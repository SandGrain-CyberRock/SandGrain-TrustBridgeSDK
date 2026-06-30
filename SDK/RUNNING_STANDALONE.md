# Running the SandGrain SDK — Standalone (no TrustBridge BE)

This guide covers running the SandGrain `PoC_SDK_v3` stack **on its own**, using the
`run_standalone.sh` / `run_standalone.ps1` launchers. "Standalone" means:

- **No TrustBridge BE** is involved. Nothing is fetched from, or reported to, a backend.
- The **Cloud** agent reads device/tenant credentials from a local
  `device_credentials.json` (the bundled `JsonFileCredentialsStore`).
- The **Gateway** authorizes devices from a **static** whitelist file
  (`trustbridge_whitelist.txt`) — it never curls a BE.
- The **Device** runs the **interactive menu**, so you trigger auth flows by hand.

It still talks to **CyberRock** + the **tenant API** over HTTPS — that's SandGrain's own
hosted backend (sandbox), not TrustBridge — so the full mutual-authentication and
auto-claim flow works end to end.

> Looking for the BE-integrated launcher instead? See `README.md` (the `run_all.*`
> scripts) — that mode syncs the whitelist and credentials from a running TrustBridge BE.

---

## 1. Architecture (standalone)

```
                         ┌─────────────────────────────────────────┐
  ┌────────────┐  TCP    ┌──────────┐  MQTT   ┌──────────────┐  HTTPS  CyberRock
  │ test_device│ ──────► │ test_gw  │ ──────► │ cloud agent   │ ──────► device-api.* +
  │ (C, chip)  │ :8080   │ (C)      │  :1883  │ (Python venv) │         tenant-api.*
  └────────────┘         └──────────┘         └──────────────┘         (SandGrain sandbox)
        │                     │
        │                     └── reads static trustbridge_whitelist.txt (no BE)
        └── interactive menu: you pick the auth mode (1/2/3)
```

Three processes, each in its own window:

| Component | What runs | Talks to |
|-----------|-----------|----------|
| **Cloud** | `python -m app.main` (in the venv) | MQTT broker + CyberRock/tenant API over HTTPS |
| **Gateway** | `./test_gw` | MQTT broker; the crypto chip; the static whitelist file |
| **Device** | `./test_device` (menu) | the Gateway over TCP; the crypto chip over serial |

---

## 2. Prerequisites

