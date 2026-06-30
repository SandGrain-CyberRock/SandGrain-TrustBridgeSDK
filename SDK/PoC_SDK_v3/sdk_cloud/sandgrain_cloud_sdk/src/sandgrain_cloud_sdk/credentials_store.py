from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

log = logging.getLogger("credentials-store")


@dataclass(frozen=True)
class DeviceCredentials:
    username: str
    password: str


@dataclass(frozen=True)
class TenantCredentials:
    email: str
    password: str


class CredentialsStore:
    def get_device_credentials(self, tid: str) -> Optional[DeviceCredentials]:
        raise NotImplementedError

    def get_tenant_credentials(self, tid: str) -> Optional[TenantCredentials]:
        raise NotImplementedError


class JsonFileCredentialsStore(CredentialsStore):
    """
    Supported formats:

    NEW (recommended):
    {
      "tenant": { "email": "...", "password": "..." },
      "devices": {
        "<TID>": { "username": "...", "password": "..." }
      }
    }

    OLD:
    {
      "devices": {
        "<TID>": {
          "device": { "username": "...", "password": "..." },
          "tenant": { "email": "...", "password": "..." }
        }
      }
    }
    """

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        log.info("JsonFileCredentialsStore using file=%s", str(self.path.resolve()))

    def _load(self) -> Dict[str, Any]:
        try:
            raw = self.path.read_text(encoding="utf-8")
        except Exception as e:
            log.exception("Failed to read credentials JSON file=%s: %s", self.path, e)
            raise

        try:
            data = json.loads(raw)
        except Exception as e:
            log.exception("Failed to parse credentials JSON file=%s: %s", self.path, e)
            raise

        if not isinstance(data, dict):
            raise ValueError("credentials JSON root must be an object")

        devices = data.get("devices")
        log.info(
            "Credentials JSON loaded ok. Has devices=%s tenant_at_root=%s",
            isinstance(devices, dict),
            isinstance(data.get("tenant"), dict),
        )
        return data

    def get_device_credentials(self, tid: str) -> Optional[DeviceCredentials]:
        data = self._load()
        devices = data.get("devices") or {}
        if not isinstance(devices, dict):
            log.error("Invalid credentials JSON: 'devices' must be an object")
            return None

        entry = devices.get(tid)
        if not isinstance(entry, dict):
            log.warning("No device entry found for tid=%s", tid)
            # Help debug: show a few keys
            try:
                sample_keys = list(devices.keys())[:5]
                log.info("Sample device keys in JSON (first 5)=%s", sample_keys)
            except Exception:
                pass
            return None

        # OLD format
        if isinstance(entry.get("device"), dict):
            dev = entry.get("device") or {}
            log.info("Device credentials format=OLD tid=%s username=%s", tid, dev.get("username"))
        else:
            # NEW format
            dev = entry
            log.info("Device credentials format=NEW tid=%s username=%s", tid, dev.get("username"))

        username = str(dev.get("username") or "")
        password = str(dev.get("password") or "")
        if not username or not password:
            log.error("Device credentials incomplete for tid=%s (username/password missing)", tid)
            return None

        return DeviceCredentials(username=username, password=password)

    def get_tenant_credentials(self, tid: str) -> Optional[TenantCredentials]:
        data = self._load()

        # Prefer OLD per-device tenant if present
        devices = data.get("devices") or {}
        if isinstance(devices, dict):
            entry = devices.get(tid) or {}
            if isinstance(entry, dict):
                ten = entry.get("tenant") or {}
                if isinstance(ten, dict) and ten:
                    email = str(ten.get("email") or "")
                    password = str(ten.get("password") or "")
                    log.info("Tenant credentials found format=OLD tid=%s email=%s", tid, email)
                    if email and password:
                        return TenantCredentials(email=email, password=password)

        # NEW format: tenant at root
        ten_root = data.get("tenant") or {}
        if isinstance(ten_root, dict) and ten_root:
            email = str(ten_root.get("email") or "")
            password = str(ten_root.get("password") or "")
            log.info("Tenant credentials found format=NEW(root) tid=%s email=%s", tid, email)
            if email and password:
                return TenantCredentials(email=email, password=password)

        log.warning("No tenant credentials found for tid=%s", tid)
        return None
