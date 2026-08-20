from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional
from urllib.parse import urlencode

import aiohttp

from .exceptions import CyberRockError, MissingTokenError
from .models import (
    TenantLoginResponse,
    ClaimTokenResponse,
    DeviceLoginResponse,
    IoTLoginResponse,
    RequestCWResponse,
    ReplyRWResponse,
    CheckAuthStatusResponse,
    RequestRWResponse,
    CheckRequestRWStatusResponse,
    # HRW flow
    RequestTransactionIdResponse,
    RequestHRWResponse,
    CheckRequestHRWStatusResponse,
)
from .token_cache import TokenCache

log = logging.getLogger("cyberrock-client")


def _mask_value(value: Optional[str]) -> str:
    if not value:
        return ""
    return "***MASKED***"


def _mask_json(d: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not d:
        return d
    out = dict(d)
    for k in ("password", "accessToken", "token", "Authorization", "RW", "HRW"):
        if k in out and out[k]:
            out[k] = "***MASKED***"
    return out


def _mask_headers(h: Dict[str, str]) -> Dict[str, str]:
    out = dict(h)
    if "Authorization" in out:
        out["Authorization"] = "Bearer ***MASKED***"
    if "CF-Access-Client-Secret" in out:
        out["CF-Access-Client-Secret"] = "***MASKED***"
    return out


class CyberRockClient:
    def __init__(
        self,
        base_url: str,
        session: aiohttp.ClientSession,
        token_cache: Optional[TokenCache] = None,
        cf_access_client_id: Optional[str] = None,
        cf_access_client_secret: Optional[str] = None,
        timeout_s: float = 15.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.session = session
        self.tokens = token_cache or TokenCache()
        self.cf_access_client_id = cf_access_client_id
        self.cf_access_client_secret = cf_access_client_secret
        self.timeout = aiohttp.ClientTimeout(total=timeout_s)

        log.info("CyberRockClient initialized base_url=%s timeout_s=%.1f", self.base_url, timeout_s)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        bearer_token: Optional[str] = None,
        cf_access: bool = False,
        json_body: Optional[Dict[str, Any]] = None,
        query: Optional[Dict[str, Any]] = None,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        if query:
            url = f"{url}?{urlencode(query)}"

        headers: Dict[str, str] = {"Content-Type": "application/json"}

        if bearer_token:
            headers["Authorization"] = f"Bearer {bearer_token}"

        if cf_access:
            if not self.cf_access_client_id or not self.cf_access_client_secret:
                raise MissingTokenError("cfAccessClientId/cfAccessClientSecret")
            headers["CF-Access-Client-Id"] = self.cf_access_client_id
            headers["CF-Access-Client-Secret"] = self.cf_access_client_secret

        if extra_headers:
            headers.update(extra_headers)

        # Safe logging (masked)
        log.info("HTTP %s %s", method, url)
        log.debug("Request headers=%s", _mask_headers(headers))
        log.debug("Request json=%s", _mask_json(json_body))

        async with self.session.request(
            method,
            url,
            headers=headers,
            json=json_body,
            timeout=self.timeout,
            allow_redirects=False,
        ) as resp:
            # Cloudflare Access sometimes returns a redirect instead of JSON
            if resp.status in (301, 302, 303, 307, 308):
                loc = resp.headers.get("Location", "")
                raise CyberRockError(
                    resp.status,
                    "Cloudflare Access redirect blocked request. Ensure CF-Access-Client-Id and CF-Access-Client-Secret are configured.",
                    {"location": loc},
                )

            text = await resp.text()
            log.info("HTTP status=%s for %s %s", resp.status, method, path)
            log.debug("Raw response body=%s", text)

            try:
                body = json.loads(text) if text else {}
            except Exception:
                body = {"raw": text}

            # Cloudflare Access HTML sign-in page heuristic
            if isinstance(body, dict) and "raw" in body and "Cloudflare Access" in str(body["raw"]):
                raise CyberRockError(
                    resp.status,
                    "Cloudflare Access blocked request (received HTML sign-in page). Ensure CF-Access-Client-Id and CF-Access-Client-Secret are configured.",
                    body,
                )

            if resp.status < 200 or resp.status >= 300:
                detail = None
                if isinstance(body, dict):
                    detail = body.get("message") or body.get("error") or body.get("raw")
                log.error("HTTP error %s detail=%s body=%s", resp.status, detail, body)
                raise CyberRockError(resp.status, f"HTTP error: {detail}" if detail else "HTTP error", body)

            return body if isinstance(body, dict) else {"data": body}

    # ---------- Tenant ----------
    async def tenant_user_login(self, email: str, password: str) -> TenantLoginResponse:
        log.info("tenant_user_login email=%s", email)

        body = await self._request(
            "POST",
            "/api/auth/tenantUserLogin",
            json_body={"email": email, "password": password},  # send REAL password
        )
        token = body.get("accessToken")
        if not token:
            raise CyberRockError(500, "Missing accessToken in tenant login response", body)

        self.tokens.set_tenant(token)
        log.info("Tenant token stored (masked=%s)", _mask_value(str(token)))

        return TenantLoginResponse(
            first_name=body.get("firstName"),
            last_name=body.get("lastName"),
            access_token=str(token),
        )

    async def claim_token(
        self,
        claim_token_id: str,
        tenant_access_token: Optional[str] = None,
    ) -> ClaimTokenResponse:
        token = tenant_access_token or self.tokens.get_tenant()
        if not token:
            raise MissingTokenError("tenantAccessToken")

        log.info("claim_token claim_token_id=%s", claim_token_id)

        body = await self._request(
            "POST",
            "/api/tenantApi/claim-token",
            bearer_token=str(token),
            json_body={"claimTokenId": claim_token_id},
        )

        result = body.get("result")
        if not result:
            raise CyberRockError(500, "Missing result in claim-token response", body)

        remaining = body.get("remainingCredit")
        log.info("claim_token OK result=%s remaining=%s", result, remaining)

        return ClaimTokenResponse(
            result=str(result),
            remaining_credit=int(remaining) if remaining is not None else None,
        )

    # ---------- Device ----------
    async def device_login(self, username: str, password: str, *, device_key: str = "default") -> DeviceLoginResponse:
        log.info("device_login username=%s device_key=%s (password masked)", username, device_key)

        # Login is typically CF-protected, Bearer is not applicable here.
        body = await self._request(
            "POST",
            "/api/auth/deviceLogin",
            cf_access=True,
            json_body={"username": username, "password": password},  # send REAL password
        )
        token = body.get("accessToken")
        if not token:
            raise CyberRockError(
                500,
                f"Missing accessToken in device login response. Body keys={list(body.keys())}",
                body,
            )

        self.tokens.set_device(device_key, str(token))
        log.info("Device token stored for device_key=%s (masked=%s)", device_key, _mask_value(str(token)))

        device_id = body.get("deviceId") or body.get("iotId")
        user = body.get("username")
        if not device_id or not user:
            raise CyberRockError(500, "Missing deviceId/username in device login response", body)

        return DeviceLoginResponse(device_id=str(device_id), username=str(user), access_token=str(token))

    # Backwards compatible alias
    async def iot_login(self, username: str, password: str, *, device_key: str = "default") -> IoTLoginResponse:
        res = await self.device_login(username, password, device_key=device_key)
        return IoTLoginResponse(device_id=res.device_id, username=res.username, access_token=res.access_token)

    def _get_device_bearer(self, *, device_key: str, device_access_token: Optional[str]) -> str:
        token = device_access_token or self.tokens.get_device(device_key)
        if not token:
            raise MissingTokenError("deviceAccessToken (login required)")
        return str(token)

    # ---------- Device Auth: requestCW / replyRW / checkAuthStatus ----------
    async def request_cw(
        self,
        *,
        tid: Optional[str] = None,
        pcc: Optional[str] = None,
        device_id: Optional[str] = None,
        device_key: str = "default",
        request_signed_response: bool = False,
        device_access_token: Optional[str] = None,
    ) -> RequestCWResponse:
        if not tid:
            if not pcc or not device_id:
                raise MissingTokenError("tid (or pcc+device_id)")
            tid = f"{pcc}{device_id}"

        bearer = self._get_device_bearer(device_key=device_key, device_access_token=device_access_token)

        log.info("request_cw tid=%s device_key=%s", tid, device_key)

        body = await self._request(
            "POST",
            "/api/device/requestCW",
            cf_access=True,
            bearer_token=bearer,
            json_body={"requestSignedResponse": bool(request_signed_response), "TID": tid},
        )
        cw = body.get("CW")
        tx = body.get("transactionId")
        if not cw or not tx:
            raise CyberRockError(500, "Missing CW/transactionId in requestCW response", body)

        log.info("request_cw OK transaction_id=%s", tx)
        return RequestCWResponse(cw=str(cw), transaction_id=str(tx))

    async def reply_rw(
        self,
        *,
        tid: str,
        cw: str,
        rw: str,
        transaction_id: str,
        request_signed_response: bool = False,
        device_key: str = "default",
        device_access_token: Optional[str] = None,
    ) -> ReplyRWResponse:
        bearer = self._get_device_bearer(device_key=device_key, device_access_token=device_access_token)

        log.info("reply_rw tid=%s transaction_id=%s", tid, transaction_id)

        body = await self._request(
            "POST",
            "/api/device/replyRW",
            cf_access=True,
            bearer_token=bearer,
            json_body={
                "requestSignedResponse": bool(request_signed_response),
                "TID": tid,
                "CW": cw,
                "RW": rw,
                "transactionId": transaction_id,
            },
        )
        tx = body.get("transactionId") or body.get("transactionID")
        if not tx:
            raise CyberRockError(500, "Missing transactionId in replyRW response", body)

        log.info("reply_rw accepted transaction_id=%s", tx)
        return ReplyRWResponse(transaction_id=str(tx))

    async def check_auth_status(
        self,
        transaction_id: str,
        *,
        device_key: str = "default",
        device_access_token: Optional[str] = None,
    ) -> CheckAuthStatusResponse:
        bearer = self._get_device_bearer(device_key=device_key, device_access_token=device_access_token)

        log.info("check_auth_status transaction_id=%s", transaction_id)

        body = await self._request(
            "GET",
            "/api/device/checkAuthStatus",
            cf_access=True,
            bearer_token=bearer,
            query={
                "transactionId": transaction_id,
            },
            extra_headers={
                "transactionId": transaction_id,
            },
        )

        raw_status = body.get("status")
        status: Optional[str] = None
        if isinstance(raw_status, str):
            status = raw_status
        elif isinstance(raw_status, dict) and raw_status:
            status = next(iter(raw_status.keys()))

        if not status:
            raise CyberRockError(500, "Missing status in checkAuthStatus response", body)

        claim_token_id = body.get("claimTokenId") or body.get("claimId")
        log.info("check_auth_status status=%s claim_token_id=%s", status, claim_token_id)

        return CheckAuthStatusResponse(
            status=str(status),
            claim_token_id=str(claim_token_id) if claim_token_id else None,
        )

    # ---------- Mutual auth (single checkstatus returns HRW2) ----------
    # New CyberRock flow: requestMutualAuthCW -> replyMutualAuthRW ->
    # checkMutualAuthStatus, where checkMutualAuthStatus returns the host-auth
    # HRW2 alongside the token-auth verdict — so Phase 2 (host-auth) folds into
    # the same transaction instead of a separate requestRW round-trip.
    async def request_mutual_auth_cw(
        self,
        *,
        tid: Optional[str] = None,
        pcc: Optional[str] = None,
        device_id: Optional[str] = None,
        device_key: str = "default",
        request_signed_response: bool = False,
        device_access_token: Optional[str] = None,
    ) -> RequestCWResponse:
        if not tid:
            if not pcc or not device_id:
                raise MissingTokenError("tid (or pcc+device_id)")
            tid = f"{pcc}{device_id}"

        bearer = self._get_device_bearer(device_key=device_key, device_access_token=device_access_token)
        log.info("request_mutual_auth_cw tid=%s device_key=%s", tid, device_key)

        body = await self._request(
            "POST",
            "/api/device/requestMutualAuthCW",
            cf_access=True,
            bearer_token=bearer,
            json_body={"requestSignedResponse": bool(request_signed_response), "TID": tid},
        )
        cw = body.get("CW")
        tx = body.get("transactionId")
        if not cw or not tx:
            raise CyberRockError(500, "Missing CW/transactionId in requestMutualAuthCW response", body)

        log.info("request_mutual_auth_cw OK transaction_id=%s", tx)
        return RequestCWResponse(cw=str(cw), transaction_id=str(tx))

    async def reply_mutual_auth_rw(
        self,
        *,
        tid: str,
        cw: str,
        rw: str,
        transaction_id: str,
        request_signed_response: bool = False,
        device_key: str = "default",
        device_access_token: Optional[str] = None,
    ) -> ReplyRWResponse:
        bearer = self._get_device_bearer(device_key=device_key, device_access_token=device_access_token)
        log.info("reply_mutual_auth_rw tid=%s transaction_id=%s", tid, transaction_id)

        body = await self._request(
            "POST",
            "/api/device/replyMutualAuthRW",
            cf_access=True,
            bearer_token=bearer,
            json_body={
                "requestSignedResponse": bool(request_signed_response),
                "TID": tid,
                "CW": cw,
                "RW": rw,
                "transactionId": transaction_id,
            },
        )
        tx = body.get("transactionId") or body.get("transactionID")
        if not tx:
            raise CyberRockError(500, "Missing transactionId in replyMutualAuthRW response", body)

        log.info("reply_mutual_auth_rw accepted transaction_id=%s", tx)
        return ReplyRWResponse(transaction_id=str(tx))

    async def check_mutual_auth_status(
        self,
        transaction_id: str,
        *,
        device_key: str = "default",
        device_access_token: Optional[str] = None,
    ) -> CheckAuthStatusResponse:
        bearer = self._get_device_bearer(device_key=device_key, device_access_token=device_access_token)
        log.info("check_mutual_auth_status transaction_id=%s", transaction_id)

        body = await self._request(
            "GET",
            "/api/device/checkMutualAuthStatus",
            cf_access=True,
            bearer_token=bearer,
            query={"transactionId": transaction_id},
            extra_headers={"transactionId": transaction_id},
        )

        raw_status = body.get("status")
        status: Optional[str] = None
        if isinstance(raw_status, str):
            status = raw_status
        elif isinstance(raw_status, dict) and raw_status:
            status = next(iter(raw_status.keys()))

        if not status:
            raise CyberRockError(500, "Missing status in checkMutualAuthStatus response", body)

        hrw2 = body.get("HRW2") or body.get("hrw2")
        claim_token_id = body.get("claimTokenId") or body.get("claimId")
        log.info("check_mutual_auth_status status=%s has_hrw2=%s claim_token_id=%s",
                 status, bool(hrw2), claim_token_id)

        return CheckAuthStatusResponse(
            status=str(status),
            claim_token_id=str(claim_token_id) if claim_token_id else None,
            hrw2=str(hrw2) if hrw2 else None,
        )

    # ---------- Mutual auth (Host/Cloud RW) : HCW/HRW endpoints ----------
    async def request_transaction_id(
        self,
        *,
        tid: str,
        hcw: str,
        device_key: str = "default",
        request_signed_response: bool = False,
        device_access_token: Optional[str] = None,
    ) -> RequestTransactionIdResponse:
        bearer = self._get_device_bearer(device_key=device_key, device_access_token=device_access_token)

        log.info("request_transaction_id tid=%s", tid)

        body = await self._request(
            "POST",
            "/api/device/requestTransactionId",
            cf_access=True,
            bearer_token=bearer,
            json_body={
                "requestSignedResponse": bool(request_signed_response),
                "TID": tid,
                "HCW": hcw,
            },
        )

        tx = body.get("transactionId")
        out_hcw = body.get("HCW") or hcw
        if not tx:
            raise CyberRockError(500, "Missing transactionId in requestTransactionId response", body)

        log.info("request_transaction_id OK transaction_id=%s", tx)
        return RequestTransactionIdResponse(hcw=str(out_hcw), transaction_id=str(tx))

    async def request_hrw(
        self,
        *,
        tid: str,
        hcw: str,
        transaction_id: Optional[str] = None,
        device_key: str = "default",
        request_signed_response: bool = False,
        device_access_token: Optional[str] = None,
    ) -> RequestHRWResponse:
        bearer = self._get_device_bearer(device_key=device_key, device_access_token=device_access_token)

        log.info("request_hrw tid=%s transaction_id=%s", tid, transaction_id)

        # UAT's requestHRW takes {TID, HCW} and RETURNS the transactionId itself;
        # there is no separate requestTransactionId pre-step (that endpoint 404s
        # on UAT). transactionId is only sent back on a follow-up poll if given.
        json_body = {
            "requestSignedResponse": bool(request_signed_response),
            "TID": tid,
            "HCW": hcw,
        }
        if transaction_id:
            json_body["transactionId"] = transaction_id

        body = await self._request(
            "POST",
            "/api/device/requestHRW",
            cf_access=True,
            bearer_token=bearer,
            json_body=json_body,
        )

        tx = body.get("transactionId") or body.get("transactionID")
        if not tx:
            raise CyberRockError(500, "Missing transactionId in requestHRW response", body)

        log.info("request_hrw accepted transaction_id=%s", tx)
        return RequestHRWResponse(transaction_id=str(tx))

    async def check_request_hrw_status(
        self,
        transaction_id: str,
        *,
        device_key: str = "default",
        device_access_token: Optional[str] = None,
    ) -> CheckRequestHRWStatusResponse:
        bearer = self._get_device_bearer(device_key=device_key, device_access_token=device_access_token)

        log.info("check_request_hrw_status transaction_id=%s", transaction_id)

        body = await self._request(
            "GET",
            "/api/device/checkRequestHRWStatus",
            cf_access=True,
            bearer_token=bearer,
            extra_headers={
                "transactionId": transaction_id,
                "TransactionId": transaction_id,
                "Transaction ID": transaction_id,
                "Transaction-ID": transaction_id,
            },
            query={
                "transactionId": transaction_id,
                "TransactionId": transaction_id,
                "Transaction ID": transaction_id,
                "Transaction-ID": transaction_id,
            },
        )

        raw_status = body.get("status")
        status: Optional[str] = None
        if isinstance(raw_status, str):
            status = raw_status
        elif isinstance(raw_status, dict) and raw_status:
            status = next(iter(raw_status.keys()))

        if not status:
            raise CyberRockError(500, "Missing status in checkRequestHRWStatus response", body)

        hrw = body.get("HRW") or body.get("hrw")
        log.info("check_request_hrw_status status=%s hrw_present=%s", status, bool(hrw))

        return CheckRequestHRWStatusResponse(status=str(status), hrw=str(hrw) if hrw else None)

    # ---------- Compatibility surface: keep request_rw / check_request_rw_status ----------
    async def request_rw(
        self,
        *,
        tid: str,
        cw: str,
        transaction_id: Optional[str] = None,
        device_key: str = "default",
        device_access_token: Optional[str] = None,
    ) -> RequestRWResponse:
        bearer = self._get_device_bearer(device_key=device_key, device_access_token=device_access_token)
        _ = bearer  # keep local, used in downstream calls

        log.info("request_rw (maps to HRW flow) tid=%s", tid)

        # requestHRW takes {TID, HCW=CW} and returns the transactionId directly.
        # The legacy requestTransactionId pre-step 404s on UAT, so it is skipped —
        # matches the reference BitErrorHandling flow (requestHRW -> checkRequestHRWStatus).
        hrw_req = await self.request_hrw(
            tid=tid,
            hcw=cw,
            transaction_id=None,
            device_key=device_key,
            device_access_token=bearer,
        )

        return RequestRWResponse(rw_transaction_id=hrw_req.transaction_id)

    async def check_request_rw_status(
        self,
        rw_transaction_id: str,
        *,
        device_key: str = "default",
        device_access_token: Optional[str] = None,
    ) -> CheckRequestRWStatusResponse:
        bearer = self._get_device_bearer(device_key=device_key, device_access_token=device_access_token)

        log.info("check_request_rw_status (maps to HRW) rw_transaction_id=%s", rw_transaction_id)

        st = await self.check_request_hrw_status(
            rw_transaction_id,
            device_key=device_key,
            device_access_token=bearer,
        )

        return CheckRequestRWStatusResponse(status=st.status, rw=st.hrw)

