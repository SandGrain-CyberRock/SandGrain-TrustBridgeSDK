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
import logging
import random
import time
from dataclasses import dataclass
from enum import Enum, IntEnum
from typing import Any, Awaitable, Callable, Dict, Optional, Tuple

from sandgrain_cloud_sdk import CloudSDK
from sandgrain_cloud_sdk.exceptions import CyberRockError

log = logging.getLogger("sandgrain-poc-cloud")

_FW_VERIFY_TTL_SEC = 300  # 5 min
_RW_POLL_INTERVAL_SEC = 0.5
_RW_POLL_TIMEOUT_SEC = 20.0
_POLL_JITTER = 0.10


class ErrorCode(IntEnum):
    NOT_OK = 10
    FW_INSTALL_NOT_ALLOWED_MISSING_VERIFY = 12
    CYBERROCK_ERROR = 13
    AUTH_NOT_OK = 14
    PARAM_INVALID = 15
    KEY_ERROR = 16
    TIMEOUT = 18


class ErrorResult(str, Enum):
    NOT_OK = "NOT_OK"
    PARAM_INVALID = "PARAM_INVALID"
    KEY_ERROR = "KEY_ERROR"
    CYBERROCK_ERROR = "CYBERROCK_ERROR"
    AUTH_NOT_OK = "AUTH_NOT_OK"
    TIMEOUT = "TIMEOUT"
    FW_INSTALL_NOT_ALLOWED = "FW_INSTALL_NOT_ALLOWED"


class ActionName(str, Enum):
    REQUEST_CW = "requestCW"
    REPLY_RW = "replyRW"
    REQUEST_RW = "requestRW"
    FW_VERIFICATION = "fwVerification"
    FW_INSTALLATION = "fwInstallation"


class RequestRwStatus(str, Enum):
    GENERATED_RW = "GENERATED_RW"
    GENERATED_HRW = "GENERATED_HRW"
    AUTH_NOT_OK = "AUTH_NOT_OK"


class AuthStatus(str, Enum):
    NOT_READY = "NOT_READY"


class ParamValidationError(ValueError):
    def __init__(self, key: str, reason: str) -> None:
        super().__init__(key)
        self.key = key
        self.reason = reason


class FwInstallPermission(str, Enum):
    ALLOWED = "ALLOWED"
    DENIED = "DENIED"


@dataclass
class FwVerifyRecord:
    permission: FwInstallPermission
    updated_at: float
    fw_verify: str


@dataclass(frozen=True)
class HandlerResult:
    """
    Normalized result type returned by handlers.

    - ok=True: operation succeeded; payload contains response fields.
    - ok=False: operation failed; error_code/error_result describe the failure
      and payload may include details.
    """

    ok: bool
    payload: Dict[str, Any]
    error_code: Optional[int] = None
    error_result: Optional[str] = None


@dataclass(frozen=True)
class RwRequestOutcome:
    rw_transaction_id: str
    status: str
    rw: Optional[str]
    duration_ms: int


@dataclass(frozen=True)
class PayloadField:
    key: str
    value: str


def ok(payload: Optional[Dict[str, Any]] = None) -> HandlerResult:
    return HandlerResult(ok=True, payload=payload or {})


def err(
    code: int | ErrorCode,
    result: str | ErrorResult = ErrorResult.NOT_OK,
    payload: Optional[Dict[str, Any]] = None,
) -> HandlerResult:
    return HandlerResult(
        ok=False,
        error_code=int(code),
        error_result=str(result),
        payload=payload or {},
    )


class PayloadReader:
    def __init__(self, payload: Dict[str, Any]) -> None:
        self._payload = payload

    def require_nonempty_str(self, key: str) -> str:
        if key not in self._payload or self._payload[key] is None:
            raise ParamValidationError(key, "MISSING")

        value = self._payload[key]
        if not isinstance(value, (str, int)):
            raise ParamValidationError(key, "INVALID_TYPE")

        normalized = str(value).strip()
        if not normalized:
            raise ParamValidationError(key, "EMPTY")

        return normalized


