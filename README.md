# Sandgrain SDK — `release/v3.2.0`

Consolidated Sandgrain / TrustBridge versioning repository.
This branch mirrors the upstream `sandgrain-sdk` branch **`rev3.2-ARM`** —
the **ARM host port** of the v3.2 stream, targeting native builds on ARM
hosts such as the Raspberry Pi.

Each branch of this repository is a complete, self-contained snapshot of one
SDK stream (see [VERSIONING.md](./VERSIONING.md) and
[COMPATIBILITY.md](./COMPATIBILITY.md)).

## What the SDK does

The Sandgrain SGR SDK implements **mutual authentication** between embedded
devices carrying a Sandgrain crypto token and the SandGrain / CyberRock cloud
platform, using a Challenge Word / Response Word (CW/RW) scheme, plus
**firmware verification** (SHA-256 hash as CW, `FW_OK`/`FW_NOK` reporting) and
**firmware installation** authorization.

## What "ARM host port" means

The port is at the host/build layer (no cross-compilation — build natively on
the ARM host with `gcc`):

- The bundled `librs232lib.so` is x86-64-only; on Linux the token transport
  (`port_spi_usb.c`) now uses **native POSIX termios** instead, with no
  external serial library. Windows keeps using the static rs232lib.
- Both Makefiles add `-D_GNU_SOURCE` (required on glibc ≥ 2.38, e.g.
  Raspberry Pi OS "Trixie" / Debian 13).
- `SDK/setup.sh` and `SDK/run_all.sh` target Debian/Ubuntu/Raspberry Pi OS,
  including headless operation over SSH via `tmux`. `.ps1` wrappers run the
  same flow under WSL on Windows.

## Architecture

```
Device (C, DEVICE_MODE)          Gateway (C, GATEWAY_MODE)         Cloud PoC app (Python)
  crypto token via USB serial      bridges up to MAX_DEVICES         sandgrain-cloud-sdk
        |                            channels                              |
        +---------- TCP ---------------+---------- MQTT (QoS 1) ----------+------ REST ------> CyberRock API
             127.0.0.1:8080+ch          sandgrain/v1/<tid>/req|rsp/...        /api/device/*
             JSON frames "4".."7"       actions 0,1,2,3,6,7
```

## Layout

- `SDK/README.md` — the **PoC Runner guide** (read this first).
- `SDK/setup.sh` / `setup.ps1` — one-time environment setup: apt packages
  (`build-essential`, `libmosquitto-dev`, `mosquitto`, `python3`, `tmux`),
  Python venv at `PoC_SDK_v3/sdk_cloud/venv`, editable install of the cloud SDK.
- `SDK/run_all.sh` / `run_all.ps1` — per-session launcher: prompts for
  CyberRock URL / credentials / MQTT settings, writes `.env` and
  `device_credentials.json`, rebuilds device+gateway firmware, **auto-detects
  the device TID via BIST**, and launches Cloud → Gateway → Device (Windows
  Terminal, GUI terminal, or a `tmux` session on headless hosts).
  Flags: `--no-build`, `--no-detect-tid`.
- `SDK/PoC_SDK_v3/`:
  - `poc_sdk_device/` — device PoC app + SGR SDK firmware (`-DSDK_MODE=0`),
    fault-injection module included.
  - `poc_sdk_gateway/` — gateway PoC app + SGR SDK firmware (`-DSDK_MODE=1`,
    `MAX_DEVICES=3`, TCP ports 8080+ to devices, MQTT to the cloud).
  - `sdk_cloud/` — Python `sandgrain_cloud_sdk/` (v0.3.0, async) +
    `application_PoC_MQTT/` + Docker/EMQX Enterprise 6.1.0 compose.
  - `User Guide - SDK v3.pdf`.

## Quick start

```bash
cd SDK
./setup.sh       # once per machine (use --no-apt to skip package install)
./run_all.sh     # each session — builds, configures and launches all three tiers
```

On Windows use `setup.ps1` / `run_all.ps1` (WSL-based). Device/gateway broker
settings are compile-time in each `app/config_poc.h` (separate from the cloud
`.env`).

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
