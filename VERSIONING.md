# Versioning — `main`

Stream: **main** — stable trunk (source `sandgrain-sdk:main`).

This branch is the consolidated snapshot of the upstream `main` line laid out
under `SDK/PoC_SDK_v3/`.

## How this repo is versioned

- Each branch of this repository is a full snapshot of one `sandgrain-sdk`
  revision (branch-per-stream, not tags): `development/vX.Y.Z` for active
  development lines, `release/vX.Y.Z` for release streams, `main` for the
  stable trunk.
- The C firmware (SGR SDK under `poc_sdk_device/sdk_fw/` and
  `poc_sdk_gateway/sdk_fw/`) carries **no version macro in code** — its version
  is the stream of this branch. The generation is identified by the bundled
  user guide (`User Guide - SDK v3.pdf`).
- The Python Cloud SDK is independently versioned in its own `pyproject.toml`.

## Component versions on this branch

| Component | Path | Version | Where defined |
| --------- | ---- | ------- | ------------- |
| SGR SDK firmware (device) | `SDK/PoC_SDK_v3/poc_sdk_device/sdk_fw/` | main (stream) | this branch |
| SGR SDK firmware (gateway) | `SDK/PoC_SDK_v3/poc_sdk_gateway/sdk_fw/` | main (stream) | this branch |
| Device / Gateway PoC apps | `.../poc_sdk_{device,gateway}/app/` | main (stream) | this branch |
| `sandgrain-cloud-sdk` (Python) | `SDK/PoC_SDK_v3/sdk_cloud/sandgrain_cloud_sdk/` | **0.3.0** | `pyproject.toml` |
| Cloud PoC MQTT app | `SDK/PoC_SDK_v3/sdk_cloud/application_PoC_MQTT/` | main (stream) | this branch |
| MQTT protocol namespace | topics | **`sandgrain/v1`** | `mqtt_transport.py`, GW `port_comm.c` |

The device and gateway `sdk_fw/` trees are the same SDK code base; they differ
only in the mode-gated sources selected by `-DSDK_MODE=0|1` at build time.

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
