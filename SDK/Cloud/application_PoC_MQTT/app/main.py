from __future__ import annotations

import asyncio
import logging
from typing import Any

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
                body = make_response_error(None, code=11, result="JSON_INVALID")
                transport.publish(rsp_topic, body)
                return

            assert env is not None
            msg_type: Any = env.msg_type

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

            transport.publish(rsp_topic, rsp)

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
