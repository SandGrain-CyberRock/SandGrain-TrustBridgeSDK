from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

from .crc_utils import CRC16

# Fields that, if present in payload, MUST have a CRC (if activated) and MUST validate.
CRC_PROTECTED_FIELDS = ("TID", "CW", "RW", "transactionId")
VALID_FIELDS = ("TID", "CW", "RW", "transactionId", "auth_status", "FW_VERIFY", "validation_status")

# Mapping from numeric message "type" to the expected MQTT action name.
EXPECTED_ACTION = {
    0: "requestCW",
    1: "replyRW",
    2: "requestRW",
    3: "checkAuthStatusCloud",
    6: "fwVerification",
    7: "fwInstallation"
}


@dataclass(frozen=True)
class Route:
    """
    Parsed route info derived from the MQTT topic.
    """
    device_id: str
    action: str


@dataclass(frozen=True)
class Envelope:
    """
    Parsed message envelope:
    - msg_type: value of "type" in the JSON
    - payload: dict under "payload" (or {} if missing/invalid)
    - crc: dict under "crc" (optional; may be None)
    - gateway_id: gateway identity the relaying gateway stamps on the envelope
      (its own IP for now); optional; None for standalone / older gateways.
    """
    msg_type: Any
    payload: Dict[str, Any]
    crc: Optional[Dict[str, Any]]
    gateway_id: Optional[str] = None


def is_valid_action(msg_type: Any, action: str) -> bool:
    """
    Validate that the numeric msg_type maps to the given action string.

    - msg_type must be int-convertible
    - EXPECTED_ACTION[msg_type] must equal the action from the topic
    """
    try:
        mt = int(msg_type)
    except (TypeError, ValueError):
        return False
    return EXPECTED_ACTION.get(mt) == action


def extract_route(topic: str) -> Optional[Route]:
    """
    Enforce exact topic format:
      sandgrain/v1/<device_id>/req/<action>
    """
    parts = topic.split("/")
    if len(parts) != 5:
        return None
    if parts[0] != "sandgrain" or parts[1] != "v1" or parts[3] != "req":
        return None
    return Route(device_id=parts[2], action=parts[4])


def parse_envelope(payload_bytes: bytes) -> Tuple[Optional[Envelope], Optional[Dict[str, Any]]]:
    """
    Returns (Envelope|None, error_payload|None)
    error_payload is shaped to be used as payload for make_response_error.
    """
    try:
        payload_str = payload_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return None, {"reason": "UTF8_INVALID"}

    try:
        env = json.loads(payload_str)
    except json.JSONDecodeError:
        return None, {"reason": "JSON_INVALID"}

    if not isinstance(env, dict):
        return None, {"reason": "JSON_NOT_OBJECT"}

    msg_type = env.get("type")

    payload = env.get("payload") or {}
    if not isinstance(payload, dict):
        payload = {}

    crc_map = env.get("crc")

    # Gateway identity (its IP), stamped on the envelope by the relaying gateway.
    # Accept a couple of spellings; None when absent (standalone / older gw).
    gateway = env.get("gateway_id") or env.get("gatewayId")
    gateway_id = str(gateway) if gateway else None

    return Envelope(msg_type=msg_type, payload=payload, crc=crc_map, gateway_id=gateway_id), None


def validate_payload_keys(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """ Validate that payload contains ONLY keys in VALID_FIELDS."""
    invalid_keys = set(payload.keys()) - set(VALID_FIELDS)
    if invalid_keys:
        return {"reason": "Invalid Parameter Keys", "key": list(invalid_keys)}
    return None


def validate_payload_crc_strict_present(payload: Dict[str, Any], crc_map: Any) -> Tuple[bool, Optional[dict]]:
    """
    Strict policy (presence-based):

    - 'crc' must be a JSON object (dict). Missing 'crc' is treated as {}.
    - For each field in CRC_PROTECTED_FIELDS:
        - If field is present in payload:
            - field MUST be present in crc
            - CRC must match (CRC16/CCITT-FALSE over UTF-8 string)
    - Additionally (strict):
        - crc MUST NOT contain keys that are not present in payload
    """
    if crc_map is None:
        crc_map = {}
    if not isinstance(crc_map, dict):
        return False, {"reason": "CRC_FIELD_NOT_AN_OBJECT"}

    # Reject CRC keys that do not exist in payload (strict)
    for k in crc_map.keys():
        if k not in payload:
            return False, {"reason": "CRC_KEY_NOT_IN_PAYLOAD", "key": k}

    # Validate required CRC for protected fields that are present
    for field in CRC_PROTECTED_FIELDS:
        if field in payload:
            if field not in crc_map:
                return False, {"reason": "MISSING_REQUIRED_CRC_FIELD", "key": field}

            value_str = str(payload[field])
            expected_crc = str(crc_map[field])

            if not CRC16.verify_str(value_str, expected_crc):
                return False, {
                    "reason": "CRC_MISMATCH",
                    "key": field,
                    "expected": expected_crc,
                    "computed": f"0x{CRC16.hex_str(value_str)}",
                }

    return True, None


def build_crc_map_for_present_protected_fields(payload: Dict[str, Any]) -> Dict[str, str]:
    """
    Build a CRC map for protected fields that are present in the given payload.

    Output format:
      { field_name: "<crc16 hex lowercase>" }
    """
    out: Dict[str, str] = {}
    for field in CRC_PROTECTED_FIELDS:
        if field in payload:
            v = str(payload[field])
            out[field] = CRC16.hex_str(v).lower()
    return out


def make_response_ok(msg_type: Any, payload: Optional[Dict[str, Any]] = None, crc_optional: bool = False) -> Dict[str, Any]:
    """
    Build a success response envelope.

    If crc_optional=True:
      - Adds "crc" field containing CRCs for any protected fields present in response payload.
      - This lets clients optionally validate integrity on responses too.
    """
    rsp_payload = payload or {}
    response = {
        "type": msg_type,
        "status": {"code": 0, "result": "OK"},
        "payload": rsp_payload,
    }

    if crc_optional:
        response["crc"] = build_crc_map_for_present_protected_fields(rsp_payload)

    return response


def make_response_error(
    msg_type: Any,
    *,
    code: int,
    result: str,
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Build an error response envelope.

    - msg_type is echoed back (may be None if parsing failed).
    - status.code/status.result carry the error classification.
    - payload can include structured error details for debugging/clients.
    """
    rsp_payload = payload or {}
    return {
        "type": msg_type,
        "status": {"code": code, "result": result},
        "payload": rsp_payload
    }
