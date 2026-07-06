# Sandgrain SDK — `release/v3.3.0`

Consolidated Sandgrain / TrustBridge versioning repository.
This branch mirrors the upstream `sandgrain-sdk` branch **`rev3.2-Mutual`** —
the **mutual-authentication integration** of the v3.2 stream.

Each branch of this repository is a complete, self-contained snapshot of one
SDK stream (see [VERSIONING.md](./VERSIONING.md) and
[COMPATIBILITY.md](./COMPATIBILITY.md)).

## What the SDK does

The Sandgrain SGR SDK authenticates embedded devices carrying a Sandgrain
crypto token against the SandGrain / CyberRock cloud platform using a
Challenge Word / Response Word (CW/RW) scheme, plus **firmware verification**
and **firmware installation** authorization.

### Two-phase mutual authentication (this stream's headline feature)

`SGR_SDK_Authenticate_Via_GW()` now performs authentication in **both
directions**:

- **Phase 1 — token → cloud** (as in earlier streams): `requestCW` → the
  token computes RW → `replyRW` → `AUT_OK`/`AUT_NOK`.
- **Phase 2 — cloud → token** (new): the device builds `HCW = RW‖RW`
  (32 bytes), the chip computes `HRW_token`, and the HCW is sent to the
  Gateway as **frame type `"8"`**; the Gateway asks the cloud (`requestRW`,
  internally mapped to the CyberRock `requestTransactionId` → `requestHRW` →
  `checkRequestHRWStatus` endpoints) for `HRW_cloud`, and the device compares
  the two locally. A mismatch returns the new status
  `SGR_SDK_MUTUAL_AUTH_FAILED`.

The gateway middleware exposes the two directions explicitly:
`SGR_SDK_Authentication_Token_To_Server()` and
`SGR_SDK_Authentication_Server_To_Token()`, built on a unified middleware FSM.

## Architecture

```
Device (C, DEVICE_MODE)          Gateway (C, GATEWAY_MODE)         Cloud PoC app (Python)
  crypto token via USB/FTDI        bridges up to MAX_DEVICES         sandgrain-cloud-sdk
        |                            channels                              |
        +---------- TCP ---------------+---------- MQTT (QoS 1) ----------+------ REST ------> CyberRock API
             127.0.0.1:8080+ch          sandgrain/v1/<tid>/req|rsp/...        /api/device/* (+HRW)
             JSON frames "4".."8"       actions 0,1,2,3,6,7
```

## Layout

- `SDK/PoC_SDK_v3/`:
  - `poc_sdk_device/` — device PoC app + SGR SDK firmware (`-DSDK_MODE=0`);
    two-phase mutual auth, FW verification (`"6"`) and installation (`"7"`).
  - `poc_sdk_gateway/` — gateway PoC app + SGR SDK firmware (`-DSDK_MODE=1`,
    `MAX_DEVICES=3`); unified middleware FSM
    (`sdk_fw/src/middleware/sgr_mw.c`) orchestrating all auth flows.
  - `sdk_cloud/` — Python `sandgrain_cloud_sdk/` (v0.3.0, async; maps the
    MQTT-facing `requestRW` action to the HCW/HRW cloud endpoints) +
    `application_PoC_MQTT/` + Docker/EMQX Enterprise 6.1.0 compose.
  - `User Guide - SDK v3.pdf`.

Note for integrators: the embedded side keeps CW/RW naming on MQTT and must
**not** call `checkRequestRWStatus` — the cloud app polls internally.

## Quick start (end-to-end PoC)

1. **Cloud + broker** — in `SDK/PoC_SDK_v3/sdk_cloud/`: create
   `application_PoC_MQTT/.env` and `device_credentials.json`, then
   `docker compose up`.
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