def _normalize_hex(value: str, *, key: str) -> str:
    """
    Normalize hex string:
    - strip surrounding whitespace
    - remove internal whitespace
    - lowercase
    - accept optional 0x prefix
    """
    normalized = "".join(str(value).strip().split()).lower()
    if normalized.startswith("0x"):
        normalized = normalized[2:]

    if not normalized:
        raise ParamValidationError(key, "EMPTY")

    try:
        bytes.fromhex(normalized)
    except ValueError as exc:
        raise ParamValidationError(key, "INVALID_HEX") from exc

    return normalized


def _verification_rw_key_from_rw(rw: str) -> str:
    """
    Verification RW is 16 bytes => 32 hex chars.
    """
    rw_norm = _normalize_hex(rw, key="RW")
    if len(rw_norm) != 32:
        raise ParamValidationError("RW", "INVALID_LENGTH")
    return rw_norm


def _verification_rw_key_from_cw(cw: str) -> str:
    """
    Installation CW is 32 bytes => 64 hex chars and must be rwrw.
    Returns the embedded verification RW (first half).
    """
    cw_norm = _normalize_hex(cw, key="CW")
    if len(cw_norm) != 64:
        raise ParamValidationError("CW", "INVALID_LENGTH")

    half = len(cw_norm) // 2
    left = cw_norm[:half]
    right = cw_norm[half:]

    if left != right:
        raise ParamValidationError("CW", "NOT_RWRW")

    return left


class FwVerificationStore:
    """
    Keeps fw-verification state keyed by (tid, verification_rw).

    verification_rw is the RW received in fwVerification.
    Later, fwInstallation derives the same verification_rw from CW=rwrw.
    """

    def __init__(self, ttl_sec: int = _FW_VERIFY_TTL_SEC) -> None:
        self._ttl_sec = ttl_sec
        self._by_key: Dict[Tuple[str, str], FwVerifyRecord] = {}
        self._locks: Dict[Tuple[str, str], asyncio.Lock] = {}

    def _get_lock(self, key: Tuple[str, str]) -> asyncio.Lock:
        lock = self._locks.get(key)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[key] = lock
        return lock

    def _is_expired(self, rec: FwVerifyRecord) -> bool:
        return (time.monotonic() - rec.updated_at) > self._ttl_sec

    def _cleanup_if_expired(self, key: Tuple[str, str]) -> None:
        rec = self._by_key.get(key)
        if rec and self._is_expired(rec):
            self._by_key.pop(key, None)

    async def set_verification(self, *, tid: str, verification_rw: str, fw_verify: str) -> FwVerifyRecord:
        key = (tid, verification_rw)
        async with self._get_lock(key):
            record = FwVerifyRecord(
                permission=(
                    FwInstallPermission.ALLOWED
                    if fw_verify == "FW_OK"
                    else FwInstallPermission.DENIED
                ),
                updated_at=time.monotonic(),
                fw_verify=fw_verify,
            )
            self._by_key[key] = record
            return record

    async def get_install_permission(self, *, tid: str, verification_rw: str) -> Optional[FwVerifyRecord]:
        key = (tid, verification_rw)
        async with self._get_lock(key):
            self._cleanup_if_expired(key)
            return self._by_key.get(key)

    async def consume_install_permission(self, *, tid: str, verification_rw: str) -> None:
        key = (tid, verification_rw)
        async with self._get_lock(key):
            self._by_key.pop(key, None)

    async def clear(self, *, tid: str, verification_rw: str) -> None:
        key = (tid, verification_rw)
        async with self._get_lock(key):
            self._by_key.pop(key, None)


_fw_verification_store = FwVerificationStore()


async def _poll_until(
    *,
    timeout_s: float,
    interval_s: float,
    fn: Callable[[], Awaitable[Optional[Any]]],
    jitter: float = _POLL_JITTER,
) -> Any:
    """
    Poll `fn()` until it returns non-None, or raise asyncio.TimeoutError.

    Important: catches Exception, not BaseException, so task cancellation is not swallowed.
    """
    deadline = time.monotonic() + timeout_s
    last_exc: Optional[Exception] = None

    while True:
        try:
            result = await fn()
            if result is not None:
                return result
        except Exception as exc:
            last_exc = exc

        if time.monotonic() >= deadline:
            if last_exc is not None:
                raise asyncio.TimeoutError() from last_exc
            raise asyncio.TimeoutError()

        # # Jitter adds a small random variation to the polling interval.
        # This prevents many callers from retrying at exactly the same time,
        # which helps reduce synchronized spikes in load.
        sleep_s = interval_s * (1.0 + random.uniform(-jitter, jitter))
        await asyncio.sleep(max(0.0, sleep_s))


