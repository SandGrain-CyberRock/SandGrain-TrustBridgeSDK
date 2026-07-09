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
- Close to 1:1 with REST endpoints
- No workflow logic beyond request/response typing

2) **`CloudSDK`** (higher-level façade used by the POC)
- Wraps `CyberRockClient`
- Adds:
  - token acquisition / refresh (via a `CredentialsStore`)
  - lightweight convenience methods used by the POC
  - optional polling helpers (where provided by the SDK)

If you are building an application/service, you will typically use `CloudSDK`.
If you want very explicit REST calls, you can use `CyberRockClient` directly.

---

## Installation

From PyPI (package name is the same as in `pyproject.toml`):

```bash
pip install sandgrain-cloud-sdk
```

Optional extras:

```bash
pip install "sandgrain-cloud-sdk[mqtt]"      # adds paho-mqtt
pip install "sandgrain-cloud-sdk[protobuf]"  # adds protobuf
```

---

## Package layout (src/)

```
sandgrain_cloud_sdk/
  cloud_sdk.py            # high-level façade (used by POC)
  cyberrock_client.py     # low-level REST client
  credentials_store.py    # where credentials come from (e.g. JSON file)
  token_cache.py          # token caching helpers
  device_store.py         # small helpers for device state/identity (POC support)
  models.py               # request/response models
  exceptions.py           # SDK exceptions
  crc.py                  # CRC helpers (if applicable)
```

---

## Quick start (CloudSDK)

> The SDK is async (uses `aiohttp`). Examples below assume you are inside an async function.

```python
from sandgrain_cloud_sdk import CloudSDK
from sandgrain_cloud_sdk.credentials_store import JsonFileCredentialsStore

sdk = CloudSDK(
    base_url="https://<sandgrain-api-host>",
    credentials_store=JsonFileCredentialsStore("device_credentials.json"),
)

# Example: request CW
res = await sdk.request_cw(tid="...")
print(res.cw, res.transaction_id)
```

---

## Using the low-level client (CyberRockClient)

```python
from sandgrain_cloud_sdk.cyberrock_client import CyberRockClient

client = CyberRockClient(base_url="https://<sandgrain-api-host>")
# await client.<endpoint_call>(...)
```

---

## Development & tests

This repository uses a `src/` layout. To run tests locally, install the package in editable mode first.

```bash
pip install -e .[dev]
pytest
```

(If you run `pytest` without installing the package, imports like `sandgrain_cloud_sdk` will fail.)

---

## What this SDK does NOT do

- It does **not** implement MQTT transport. Transport is the responsibility of your application.
- It does **not** store secrets for you beyond what your `CredentialsStore` implementation provides.
- It does **not** provide production-ready retry/backoff policies (the POC keeps things simple).
