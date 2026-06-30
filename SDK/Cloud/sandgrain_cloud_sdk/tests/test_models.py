
from sandgrain_cloud_sdk.models import (
    IoTLoginResponse,
    RequestCWResponse,
    ReplyRWResponse,
    CheckAuthStatusResponse,
)

def test_iot_login_response():
    r = IoTLoginResponse(iot_id="id", username="user", access_token="token")
    assert r.iot_id == "id"
    assert r.username == "user"
    assert r.access_token == "token"

def test_request_cw_response():
    r = RequestCWResponse(cw="cw", transaction_id="tx")
    assert r.cw == "cw"
    assert r.transaction_id == "tx"

def test_reply_rw_response():
    r = ReplyRWResponse(transaction_id="tx")
    assert r.transaction_id == "tx"

def test_check_auth_status_response():
    r = CheckAuthStatusResponse(status="AUTH_OK", claim_id=None)
    assert r.status == "AUTH_OK"
    assert r.claim_id is None
