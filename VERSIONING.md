# Versioning

## Release model

- Every **major release** gets its own branch: **`release/vX.Y.0`**
  (`release/v3.1.0`, `release/v3.2.0`, ...).
- **Fixes and enhancements** on a released line are committed to its release
  branch and published as **tags**: `v3.6.1`, `v3.6.2`, ... — the `3.6.x`
  series lives on `release/v3.6.0`.
- The next release starts a new branch and its VERSIONING.md carries the
  **previous versions' history plus what is new** on that line.
- The **development branch** (`development/vX.Y.0`) is the current working
  branch feeding its release line.
- The **3.6 line** additionally carries **transport-variant release branches**:
  `release/v3.6.1` (Bluetooth LE) and `release/v3.6.2` (cellular / LTE) — each a
  self-contained snapshot mirroring its upstream `trustbridge-0.4-{BLE,LTE}`
  stream, tagged `v3.6.1` / `v3.6.2`.

What moves the version:

| Change | Bump |
| ------ | ---- |
| Breaking API / architecture shift | MAJOR · `X.0.0` |
| New backward-compatible capability or supported target | MINOR · `3.Y.0` |
| Backward-compatible bug / doc / build fix | PATCH · `3.Y.Z` (tag on the release branch) |

## This branch

`release/v3.6.2` — the **cellular / LTE-transport variant of the 3.6.x line**:
the same TrustBridge integration as `release/v3.6.0` (the SandGrain auth stack
under `SandGrain-SDK/` plus the TrustBridge frontend/backend management layer
under `TrustBridge/`), with a Nordic **nRF9151** Zephyr device that reaches the
broker directly over **cellular (LTE-M / NB-IoT)** MQTT. It mirrors upstream
`sandgrain-sdk` `trustbridge-0.4-LTE` and is published as the `v3.6.2` tag. The
SDK-level integration changes are documented in `SandGrain-SDK/changes.md`; the
cellular walk-through is `RUN_CELLULAR_DEMO.md`.

## Version history

### 3.6.2 — Cellular / LTE transport (`release/v3.6.2`, this branch)

Everything in 3.6.0, re-transported over **cellular (LTE-M / NB-IoT)**:

- Nordic **nRF9151 DK** Zephyr cellular firmware
  (`PoC_SDK_v3/poc_sdk_cellular_nrf9151/`): SGT1001 over SPI; MQTT carried over
  the LTE modem straight to the broker (`src/ports/app_mqtt.c`, no local gateway
  hop); a `gw_log` telemetry port; `flash_cellular.ps1`.
- On-device **UART menu**: fault injection, firmware verification and
  installation flows driven from the serial console.
- Cellular bring-up guide `RUN_CELLULAR_DEMO.md`.

Branches from the shared 3.6 base (upstream `trustbridge-0.4-LTE`); the
TrustBridge FE/BE management layer is unchanged from `release/v3.6.0`.

### 3.6.0 — TrustBridge integration (`release/v3.6.0`)

Everything in 3.5.x, plus:

- **TrustBridge management layer**: React/Vite frontend (`trustbridge-fe`,
  admin dashboard for devices, hierarchies, auth/comm events, RBAC) and
  NestJS backend (`trustbridge-be` 1.0.0; MySQL 8 via TypeORM, JWT/RBAC,
  Swagger).
- Shared **Mosquitto 2** broker replaces the standalone EMQX; all services
  rendezvous on the Docker network `trustbridge-net`.
- **Gateway telemetry**: persistent `gw_log` MQTT client publishing per-step
  logs plus a terminal `auth_result`, driving device state in the backend
  (idle → inprogress → claimed → authenticated).
- **BE-synced whitelist**: the gateway polls `GET {BE_URL}/devices/whitelist`
  (~3 s) into a runtime `trustbridge_whitelist.txt`; the cloud agent fetches
  per-TID credentials from `GET {BE_URL}/devices/credentials-by-tid`
  (`TrustBridgeCredentialsStore`) with auto-claim on `CLAIM_TOKEN`.
- **Device `--listen` mode**: subscribes `sandgrain/v1/{TID}/cmd/run_auth`,
  publishes `status`, runs authentication on command; interactive menu kept as
  fallback.
- **Standalone (no-BE) mode**: local `device_credentials.json` + static
  whitelist (`SandGrain-SDK/RUNNING_STANDALONE.md`, `run_standalone.*`).
- Two-phase crypto opcodes: `TOKEN_AUTH` (`0x03000800`) and `HOST_AUTH`
  (`0x05000800`); gateway FSM rewrite with bit-flip error-management recovery;
  macOS build support.

### 3.5.0 — SGT1001 + dual token transport (`release/v3.5.0`)

Everything in 3.4.x, plus:

- SGT1001 "CyberRock-Token" chip support (datasheet-locked SPI: Mode 0,
  ≤ 10 MHz); build-time dual token transport (`make TRANSPORT=usb|spi`,
  native Linux `/dev/spidev`); restructured `SDK_v3.3/` layout with a full
  integration guide.

### 3.4.0 — BIST + unified gateway dispatcher (`release/v3.4.0`)

Everything in 3.3.x, plus:

- `SGR_SDK_BIST()` device self-test (`0x50` = PASS); unified
  `SGR_SDK_GW_Run()` gateway dispatcher; multi-device gateway
  (`MAX_DEVICES=3`, ports from `PORT_BASE 8080`); TID whitelist database.

### 3.3.0 — Two-phase mutual authentication (`release/v3.3.0`)

Everything in 3.2.x, plus:

- Two-phase mutual authentication (Phase 2 cloud→token via `HCW = RW‖RW`,
  frame `"8"`, HRW comparison; `SGR_SDK_MUTUAL_AUTH_FAILED`); explicit
  `Token_To_Server` / `Server_To_Token` gateway API; cloud mapping of
  `requestRW` to the CyberRock HRW endpoints.

### 3.2.0 — ARM host port (`release/v3.2.0`)

Everything in 3.1.x, plus:

- Native ARM/Raspberry Pi builds; POSIX termios token transport on Linux;
  `setup.sh` / `run_all.sh` runner tooling with BIST-based TID auto-detection.

### 3.1.0 — Initial SDK v3 release (`release/v3.1.0`)

- Three-tier PoC architecture: device (C) ↔ gateway (C) ↔ cloud (Python);
  CW/RW authentication (TCP device↔gateway, MQTT gateway↔cloud on
  `sandgrain/v1` topics).
- Firmware verification (frame `"6"`) and installation authorization
  (frame `"7"`); fault-injection framework.
- Python Cloud SDK `sandgrain-cloud-sdk` 0.3.0 (async) + MQTT PoC application;
  EMQX docker-compose; optional CRC-16/CCITT-FALSE payload integrity.
