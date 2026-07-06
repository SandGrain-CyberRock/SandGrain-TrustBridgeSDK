# Sandgrain SDK — `release/v3.5.0`

Consolidated Sandgrain / TrustBridge versioning repository.
This branch mirrors the upstream `sandgrain-sdk` branch **`rev3.3`** —
the **v3.3 stream**, built around the **SGT1001 "CyberRock-Token"** chip
(immutable HMAC-SHA256 authentication IC).

Each branch of this repository is a complete, self-contained snapshot of one
SDK stream (see [VERSIONING.md](./VERSIONING.md) and
[COMPATIBILITY.md](./COMPATIBILITY.md)).

## What the SDK does

The Sandgrain SDK v3.3 implements **two-phase mutual authentication** between
devices carrying the SGT1001 token and the SandGrain / CyberRock cloud
platform (Challenge Word / Response Word scheme; Phase 2 verifies the cloud to
the device via HCW = RW‖RW, frame `"8"`), plus **firmware verification** and
**installation** authorization, and **Error Management** with bit-flip
tolerance (`CW_BITFLIP_THRESHOLD` = 3).

### New in the v3.3 stream

- **Dual token transport, selected at build time**: `make TRANSPORT=usb`
  (default; USB-CDC/FTDI bridge, `port_spi_usb.c`) or `make TRANSPORT=spi`
  (Linux-only native `/dev/spidev`, `port_spi_spidev.c` — e.g. Raspberry Pi,
  wiring documented in `SDK/README.md`). SPI parameters are datasheet-locked
  (Mode 0, ≤ 10 MHz) in `config_poc.h`.
- Renamed layout: components live under `SDK/SDK_v3.3/` as `sdk_device/`,
  `sdk_gateway/`, `sdk_cloud/` (previously `PoC_SDK_v3/poc_sdk_*`).
- `SGT1001_Datasheet.pdf` bundled next to the code.

## Architecture

```
Device (C, DEVICE_MODE)          Gateway (C, GATEWAY_MODE)         Cloud PoC app (Python)
  SGT1001 via USB or /dev/spidev   unified SGR_SDK_GW_Run()          sandgrain-cloud-sdk
        |                            dispatcher, MAX_DEVICES ch.           |
        +---------- TCP ---------------+---------- MQTT (QoS 1) ----------+------ REST ------> CyberRock API
             PORT_BASE + channel        sandgrain/v1/<tid>/req|rsp/...        /api/device/* (+HRW)
             JSON frames "4".."8"       actions 0,1,2,3,6,7
```

## Layout

- `SDK/README.md` — the full **SandGrain SDK v3.3 integration guide**
  (quick-start builds, the 8-item device menu incl. BIST, USB-vs-SPI
  selection, Raspberry Pi wiring table, config knobs, MQTT action table,
  troubleshooting). Read this first.
- `SDK/SDK_v3.3/`:
  - `sdk_device/` — device app + portable SDK firmware (`app/` +
    `sdk_fw/`), `SGR_SDK_BIST`, two-phase `SGR_SDK_Authenticate_Via_GW`,
    `SGR_SDK_Verification_FW`, `SGR_SDK_Installation`.
  - `sdk_gateway/` — gateway app + SDK firmware; unified `SGR_SDK_GW_Run()`
    dispatcher plus the per-flow `SGR_SDK_GW_Handle_*` calls.
  - `sdk_cloud/` — Python `sandgrain_cloud_sdk/` (v0.3.0, async) +
    `application_PoC_MQTT/` + Docker/EMQX Enterprise 6.1.0 compose +
    `Sandgrain_Cloud_SDK_PoC_Manual.pdf`.
  - `SGT1001_Datasheet.pdf`, `User Guide - SDK v3.pdf`.

## Quick start (end-to-end PoC)

1. **Cloud + broker** — in `SDK/SDK_v3.3/sdk_cloud/`: create
   `application_PoC_MQTT/.env` and `device_credentials.json`, then
   `docker compose up`.
2. **Gateway** — in `sdk_gateway/app/`: point `config_poc.h` at your broker,
   then `make && ./test_gw`.
3. **Device** — in `sdk_device/app/`: connect the SGT1001 (USB, or SPI wiring
   per `SDK/README.md`), then `make TRANSPORT=usb && ./test_device`
   (or `make TRANSPORT=spi` on Linux/Raspberry Pi).

Prerequisites: `gcc`/`make` + `libmosquitto` (Linux or Windows/MinGW; SPI
transport is Linux-only); Docker (or Python ≥ 3.10 + an MQTT broker) for the
cloud side.

## Branch map (sandgrain-sdk -> versioning)

| Versioning branch    | sandgrain-sdk source | Notes                          |
| -------------------- | -------------------- | ------------------------------ |
| `main`               | `main`               | Stable trunk                   |
| `development/v3.1.0` | `rev3.1-Spinnov`     | Spinnov development line        |
| `release/v3.1.0`     | `rev3.1`             | v3.1 release stream             |
| `release/v3.2.0`     | `rev3.2-ARM`         | ARM host port                   |
| `release/v3.3.0`     | `rev3.2-Mutual`      | Mutual-auth integration         |
| `release/v3.4.0`     | `rev3.2`             | v3.2 baseline                   |
| `release/v3.5.0`     | `rev3.3`             | v3.3 stream                     |
| `release/v3.6.0`     | `trustbridge-0.4`    | TrustBridge integration (+ FE/BE) |

See [COMPATIBILITY.md](./COMPATIBILITY.md) and [VERSIONING.md](./VERSIONING.md).
