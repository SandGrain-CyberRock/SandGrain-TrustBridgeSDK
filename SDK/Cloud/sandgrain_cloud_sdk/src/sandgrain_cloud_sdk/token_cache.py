"""token_cache.py

In-memory access token cache for the Cloud SDK.

Stores:
- Device (formerly IoT) access tokens per `device_key`
- Tenant access token (single)
"""

from __future__ import annotations

import base64
import json
import time
from dataclasses import dataclass
from typing import Dict, Optional


def _jwt_exp_unverified(token: str) -> Optional[int]:
    """Best-effort parse of JWT exp without verifying signature."""
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return None
        payload_b64 = parts[1]
        # pad
        padding = "=" * (-len(payload_b64) % 4)
        payload = base64.urlsafe_b64decode(payload_b64 + padding).decode("utf-8")
        data = json.loads(payload)
        exp = data.get("exp")
        return int(exp) if exp is not None else None
    except Exception:
        return None


@dataclass
class TokenInfo:
    token: str
    exp: Optional[int]


class TokenCache:
    def __init__(self, expiry_window_s: int = 30) -> None:
        self._tenant: Optional[TokenInfo] = None
        self._device_by_key: Dict[str, TokenInfo] = {}
        self._window = int(expiry_window_s)

    # -------- Tenant token --------
    def set_tenant(self, token: str) -> None:
        self._tenant = TokenInfo(token=token, exp=_jwt_exp_unverified(token))

    def get_tenant(self) -> Optional[str]:
        if not self._tenant:
            return None
        if self._tenant.exp and time.time() > (self._tenant.exp - self._window):
            return None
        return self._tenant.token

    def clear_tenant(self) -> None:
        self._tenant = None

    # -------- Device tokens (per device_key) --------
    def set_device(self, device_key: str, token: str) -> None:
        self._device_by_key[str(device_key)] = TokenInfo(token=token, exp=_jwt_exp_unverified(token))

    def get_device(self, device_key: str) -> Optional[str]:
        info = self._device_by_key.get(str(device_key))
        if not info:
            return None
        if info.exp and time.time() > (info.exp - self._window):
            return None
        return info.token

    def clear_device(self, device_key: str) -> None:
        self._device_by_key.pop(str(device_key), None)

    # Backwards compatible names
    set_iot = set_device
    get_iot = get_device
    clear_iot = clear_device
