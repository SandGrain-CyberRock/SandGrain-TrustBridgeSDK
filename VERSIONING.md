# Versioning

## Release model

- Every **major release** gets its own branch: **`release/vX.Y.0`**
  (`release/v3.1.0`, `release/v3.2.0`, ...).
- **Fixes and enhancements** on a released line are committed to its release
  branch and published as **tags**: `v3.1.1`, `v3.1.2`, ... — the `3.1.x`
  series lives on `release/v3.1.0`, the `3.2.x` series on `release/v3.2.0`,
  and so on.
- Each new release branch's VERSIONING.md carries the **previous versions'
  history plus what is new** on that line.
- The **development branch** (`development/vX.Y.0`) is the current working
  branch feeding its release line.
- `main` is the stable trunk; release lines branch off as `release/vX.Y.0`.

What moves the version:

| Change | Bump |
| ------ | ---- |
| Breaking API / architecture shift | MAJOR · `X.0.0` |
| New backward-compatible capability or supported target | MINOR · `3.Y.0` |
| Backward-compatible bug / doc / build fix | PATCH · `3.Y.Z` (tag on the release branch) |

## This branch

`main` — the stable trunk, laid out under `SDK/PoC_SDK_v3/`. The full version
history across all release lines is kept here for reference.

## Version history

### 3.6.0 — TrustBridge integration (`release/v3.6.0`)

Everything in 3.5.x, plus:

- TrustBridge management layer: React/Vite frontend (`trustbridge-fe`) and
  NestJS backend (`trustbridge-be` 1.0.0; MySQL 8, JWT/RBAC, Swagger).
- Shared Mosquitto 2 broker replaces standalone EMQX (Docker network
  `trustbridge-net`).
- Gateway `gw_log` / `auth_result` telemetry driving device state in the BE;
  BE-synced runtime whitelist; per-TID credentials from the BE with
  auto-claim.
- Device `--listen` mode (MQTT `cmd/run_auth`); standalone (no-BE) run mode;
  two-phase crypto opcodes (`TOKEN_AUTH 0x03000800` / `HOST_AUTH 0x05000800`);
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
  `-D_GNU_SOURCE` for glibc ≥ 2.38; `setup.sh` / `run_all.sh` runner tooling
  with BIST-based TID auto-detection.

### 3.1.0 — Initial SDK v3 release (`release/v3.1.0`)

- Three-tier PoC architecture: device (C, `DEVICE_MODE`) ↔ gateway (C,
  `GATEWAY_MODE`) ↔ cloud (Python).
- CW/RW device authentication through the gateway: TCP device↔gateway
  (JSON frames `"4"`/`"5"`), MQTT gateway↔cloud (`sandgrain/v1/<tid>/req|rsp`
  topics).
- Firmware verification (frame `"6"`) and installation authorization
  (frame `"7"`); fault-injection framework.
- Python Cloud SDK `sandgrain-cloud-sdk` 0.3.0 (async) + MQTT PoC application;
  EMQX docker-compose; optional CRC-16/CCITT-FALSE payload integrity.
