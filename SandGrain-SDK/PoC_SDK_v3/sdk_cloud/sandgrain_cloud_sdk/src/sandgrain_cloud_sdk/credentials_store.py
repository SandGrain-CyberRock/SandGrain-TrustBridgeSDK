from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

log = logging.getLogger("credentials-store")


@dataclass(frozen=True)
class DeviceCredentials:
    username: str
    password: str


@dataclass(frozen=True)
class TenantCredentials:
    email: str
    password: str


@dataclass(frozen=True)
class CfCredentials:
    """Cloudflare Access service-token credentials (per tenant)."""
    client_id: str
    client_secret: str


class CredentialsStore:
    def get_device_credentials(self, tid: str) -> Optional[DeviceCredentials]:
        raise NotImplementedError

    def get_tenant_credentials(self, tid: str) -> Optional[TenantCredentials]:
        raise NotImplementedError

    def get_cf_credentials(self, tid: str) -> Optional[CfCredentials]:
        """Per-tenant Cloudflare Access creds. None => caller uses its own
        defaults (e.g. the CF creds from .env). Stores that don't carry CF
        info (the standalone JSON file) return None."""
        return None


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


class BackendCredentialsStore(CredentialsStore):
    """
    TrustBridge mode: resolve credentials from the TrustBridge BE database via
    `GET {base_url}/devices/credentials-by-tid?tid=<TID>`.

    BE is the single source of truth here — there is NO fallback to a local
    file. If BE doesn't know the TID (or is unreachable), credential lookup
    returns None and authentication fails, by design.

    BE response shape (empty object {} if the TID is unknown):
        {
          "device_username": "...", "device_password": "...",
          "tenant_email": "...",    "tenant_password": "...",
          "cf_access_client_id": "...", "cf_access_client_secret": "..."
        }
    """

    def __init__(self, base_url: str, *, timeout_s: float = 10.0, cache_ttl_s: float = 30.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s
        self.cache_ttl_s = cache_ttl_s
        # tid -> (fetched_at, payload). Avoids 3 HTTP calls per ensure_device_token
        # (device + tenant + cf are all read from one response).
        self._cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
        log.info("BackendCredentialsStore using BE=%s (TrustBridge mode, no file fallback)", self.base_url)

    def _fetch(self, tid: str) -> Dict[str, Any]:
        cached = self._cache.get(tid)
        if cached and (time.monotonic() - cached[0]) < self.cache_ttl_s:
            return cached[1]

        url = f"{self.base_url}/devices/credentials-by-tid?" + urllib.parse.urlencode({"tid": tid})
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                raw = resp.read().decode("utf-8")
            data = json.loads(raw) if raw else {}
        except urllib.error.URLError as e:
            log.error("BE credentials lookup failed tid=%s url=%s: %s", tid, url, e)
            return {}
        except Exception as e:
            log.exception("BE credentials lookup error tid=%s: %s", tid, e)
            return {}

        if not isinstance(data, dict):
            log.error("BE credentials response not an object for tid=%s", tid)
            data = {}

        # BE wraps responses in an envelope: {"data": {...}, "message": "Success"}.
        # Unwrap it; tolerate a bare object too (standalone BE / future change).
        inner = data.get("data")
        if isinstance(inner, dict):
            data = inner

        self._cache[tid] = (time.monotonic(), data)
        return data

    def get_device_credentials(self, tid: str) -> Optional[DeviceCredentials]:
        data = self._fetch(tid)
        username = str(data.get("device_username") or "")
        password = str(data.get("device_password") or "")
        if not username or not password:
            log.warning("BE returned no device credentials for tid=%s", tid)
            return None
        log.info("BE device credentials resolved tid=%s username=%s (password masked)", tid, username)
        return DeviceCredentials(username=username, password=password)

    def get_tenant_credentials(self, tid: str) -> Optional[TenantCredentials]:
        data = self._fetch(tid)
        email = str(data.get("tenant_email") or "")
        password = str(data.get("tenant_password") or "")
        if not email or not password:
            log.warning("BE returned no tenant credentials for tid=%s", tid)
            return None
        log.info("BE tenant credentials resolved tid=%s email=%s (password masked)", tid, email)
        return TenantCredentials(email=email, password=password)

    def get_cf_credentials(self, tid: str) -> Optional[CfCredentials]:
        data = self._fetch(tid)
        client_id = str(data.get("cf_access_client_id") or "")
        client_secret = str(data.get("cf_access_client_secret") or "")
        if not client_id or not client_secret:
            return None
        return CfCredentials(client_id=client_id, client_secret=client_secret)
