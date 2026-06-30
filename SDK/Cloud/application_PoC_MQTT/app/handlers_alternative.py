"""
IMPORTANT: THIS HANDLERS VERSION MAKES THE EMBEDDED PART CHECK FOR THE CLOUD RW STATUS - AS IT APPEARS IN THE OFFICIAL DOCUMENTATION

MQTT message handlers for the SandGrain POC Cloud App (mutual authentication).

Actions (topics: sandgrain/v1/<DEVICE_ID>/req/<action>)
-----------------------------------------------------
- requestCW
  Input:  { "TID": "..." }
  Output: { "CW": "...", "transactionId": "..." }

- replyRW   (device computed RW -> cloud -> CyberRock)
  Input:  { "TID": "...", "CW": "...", "RW": "...", "transactionId": "..." }
  Output: { "transactionId": "..." }

- checkAuthStatus
  Input:  { "TID": "...", "transactionId": "..." }
  Output: { "status": "...", "claimTokenId": "..."? }

- requestRW (cloud asks CyberRock to generate RW for device-provided CW)
  Input:  { "TID": "...", "CW": "...", "transactionId": "..." }
  Output: { "rwTransactionId": "..." }

- checkRequestRWStatus
  Input:  { "rwTransactionId": "..." }
  Output: { "status": "...", "RW": "..."? }

Notes
-----
- Embedded does NOT send login credentials. Cloud app/SDK looks them up by TID.
- Legacy fields are NOT supported (no PCC/ID, no PCCID, no transactionId alias for rwTransactionId).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from sandgrain_cloud_sdk import CloudSDK
from sandgrain_cloud_sdk.exceptions import CyberRockError


@dataclass(frozen=True)
class HandlerResult:
    ok: bool
    payload: Optional[Dict[str, Any]] = None
    error_code: Optional[int] = None


def _extract_tid(payload: Dict[str, Any]) -> str:
    tid = payload.get("TID")
    if tid is None:
        raise KeyError("TID")
    return str(tid)


async def handle_action(action: str, payload: dict, *, sdk: CloudSDK) -> HandlerResult:
    try:
        if action == "requestCW":
            tid = _extract_tid(payload)
            res = await sdk.request_cw(tid=tid)
            return HandlerResult(ok=True, payload={"CW": res.cw, "transactionId": res.transaction_id})

        if action == "replyRW":
            tid = _extract_tid(payload)
            cw = str(payload["CW"])
            rw = str(payload["RW"])
            tx = str(payload["transactionId"])
            res = await sdk.reply_rw(
                tid=tid,
                cw=cw,
                rw=rw,
                transaction_id=tx,
                action_id="replyRW",
            )
            return HandlerResult(ok=True, payload={"transactionId": res.transaction_id})

        if action == "checkAuthStatus":
            tid = _extract_tid(payload)
            tx = str(payload["transactionId"])
            res = await sdk.check_auth_status(transaction_id=tx, tid=tid)
            out: Dict[str, Any] = {"status": res.status}
            if res.claim_token_id:
                out["claimTokenId"] = res.claim_token_id
            return HandlerResult(ok=True, payload=out)

        if action == "requestRW":
            tid = _extract_tid(payload)
            cw = str(payload["CW"])
            tx = str(payload["transactionId"])
            res = await sdk.request_rw(tid=tid, cw=cw, transaction_id=tx)
            return HandlerResult(ok=True, payload={"rwTransactionId": res.rw_transaction_id})

        if action == "checkRequestRWStatus":
            rw_tx = str(payload.get("rwTransactionId") or payload.get("transactionId") or "")
            if not rw_tx:
                raise KeyError("rwTransactionId")
            st = await sdk.check_request_rw_status(rw_transaction_id=str(rw_tx))
            out: Dict[str, Any] = {"status": st.status}
            if st.rw:
                out["RW"] = st.rw
            return HandlerResult(ok=True, payload=out)
        
        if action == "checkAuthStatusCloud":
            tid = _extract_tid(payload)
            tx = str(payload.get("rwTransactionId") or payload.get("transactionId") or "")
            status = str(payload.get("status", ""))

            if not rw_tx:
                return HandlerResult(ok=False, error_code=400)
            if status not in {"CLOUD_AUTH_OK", "CLOUD_AUTH_NOT_OK"}:
                return HandlerResult(ok=False, error_code=400)

            return HandlerResult(ok=True, payload={"status": status, "rwTransactionId": rw_tx})

        # Unknown action
        return HandlerResult(ok=False, error_code=501)

    except KeyError:
        # Missing required field
        return HandlerResult(ok=False, error_code=400)

    except CyberRockError as e:
        # Propagate CyberRock HTTP status
        return HandlerResult(ok=False, error_code=e.status)

    except Exception:
        return HandlerResult(ok=False, error_code=500)