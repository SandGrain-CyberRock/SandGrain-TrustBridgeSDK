# Versioning — `release/v3.6.0`

Stream: **3.6.0** (source `sandgrain-sdk:trustbridge-0.4`).

This branch is the consolidated snapshot of the `trustbridge-0.4` line: the
SandGrain auth stack under `SDK/` (based on `rev3.2-ARM` + the rev3.2-Mutual
two-phase auth port) plus the TrustBridge management layer under
`TrustBridge/`.

## How this repo is versioned

- Each branch of this repository is a full snapshot of one `sandgrain-sdk`
  revision (branch-per-stream, not tags): `development/vX.Y.Z` for active
  development lines, `release/vX.Y.Z` for release streams.
- The C firmware carries **no version macro in code** — its version is the
  stream version of this branch. The TrustBridge integration changes are
  documented in `SDK/changes.md`.
- The Python Cloud SDK and the TrustBridge FE/BE are independently versioned
  in their own `pyproject.toml` / `package.json`.

## Component versions on this branch

| Component | Path | Version | Where defined |
| --------- | ---- | ------- | ------------- |
| SGR SDK firmware (device) | `SDK/PoC_SDK_v3/poc_sdk_device/sdk_fw/` | 3.6.0 (stream, trustbridge-0.4) | this branch |
| SGR SDK firmware (gateway) | `SDK/PoC_SDK_v3/poc_sdk_gateway/sdk_fw/` | 3.6.0 (stream, trustbridge-0.4) | this branch |
| Device / Gateway apps | `.../poc_sdk_{device,gateway}/app/` | 3.6.0 (stream) | this branch |
| `sandgrain-cloud-sdk` (Python) | `SDK/PoC_SDK_v3/sdk_cloud/sandgrain_cloud_sdk/` | **0.3.0** | `pyproject.toml` |
| Cloud agent (MQTT app) | `SDK/PoC_SDK_v3/sdk_cloud/application_PoC_MQTT/` | 3.6.0 (stream) | this branch |
| TrustBridge backend | `TrustBridge/TrustBridge-Be/` | **`trustbridge-be` 1.0.0** (upstream tag trustbridge-0.4) | `package.json` |
| TrustBridge frontend | `TrustBridge/TrustBridge-FE/` | **`trustbridge-fe` 0.0.0** (upstream tag trustbridge-0.4) | `package.json` |
| MQTT protocol namespace | topics | **`sandgrain/v1`** (+ `cmd/run_auth`, `gw_log`, `auth_result`, `status`, `claim`) | code |

What this stream adds (see `SDK/changes.md` for the full changelog): the
TrustBridge FE/BE management layer, two-phase crypto opcodes
(`TOKEN_AUTH 0x03000800` / `HOST_AUTH 0x05000800`), gateway FSM rewrite with
error-management bit-flip recovery and `gw_log`/`auth_result` telemetry,
BE-synced runtime whitelist, device `--listen` MQTT-command mode, a
`TrustBridgeCredentialsStore` + auto-claim in the cloud agent, standalone
(no-BE) run mode, and macOS build support. The shared Mosquitto broker
replaces the standalone EMQX of earlier streams.

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
