# Versioning — `release/v3.5.0`

Stream: **3.5.0** (source `sandgrain-sdk:rev3.3` — the v3.3 stream).

This branch is the consolidated snapshot of the `rev3.3` line laid out under
`SDK/SDK_v3.3/` (note: this stream renames the tree — `SDK_v3.3/` with
`sdk_device/`, `sdk_gateway/`, `sdk_cloud/` instead of the older
`PoC_SDK_v3/poc_sdk_*` naming).

## How this repo is versioned

- Each branch of this repository is a full snapshot of one `sandgrain-sdk`
  revision (branch-per-stream, not tags): `development/vX.Y.Z` for active
  development lines, `release/vX.Y.Z` for release streams.
- The C firmware (SDK under `sdk_device/sdk_fw/` and `sdk_gateway/sdk_fw/`)
  carries **no version macro in code** — its version is the stream version of
  this branch; the tree itself is named for the upstream version
  (`SDK_v3.3`). Chip generation: **SGT1001** (see the bundled datasheet).
- The Python Cloud SDK is independently versioned in its own `pyproject.toml`.

## Component versions on this branch

| Component | Path | Version | Where defined |
| --------- | ---- | ------- | ------------- |
| SDK firmware (device) | `SDK/SDK_v3.3/sdk_device/sdk_fw/` | 3.5.0 (stream, upstream v3.3) | this branch |
| SDK firmware (gateway) | `SDK/SDK_v3.3/sdk_gateway/sdk_fw/` | 3.5.0 (stream, upstream v3.3) | this branch |
| Device / Gateway apps | `SDK/SDK_v3.3/sdk_{device,gateway}/app/` | 3.5.0 (stream) | this branch |
| `sandgrain-cloud-sdk` (Python) | `SDK/SDK_v3.3/sdk_cloud/sandgrain_cloud_sdk/` | **0.3.0** | `pyproject.toml` |
| Cloud PoC MQTT app | `SDK/SDK_v3.3/sdk_cloud/application_PoC_MQTT/` | 3.5.0 (stream) | this branch |
| Token chip | — | **SGT1001** ("CyberRock-Token") | `SDK/SDK_v3.3/SGT1001_Datasheet.pdf` |
| MQTT protocol namespace | topics | **`sandgrain/v1`** | `mqtt_transport.py`, GW `port_comm.c` |

What the v3.3 stream adds over v3.2 (`release/v3.4.0`) and rev3.2-Mutual
(`release/v3.3.0`): **build-time dual token transport** (`make TRANSPORT=usb`
FTDI/USB-CDC vs `TRANSPORT=spi` native Linux `/dev/spidev`, SPI config
datasheet-locked to Mode 0 / ≤ 10 MHz), the renamed `SDK_v3.3` layout, a full
integration guide at `SDK/README.md`, and the bundled SGT1001 datasheet — on
top of two-phase mutual auth, BIST, Error Management and the unified
`SGR_SDK_GW_Run()` dispatcher inherited from the earlier streams.

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
