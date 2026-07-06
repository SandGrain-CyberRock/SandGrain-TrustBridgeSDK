# Compatibility — `development/v3.1.0`

| Field            | Value |
| ---------------- | ----- |
| Versioning branch | `development/v3.1.0` |
| sandgrain-sdk source | `rev3.1-Spinnov` |
| Stream version   | 3.1.0-dev |

All components on this branch are developed and tested together — mix with
other streams at your own risk. The interfaces that must line up are listed below.

## Component chain

```
Device (C, DEVICE_MODE)  <-- TCP -->  Gateway (C, GATEWAY_MODE)  <-- MQTT -->  Cloud PoC app (Python)  <-- REST -->  CyberRock API
```

## Device <-> Gateway

| Aspect | Value |
| ------ | ----- |
| Transport | TCP socket, `127.0.0.1`, port `PORT_BASE + channel` (8080–8082, `MAX_DEVICES=3`) |
| Framing | JSON, frame types `"4"` (auth), `"5"` (CW / CW-echo+RW), `"6"` (FW verification), `"7"` (installation) |
| Field sizes | TID/CW = 64 hex chars (32 bytes), RW = 32 hex chars (16 bytes) |
| Device identity | CRC32 of TID; the TID must be present in the gateway whitelist (`auth_db_whitelist.c`) |
| Bit-flip tolerance | `CW_BITFLIP_THRESHOLD` / `RW_BITFLIP_THRESHOLD` = 3 (both sides built from the same SDK) |

## Gateway <-> Cloud PoC app

| Aspect | Value |
| ------ | ----- |
| Transport | MQTT, QoS 1, no TLS in this PoC |
| Topic scheme | `sandgrain/v1/<tid>/req/<action>` → `sandgrain/v1/<tid>/rsp/<action>`; cloud subscribes `sandgrain/v1/+/req/+` |
| Actions / types | `0` requestCW, `1` replyRW, `2` requestRW, `3` checkAuthStatusCloud (no response), `6` fwVerification, `7` fwInstallation |
| Envelope | `{"type", "payload", "crc"?}` request; `{"type", "status": {code, result}, "payload"}` response |
| CRC | Optional CRC-16/CCITT-FALSE per field (`TID`, `CW`, `RW`, `transactionId`); auto-enabled when the request carries a `crc` object. Gateway builds default to `CRC_ENABLE=0` — compatible either way |
| Identity mapping | The `<tid>` topic segment must have matching credentials in the cloud app's `device_credentials.json` |

## Cloud PoC app <-> CyberRock

| Aspect | Value |
| ------ | ----- |
| SDK package | `sandgrain-cloud-sdk` **0.3.0** (async, `aiohttp`) |
| Endpoints | `/api/auth/tenantUserLogin`, `/api/auth/deviceLogin`, `/api/tenantApi/claim-token`, `/api/device/{requestCW, replyRW, checkAuthStatus, requestTransactionId, requestHRW, checkRequestHRWStatus}` |
| Legacy API | Old `iotLogin` / `/api/iot/*` endpoints are **not** supported on this stream |
| Auth | Per-TID device tokens + tenant token, cached with JWT-expiry awareness; optional Cloudflare Access headers |

## Platform / toolchain requirements

| Component | Requirement |
| --------- | ----------- |
| C firmware + PoC apps | `gcc` (C11), Linux or Windows/MinGW; `libmosquitto`; bundled rs232 lib; crypto token on USB/FTDI (VID 0x0403, PID 0x6014) |
| Cloud SDK | Python >= 3.10, `aiohttp` |
| Cloud PoC app | Python (Docker image uses `python:3.12-slim`), `paho-mqtt` v2 API, `python-dotenv` |
| MQTT broker | EMQX Enterprise 6.1.0 via `sdk_cloud/docker-compose.yml` (any MQTT 3.1.1+ broker with auth works) |

## SDK <-> Firmware <-> Gateway

| SDK stream | Device firmware | Gateway | Cloud SDK |
| ---------- | --------------- | ------- | --------- |
| 3.1.0-dev | 3.1.0-dev (this branch) | 3.1.0-dev (this branch) | sandgrain-cloud-sdk 0.3.0 |
