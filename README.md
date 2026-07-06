# Sandgrain SDK — `release/v3.4.0`

Consolidated Sandgrain / TrustBridge versioning repository.
This branch mirrors the upstream `sandgrain-sdk` branch **`rev3.2`** —
the **v3.2 baseline** release stream.

Each branch of this repository is a complete, self-contained snapshot of one
SDK stream (see [VERSIONING.md](./VERSIONING.md) and
[COMPATIBILITY.md](./COMPATIBILITY.md)).

## What the SDK does

The Sandgrain SGR SDK implements **mutual authentication** between embedded
devices carrying a Sandgrain crypto token and the SandGrain / CyberRock cloud
platform, using a Challenge Word / Response Word (CW/RW) scheme, plus
**firmware verification** (SHA-256 hash as CW, `FW_OK`/`FW_NOK` reporting,
frame `"6"`) and **firmware installation** authorization (frame `"7"`).

Notable in the v3.2 stream:

- **`SGR_SDK_BIST()`** — device built-in self-test returning pcc/id/rw/ek and
  a BIST byte (`0x50` = PASS).
- **`SGR_SDK_GW_Run()`** — unified gateway dispatcher that polls all device
  channels, peeks the incoming frame type and routes to the right flow
  (auth / FW verification / installation), replacing the three separate
  `SGR_SDK_GW_Handle_*` calls in a single main loop.
- **Multi-device gateway** — `MAX_DEVICES=3` channels, one TCP listening port
  per channel (`PORT_BASE 8080` → 8080/8081/8082).

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

- `SDK/PoC_SDK_v3/`:
  - `poc_sdk_device/` — device PoC app + SGR SDK firmware (`-DSDK_MODE=0`);
    interactive app with BIST and fault-injection hooks
    (`app/fault_injection/`), TCP link to the Gateway, crypto token over
    USB/FTDI (`SERIAL{n}:115200,N,8,1,N,N`).
  - `poc_sdk_gateway/` — gateway PoC app + SGR SDK firmware (`-DSDK_MODE=1
    -DMAX_DEVICES=3`); `SGR_SDK_GW_Run()` main loop, TID whitelist
    (`auth_db_whitelist.c`), MQTT to the cloud (broker default
    `127.0.0.1:1883`, set in `app/config_poc.h`).
  - `sdk_cloud/` — Python `sandgrain_cloud_sdk/` (v0.3.0, async) +
    `application_PoC_MQTT/` (25 s handler timeout, optional strict CRC) +
    Docker/EMQX Enterprise 6.1.0 compose.
  - `User Guide - SDK v3.pdf`.

Legacy trees (`SDK/Cloud`, `SDK/Device`, `SDK/PoC_SDK_v2`) were removed —
`PoC_SDK_v3` is canonical.

## Quick start (end-to-end PoC)

1. **Cloud + broker** — in `SDK/PoC_SDK_v3/sdk_cloud/`: create
   `application_PoC_MQTT/.env` (CyberRock URL, e.g.
   `https://device-api.sandbox.sandgrain.io`, optional Cloudflare Access
   creds) and `device_credentials.json`, then `docker compose up`.
2. **Gateway** — in `poc_sdk_gateway/app/`: point `config_poc.h` at your
   broker, then `make && ./test_gw`. Device TIDs must be whitelisted and
   present in the cloud's `device_credentials.json`.
3. **Device** — in `poc_sdk_device/app/`: connect the crypto token via USB,
   set the serial port in `config_poc.h`, then `make && ./test_device`.

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
