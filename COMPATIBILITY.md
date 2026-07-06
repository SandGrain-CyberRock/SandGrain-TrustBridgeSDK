# Compatibility — `release/v3.1.0`

| Field            | Value |
| ---------------- | ----- |
| Versioning branch | `release/v3.1.0` |
| sandgrain-sdk source | `rev3.1` |
| Stream version   | 3.1.0 |

All components on this branch are developed and tested together — mix with
other streams at your own risk.

## Component chain

```
Device (C, DEVICE_MODE)  <-- TCP -->  Gateway (C, GATEWAY_MODE)  <-- MQTT -->  Cloud PoC app (Python)  <-- REST -->  CyberRock API
```

## Device <-> Gateway

| Aspect | Value |
| ------ | ----- |
| Transport | TCP socket, `127.0.0.1`, port `PORT_BASE + channel` (8080+, `MAX_DEVICES=3`) |
| Framing | JSON, frame types `"4"` (auth), `"5"` (CW / CW-echo+RW), `"6"` (FW verification), `"7"` (installation) |
| Field sizes | TID/CW = 64 hex chars (32 bytes), RW = 32 hex chars (16 bytes) |
| Device identity | CRC32 of TID; the TID must be present in the gateway whitelist (`auth_db_whitelist.c`) |
| Fault injection | Device `fi_device` bit-flip module + gateway per-frame-type TX fault toggles (testing the bit-flip tolerance thresholds) |

## Gateway <-> Cloud PoC app

| Aspect | Value |
| ------ | ----- |
| Transport | MQTT, QoS 1 (broker default `127.0.0.1:1883`, set in gateway `app/config_poc.h`) |
| Topic scheme | `sandgrain/v1/<tid>/req/<action>` → `sandgrain/v1/<tid>/rsp/<action>`; cloud subscribes `sandgrain/v1/+/req/+` |
| Actions / types | `0` requestCW, `1` replyRW, `2` requestRW, `3` checkAuthStatusCloud, `6` fwVerification, `7` fwInstallation |
| CRC | Optional CRC-16/CCITT-FALSE per field (`TID`, `CW`, `RW`, `transactionId`), auto-enabled when the request carries a `crc` object |
| Identity mapping | The `<tid>` topic segment must have matching credentials in the cloud app's `device_credentials.json` |

## Cloud PoC app <-> CyberRock

| Aspect | Value |
| ------ | ----- |
| SDK package | `sandgrain-cloud-sdk` **0.3.0** (async, `aiohttp`) |
| Endpoints | `/api/device/{requestCW, replyRW, checkAuthStatus}` + tenant/device login and RW-generation endpoints |
| Auth | Per-TID device tokens + tenant token; optional Cloudflare Access headers |

## OS / platform compatibility

| Platform | Device app (C) | Gateway app (C) | Cloud (SDK + PoC app) | Notes |
| -------- | -------------- | --------------- | --------------------- | ----- |
| Linux x86-64 | ✅ | ✅ | ✅ | Native `gcc` build; token serial link uses the bundled `librs232lib.so` (**x86-64 only**) |
| Windows 10/11 | ✅ (MinGW) | ✅ (MinGW) | ✅ | Static `librs232lib-static.a`; links `ws2_32` (sockets) and `bcrypt` (RNG) |
| macOS | ❌ | ❌ | ✅ | No macOS target in the C Makefiles on this line (macOS support arrives in the 3.6.x line) |
| ARM Linux (generic) | ❌ | ❌ | ✅ | The bundled rs232lib is x86-64-only — use the 3.2.x ARM line (`release/v3.2.0`) for ARM hosts |
| Raspberry Pi | ❌ | ❌ | ✅ | Supported from 3.2.x (native builds, POSIX termios serial) |

The cloud side (Python ≥ 3.10 / Docker) runs on any OS; only the C device and
gateway apps are platform-constrained.

## Toolchain requirements

| Component | Requirement |
| --------- | ----------- |
| C firmware + PoC apps | `gcc` (C11), `make`; `libmosquitto`; crypto token on USB/FTDI (115200,N,8,1) |
| Cloud SDK | Python >= 3.10, `aiohttp` |
| Cloud PoC app | Python, `paho-mqtt` v2 API, `python-dotenv` |
| MQTT broker | EMQX Enterprise 6.1.0 via `sdk_cloud/docker-compose.yml` (any MQTT 3.1.1+ broker with auth works) |

## SDK <-> Firmware <-> Gateway

| SDK stream | Device firmware | Gateway | Cloud SDK |
| ---------- | --------------- | ------- | --------- |
| 3.1.0 | 3.1.0 (this branch) | 3.1.0 (this branch) | sandgrain-cloud-sdk 0.3.0 |
