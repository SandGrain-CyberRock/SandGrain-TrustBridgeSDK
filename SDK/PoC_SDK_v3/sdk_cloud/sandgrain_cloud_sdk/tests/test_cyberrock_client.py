
import pytest
import aiohttp
import asyncio

from sandgrain_cloud_sdk.cyberrock_client import CyberRockClient
from sandgrain_cloud_sdk.token_cache import TokenCache

class FakeClient(CyberRockClient):
    async def _request(self, method, path, *, bearer_token=None, json_body=None, query=None):
        if path == "/api/auth/iotLogin":
            return {
                "iotId": "iot-id",
                "username": json_body["username"],
                "accessToken": "iot-token",
            }
        if path == "/api/iot/requestCW":
            return {
                "CW": "cw-value",
                "transactionId": "tx-id",
            }
        if path == "/api/iot/replyRW":
            return {
                "transactionId": json_body["transactionId"],
            }
        if path == "/api/iot/checkAuthStatus":
            return {
                "status": "AUTH_OK",
            }
        return {}

@pytest.mark.asyncio
async def test_iot_login_and_flow():
    async with aiohttp.ClientSession() as session:
        client = FakeClient(
            base_url="https://fake",
            session=session,
            token_cache=TokenCache(),
        )

        login = await client.iot_login("user", "pass")
        assert login.iot_id == "iot-id"

        cw = await client.request_cw("pccid", "iot-id", login.access_token)
        assert cw.cw == "cw-value"

        rw = await client.reply_rw("pccid", "iot-id", cw.cw, "rw", cw.transaction_id, login.access_token)
        assert rw.transaction_id == cw.transaction_id

        status = await client.check_auth_status(cw.transaction_id, login.access_token)
        assert status.status == "AUTH_OK"