async def _request_rw_and_wait(*, sdk: CloudSDK, tid: str, cw: str) -> RwRequestOutcome:
    t0 = time.monotonic()

    start = await sdk.request_rw(tid=tid, cw=cw, transaction_id=None)
    rw_transaction_id = getattr(start, "rw_transaction_id", None)
    if not rw_transaction_id:
        log.error("requestRW missing rw_transaction_id tid=%s", tid)
        raise RuntimeError("MISSING_RW_TRANSACTION_ID")

    last_status: Optional[str] = None

    async def _check() -> Optional[Any]:
        nonlocal last_status

        status_response = await sdk.check_request_rw_status(
            rw_transaction_id=rw_transaction_id,
            tid=tid,
        )
        last_status = getattr(status_response, "status", None)

        if last_status in (RequestRwStatus.GENERATED_RW.value, RequestRwStatus.GENERATED_HRW.value):
            if getattr(status_response, "rw", None):
                return status_response
            return None

        if last_status == RequestRwStatus.AUTH_NOT_OK.value:
            return status_response

        return None

    try:
        status_response = await _poll_until(
            timeout_s=_RW_POLL_TIMEOUT_SEC,
            interval_s=_RW_POLL_INTERVAL_SEC,
            fn=_check,
        )
    except asyncio.TimeoutError:
        duration_ms = int((time.monotonic() - t0) * 1000)
        log.warning(
            "requestRW timeout tid=%s rw_tx=%s last_status=%s dt_ms=%s",
            tid,
            rw_transaction_id,
            last_status,
            duration_ms,
        )
        raise

    duration_ms = int((time.monotonic() - t0) * 1000)
    return RwRequestOutcome(
        rw_transaction_id=rw_transaction_id,
        status=getattr(status_response, "status", None),
        rw=getattr(status_response, "rw", None),
        duration_ms=duration_ms,
    )


def _request_rw_outcome_to_handler_result(*, tid: str, outcome: RwRequestOutcome) -> HandlerResult:
    if outcome.status == RequestRwStatus.AUTH_NOT_OK.value:
        log.info(
            "requestRW auth_not_ok tid=%s rw_tx=%s dt_ms=%s",
            tid,
            outcome.rw_transaction_id,
            outcome.duration_ms,
        )
        return err(
            ErrorCode.AUTH_NOT_OK,
            ErrorResult.AUTH_NOT_OK,
            {"rw_transaction_id": outcome.rw_transaction_id},
        )

    if not outcome.rw:
        log.error(
            "requestRW terminal_no_rw tid=%s rw_tx=%s status=%s dt_ms=%s",
            tid,
            outcome.rw_transaction_id,
            outcome.status,
            outcome.duration_ms,
        )
        return err(
            ErrorCode.CYBERROCK_ERROR,
            ErrorResult.CYBERROCK_ERROR,
            {
                "reason": "RW_MISSING",
                "status": outcome.status,
                "rw_transaction_id": outcome.rw_transaction_id,
            },
        )

    log.info(
        "requestRW ok tid=%s rw_tx=%s status=%s dt_ms=%s",
        tid,
        outcome.rw_transaction_id,
        outcome.status,
        outcome.duration_ms,
    )
    return ok({"RW": outcome.rw})


async def _poll_auth_status(*, sdk: CloudSDK, tid: str, transaction_id: str) -> Any:
    """
    Poll check_auth_status until terminal. Returns the full CheckAuthStatusResponse
    so the caller can access auxiliary fields like claim_token_id for CLAIM_TOKEN.
    """
    last_status: Optional[str] = None

    async def _check() -> Optional[Any]:
        nonlocal last_status

        status_response = await sdk.check_auth_status(transaction_id=transaction_id, tid=tid)
        last_status = getattr(status_response, "status", None)
        if last_status and last_status != AuthStatus.NOT_READY.value:
            return status_response
        return None

    try:
        status_response = await _poll_until(
            timeout_s=_RW_POLL_TIMEOUT_SEC,
            interval_s=_RW_POLL_INTERVAL_SEC,
            fn=_check,
        )
    except asyncio.TimeoutError as exc:
        raise asyncio.TimeoutError(last_status) from exc

    return status_response


