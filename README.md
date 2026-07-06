# Sandgrain SDK — `development/v3.1.0`

Consolidated Sandgrain / TrustBridge versioning repository.
This branch mirrors the upstream `sandgrain-sdk` branch **`rev3.1-Spinnov`**.

Each branch of this repository is a complete, self-contained snapshot of one
SDK stream — check out a branch to get the matching device firmware, gateway
firmware and cloud components for that stream (see
[VERSIONING.md](./VERSIONING.md) for the scheme and
[COMPATIBILITY.md](./COMPATIBILITY.md) for the interop matrix).

## What the SDK does

The Sandgrain SGR SDK implements **mutual authentication** between embedded
devices carrying a Sandgrain crypto token and the SandGrain / CyberRock cloud
platform, using a Challenge Word / Response Word (CW/RW) scheme:

- **Device authentication** — a device proves its identity through the Gateway:
  the cloud issues a CW, the device's crypto token computes the RW, and
  CyberRock verifies the pair.
- **Firmware verification** — the device hashes a firmware image (SHA-256),
  uses the hash as CW, and reports `FW_OK`/`FW_NOK` to the cloud, which stores
  an installation permission.
- **Firmware installation** — the device requests installation authorization;
  the cloud validates it against the earlier verification and an RW check, and
  the permission is consumed on success.

## Architecture

```
Device (C, DEVICE_MODE)          Gateway (C, GATEWAY_MODE)         Cloud PoC app (Python)
  crypto token via USB/FTDI        bridges up to MAX_DEVICES         sandgrain-cloud-sdk
        |                            channels                              |
        +---------- TCP ---------------+---------- MQTT (QoS 1) ----------+------ REST ------> CyberRock API
             127.0.0.1:8080+ch          sandgrain/v1/<tid>/req|rsp/...        /api/device/*
             JSON frames "4".."7"       actions 0,1,2,3,6,7
```

## Layout

- `SDK/PoC_SDK_v3/` — the Sandgrain SDK (canonical v3 line) for this stream:
  - `poc_sdk_device/` — device PoC app + SGR SDK firmware (`DEVICE_MODE`); authenticates via the Gateway over TCP, crypto token over USB/FTDI.
  - `poc_sdk_gateway/` — gateway PoC app + SGR SDK firmware (`GATEWAY_MODE`); bridges devices (TCP, ports 8080+) to the Cloud (MQTT, `sandgrain/v1/<tid>/...`).
  - `sdk_cloud/` — Python side: `sandgrain_cloud_sdk/` (async CyberRock/SandGrain REST client library) and `application_PoC_MQTT/` (runnable MQTT/EMQX PoC service), plus Docker/EMQX compose setup.
  - `User Guide - SDK v3.pdf` — full SDK v3 user guide.

The device and gateway `sdk_fw/` trees are the same SDK code base built with
`-DSDK_MODE=0` (device) or `-DSDK_MODE=1` (gateway); they differ only in the
mode-gated sources.

## Quick start (end-to-end PoC)

Bring the stack up back-to-front:

1. **Cloud + broker** — in `SDK/PoC_SDK_v3/sdk_cloud/`: create
   `application_PoC_MQTT/.env` (from `.env.example`) and
   `device_credentials.json`, then `docker compose up`. This starts an EMQX
   broker (1883) and the cloud app subscribed to `sandgrain/v1/+/req/+`.
2. **Gateway** — in `SDK/PoC_SDK_v3/poc_sdk_gateway/app/`: point
   `config_poc.h` at your broker, then `make && ./test_gw`. It listens for
   devices on ports 8080+ and bridges them to the cloud. Device TIDs must be
   present in the whitelist (`sdk_fw/src/services/database/auth_db_whitelist.c`)
   and in the cloud's `device_credentials.json`.
3. **Device** — in `SDK/PoC_SDK_v3/poc_sdk_device/app/`: connect the crypto
   token via USB, set the serial port in `config_poc.h`, then
   `make && ./test_device`. Use the interactive menu to run authentication,
   FW verification and installation flows (including fault-injection variants).

Prerequisites: `gcc`/`make` + `libmosquitto` for the C apps (Linux or
Windows/MinGW), Docker (or Python ≥ 3.10 + an MQTT broker) for the cloud side.

Each component's README has the full details:
[device](./SDK/PoC_SDK_v3/poc_sdk_device/README.md) ·
[gateway](./SDK/PoC_SDK_v3/poc_sdk_gateway/README.md) ·
[SDK firmware](./SDK/PoC_SDK_v3/poc_sdk_device/sdk_fw/README.md) ·
[cloud SDK](./SDK/PoC_SDK_v3/sdk_cloud/sandgrain_cloud_sdk/README.md) ·
[cloud PoC app](./SDK/PoC_SDK_v3/sdk_cloud/application_PoC_MQTT/README.md)

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
