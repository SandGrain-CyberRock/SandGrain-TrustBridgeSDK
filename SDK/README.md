# SandGrain SDK — PoC Runner

This repository contains the SandGrain authentication PoC (`PoC_SDK_v3`): an embedded
**Device** and **Gateway** (C firmware) plus a **Cloud** service (Python) that together
run the Challenge-Word / Response-Word mutual-authentication and firmware
verification/installation flows.

Two helper scripts at the repo root automate the whole thing:

| Script | When you run it | What it does |
|--------|-----------------|--------------|
| `setup.sh` / `setup.ps1` | **once** (or after a fresh clone) | Installs system packages, creates the Python venv, installs Python deps + the local Cloud SDK |
| `run_all.sh` / `run_all.ps1` | **every session** | Prompts for config, writes `.env` + tenant creds, rebuilds the firmware, detects the device TID, and launches Cloud + Gateway + Device in three terminals |

> The `.ps1` files are thin wrappers — on Windows everything actually runs **inside WSL**,
> because the firmware is built with `gcc`/`make` and the Cloud runs in a Linux Python venv.

---

## 1. Prerequisites

### Windows
- **WSL** with a Debian/Ubuntu distribution — <https://learn.microsoft.com/windows/wsl/install>
- **Windows Terminal** (`wt.exe`) — from the Microsoft Store (used to open the three windows)
- A **SandGrain token chip** reachable from WSL. If it's a USB device, attach it to WSL with
  [`usbipd-win`](https://learn.microsoft.com/windows/wsl/connect-usb).

### Linux / Raspberry Pi
- A Debian/Ubuntu/Raspberry Pi OS system (the scripts use `apt`)
- For the launcher: a **desktop terminal** (gnome-terminal/konsole/xterm/…) **or** `tmux`
  (installed by `setup.sh`) when running headless over SSH
- A **SandGrain token chip** connected (the Device/Gateway need it; on native Linux they run with `sudo`)

### An MQTT broker
The Cloud, Gateway and Device talk over MQTT. Point `MQTT_HOST` at your broker (EMQX or
Mosquitto). `setup.sh` installs a local `mosquitto` broker you can use, or use a remote one.

---

## 2. Quick start

Clone, then run **setup once**, then **run_all each session**.

### Windows (PowerShell)

Run from a **PowerShell prompt** (so you can answer the prompts):

```powershell
cd "D:\path\to\sandgrain-sdk"

# one-time
.\setup.ps1

# every session
.\run_all.ps1
```

If PowerShell blocks the script with *"running scripts is disabled on this system"*, allow it
for the current session:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
# ...or run a single script without changing policy:
powershell -ExecutionPolicy Bypass -File .\run_all.ps1
```

### Linux / WSL (Bash)

```bash
cd /path/to/sandgrain-sdk      # on WSL this is e.g. /mnt/d/path/to/sandgrain-sdk

# one-time
bash setup.sh

# every session
bash run_all.sh
```

> Run with `bash <script>` (rather than `./script.sh`). On Windows-mounted drives the execute
> bit often isn't honored, and `bash <script>` works regardless.

---

## 3. What `setup.sh` installs

Targets `apt` (Debian/Ubuntu/Raspberry Pi OS). It installs:

- **build tools:** `build-essential` (gcc, make)
- **MQTT:** `libmosquitto-dev` (firmware links `-lmosquitto`), `mosquitto`, `mosquitto-clients`
- **Python:** `python3`, `python3-venv`, `python3-pip`, and `tmux`

Then it creates the venv at `PoC_SDK_v3/sdk_cloud/venv` and installs the Python dependencies:

```
python-dotenv  paho-mqtt  aiohttp  cryptography
+ the local Cloud SDK (pip install -e PoC_SDK_v3/sdk_cloud/sandgrain_cloud_sdk)
```

`setup.sh` is **re-runnable**. Useful flags:

| Flag | Effect |
|------|--------|
| `--no-apt` | Skip the system packages; only (re)create the venv and reinstall Python deps |
| `-h`, `--help` | Show help |

On native Linux it uses `sudo apt-get` (prompts for your password once).

---

## 4. What `run_all.sh` does (each run)

1. **Prompts for configuration** (press Enter to keep the shown `[current]` value):

   | Prompt | Goes to | Notes |
   |--------|---------|-------|
   | CyberRock base URL | `.env` `CYBERROCK_BASE_URL` | SandGrain/CyberRock API URL |
   | Device ID | `.env` `DEVICE_ID` | topic scope (e.g. `gw-001`) |
   | CF Access Client ID | `.env` `CF_ACCESS_CLIENT_ID` | Cloudflare Access (for `requestRW`) |
   | CF Access Client Secret | `.env` `CF_ACCESS_CLIENT_SECRET` | hidden input |
   | Tenant email | `device_credentials.json` → `tenant` | |
   | Tenant password | `device_credentials.json` → `tenant` | hidden input |
   | MQTT host / port / username / password | `.env` `MQTT_*` | password hidden |

2. **Writes** the cloud `.env` and the `tenant` block of `device_credentials.json`
   (the `devices` map is preserved).
3. **Verifies** the venv exists (tells you to run `setup` first if not).
4. **Rebuilds** the firmware: `make clean` + `make` for Device and Gateway.
5. **Detects the device TID** via BIST and, if it's new, prompts for username/password and adds
   it to `device_credentials.json` (see [§6](#6-device-tid-auto-detection)).
6. **Launches** Cloud → Gateway → Device, each in its own terminal.

### Flags

| Flag | Effect |
|------|--------|
| `--no-build` | Skip `make clean`/`make`; reuse existing binaries |
| `--no-detect-tid` | Skip the TID auto-detection step (e.g. quick relaunch without the chip) |
| `-h`, `--help` | Show help |

```powershell
.\run_all.ps1 --no-build --no-detect-tid
```
```bash
bash run_all.sh --no-build
```

---

## 5. How the three components are launched

`run_all` auto-detects the environment and opens the three components accordingly:

| Environment | How they open |
|-------------|---------------|
| **WSL / Windows** | three **Windows Terminal** windows (`wt.exe`) |
| **Linux desktop** (has a display) | three GUI windows (gnome-terminal/konsole/xfce4-terminal/xterm/…) |
| **Headless Linux / SSH** | three panes in a **tmux** session named `sandgrain` |

For the tmux session: detach with `Ctrl-b d`, re-attach with `tmux attach -t sandgrain`,
stop with `tmux kill-session -t sandgrain`.

On **native Linux** the Device and Gateway run with `sudo` (they need raw serial/socket access);
the Cloud (Python) never uses `sudo`. On **WSL** none of them use `sudo`.

---

## 6. Device TID auto-detection

The device TID is the identity read from the SandGrain token chip — it is **not** configured by
hand. On every run (unless `--no-detect-tid`), `run_all` runs the device's **BIST**, reads
`PCC` + `ID` (= the 64-hex TID), and checks `device_credentials.json`:

- **already present** → nothing to do
- **new** → prompts for `username`/`password` and adds it under `devices`

This is **best-effort**: if the token chip isn't connected (or BIST can't be read), it prints a
warning and continues to launch — it never blocks the run.

---

## 7. Troubleshooting

| Symptom | Fix |
|---------|-----|
| PowerShell: *"running scripts is disabled"* | `Set-ExecutionPolicy -Scope Process Bypass` (see [§2](#windows-powershell)) |
| `wsl` / `wt.exe` not found | Install WSL and Windows Terminal |
| `make` / `python3` not found | Run `setup` first |
| `Python venv not found …` | Run `setup` first (it creates the venv) |
| TID detection: *"Could not read the TID from BIST"* | Connect the token chip; on WSL attach the USB device with `usbipd-win`; or use `--no-detect-tid` |
| Cloud can't reach the broker | Make sure an MQTT broker is running and `MQTT_HOST`/`MQTT_PORT` point at it |
| Device/Gateway can't reach the broker | Their broker settings are **compile-time** in `config_poc.h` (separate from `.env`) — edit there and rebuild |
| `git status` shows `test_device`/`test_gw` as deleted | `make clean` removes these tracked binaries each run; they're rebuilt immediately. Consider untracking them (`git rm --cached`) |

---

## 8. Manual run (without the scripts)

If you'd rather do it by hand (all on Linux/WSL):

```bash
# --- one-time ---
sudo apt-get install -y build-essential libmosquitto-dev mosquitto mosquitto-clients \
                        python3 python3-venv python3-pip tmux
python3 -m venv PoC_SDK_v3/sdk_cloud/venv
source PoC_SDK_v3/sdk_cloud/venv/bin/activate
pip install python-dotenv paho-mqtt aiohttp cryptography
pip install -e PoC_SDK_v3/sdk_cloud/sandgrain_cloud_sdk

# --- Cloud (terminal 1) ---
cd PoC_SDK_v3/sdk_cloud/application_PoC_MQTT
# edit .env and device_credentials.json by hand
python -m app.main

# --- Gateway (terminal 2) ---
cd PoC_SDK_v3/poc_sdk_gateway/app && make && sudo ./test_gw      # drop sudo on WSL

# --- Device (terminal 3) ---
cd PoC_SDK_v3/poc_sdk_device/app && make && sudo ./test_device   # drop sudo on WSL
```

---

## Repository layout (relevant parts)

```
setup.sh / setup.ps1            one-time environment setup
run_all.sh / run_all.ps1        per-session build + launch
PoC_SDK_v3/
  poc_sdk_device/   app/ -> test_device   (firmware SDK, DEVICE mode)
  poc_sdk_gateway/  app/ -> test_gw        (firmware SDK, GATEWAY mode)
  sdk_cloud/
    sandgrain_cloud_sdk/         Cloud SDK (Python, pip-installable)
    application_PoC_MQTT/         Cloud service (python -m app.main)
      .env                        cloud config (written by run_all)
      device_credentials.json     tenant + per-TID device credentials
    venv/                         Python virtualenv (created by setup)
```