async def _poll_mutual_auth_status(*, sdk: CloudSDK, tid: str, transaction_id: str) -> Any:
    """
    Poll check_mutual_auth_status until terminal. Returns the full
    CheckAuthStatusResponse — which in the mutual-auth flow also carries HRW2
    (the host-auth response word), so Phase 2 needs no separate requestRW.
    """
    last_status: Optional[str] = None

    async def _check() -> Optional[Any]:
        nonlocal last_status
        status_response = await sdk.check_mutual_auth_status(transaction_id=transaction_id, tid=tid)
        last_status = getattr(status_response, "status", None)
        if last_status and last_status != AuthStatus.NOT_READY.value:
            return status_response
        return None

    try:
        status_response = await _poll_until(
            timeout_s=_RW_POLL_TIMEOUT_SEC,
            interval_s=_RW_POLL_INTERVAL_SEC,
            fn=_check,
        )
    except asyncio.TimeoutError as exc:
        raise asyncio.TimeoutError(last_status) from exc

    return status_response


async def _handle_request_cw(payload: Dict[str, Any], *, sdk: CloudSDK) -> HandlerResult:
    reader = PayloadReader(payload)
    tid = reader.require_nonempty_str("TID")

    t0 = time.monotonic()
    # Mutual-auth flow: requestMutualAuthCW (the CW is the same token-auth CW;
    # the transaction is a mutual-auth transaction whose checkstatus returns HRW2).
    result = await sdk.request_mutual_auth_cw(tid=tid)
    duration_ms = int((time.monotonic() - t0) * 1000)

    log.info("requestMutualAuthCW ok tid=%s dt_ms=%s", tid, duration_ms)
    return ok({"CW": result.cw, "transactionId": result.transaction_id})


async def _handle_fw_verification(payload: Dict[str, Any], *, sdk: CloudSDK) -> HandlerResult:
    del sdk  # intentionally unused

    reader = PayloadReader(payload)
    tid = reader.require_nonempty_str("TID")
    fw_verify = reader.require_nonempty_str("FW_VERIFY")
    rw = reader.require_nonempty_str("RW")

    verification_rw = _verification_rw_key_from_rw(rw)

    log.info(
        "fwVerification tid=%s verification_rw=%s fw_verify=%s",
        tid,
        verification_rw,
        fw_verify,
    )

    record = await _fw_verification_store.set_verification(
        tid=tid,
        verification_rw=verification_rw,
        fw_verify=fw_verify,
    )

    if record.permission == FwInstallPermission.ALLOWED:
        log.info("fwVerification allowed tid=%s verification_rw=%s", tid, verification_rw)
    else:
        log.warning(
            "fwVerification denied tid=%s verification_rw=%s fw_verify=%s",
            tid,
            verification_rw,
            fw_verify,
        )

    return ok(
        {
            "permission": record.permission.value,
            "verificationRW": verification_rw,
        }
    )


