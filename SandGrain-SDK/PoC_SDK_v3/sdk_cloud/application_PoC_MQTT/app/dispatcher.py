from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from sandgrain_cloud_sdk.exceptions import CyberRockError

import asyncio

from .handlers import handle_action
from .protocol import (
    make_response_error,
    make_response_ok,
    validate_payload_crc_strict_present,
)

log = logging.getLogger("sandgrain-poc-cloud")

_HANDLER_TIMEOUT_S = 25  

def make_response_from_handler_result(msg_type: Any, handler_result: Any) -> Dict[str, Any]:
    """
    Convert a HandlerResult-like object into a protocol error envelope.

    This keeps the dispatcher tolerant to the exact type returned by handlers:
    it reads attributes (error_code/error_result/payload) rather than importing the type.
    """
    code = getattr(handler_result, "error_code", None)
    result = getattr(handler_result, "error_result", None)
    payload = getattr(handler_result, "payload", None)
    return make_response_error(
        msg_type,
        code=code if code is not None else 10,
        result=result or "NOT_OK",
        payload=payload or {},
    )


async def dispatch(
    *,
    device_id: str,
    action: str,
    msg_type: Any,
    payload: Dict[str, Any],
    crc_map: Any,
    sdk: Any,
) -> Optional[Dict[str, Any]]:
    """
    Main dispatcher: validates request integrity, runs the action handler, and builds a response.

    Returns:
      - dict: response envelope to publish to MQTT, or
      - None: for actions that intentionally do not respond ("no response" mode)

    Key behaviors:
      - Enforces special-case no-response actions.
      - Validates request CRCs (strict policy) when CRC is provided (optional).
      - Applies a hard timeout to handler execution.
      - Normalizes all failures into protocol error envelopes.
    """
    log.info("[DISPATCH] device_id=%s action=%s payload_keys=%s", device_id, action, list(payload.keys()))

    # Keep existing no-response behavior
    if action == "checkAuthStatusCloud":
        log.info("[NO-RSP] device_id=%s action=%s", device_id, action)
        return None

    # If crc_map is provided by the client, we validate it and (optionally) include CRC on responses too.
    crc_optional = False
    if crc_map is not None:
        crc_optional = True
        ok_crc, crc_err = validate_payload_crc_strict_present(payload, crc_map)
        if not ok_crc:
            return make_response_error(
                msg_type,
                code=12,
                result="CRC_INVALID",
                payload=crc_err or {},
            )

    try:
        result = await asyncio.wait_for(
            handle_action(action, payload, sdk=sdk),
            timeout=_HANDLER_TIMEOUT_S,
        )

        if result.ok:
            return make_response_ok(msg_type, result.payload or {}, crc_optional)
        return make_response_from_handler_result(msg_type, result)

    except CyberRockError as e:
        log.exception(
            "CyberRockError action=%s device_id=%s status=%s details=%s",
            action,
            device_id,
            getattr(e, "status_code", None),
            getattr(e, "details", None),
        )
        return make_response_error(msg_type, code=13, result="CYBERROCK_ERROR")

    except Exception as e:
        log.exception("Unhandled error action=%s device_id=%s: %s", action, device_id, e)
        return make_response_error(msg_type, code=10, result="NOT_OK")
