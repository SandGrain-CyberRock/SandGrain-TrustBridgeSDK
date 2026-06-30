# handlers.py (app)
"""
IMPORTANT: THIS HANDLERS VERSION MANAGES THE RW RETRIEVAL FROM THE CLOUD INTERNALLY.

The Cloud App polls CyberRock internally and sends the RW directly to the embedded
in the response to `requestRW`.

The embedded MUST NOT call `checkRequestRWStatus`.

NOTE:
- requestCW/replyRW/checkAuthStatus keep the original device-RW flow intact.
- requestRW keeps CW/RW naming on MQTT, but internally maps to HCW/HRW endpoints
  via the SDK (CW -> HCW, RW -> HRW).
"""

from __future__ import annotations

import asyncio
import random
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Optional

from sandgrain_cloud_sdk import CloudSDK
from sandgrain_cloud_sdk.exceptions import CyberRockError

import logging

log = logging.getLogger("sandgrain-poc-cloud")

_RW_POLL_INTERVAL_SEC = 0.5
_RW_POLL_TIMEOUT_SEC = 20.0

_TIMEOUT_CODE = 18 #TIMEOUT_ERROR


@dataclass(frozen=True)
class HandlerResult:
    """
    Normalized result type returned by handlers.

    - ok=True: operation succeeded; payload contains response fields.
    - ok=False: operation failed; error_code/error_result describe the failure and payload may include details.
    """
    ok: bool
    payload: Optional[Dict[str, Any]] = None
    error_code: Optional[int] = None
    error_result: Optional[str] = None


def ok(payload: Optional[Dict[str, Any]] = None) -> HandlerResult:
    """Convenience constructor for successful handler results."""
    return HandlerResult(ok=True, payload=payload or {})


def err(code: int, result: str = "NOT_OK", payload: Optional[Dict[str, Any]] = None) -> HandlerResult:
    """Convenience constructor for error handler results."""
    return HandlerResult(ok=False, error_code=code, error_result=result, payload=payload or {})


def require_nonempty_str(payload: Dict[str, Any], key: str) -> str:
    """
    Strict-ish: require key present and value convertible to non-empty string.
    Accepts str/int (common for IDs), rejects dict/list/etc.
    """
    if key not in payload or payload[key] is None:
        raise KeyError(key)

    v = payload[key]
    if not isinstance(v, (str, int)):
        raise TypeError(key)

    s = str(v).strip()
    if not s:
        raise ValueError(key)

    return s


async def _poll_until(
    *,
    timeout_s: float,
    interval_s: float,
    fn: Callable[[], Awaitable[Optional[Any]]],
    jitter: float = 0.10,
) -> Any:
    """
    Poll `fn()` until it returns a non-None value, or raise asyncio.TimeoutError.

    - `fn()` is expected to return:
        * None      -> keep polling
        * non-None  -> done (value returned to caller)
    - Jitter is used to avoid synchronized polling (thundering herd) when many devices hit at once.
    - If `fn()` raises, we keep polling but remember the last exception; on timeout we chain it.
    """
    deadline = time.monotonic() + timeout_s
    last_exc: Optional[BaseException] = None

    while True:
        try:
            res = await fn()
            if res is not None:
                return res
        except BaseException as e:
            # store last exception; often useful for diagnosing transient failures
            last_exc = e

        if time.monotonic() >= deadline:
            if last_exc:
                raise asyncio.TimeoutError() from last_exc
            raise asyncio.TimeoutError()

        sleep_s = interval_s * (1.0 + random.uniform(-jitter, jitter))
        await asyncio.sleep(max(0.0, sleep_s))


async def _handle_request_cw(payload: Dict[str, Any], *, sdk: CloudSDK) -> HandlerResult:
    tid = require_nonempty_str(payload, "TID")

    t0 = time.monotonic()
    res = await sdk.request_cw(tid=tid)
    dt_ms = int((time.monotonic() - t0) * 1000)

    log.info("requestCW ok tid=%s dt_ms=%s", tid, dt_ms)
    return ok({"CW": res.cw, "transactionId": res.transaction_id})


async def _handle_reply_rw(payload: Dict[str, Any], *, sdk: CloudSDK) -> HandlerResult:
    """
    replyRW flow:
    - Input: TID, CW, RW, transactionId
    - Step 1: submit RW (may be ignored if tx is not waiting)
    - Step 2: poll check_auth_status until terminal status (or timeout)
    - Output: auth_status
    """
    tid = require_nonempty_str(payload, "TID")
    cw = require_nonempty_str(payload, "CW")
    rw = require_nonempty_str(payload, "RW")
    tx = require_nonempty_str(payload, "transactionId")

    t0 = time.monotonic()

    # 1) Attempt to submit RW
    try:
        await sdk.reply_rw(
            tid=tid,
            cw=cw,
            rw=rw,
            transaction_id=tx,
            action_id="replyRW",
        )
    except CyberRockError as e:
        log.info("replyRW ignored (tx not waiting) tid=%s tx=%s status=%s", tid, tx, getattr(e, "status", None))

    # 2) Poll auth status until ready (or timeout)
    last_status: Optional[str] = None

    async def _check() -> Optional[Any]:
        nonlocal last_status
        st = await sdk.check_auth_status(transaction_id=tx, tid=tid)
        last_status = getattr(st, "status", None)
        if last_status and last_status != "NOT_READY":
            return st
        return None

    try:
        st = await _poll_until(
            timeout_s=_RW_POLL_TIMEOUT_SEC,
            interval_s=_RW_POLL_INTERVAL_SEC,
            fn=_check,
        )
    except asyncio.TimeoutError:
        dt_ms = int((time.monotonic() - t0) * 1000)
        log.warning("replyRW timeout tid=%s tx=%s last_status=%s dt_ms=%s", tid, tx, last_status, dt_ms)
        return err(
            _TIMEOUT_CODE,
            "TIMEOUT",
            {"phase": "check_auth_status", "transactionId": tx, "last_status": last_status},
        )

    dt_ms = int((time.monotonic() - t0) * 1000)
    status = getattr(st, "status", None)
    log.info("replyRW ok tid=%s tx=%s auth_status=%s dt_ms=%s", tid, tx, status, dt_ms)
    return ok({"auth_status": status})