async def _handle_fw_installation(payload: Dict[str, Any], *, sdk: CloudSDK) -> HandlerResult:
    reader = PayloadReader(payload)
    tid = reader.require_nonempty_str("TID")
    cw = reader.require_nonempty_str("CW")
    rw = reader.require_nonempty_str("RW")

    verification_rw = _verification_rw_key_from_cw(cw)
    installation_rw = _verification_rw_key_from_rw(rw)

    verification_record = await _fw_verification_store.get_install_permission(
        tid=tid,
        verification_rw=verification_rw,
    )

    if verification_record is None:
        log.warning(
            "fwInstallation denied tid=%s verification_rw=%s reason=missing_or_expired_fw_verification",
            tid,
            verification_rw,
        )
        return err(
            ErrorCode.FW_INSTALL_NOT_ALLOWED_MISSING_VERIFY,
            ErrorResult.FW_INSTALL_NOT_ALLOWED,
            {
                "tid": tid,
                "verificationRW": verification_rw,
                "reason": "missing_or_expired_fw_verification",
            },
        )

    if verification_record.permission != FwInstallPermission.ALLOWED:
        log.warning(
            "fwInstallation denied tid=%s verification_rw=%s reason=fw_verification_failed fw_verify=%s",
            tid,
            verification_rw,
            verification_record.fw_verify,
        )
        return err(
            ErrorCode.CYBERROCK_ERROR,
            ErrorResult.FW_INSTALL_NOT_ALLOWED,
            {
                "tid": tid,
                "verificationRW": verification_rw,
                "reason": "fw_verification_failed",
                "fw_verify": verification_record.fw_verify,
            },
        )

    try:
        outcome = await _request_rw_and_wait(sdk=sdk, tid=tid, cw=cw)
    except asyncio.TimeoutError:
        return err(
            ErrorCode.TIMEOUT,
            ErrorResult.TIMEOUT,
            {
                "phase": "check_request_rw_status",
            },
        )
    except RuntimeError as exc:
        if str(exc) != "MISSING_RW_TRANSACTION_ID":
            raise
        return err(
            ErrorCode.CYBERROCK_ERROR,
            ErrorResult.CYBERROCK_ERROR,
            {"reason": "MISSING_RW_TRANSACTION_ID"},
        )

    request_rw_error = _request_rw_outcome_to_handler_result(tid=tid, outcome=outcome)
    if not request_rw_error.ok:
        return request_rw_error

    generated_rw = _verification_rw_key_from_rw(outcome.rw or "")
    fw_installation = "OK" if installation_rw == generated_rw else "NOK"

    log.info(
        "fwInstallation comparison tid=%s verification_rw=%s installation_rw=%s generated_rw=%s result=%s",
        tid,
        verification_rw,
        installation_rw,
        generated_rw,
        fw_installation,
    )

    if fw_installation == "OK":
        await _fw_verification_store.consume_install_permission(
            tid=tid,
            verification_rw=verification_rw,
        )

    return ok(
        {
            "FW_INSTALLATION": fw_installation,
            "verificationRW": verification_rw,
        }
    )


async def _handle_reply_rw(payload: Dict[str, Any], *, sdk: CloudSDK) -> HandlerResult:
    """
    replyRW flow:
    - Input: TID, CW, RW, transactionId
    - Step 1: submit RW
    - Step 2: poll check_auth_status until terminal status (or timeout)
    - Output: auth_status
    """
    reader = PayloadReader(payload)
    tid = reader.require_nonempty_str("TID")
    cw = reader.require_nonempty_str("CW")
    rw = reader.require_nonempty_str("RW")
    transaction_id = reader.require_nonempty_str("transactionId")

    t0 = time.monotonic()

    try:
        await sdk.reply_mutual_auth_rw(
            tid=tid,
            cw=cw,
            rw=rw,
            transaction_id=transaction_id,
            action_id=ActionName.REPLY_RW.value,
        )
    except CyberRockError as exc:
        log.info(exc)
        log.info(
            "replyRW failed tid=%s tx=%s status=%s",
            tid,
            transaction_id,
            getattr(exc, "status", None),
        )
        if getattr(exc, "status", None) == 400:
            return err(ErrorCode.NOT_OK, str(exc))
        raise

    try:
        status_response = await _poll_mutual_auth_status(
            sdk=sdk,
            tid=tid,
            transaction_id=transaction_id,
        )
    except asyncio.TimeoutError as exc:
        duration_ms = int((time.monotonic() - t0) * 1000)
        last_status = exc.args[0] if exc.args else None
        log.warning(
            "replyRW timeout tid=%s tx=%s last_status=%s dt_ms=%s",
            tid,
            transaction_id,
            last_status,
            duration_ms,
        )
        return err(
            ErrorCode.TIMEOUT,
            ErrorResult.TIMEOUT,
            {
                "phase": "check_mutual_auth_status",
                "transactionId": transaction_id,
                "last_status": last_status,
            },
        )

    auth_status = getattr(status_response, "status", None)
    claim_token_id = getattr(status_response, "claim_token_id", None)
    hrw2 = getattr(status_response, "hrw2", None)
    duration_ms = int((time.monotonic() - t0) * 1000)
    log.info(
        "replyRW ok tid=%s tx=%s auth_status=%s has_hrw2=%s dt_ms=%s",
        tid,
        transaction_id,
        auth_status,
        bool(hrw2),
        duration_ms,
    )

    # Mutual-auth flow: the checkstatus verdict now also carries HRW2 (host-auth
    # response word). Relay it so the gateway hands it to the device in the same
    # verdict — Phase 2 no longer needs a separate requestRW round-trip.
    response_payload: Dict[str, Any] = {"auth_status": auth_status}
    if hrw2:
        response_payload["HRW2"] = hrw2
    if auth_status == "CLAIM_TOKEN" and claim_token_id:
        response_payload["claim_token_id"] = claim_token_id
        log.info(
            "replyRW CLAIM_TOKEN tid=%s tx=%s claim_token_id=%s",
            tid,
            transaction_id,
            claim_token_id,
        )
    return ok(response_payload)


