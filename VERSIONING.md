# Versioning

## Release model

- Every **major release** gets its own branch: **`release/vX.Y.0`**
  (`release/v3.1.0`, `release/v3.2.0`, ...).
- **Fixes and enhancements** on a released line are committed to its release
  branch and published as **tags**: `v3.2.1`, `v3.2.2`, ... — the `3.2.x`
  series lives on `release/v3.2.0`.
- The next release starts a new branch (`release/v3.3.0`, ...) and its
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

`release/v3.2.0` — the **main release of the 3.2.x line** (ARM host port),
laid out under `SDK/PoC_SDK_v3/` with the `SDK/setup.*` / `SDK/run_all.*`
runner scripts. Fixes and enhancements to 3.2 land on this branch and are
published as `v3.2.1`, `v3.2.2`, ... tags.

## Version history

### 3.2.0 — ARM host port (`release/v3.2.0`, this branch)

Everything in 3.1.x, plus:

- Native builds on ARM hosts (Raspberry Pi) with plain `gcc` — no cross
  toolchain required.
- Linux token transport moved to **POSIX termios**, dropping the x86-64-only
  `librs232lib.so`; Windows keeps the static rs232lib.
- `-D_GNU_SOURCE` added for glibc ≥ 2.38 (Raspberry Pi OS "Trixie" /
  Debian 13).
- Runner tooling: `SDK/setup.sh` (one-time apt + Python venv setup) and
  `SDK/run_all.sh` (per-session config, firmware rebuild, **BIST-based TID
  auto-detection**, Cloud→Gateway→Device launch; tmux for headless hosts,
  `.ps1` wrappers for WSL on Windows).

### 3.1.0 — Initial SDK v3 release (`release/v3.1.0`)

- Three-tier PoC architecture: device (C, `DEVICE_MODE`) ↔ gateway (C,
  `GATEWAY_MODE`) ↔ cloud (Python).
- CW/RW device authentication through the gateway: TCP device↔gateway
  (JSON frames `"4"`/`"5"`), MQTT gateway↔cloud (`sandgrain/v1/<tid>/req|rsp`
  topics, actions requestCW / replyRW / requestRW / checkAuthStatusCloud).
- Firmware verification (frame `"6"`, SHA-256 hash as CW, `FW_OK`/`FW_NOK`)
  and firmware installation authorization (frame `"7"`).
- Fault-injection framework: device bit-flip module plus gateway
  per-frame-type TX faults, exercising the CW/RW bit-flip tolerance thresholds.
- Python Cloud SDK `sandgrain-cloud-sdk` 0.3.0 (async, `aiohttp`) and the
  runnable MQTT PoC application; EMQX docker-compose deployment.
- Optional CRC-16/CCITT-FALSE payload integrity (auto-enabled per request).