### Windows
- **WSL** with a Debian/Ubuntu distribution — <https://learn.microsoft.com/windows/wsl/install>
- **Windows Terminal** (`wt.exe`) — used to open the three windows
- The **SandGrain token chip** attached to WSL. If it's USB, attach it with
  [`usbipd-win`](https://learn.microsoft.com/windows/wsl/connect-usb) so it shows up as
  `/dev/ttyACM0` (or similar) inside WSL.

### Linux / Raspberry Pi
- Debian/Ubuntu/Raspberry Pi OS (the scripts use `apt`)
- A desktop terminal (gnome-terminal/konsole/xterm/…) **or** `tmux` for headless/SSH
- The token chip connected (on native Linux the Device/Gateway run with `sudo`)

### An MQTT broker (required)
The three components rendezvous on an MQTT broker. In standalone mode **there is no BE
bringing one up**, so you must have one running yourself. `setup.sh` installs a local
**mosquitto** you can use:

```bash
# inside WSL / Linux — start the bundled broker on :1883
sudo service mosquitto start        # Debian/Ubuntu service
# or run it in the foreground:
mosquitto -p 1883 -v
```
Point the **MQTT host** prompt (below) at this broker (`localhost` / `127.0.0.1`).

### CyberRock access
You need, from the SandGrain team:
- the **CyberRock base URL** (sandbox default: `https://device-api.sandbox.sandgrain.io`)
- **Cloudflare Access** client ID + secret (`CF_ACCESS_*`)
- a **tenant** login (email + password) that owns the device

---

## 3. One-time setup

Run **once** (or after a fresh clone). This installs system packages, creates the Python
venv, and installs the Python deps + the local Cloud SDK.

### Windows (PowerShell)
```powershell
cd "D:\path\to\sandgrain-sdk"
.\setup.ps1
```
### Linux / WSL (Bash)
```bash
cd /path/to/sandgrain-sdk      # on WSL e.g. /mnt/d/path/to/sandgrain-sdk
bash setup.sh
```

`setup` installs (via apt): `build-essential`, `libmosquitto-dev`, `mosquitto`,
`mosquitto-clients`, `python3`/`python3-venv`/`python3-pip`, `tmux`; then creates the venv
at `PoC_SDK_v3/sdk_cloud/venv` and pip-installs `python-dotenv paho-mqtt aiohttp
cryptography` + the local SDK. Re-runnable; `--no-apt` skips the system packages.

> If PowerShell blocks the script ("running scripts is disabled"), allow it for the session:
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`.

---

## 4. Run it

From a **PowerShell** prompt (so you can answer the prompts):

```powershell
.\run_standalone.ps1
```
or from **WSL / Linux**:
```bash
bash run_standalone.sh
```

### Flags

| Flag | Effect |
|------|--------|
| `--no-build` | Skip `make clean`/`make`; reuse the existing `test_device` / `test_gw` binaries |
| `--no-detect-tid` | Skip the chip TID auto-detection and whitelist auto-add; use `trustbridge_whitelist.txt` **exactly as-is** (pure static mode) |
| `-h`, `--help` | Show help |

```powershell
.\run_standalone.ps1 --no-build
```

### What the run does, step by step
1. **Prompts** for configuration (Enter keeps the shown `[current]` value).
2. **Writes** the cloud `.env` and the `tenant` block of `device_credentials.json`.
3. **Verifies** the venv exists (run `setup` first if not).
4. **Builds** the Device and Gateway firmware (`make clean` + `make`).
5. **Detects the chip TID** via BIST and adds it to `device_credentials.json` **and** the
   static whitelist if missing (skip with `--no-detect-tid`).
6. **Launches** Cloud → Gateway → Device, each in its own window.

> Steps 1–5 print in the **main launcher window** (where you ran the command). The
> auto-detect / whitelist messages appear there — not inside the three component windows.

---

## 5. The prompts

| Prompt | Stored in | Notes |
|--------|-----------|-------|
| CyberRock base URL | `.env` `CYBERROCK_BASE_URL` | sandbox: `https://device-api.sandbox.sandgrain.io` |
| Device ID | `.env` `DEVICE_ID` | MQTT topic scope (e.g. `gw-001`) |
| CF Access Client ID | `.env` `CF_ACCESS_CLIENT_ID` | Cloudflare Access |
| CF Access Client Secret | `.env` `CF_ACCESS_CLIENT_SECRET` | hidden input |
| Tenant email | `device_credentials.json` → `tenant` | tenant that owns the device |
| Tenant password | `device_credentials.json` → `tenant` | hidden input |
| MQTT host / port / username / password | `.env` `MQTT_*` | point at your broker; password hidden |

The `.env` and `device_credentials.json` both live in
`PoC_SDK_v3/sdk_cloud/application_PoC_MQTT/`. They persist between runs and seed the next
run's defaults — so after the first run you can usually just press Enter through everything.

> **Notably absent:** there is no `BE_URL` prompt. That's the whole point of standalone —
> the launcher never sets `BE_URL`, which is what keeps the Cloud on the JSON credentials
> store and the Gateway on the static whitelist.

---

## 6. The static whitelist (how the gateway authorizes your device)

The gateway only authorizes devices whose 64-hex TID is in:

```
PoC_SDK_v3/poc_sdk_gateway/app/trustbridge_whitelist.txt   (one TID per line)
```

In standalone mode this file is **authoritative** (no BE overwrites it). `run_standalone`
manages it for you:

- On each run (unless `--no-detect-tid`), it reads the connected chip's TID via BIST and
  **appends it if missing** (non-destructive — existing lines are kept, duplicates skipped).
- An empty file + chip connected → the file becomes that one TID.
- The file already contains the TID → nothing changes (you'll see `TID already in whitelist`).

At gateway startup you'll see it load:
```
[AUTH_DB] Loaded 1 device(s) from whitelist: .../trustbridge_whitelist.txt
[AUTH_DB] Registered — idx=0 | crc32=0x... | tid=8000000000000000...
```

**If the chip can't be read** (e.g. not attached to WSL) **and the file is empty**, the
launcher warns that the gateway will authorize **no** device. Fix by either attaching the
chip and re-running, or adding the TID line by hand:
```bash
echo "80000000000000000000000000000024ad8fc3d839e09ca8aba9474002e7d185" \
  > PoC_SDK_v3/poc_sdk_gateway/app/trustbridge_whitelist.txt
```

To **remove** a device, just delete its line from the file. To run with a frozen list,
use `--no-detect-tid` so the chip's TID isn't auto-added.

---

## 7. Triggering an authentication

In standalone mode the **Device window has the interactive menu** — that's how you start a
flow (there's no BE to publish `cmd/run_auth`). In the Device window:

```
  0. BIST — Built-In Self-Test (crypto chip)
  1. Mutual Authentication (no fault injection)        <-- normal flow
  2. Fault injection (CW: 2 bits, CW echo: 1 bit, RW: 1 bit)
  3. Fault injection — Error Management stress (CW: 3 bits, CW echo: 2 bits)
  4. FW Verification — correct RW
  5. FW Verification — wrong RW
  6. Installation — request install auth (run option 4 first)
  7. Exit
```

A normal end-to-end run: type **`1`** and press Enter. Watch all three windows:

- **Device** drives the chip and exchanges frames with the gateway.
- **Gateway** walks the FSM and prints step progress (`[1/6] … [6/6] CR verdict: AUT_OK ✔`).
- **Cloud** logs the CyberRock calls (`requestCW`, `replyRW`, `checkAuthStatus`) and the
  auto-claim against the tenant API.

Use **`2`** / **`3`** to exercise the gateway's bit-flip error-management recovery.

---

## 8. Verifying success

You're fully working when you see, roughly in this order:

| Window | Success signal |
|--------|----------------|
| Device | `BIST PASS`, then the mutual-auth exchange completes without errors |
| Gateway | `[6/6] CR verdict: AUT_OK ✔` and, for Phase 2, `MUTUAL AUTH OK ✔` |
| Cloud | `replyRW ok auth_status=AUTH_OK …` (and `claim_result=CLAIMED` on first claim) |

---

## 9. Troubleshooting

| Symptom | Fix |
|---------|-----|
| PowerShell: *"running scripts is disabled"* | `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` |
| `wsl` / `wt.exe` not found | Install WSL and Windows Terminal |
| `make` / `python3` not found, or *"venv not found"* | Run `setup` first (`.\setup.ps1` / `bash setup.sh`) |
| Device: `crypto chip not responding` / `/dev/ttyACM0` missing | Attach the chip to WSL with `usbipd-win`; confirm `ls /dev/ttyACM*` in WSL |
| Launcher: *"Could not read the TID from BIST"* | Chip not visible at detect time — attach it (usbipd) and re-run, or add the TID to the whitelist manually |
| Gateway authorizes nothing / device rejected | The whitelist has no valid TID — see [§6](#6-the-static-whitelist-how-the-gateway-authorizes-your-device) |
| Cloud / Gateway can't reach the broker | Start a broker and point the **MQTT host/port** prompts at it (`sudo service mosquitto start`) |
| Cloud HTTPS errors / `401` / `403` | Check `CYBERROCK_BASE_URL` and the `CF_ACCESS_*` creds; check the tenant login in `device_credentials.json` |
| TID detection prompts for `sudo` | Expected on WSL/native Linux — the chip serial device needs root. Enter your password once. |

---

## 10. Standalone vs. `run_all` (BE mode) — quick reference

| | `run_standalone.*` (this guide) | `run_all.*` (`README.md`) |
|--|--|--|
| TrustBridge BE | **not used** | required/assumed (`BE_URL` always set) |
| Whitelist source | **static file**, auto-seeded from the chip | BE-synced (`GET BE_URL/devices/whitelist`), overwrites the file |
| Cloud credentials | `device_credentials.json` (JSON store) | same JSON store in this tree |
| Device mode | interactive **menu** | menu (or `--listen` with `--no-cloud`) |
| How you trigger auth | Device menu option `1`/`2`/`3` | Device menu, or the FE/BE via `cmd/run_auth` |
| MQTT broker | **you start it** (e.g. local mosquitto) | typically the BE's broker |

---

## 11. Cheat sheet

```powershell
# one-time
.\setup.ps1

# every session (Windows)
.\run_standalone.ps1                      # full build + launch
.\run_standalone.ps1 --no-build           # reuse binaries
.\run_standalone.ps1 --no-detect-tid      # frozen static whitelist
```
```bash
# every session (WSL / Linux)
sudo service mosquitto start              # make sure a broker is up
bash run_standalone.sh
```
Then, in the **Device** window: press `1` (Enter) for a normal mutual-auth run.
```

Files the launcher touches:
- PoC_SDK_v3/sdk_cloud/application_PoC_MQTT/.env                  (cloud config; no BE_URL)
- PoC_SDK_v3/sdk_cloud/application_PoC_MQTT/device_credentials.json (tenant + per-TID creds)
- PoC_SDK_v3/poc_sdk_gateway/app/trustbridge_whitelist.txt        (static whitelist)
```