async def _handle_request_rw(payload: Dict[str, Any], *, sdk: CloudSDK) -> HandlerResult:
    reader = PayloadReader(payload)
    tid = reader.require_nonempty_str("TID")
    cw = reader.require_nonempty_str("CW")

    ignored_tx = payload.get("transactionId")
    if ignored_tx is not None:
        log.debug(
            "requestRW ignoring provided transactionId tid=%s provided_tx=%s",
            tid,
            str(ignored_tx)[:64],
        )

    try:
        outcome = await _request_rw_and_wait(sdk=sdk, tid=tid, cw=cw)
    except asyncio.TimeoutError:
        return err(
            ErrorCode.TIMEOUT,
            ErrorResult.TIMEOUT,
            {"phase": "check_request_rw_status"},
        )
    except RuntimeError as exc:
        if str(exc) != "MISSING_RW_TRANSACTION_ID":
            raise
        return err(
            ErrorCode.CYBERROCK_ERROR,
            ErrorResult.CYBERROCK_ERROR,
            {"reason": "MISSING_RW_TRANSACTION_ID"},
        )

    return _request_rw_outcome_to_handler_result(tid=tid, outcome=outcome)


HandlerFn = Callable[..., Awaitable[HandlerResult]]

_HANDLERS: Dict[str, HandlerFn] = {
    ActionName.REQUEST_CW.value: _handle_request_cw,
    ActionName.REPLY_RW.value: _handle_reply_rw,
    ActionName.REQUEST_RW.value: _handle_request_rw,
    ActionName.FW_VERIFICATION.value: _handle_fw_verification,
    ActionName.FW_INSTALLATION.value: _handle_fw_installation,
}


async def handle_action(action: str, payload: Dict[str, Any], *, sdk: CloudSDK) -> HandlerResult:
    """
    Public dispatcher for actions.

    - Looks up the action handler.
    - Normalizes all errors into HandlerResult.
    - Keeps error codes/results consistent for the MQTT response layer.
    """
    try:
        handler = _HANDLERS.get(action)
        if handler is None:
            return err(ErrorCode.NOT_OK, ErrorResult.NOT_OK)

        return await handler(payload, sdk=sdk)

    except ParamValidationError as exc:
        return err(
            ErrorCode.PARAM_INVALID,
            ErrorResult.PARAM_INVALID,
            payload={
                "reason": exc.reason,
                "key": exc.key,
            },
        )

    except KeyError as exc:
        return err(
            ErrorCode.KEY_ERROR,
            ErrorResult.KEY_ERROR,
            payload={"missing": str(exc)},
        )

    except (TypeError, ValueError) as exc:
        return err(
            ErrorCode.PARAM_INVALID,
            ErrorResult.PARAM_INVALID,
            payload={
                "reason": "INVALID_FIELD",
                "key": str(exc),
            },
        )

    except CyberRockError as exc:
        log.exception(
            "[handle_action:%s] CyberRockError status=%s details=%s body=%s",
            action,
            getattr(exc, "status", None),
            getattr(exc, "details", None),
            getattr(exc, "body", None),
        )
        return err(
            ErrorCode.CYBERROCK_ERROR,
            ErrorResult.CYBERROCK_ERROR,
            payload={"status": getattr(exc, "status", None)},
        )

    except Exception as exc:
        log.exception("[handle_action:%s] Unexpected error", action)
        return err(
            ErrorCode.NOT_OK,
            ErrorResult.NOT_OK,
            payload={"error": type(exc).__name__},
        )