async def _handle_request_rw(payload: Dict[str, Any], *, sdk: CloudSDK) -> HandlerResult:
    tid = require_nonempty_str(payload, "TID")
    cw = require_nonempty_str(payload, "CW")

    # IMPORTANT:
    # For mutual-auth HRW flow, the transactionId must be created from HCW via requestTransactionId.
    # If embedded sends transactionId (e.g., from requestCW), we ignore it.
    ignored_tx = payload.get("transactionId")
    if ignored_tx is not None:
        log.debug("requestRW ignoring provided transactionId tid=%s provided_tx=%s", tid, str(ignored_tx)[:64])

    t0 = time.monotonic()

    start = await sdk.request_rw(tid=tid, cw=cw, transaction_id=None)
    rw_tx = getattr(start, "rw_transaction_id", None)
    if not rw_tx:
        log.error("requestRW missing rw_transaction_id tid=%s", tid)
        return err(13, "CYBERROCK_ERROR", {"reason": "MISSING_RW_TRANSACTION_ID"})

    last_status: Optional[str] = None

    async def _check() -> Optional[Any]:
        nonlocal last_status
        st = await sdk.check_request_rw_status(rw_transaction_id=rw_tx, tid=tid)
        last_status = getattr(st, "status", None)

        # Success
        if last_status in ("GENERATED_RW", "GENERATED_HRW") and getattr(st, "rw", None):
            return st

        # Terminal failure
        if last_status == "AUTH_NOT_OK":
            # Return sentinel object to handle outside
            return st

        # Keep polling for NOT_READY and any other non-terminal statuses
        return None

    try:
        st = await _poll_until(
            timeout_s=_RW_POLL_TIMEOUT_SEC,
            interval_s=_RW_POLL_INTERVAL_SEC,
            fn=_check,
        )
    except asyncio.TimeoutError:
        dt_ms = int((time.monotonic() - t0) * 1000)
        log.warning("requestRW timeout tid=%s rw_tx=%s last_status=%s dt_ms=%s", tid, rw_tx, last_status, dt_ms)
        return err(
            _TIMEOUT_CODE,
            "TIMEOUT",
            {"phase": "check_request_rw_status", "rw_transaction_id": rw_tx, "last_status": last_status},
        )

    status = getattr(st, "status", None)

    if status == "AUTH_NOT_OK":
        dt_ms = int((time.monotonic() - t0) * 1000)
        log.info("requestRW auth_not_ok tid=%s rw_tx=%s dt_ms=%s", tid, rw_tx, dt_ms)
        return err(14, "AUTH_NOT_OK", {"rw_transaction_id": rw_tx})

    rw_val = getattr(st, "rw", None)
    if not rw_val:
        # Should be rare because success branch checks st.rw, but keep safe.
        dt_ms = int((time.monotonic() - t0) * 1000)
        log.error("requestRW terminal_no_rw tid=%s rw_tx=%s status=%s dt_ms=%s", tid, rw_tx, status, dt_ms)
        return err(13, "CYBERROCK_ERROR", {"reason": "RW_MISSING", "status": status, "rw_transaction_id": rw_tx})

    dt_ms = int((time.monotonic() - t0) * 1000)
    log.info("requestRW ok tid=%s rw_tx=%s status=%s dt_ms=%s", tid, rw_tx, status, dt_ms)
    return ok({"RW": rw_val})


# Action name -> handler coroutine.
_HANDLERS: Dict[str, Callable[[Dict[str, Any]], Awaitable[HandlerResult]]] = {
    "requestCW": _handle_request_cw,  
    "replyRW": _handle_reply_rw,      
    "requestRW": _handle_request_rw, 
}


async def handle_action(action: str, payload: Dict[str, Any], *, sdk: CloudSDK) -> HandlerResult:
    """
    Public dispatcher for actions.

    - Looks up the action handler.
    - Normalizes all errors into HandlerResult (no exceptions leak past this boundary).
    - Keeps error codes/results consistent for the MQTT response layer.
    """
    try:
        fn = _HANDLERS.get(action)
        if fn is None:
            # checkRequestRWStatus is intentionally NOT exposed to embedded in this mode
            return err(10, "NOT_OK")

        return await fn(payload, sdk=sdk)

    except KeyError as e:
        return err(16, "KEY_ERROR", payload={"missing": str(e)})

    except (TypeError, ValueError) as e:
        # Wrong type, empty strings, etc.
        return err(15, "PARAM_INVALID", payload={"reason": "INVALID_FIELD", "key": str(e)})

    except CyberRockError as e:
        log.exception(
            "[handle_action:%s] CyberRockError status=%s details=%s body=%s",
            action,
            getattr(e, "status", None),
            getattr(e, "details", None),
            getattr(e, "body", None),
        )
        return err(13, "CYBERROCK_ERROR", payload={"status": getattr(e, "status", None)})

    except Exception as e:
        log.exception("[handle_action:%s] Unexpected error", action)
        return err(10, "NOT_OK", payload={"error": type(e).__name__})
