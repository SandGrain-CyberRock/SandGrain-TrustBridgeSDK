# Compatibility — `release/v3.2.0`

| Field            | Value |
| ---------------- | ----- |
| Versioning branch | `release/v3.2.0` |
| sandgrain-sdk source | `rev3.2-ARM` |
| Stream version   | 3.2.0 (ARM host port) |

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
| Device identity | TID auto-detected via BIST by `run_all.sh`; must be whitelisted on the gateway and present in the cloud's `device_credentials.json` |

## Gateway <-> Cloud PoC app

| Aspect | Value |
| ------ | ----- |
| Transport | MQTT, QoS 1 (broker set at compile time in gateway `app/config_poc.h`) |
| Topic scheme | `sandgrain/v1/<tid>/req/<action>` → `sandgrain/v1/<tid>/rsp/<action>`; cloud subscribes `sandgrain/v1/+/req/+` |
| Actions / types | `0` requestCW, `1` replyRW, `2` requestRW, `3` checkAuthStatusCloud (no response), `6` fwVerification, `7` fwInstallation |
| CRC | Optional CRC-16/CCITT-FALSE per field (`TID`, `CW`, `RW`, `transactionId`), auto-enabled when the request carries a `crc` object |

## Cloud PoC app <-> CyberRock

| Aspect | Value |
| ------ | ----- |
| SDK package | `sandgrain-cloud-sdk` **0.3.0** (async, `aiohttp`; extras `mqtt`, `protobuf`, `dev`) |
| Endpoints | `/api/device/*` (requestCW, replyRW, checkAuthStatus, RW generation) + tenant/device login |
| Auth | Per-TID device tokens + tenant token; optional Cloudflare Access headers |

## OS / platform compatibility

This line is the **ARM host port** — the first line to support ARM hosts natively.

| Platform | Device app (C) | Gateway app (C) | Cloud (SDK + PoC app) | Notes |
| -------- | -------------- | --------------- | --------------------- | ----- |
| Linux x86-64 | ✅ | ✅ | ✅ | Native `gcc`; token serial link via POSIX **termios** (no rs232lib needed) |
| ARM Linux (generic) | ✅ | ✅ | ✅ | Native `gcc` build on the ARM host — no cross toolchain; termios serial |
| Raspberry Pi | ✅ | ✅ | ✅ | Raspberry Pi OS (Trixie / Debian 13; `-D_GNU_SOURCE` for glibc ≥ 2.38); headless operation via `tmux`; setup via `SDK/setup.sh` |
| Windows 10/11 | ✅ (via WSL) | ✅ (via WSL) | ✅ | `setup.ps1` / `run_all.ps1` run the stack inside WSL; a native MinGW build keeps the static rs232lib |
| macOS | ❌ | ❌ | ✅ | No macOS target in the C Makefiles on this line (macOS support arrives in the 3.6.x line) |

The cloud side (Python ≥ 3.10 / Docker) runs on any OS; only the C device and
gateway apps are platform-constrained.

## Toolchain requirements

| Component | Requirement |
| --------- | ----------- |
| C firmware + PoC apps | `gcc` (C11), `make`; `libmosquitto`; `-D_GNU_SOURCE` (glibc ≥ 2.38) |
| Host setup | `SDK/setup.sh` (Debian/Ubuntu/Raspberry Pi OS apt packages, Python venv); Windows via WSL (`setup.ps1`) |
| Cloud SDK | Python >= 3.10, `aiohttp` |
| Cloud PoC app | Python, `paho-mqtt` v2 API, `python-dotenv` |
| MQTT broker | EMQX Enterprise 6.1.0 via `sdk_cloud/docker-compose.yml`, or the Mosquitto installed by `setup.sh` |

## SDK <-> Firmware <-> Gateway

| SDK stream | Device firmware | Gateway | Cloud SDK |
| ---------- | --------------- | ------- | --------- |
| 3.2.0 | 3.2.0 (this branch, ARM port) | 3.2.0 (this branch, ARM port) | sandgrain-cloud-sdk 0.3.0 |
