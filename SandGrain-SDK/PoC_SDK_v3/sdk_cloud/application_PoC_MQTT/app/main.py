from __future__ import annotations

import asyncio
import logging
import uuid
from collections import OrderedDict
from typing import Any

from . import trace_log
from .config import load_config
from .dispatcher import dispatch
from .mqtt_transport import MQTTTransport
from .protocol import (
    extract_route,
    is_valid_action,
    make_response_error,
    parse_envelope,
    validate_payload_keys,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)
log = logging.getLogger("sandgrain-poc-cloud")


# --------------------------------------------------------------------------- #
# flow_id — correlate every trace line of ONE auth attempt.
# The cloud handles requestCW and replyRW as separate MQTT messages; they share
# the CyberRock transactionId (minted during requestCW, echoed back in replyRW),
# so we thread one flow_id across them keyed by that tx. This is cloud-local
# grouping only — a device-minted flow_id carried over the wire (which would also
# span the device and gateway hops, for combined cross-component logs) is
# separate, deferred work.
# --------------------------------------------------------------------------- #
_FLOW_BY_TX: "OrderedDict[str, str]" = OrderedDict()
_FLOW_TX_CAP = 512


def _new_flow_id() -> str:
    return uuid.uuid4().hex[:8]


def _resolve_flow_id(incoming_tx: Any) -> str:
    """Reuse the attempt's flow_id when this message carries a known transactionId
    (e.g. replyRW following its requestCW); otherwise start a new flow."""
    if incoming_tx:
        existing = _FLOW_BY_TX.get(str(incoming_tx))
        if existing:
            return existing
    return _new_flow_id()


def _bind_flow_tx(tx: Any, flow_id: str) -> None:
    """Remember tx -> flow_id so a later message with the same tx joins this flow.
    Bounded (LRU-ish) so an abandoned attempt cannot leak memory."""
    if not tx:
        return
    key = str(tx)
    _FLOW_BY_TX[key] = flow_id
    _FLOW_BY_TX.move_to_end(key)
    while len(_FLOW_BY_TX) > _FLOW_TX_CAP:
        _FLOW_BY_TX.popitem(last=False)


