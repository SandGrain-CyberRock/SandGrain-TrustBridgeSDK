"""
High-level cloud-side SDK facade.

The CyberRockClient is a thin REST client.
This facade adds:
- Local mapping from TID -> credentials
- Automatic device token management
- Polling helpers for async endpoints
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Optional

import aiohttp

from .credentials_store import CredentialsStore
from .cyberrock_client import CyberRockClient
from .exceptions import InvalidInputError, MissingTokenError, WorkflowTimeoutError
from .models import (
    CheckAuthStatusResponse,
    CheckRequestRWStatusResponse,
    RequestCWResponse,
    ReplyRWResponse,
    RequestTransactionIdResponse,
    RequestRWResponse,
)
from .token_cache import TokenCache

log = logging.getLogger("cloud-sdk")


@dataclass(frozen=True)
class CloudSDKConfig:
    base_url: str
    poll_interval_s: float = 1.0
    poll_timeout_s: float = 30.0


class CloudSDK:
    def __init__(
        self,
        *,
        cfg: CloudSDKConfig,
        session: aiohttp.ClientSession,
        creds: CredentialsStore,
        token_cache: Optional[TokenCache] = None,
        cf_access_client_id: Optional[str] = None,
        cf_access_client_secret: Optional[str] = None,
    ) -> None:
        self.cfg = cfg
        self.creds = creds
        self.client = CyberRockClient(
            base_url=cfg.base_url,
            session=session,
            token_cache=token_cache or TokenCache(),
            cf_access_client_id=cf_access_client_id,
            cf_access_client_secret=cf_access_client_secret,
        )
        log.info("CloudSDK initialized base_url=%s", cfg.base_url)

    async def ensure_device_token(self, tid: str, *, device_key: str = "default") -> str:
        token = self.client.tokens.get_device(device_key)
        if token and tid == str(token):
            log.info("ensure_device_token cache HIT device_key=%s tid=%s", device_key, tid)
            return str(token)

        log.warning("ensure_device_token cache MISS device_key=%s tid=%s -> lookup creds", device_key, tid)

        c = self.creds.get_device_credentials(tid)
        if not c:
            log.error("No device credentials resolved for tid=%s (check JSON path/format/key)", tid)
            raise MissingTokenError(f"device credentials for tid={tid}")

        log.info("Resolved device creds tid=%s username=%s (password masked)", tid, c.username)

        res = await self.client.device_login(c.username, c.password, device_key=device_key)
        log.info("device_login OK tid=%s device_key=%s device_id=%s", tid, device_key, res.device_id)
        return res.access_token

    async def ensure_tenant_token(self, tid: str) -> str:
        token = self.client.tokens.get_tenant()
        if token and tid == str(token):
            log.info("ensure_tenant_token cache HIT tid=%s", tid)
            return str(token)

        log.warning("ensure_tenant_token cache MISS tid=%s -> lookup creds", tid)

        c = self.creds.get_tenant_credentials(tid)
        if not c:
            log.error("No tenant credentials resolved for tid=%s", tid)
            raise MissingTokenError(f"tenant credentials for tid={tid}")

        log.info("Resolved tenant creds tid=%s email=%s (password masked)", tid, c.email)

        res = await self.client.tenant_user_login(c.email, c.password)
        log.info("tenant_user_login OK tid=%s", tid)
        return res.access_token

    async def request_cw(self, *, tid: str, device_key: str = "default") -> RequestCWResponse:
        log.info("SDK request_cw tid=%s device_key=%s", tid, device_key)
        token = await self.ensure_device_token(tid, device_key=device_key)
        return await self.client.request_cw(
            tid=tid,
            device_key=device_key,
            device_access_token=token,
        )

    async def reply_rw(
        self,
        *,
        tid: str,
        cw: str,
        rw: str,
        transaction_id: str,
        action_id: str,
        device_key: str = "default",
    ) -> ReplyRWResponse:
        _ = action_id
        log.info("SDK reply_rw tid=%s tx=%s device_key=%s", tid, transaction_id, device_key)
        token = await self.ensure_device_token(tid, device_key=device_key)
        return await self.client.reply_rw(
            tid=tid,
            cw=cw,
            rw=rw,
            transaction_id=transaction_id,
            device_key=device_key,
            device_access_token=token,
        )

    async def check_auth_status(
        self,
        *,
        transaction_id: str,
        tid: str,
        device_key: str = "default",
    ) -> CheckAuthStatusResponse:
        log.info("SDK check_auth_status tid=%s tx=%s device_key=%s", tid, transaction_id, device_key)
        token = await self.ensure_device_token(tid, device_key=device_key)
        return await self.client.check_auth_status(
            transaction_id,
            device_key=device_key,
            device_access_token=token,
        )


    async def request_transaction_id(
        self,
        *,
        tid: str,
        cw: str,
        device_key: str = "default",
    ) -> RequestTransactionIdResponse:
        log.info("SDK request_transaction_id tid=%s device_key=%s", tid, device_key)
        token = await self.ensure_device_token(tid, device_key=device_key)
        return await self.client.request_transaction_id(
            tid=tid,
            hcw=cw,
            device_key=device_key,
            device_access_token=token,
        )

    async def request_rw(
        self,
        *,
        tid: str,
        cw: str,
        transaction_id: Optional[str] = None,
        device_key: str = "default",
    ) -> RequestRWResponse:
        log.info("SDK request_rw tid=%s device_key=%s txid_provided=%s", tid, device_key, bool(transaction_id))
        token = await self.ensure_device_token(tid, device_key=device_key)
        return await self.client.request_rw(
            tid=tid,
            cw=cw,
            transaction_id=transaction_id,
            device_key=device_key,
            device_access_token=token,
        )

    async def check_request_rw_status(
        self,
        *,
        rw_transaction_id: str,
        tid: str,
        device_key: str = "default",
    ) -> CheckRequestRWStatusResponse:
        log.info("SDK check_request_rw_status tid=%s rw_tx=%s device_key=%s", tid, rw_transaction_id, device_key)
        token = await self.ensure_device_token(tid, device_key=device_key)
        return await self.client.check_request_rw_status(
            rw_transaction_id,
            device_key=device_key,
            device_access_token=token,
        )

    async def wait_auth_ok(
        self,
        *,
        transaction_id: str,
        tid: str,
        device_key: str = "default",
    ) -> CheckAuthStatusResponse:
        log.info("SDK wait_auth_ok start tid=%s tx=%s timeout=%.1fs", tid, transaction_id, self.cfg.poll_timeout_s)
        start = time.time()
        while True:
            res = await self.check_auth_status(
                transaction_id=transaction_id,
                tid=tid,
                device_key=device_key,
            )
            log.info("SDK wait_auth_ok status=%s", res.status)

            if res.status not in {"PROCESSING", "NOT_READY"}:
                return res

            if time.time() - start > self.cfg.poll_timeout_s:
                raise WorkflowTimeoutError(self.cfg.poll_timeout_s)

            await asyncio.sleep(self.cfg.poll_interval_s)

    async def wait_generated_rw(
        self,
        *,
        rw_transaction_id: str,
        tid: str,
        device_key: str = "default",
    ) -> str:
        log.info("SDK wait_generated_rw start tid=%s rw_tx=%s", tid, rw_transaction_id)
        start = time.time()
        while True:
            res = await self.check_request_rw_status(
                rw_transaction_id=rw_transaction_id,
                tid=tid,
                device_key=device_key,
            )

            if res.status == "GENERATED_RW":
                if not res.rw:
                    raise InvalidInputError("GENERATED_RW but missing RW")
                return res.rw

            if res.status == "AUTH_NOT_OK":
                raise InvalidInputError("AUTH_NOT_OK")

            if time.time() - start > self.cfg.poll_timeout_s:
                raise WorkflowTimeoutError(self.cfg.poll_timeout_s)

            await asyncio.sleep(self.cfg.poll_interval_s)
