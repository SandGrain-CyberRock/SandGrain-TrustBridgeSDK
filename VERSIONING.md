# Versioning

## Release model

- Every **major release** gets its own branch: **`release/vX.Y.0`**
  (`release/v3.1.0`, `release/v3.2.0`, ...).
- **Fixes and enhancements** on a released line are committed to its release
  branch and published as **tags**: `v3.4.1`, `v3.4.2`, ... — the `3.4.x`
  series lives on `release/v3.4.0`.
- The next release starts a new branch (`release/v3.5.0`, ...) and its
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

`release/v3.4.0` — the **main release of the 3.4.x line** (v3.2 baseline
consolidation: BIST + unified gateway dispatcher), laid out under
`SDK/PoC_SDK_v3/`. Fixes and enhancements to 3.4 land on this branch and are
published as `v3.4.1`, `v3.4.2`, ... tags.

## Version history

### 3.4.0 — BIST + unified gateway dispatcher (`release/v3.4.0`, this branch)

Everything in 3.3.x, plus:

- **`SGR_SDK_BIST()`** device built-in self-test returning pcc/id/rw/ek and a
  BIST byte (`0x50` = PASS).
- **`SGR_SDK_GW_Run()`** unified gateway dispatcher: polls all device
  channels, peeks the incoming frame type and routes to the right flow
  (auth / FW verification / installation), replacing the three separate
  `SGR_SDK_GW_Handle_*` calls in a single main loop.
- **Multi-device gateway**: `MAX_DEVICES=3` channels, one TCP listening port
  per channel (`PORT_BASE 8080` → 8080/8081/8082).
- TID whitelist database (`auth_db_whitelist`) registered at
  `SGR_SDK_Initialize()`.

### 3.3.0 — Two-phase mutual authentication (`release/v3.3.0`)

Everything in 3.2.x, plus:

- Two-phase mutual authentication: Phase 2 cloud→token via `HCW = RW‖RW`
  (frame type `"8"`) and local HRW comparison; new status
  `SGR_SDK_MUTUAL_AUTH_FAILED`.
- Explicit `Token_To_Server` / `Server_To_Token` gateway API on a unified
  middleware FSM.
- Cloud mapping of `requestRW` to the CyberRock HRW endpoints
  (`requestTransactionId` / `requestHRW` / `checkRequestHRWStatus`).

### 3.2.0 — ARM host port (`release/v3.2.0`)

Everything in 3.1.x, plus:

- Native builds on ARM hosts (Raspberry Pi); Linux token transport moved to
  POSIX termios (drops the x86-64-only rs232lib); `-D_GNU_SOURCE` for
  glibc ≥ 2.38.
- Runner tooling: `setup.sh` / `run_all.sh` with BIST-based TID
  auto-detection, tmux and WSL support.

### 3.1.0 — Initial SDK v3 release (`release/v3.1.0`)

- Three-tier PoC architecture: device (C, `DEVICE_MODE`) ↔ gateway (C,
  `GATEWAY_MODE`) ↔ cloud (Python).
- CW/RW device authentication through the gateway: TCP device↔gateway
  (JSON frames `"4"`/`"5"`), MQTT gateway↔cloud (`sandgrain/v1/<tid>/req|rsp`
  topics).
- Firmware verification (frame `"6"`) and installation authorization
  (frame `"7"`).
- Fault-injection framework (device bit-flip module + gateway TX faults).
- Python Cloud SDK `sandgrain-cloud-sdk` 0.3.0 (async) + MQTT PoC application;
  EMQX docker-compose; optional CRC-16/CCITT-FALSE payload integrity.