async def run_app() -> None:
    """
    Async application entry point.

    Responsibilities:
    - Load configuration.
    - Create an SDK pool (reuse clients; bound concurrency).
    - Start MQTT transport and route incoming messages to async handlers.
    - Keep the process alive until shutdown (finally ensures transport.stop()).
    """
    cfg = load_config()
    loop = asyncio.get_running_loop()

    # Local end-to-end traceability (no-op unless TRACE_LOG_PATH is set). Must run
    # after basicConfig so the JSONL handler attaches to the configured loggers.
    trace_log.init_trace()

    # In trustbridge mode the requests originate from TrustBridge relaying through
    # the gateway; in standalone mode there is no BE. This labels request_originator.
    request_originator = "trust_bridge" if cfg.credentials_source == "trustbridge" else "standalone"

    # Auto-claim is a TrustBridge responsibility: in trustbridge mode the cloud
    # forwards the CyberRock claim_token_id to BE (which owns the tenant-api
    # claim flow). In standalone mode there is no BE, so we don't forward and
    # claiming stays manual.
    forward_claim_to_be = (cfg.credentials_source == "trustbridge")

    from .sdk_factory import create_sdk_pool

    # Pool size: maximum number of concurrent message handlers using an SDK.
    POOL_SIZE = 4
    async with create_sdk_pool(POOL_SIZE) as pool:

        def _log_future(fut: "asyncio.Future[Any]") -> None:
            # Callback for futures returned by run_coroutine_threadsafe.
            try:
                fut.result()
            except Exception:
                log.exception("Unhandled exception in scheduled handler")

        async def handle_message(topic: str, payload_bytes: bytes) -> None:
            """
            The actual async MQTT message handler.

            Flow:
            1) Parse topic -> route (device_id, action)
            2) Parse JSON payload -> envelope
            3) Validate action vs msg_type and validate payload keys
            4) Dispatch using an SDK from the pool
            5) Publish response (or error) to the response topic
            """
            route = extract_route(topic)
            if not route:
                log.error("Invalid topic format: %s", topic)
                return

            rsp_topic = f"sandgrain/v1/{route.device_id}/rsp/{route.action}"

            # Parse the "envelope" structure (JSONC decode)
            env, parse_err = parse_envelope(payload_bytes)
            if parse_err:
                body = make_response_error(msg_type=-1, code=11, result="JSON_INVALID", payload=parse_err)
                transport.publish(rsp_topic, body)
                return

            assert env is not None
            msg_type: Any = env.msg_type

            # Establish the per-request trace envelope (V4 section 3). Field names
            # follow this deployment's concrete topology: the device that
            # originated this auth action, and the gateway relaying it (identified
            # by the IP it stamped on the envelope). In V4 spec terms these are the
            # "leaf" and the "edge_node" respectively. app_message_seq is scoped
            # per-device here (not globally unique), used for gap/duplicate
            # detection only, not as a correlation key.
            device_id = route.device_id
            # Correlate all trace lines of this attempt under one flow_id. Prefer
            # the device-minted flow_id relayed on the envelope (spans device +
            # gateway too); fall back to cloud-side minting/tx-threading when the
            # device+gateway don't send one (standalone / older components).
            incoming_tx = env.payload.get("transactionId") if isinstance(env.payload, dict) else None
            flow_id = env.flow_id or _resolve_flow_id(incoming_tx)
            trace_log.set_context(
                flow_id=flow_id,
                request_originator=request_originator,
                gateway_id=env.gateway_id,
                event_scope="device",
                device_id=device_id,
                app_seq_scope="device",
                app_message_seq=trace_log.next_app_seq("device", device_id),
                action=route.action,
            )

            # Cross-validation: topic action must be compatible with msg_type.
            if not is_valid_action(msg_type, route.action):
                body = make_response_error(
                    msg_type,
                    code=17,
                    result="ACTION_INVALID",
                    payload={"reason": "Invalid action or type", "key": (route.action, msg_type)},
                )
                transport.publish(rsp_topic, body)
                return

            keys_err = validate_payload_keys(env.payload)
            if keys_err:
                body = make_response_error(
                    msg_type,
                    code=15,
                    result="PARAM_INVALID",
                    payload=keys_err,
                )
                transport.publish(rsp_topic, body)
                return

            # Acquire an SDK from the pool to process this message (controls concurrency).
            async with pool.acquire() as sdk:
                rsp = await dispatch(
                    device_id=route.device_id,
                    action=route.action,
                    msg_type=msg_type,
                    payload=env.payload,
                    crc_map=env.crc,
                    sdk=sdk,
                )

            if rsp is None:
                return

            # Link this attempt's flow_id to the transactionId it just minted, so
            # the follow-up replyRW (which carries the same tx) joins this flow.
            if isinstance(rsp, dict):
                out_tx = (rsp.get("payload") or {}).get("transactionId")
                if out_tx:
                    _bind_flow_tx(out_tx, flow_id)

            transport.publish(rsp_topic, rsp)

            # TrustBridge auto-claim: when replyRW yields a claim_token_id, hand it
            # to BE (sandgrain/v1/{tid}/claim) so BE runs its tenant-api claim flow.
            if forward_claim_to_be and route.action == "replyRW" and isinstance(rsp, dict):
                claim_id = (rsp.get("payload") or {}).get("claim_token_id")
                if claim_id:
                    claim_topic = f"sandgrain/v1/{route.device_id}/claim"
                    transport.publish(claim_topic, {"TID": route.device_id, "claim_token_id": claim_id})
                    log.info("Forwarded claim_token_id to BE topic=%s", claim_topic)

        def on_mqtt_message(topic: str, payload_bytes: bytes) -> None:
            cfut = asyncio.run_coroutine_threadsafe(handle_message(topic, payload_bytes), loop)
            cfut.add_done_callback(_log_future)

        transport = MQTTTransport(
            host=cfg.mqtt_host,
            port=cfg.mqtt_port,
            username=cfg.mqtt_username,
            password=cfg.mqtt_password,
            on_message=on_mqtt_message,
            keepalive=30,
        )

        transport.start()

        # Wire the cloud_log MQTT sink onto the live transport (no-op unless
        # TRACE_LOG_MQTT enabled it). QoS 0 fire-and-forget, matching gw_log.
        trace_log.set_cloud_log_publisher(
            lambda topic, body: transport.publish(topic, body, qos=0)
        )

        log.info(
            "POC Cloud App started. Listening for MANY devices (wildcard subscription). SDK pool size=%s",
            POOL_SIZE,
        )

        try:
            while True:
                await asyncio.sleep(1)
        finally:
            transport.stop()


def main() -> None:
    asyncio.run(run_app())


if __name__ == "__main__":
    main()
