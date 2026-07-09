# models.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


# ---------- Auth / Tenant ----------
@dataclass(frozen=True)
class TenantLoginResponse:
    first_name: Optional[str]
    last_name: Optional[str]
    access_token: str


@dataclass(frozen=True)
class ClaimTokenResponse:
    result: str
    remaining_credit: Optional[int] = None


# ---------- Auth / Device ----------
@dataclass(frozen=True)
class DeviceLoginResponse:
    device_id: str
    username: str
    access_token: str


# Backwards compatible alias model (kept for API stability)
@dataclass(frozen=True)
class IoTLoginResponse:
    device_id: str
    username: str
    access_token: str


# ---------- Device Auth (device RW flow: requestCW/replyRW/checkAuthStatus) ----------
@dataclass(frozen=True)
class RequestCWResponse:
    cw: str
    transaction_id: str


@dataclass(frozen=True)
class ReplyRWResponse:
    transaction_id: str


@dataclass(frozen=True)
class CheckAuthStatusResponse:
    status: str
    claim_token_id: Optional[str] = None


# ---------- Mutual auth (host/cloud RW flow) ----------
# Public naming stays RequestRW/CheckRequestRWStatus, but internally it maps to:
# CW -> HCW, RW -> HRW and endpoints:
# requestTransactionId -> requestHRW -> checkRequestHRWStatus

@dataclass(frozen=True)
class RequestRWResponse:
    # In HRW flow this is the HRW request transactionId (used to poll checkRequestHRWStatus)
    rw_transaction_id: str


@dataclass(frozen=True)
class CheckRequestRWStatusResponse:
    # HRW flow statuses: PROCESSING / NOT_READY / AUTH_NOT_OK / GENERATED_RW
    status: str
    # HRW returned by backend is mapped to "rw" for compatibility with CW/RW naming
    rw: Optional[str] = None


# ---------- HRW-native helper responses (internal use / optional exposure) ----------
@dataclass(frozen=True)
class RequestTransactionIdResponse:
    hcw: str
    transaction_id: str


@dataclass(frozen=True)
class RequestHRWResponse:
    transaction_id: str


@dataclass(frozen=True)
class CheckRequestHRWStatusResponse:
    status: str
    hrw: Optional[str] = None
