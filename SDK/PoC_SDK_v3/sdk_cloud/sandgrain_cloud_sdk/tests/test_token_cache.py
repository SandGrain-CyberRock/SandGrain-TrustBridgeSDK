
from sandgrain_cloud_sdk.token_cache import TokenCache

def test_set_and_get_iot_token():
    cache = TokenCache()
    cache.set_iot("iot-token")
    assert cache.get_iot() == "iot-token"

def test_set_and_get_tenant_token():
    cache = TokenCache()
    cache.set_tenant("tenant-token")
    assert cache.get_tenant() == "tenant-token"
