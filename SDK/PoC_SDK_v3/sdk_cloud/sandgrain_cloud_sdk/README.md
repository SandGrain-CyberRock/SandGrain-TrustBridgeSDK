# SandGrain Cloud SDK (Python)

## Purpose

This SDK provides a **clean, transport-agnostic Python client** for integrating with the
**SandGrain / CyberRock authentication platform**.

It is intended to be:
- Embedded into **cloud backends**
- Used by **services communicating with device applications** (MQTT/HTTP/etc.)
- Integrated with **any transport**, without enforcing one

---

## High-level architecture

```
[ Device / Embedded ]
        |
        | (CW / RW via any transport)
        v
[ Cloud Application ]
        |
        | (uses this SDK)
        v
[ SandGrain / CyberRock APIs ]
```

The SDK sits on the **cloud application** side, and exposes primitives to call the platform APIs.

---

## Two layers in this SDK

This repository contains **two levels** of API:

1) **`CyberRockClient`** (thin REST client)
- Close to 1:1 with REST endpoints (`tenantUserLogin`, `deviceLogin`, `claim-token`,
  `requestCW`, `replyRW`, `checkAuthStatus`, `requestTransactionId`, `requestHRW`,
  `checkRequestHRWStatus`)
- `request_rw` / `check_request_rw_status` are compatibility wrappers over the
  `requestTransactionId` + `requestHRW` pair (CW→HCW, HRW→RW mapping)
- No workflow logic beyond request/response typing
- All `/api/device/*` calls support Cloudflare Access headers

2) **`CloudSDK`** (higher-level façade used by the POC)
- Wraps `CyberRockClient`
- Adds:
  - device/tenant token acquisition and refresh (via a `CredentialsStore` + `TokenCache`)
  - convenience methods used by the POC (`request_cw`, `reply_rw`, `request_rw`, ...)
  - polling helpers (`wait_auth_ok`, `wait_generated_rw`)

If you are building an application/service, you will typically use `CloudSDK`.
If you want very explicit REST calls, you can use `CyberRockClient` directly.

---

## Installation

From PyPI (package name matches `pyproject.toml`: `sandgrain-cloud-sdk`, requires Python >= 3.10):

```bash
pip install sandgrain-cloud-sdk
```

The only runtime dependency is `aiohttp`. Optional extras:

```bash
pip install "sandgrain-cloud-sdk[mqtt]"      # adds paho-mqtt
pip install "sandgrain-cloud-sdk[protobuf]"  # adds protobuf
pip install "sandgrain-cloud-sdk[dev]"       # adds pytest, pytest-asyncio
```

---

## Package layout (src/)

```
sandgrain_cloud_sdk/
  cloud_sdk.py            # high-level façade: CloudSDK + CloudSDKConfig
  cyberrock_client.py     # low-level REST client (aiohttp)
  credentials_store.py    # credentials source (CredentialsStore, JsonFileCredentialsStore)
  token_cache.py          # JWT token caching with expiry window
  device_store.py         # backwards-compat aliases for the credentials store
  models.py               # frozen dataclass request/response models
  exceptions.py           # SDKError, CyberRockError, MissingTokenError,
                          # WorkflowTimeoutError, InvalidInputError
```

(CRC helpers are **not** part of the SDK — the MQTT PoC application implements
CRC in `../application_PoC_MQTT/app/crc_utils.py`.)

---

## Quick start (CloudSDK)

> The SDK is fully async (uses `aiohttp`). Examples below assume you are inside an async function.

```python
import aiohttp

from sandgrain_cloud_sdk import CloudSDK, CloudSDKConfig, JsonFileCredentialsStore

async with aiohttp.ClientSession() as session:
    sdk = CloudSDK(
        cfg=CloudSDKConfig(base_url="https://<sandgrain-api-host>"),
        session=session,
        creds=JsonFileCredentialsStore("device_credentials.json"),
        # cf_access_client_id / cf_access_client_secret if the API is behind Cloudflare Access
    )

    # Example: request CW
    res = await sdk.request_cw(tid="...")
    print(res.cw, res.transaction_id)

    # Example: cloud-computed RW (request + wait until generated)
    rw_res = await sdk.request_rw(tid="...", cw="...")
    rw = await sdk.wait_generated_rw(rw_transaction_id=rw_res.rw_transaction_id, tid="...")
```

`CloudSDKConfig` also carries the polling parameters (`poll_interval_s`, default 1.0;
`poll_timeout_s`, default 30.0) used by `wait_auth_ok` / `wait_generated_rw`.

Device tokens are obtained lazily per TID through the `CredentialsStore` and cached
in a `TokenCache` (JWT `exp`-aware, with a configurable early-expiry window).

---

## Using the low-level client (CyberRockClient)

```python
import aiohttp

from sandgrain_cloud_sdk import CyberRockClient

async with aiohttp.ClientSession() as session:
    client = CyberRockClient(base_url="https://<sandgrain-api-host>", session=session)
    login = await client.device_login("iot-user", "password")
    res = await client.request_cw(tid="...", device_access_token=login.access_token)
```

Errors from the platform are raised as `CyberRockError` (with `.status`, `.message`, `.body`).

---

## Development & tests

This repository uses a `src/` layout. To run tests locally, install the package in editable mode first.

```bash
pip install -e .[dev]
pytest
```

(If you run `pytest` without installing the package, imports like `sandgrain_cloud_sdk` will fail.)

> **Note:** the current tests under `tests/` predate the device-login refactor
> (they still reference the old `iotLogin` endpoints and field names) and need
> updating before they pass against the current code.

---

## What this SDK does NOT do

- It does **not** implement MQTT transport. Transport is the responsibility of your application.
- It does **not** store secrets for you beyond what your `CredentialsStore` implementation provides.
- It does **not** provide production-ready retry/backoff policies (the POC keeps things simple).
