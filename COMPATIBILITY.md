# Compatibility — `release/v3.5.0`

| Field            | Value |
| ---------------- | ----- |
| Versioning branch | `release/v3.5.0` |
| sandgrain-sdk source | `rev3.3` |
| Stream version   | 3.5.0 (upstream v3.3 stream) |
| Token chip       | SGT1001 "CyberRock-Token" (HMAC-SHA256 IC) |

All components on this branch are developed and tested together — mix with
other streams at your own risk.

## Component chain

```
SGT1001 token <-- USB or /dev/spidev --> Device (C)  <-- TCP -->  Gateway (C)  <-- MQTT -->  Cloud PoC app (Python)  <-- REST -->  CyberRock API
```

## Token <-> Device

| Aspect | Value |
| ------ | ----- |
| Transport | Build-time switch: `make TRANSPORT=usb` (USB-CDC/FTDI bridge, default, Linux+Windows) or `make TRANSPORT=spi` (native Linux `/dev/spidev`, e.g. Raspberry Pi) |
| SPI parameters | Datasheet-locked: SPI Mode 0, ≤ 10 MHz (`config_poc.h`) |
| Self-test | `SGR_SDK_BIST()` returns pcc/id/rw/ek + BIST byte (`0x50` = PASS) |

## Device <-> Gateway

| Aspect | Value |
| ------ | ----- |
| Transport | TCP socket, port `PORT_BASE + channel` (multi-device gateway) |
| Framing | JSON, frame types `"4"` (auth), `"5"` (CW / CW-echo+RW), `"6"` (FW verification), `"7"` (installation), `"8"` (Phase-2 HCW, mutual auth) |
| Mutual auth | Two-phase: token→cloud (CW/RW) + cloud→token (HCW = RW‖RW → HRW compare) |
| Error Management | Bit-flip tolerant (`CW_BITFLIP_THRESHOLD` = 3) |
| Field sizes | TID/CW = 64 hex chars (32 bytes), RW = 32 hex chars (16 bytes) |

## Gateway <-> Cloud PoC app

| Aspect | Value |
| ------ | ----- |
| Transport | MQTT, QoS 1 |
| Topic scheme | `sandgrain/v1/<tid>/req/<action>` → `sandgrain/v1/<tid>/rsp/<action>` (topic must be exactly 5 segments); cloud subscribes `sandgrain/v1/+/req/+` |
| Actions / types | `0` requestCW, `1` replyRW, `2` requestRW, `3` checkAuthStatusCloud (no response), `6` fwVerification, `7` fwInstallation (types 4/5/8 are device↔GW-only frames) |
| Envelope | `{type, status, payload, crc}`; optional strict **CRC-16/CCITT-FALSE** over protected fields `TID`, `CW`, `RW`, `transactionId` |

## Cloud PoC app <-> CyberRock

| Aspect | Value |
| ------ | ----- |
| SDK package | `sandgrain-cloud-sdk` **0.3.0** (async, `aiohttp>=3.9`; extras `mqtt`, `protobuf`, `dev`; Python >= 3.10) |
| Endpoints | `/api/device/*` incl. the HRW path (`requestTransactionId` / `requestHRW` / `checkRequestHRWStatus`) behind the public `requestRW` naming |
| Auth | Per-TID device tokens + tenant token; optional Cloudflare Access headers |

## OS / platform compatibility

Token transport is a build-time switch on this line: `make TRANSPORT=usb`
(USB-CDC/FTDI bridge, default) or `make TRANSPORT=spi` (native Linux
`/dev/spidev` — Linux-only; the Makefile errors on Windows).

| Platform | Device app (C) | Gateway app (C) | Cloud (SDK + PoC app) | Notes |
| -------- | -------------- | --------------- | --------------------- | ----- |
| Linux x86-64 | ✅ USB or SPI | ✅ | ✅ | Native `gcc` build |
| Raspberry Pi | ✅ SPI (native) | ✅ | ✅ | `TRANSPORT=spi` over `/dev/spidev`; SGT1001 wiring table and SPI enablement in `SDK/README.md`; SPI config datasheet-locked (Mode 0, ≤ 10 MHz) |
| ARM Linux (generic) | ✅ SPI | ✅ | ✅ | Native build; SPI via `/dev/spidev` |
| Windows 10/11 | ✅ USB only | ✅ (MinGW) | ✅ | `TRANSPORT=spi` is rejected on Windows |
| macOS | ❌ | ❌ | ✅ | No macOS target in the C Makefiles on this line (macOS support arrives in the 3.6.x line) |

The cloud side (Python ≥ 3.10 / Docker) runs on any OS; only the C device and
gateway apps are platform-constrained.

## Toolchain requirements

| Component | Requirement |
| --------- | ----------- |
| C firmware + apps | `gcc` (C11), `make` (`TRANSPORT=usb\|spi`); `libmosquitto` |
| Cloud SDK | Python >= 3.10, `aiohttp` |
| Cloud PoC app | Python, `paho-mqtt` v2 API, `python-dotenv` |
| MQTT broker | EMQX Enterprise 6.1.0 via `sdk_cloud/docker-compose.yml` (ports 1883/8883/8083/8084/18083) |

## SDK <-> Firmware <-> Gateway

| SDK stream | Device firmware | Gateway | Cloud SDK | Token |
| ---------- | --------------- | ------- | --------- | ----- |
| 3.5.0 | 3.5.0 (this branch) | 3.5.0 (this branch) | sandgrain-cloud-sdk 0.3.0 | SGT1001 |
