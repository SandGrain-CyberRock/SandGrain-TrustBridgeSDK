# Sandgrain SDK — `release/v3.1.0`

Consolidated Sandgrain / TrustBridge versioning repository.
This branch mirrors the upstream `sandgrain-sdk` branch **`rev3.1`** —
the **v3.1 release stream**.

Each branch of this repository is a complete, self-contained snapshot of one
SDK stream — check out a branch to get the matching device firmware, gateway
firmware and cloud components for that stream (see
[VERSIONING.md](./VERSIONING.md) and [COMPATIBILITY.md](./COMPATIBILITY.md)).

## What the SDK does

The Sandgrain SGR SDK implements **mutual authentication** between embedded
devices carrying a Sandgrain crypto token and the SandGrain / CyberRock cloud
platform, using a Challenge Word / Response Word (CW/RW) scheme:

- **Device authentication** — a device proves its identity through the Gateway:
  the cloud issues a CW, the device's crypto token computes the RW, and
  CyberRock verifies the pair.
- **Firmware verification** — the device hashes a firmware image (SHA-256),
  uses the hash as CW, and reports `FW_OK`/`FW_NOK` to the cloud.
- **Firmware installation** — the device requests installation authorization,
  validated against the earlier verification.

A distinguishing feature of this stream is the integrated **fault-injection
framework**: the device app (`app/fault_injection/fi_device.{c,h}`) can flip
bits in CW / CW-echo / RW fields at runtime, and the gateway port layer has
per-frame-type TX fault toggles with recovery-attempt logic — used to exercise
the SDK's bit-flip tolerance and Error Management.

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

- `SDK/PoC_SDK_v3/` — the Sandgrain SDK (canonical v3 line):
  - `poc_sdk_device/` — device PoC app + SGR SDK firmware (`-DSDK_MODE=0`);
    interactive menu app with fault injection, TCP link to the Gateway,
    crypto token over USB/FTDI.
  - `poc_sdk_gateway/` — gateway PoC app + SGR SDK firmware (`-DSDK_MODE=1`,
    `MAX_DEVICES=3`); bridges devices (TCP, ports 8080+) to the Cloud (MQTT,
    broker at `127.0.0.1:1883` by default, set in `app/config_poc.h`). Ships a
    reference port example under `sdk_fw/examples/PC_USB_SGR/`.
  - `sdk_cloud/` — Python side: `sandgrain_cloud_sdk/` (async CyberRock/SandGrain
    REST client, v0.3.0) and `application_PoC_MQTT/` (runnable MQTT PoC service),
    plus a Docker/EMQX Enterprise 6.1.0 compose setup.
  - `User Guide - SDK v3.pdf` — full SDK v3 user guide.

## Quick start (end-to-end PoC)

1. **Cloud + broker** — in `SDK/PoC_SDK_v3/sdk_cloud/`: create
   `application_PoC_MQTT/.env` (from `.env.example`) and
   `device_credentials.json`, then `docker compose up` (EMQX on 1883 + the
   cloud app subscribed to `sandgrain/v1/+/req/+`).
2. **Gateway** — in `poc_sdk_gateway/app/`: point `config_poc.h` at your
   broker, then `make && ./test_gw`. Device TIDs must be whitelisted in
   `sdk_fw/src/services/database/auth_db_whitelist.c` and present in the
   cloud's `device_credentials.json`.
3. **Device** — in `poc_sdk_device/app/`: connect the crypto token via USB,
   set the serial port in `config_poc.h`, then `make && ./test_device` and use
   the interactive menu (auth, FW verification, installation, fault injection).

Prerequisites: `gcc`/`make` + `libmosquitto` (Linux or Windows/MinGW); Docker
(or Python ≥ 3.10 + an MQTT broker) for the cloud side.

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
