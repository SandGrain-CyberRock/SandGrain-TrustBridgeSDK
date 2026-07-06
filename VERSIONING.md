# Versioning

## Release model

- Every **major release** gets its own branch: **`release/vX.Y.0`**
  (`release/v3.1.0`, `release/v3.2.0`, ...).
- **Fixes and enhancements** on a released line are committed to its release
  branch and published as **tags**: `v3.5.1`, `v3.5.2`, ... — the `3.5.x`
  series lives on `release/v3.5.0`.
- The next release starts a new branch (`release/v3.6.0`, ...) and its
  VERSIONING.md carries the **previous versions' history plus what is new**
  on that line.
- The **development branch** (`development/vX.Y.0`) is the current working
  branch feeding its release line.

What moves the version:

| Change | Bump |
| ------ | ---- |
| Breaking API / architecture shift | MAJOR · `X.0.0` |
| New backward-compatible capability or supported target | MINOR · `3.Y.0` |
| Backward-compatible bug / doc / build fix | PATCH · `3.Y.Z` (tag on the release branch) |

## This branch

`release/v3.5.0` — the **main release of the 3.5.x line** (SGT1001 chip +
dual token transport), laid out under `SDK/SDK_v3.3/` (`sdk_device/`,
`sdk_gateway/`, `sdk_cloud/`). Fixes and enhancements to 3.5 land on this
branch and are published as `v3.5.1`, `v3.5.2`, ... tags.

## Version history

### 3.5.0 — SGT1001 + dual token transport (`release/v3.5.0`, this branch)

Everything in 3.4.x, plus:

- **SGT1001 "CyberRock-Token"** chip support with the bundled datasheet;
  SPI parameters datasheet-locked in `config_poc.h` (Mode 0, ≤ 10 MHz).
- **Build-time dual token transport**: `make TRANSPORT=usb` (FTDI/USB-CDC
  bridge, default) or `make TRANSPORT=spi` (native Linux `/dev/spidev`, e.g.
  Raspberry Pi — wiring documented in `SDK/README.md`).
- Restructured layout: `SDK/SDK_v3.3/` with `sdk_device/`, `sdk_gateway/`,
  `sdk_cloud/` (renamed from `PoC_SDK_v3/poc_sdk_*`), plus a full integration
  guide at `SDK/README.md`.

### 3.4.0 — BIST + unified gateway dispatcher (`release/v3.4.0`)

Everything in 3.3.x, plus:

- `SGR_SDK_BIST()` device self-test (pcc/id/rw/ek, `0x50` = PASS).
- Unified `SGR_SDK_GW_Run()` gateway dispatcher replacing the three separate
  `Handle_*` calls.
- Multi-device gateway (`MAX_DEVICES=3`, ports from `PORT_BASE 8080`);
  TID whitelist database.

### 3.3.0 — Two-phase mutual authentication (`release/v3.3.0`)

Everything in 3.2.x, plus:

- Two-phase mutual authentication: Phase 2 cloud→token via `HCW = RW‖RW`
  (frame type `"8"`) and local HRW comparison; new status
  `SGR_SDK_MUTUAL_AUTH_FAILED`.
- Explicit `Token_To_Server` / `Server_To_Token` gateway API on a unified
  middleware FSM; cloud mapping of `requestRW` to the CyberRock HRW endpoints.

### 3.2.0 — ARM host port (`release/v3.2.0`)

Everything in 3.1.x, plus:

- Native builds on ARM hosts (Raspberry Pi); POSIX termios token transport on
  Linux; `-D_GNU_SOURCE` for glibc ≥ 2.38; `setup.sh` / `run_all.sh` runner
  tooling with BIST-based TID auto-detection.

### 3.1.0 — Initial SDK v3 release (`release/v3.1.0`)

- Three-tier PoC architecture: device (C) ↔ gateway (C) ↔ cloud (Python);
  CW/RW authentication (TCP device↔gateway, MQTT gateway↔cloud on
  `sandgrain/v1` topics).
- Firmware verification (frame `"6"`) and installation authorization
  (frame `"7"`); fault-injection framework.
- Python Cloud SDK `sandgrain-cloud-sdk` 0.3.0 (async) + MQTT PoC application;
  EMQX docker-compose; optional CRC-16/CCITT-FALSE payload integrity.
