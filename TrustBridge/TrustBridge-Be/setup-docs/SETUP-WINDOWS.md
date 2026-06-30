# TrustBridge — Windows Setup Guide

A complete, step-by-step guide to running the entire TrustBridge stack on a fresh Windows 10 / 11 machine.

**You'll get:**
- **Frontend** at <http://localhost:5173>
- **Backend API** at <http://localhost:3000/api> (Swagger at `/docs`)
- **MySQL** + **Mosquitto MQTT** + **Cloud SDK** running in Docker
- **Device-side SDK + Gateway** running natively (only needed if you have the SandGrain USB hardware)

**Time required:** ~30–60 min on first install (mostly downloads). After that, `start-all.ps1` brings everything up in under a minute.

---

## Table of Contents

1. [What you'll install](#1-what-youll-install)
2. [Install prerequisites](#2-install-prerequisites)
3. [Get the code](#3-get-the-code)
4. [Start Docker Desktop (one-time)](#4-start-docker-desktop-one-time)
5. [Bring up the Docker stack (FE + BE + Cloud)](#5-bring-up-the-docker-stack-fe--be--cloud)
6. [Verify the stack is working](#6-verify-the-stack-is-working)
7. [Run the device-side SDK + Gateway (optional)](#7-run-the-device-side-sdk--gateway-optional)
8. [Daily workflow](#8-daily-workflow)
9. [Troubleshooting](#9-troubleshooting)
10. [Uninstall / clean slate](#10-uninstall--clean-slate)

---

## 1. What you'll install

| # | Tool | Why | Approx download |
|---|---|---|---|
| 1 | **Git** | clone the repos | ~50 MB |
| 2 | **Node.js LTS** (≥ 20) | BE seed runner uses ts-node, FE uses Vite | ~30 MB |
| 3 | **Docker Desktop** | runs MySQL + Mosquitto + BE + FE + Cloud SDK as containers | ~600 MB |
| 4 | **MSYS2** + GCC + libs | builds the C device-side SDK on Windows *(only if you have the SandGrain hardware)* | ~700 MB |

If you do **not** have the SandGrain USB device, you can skip MSYS2 and step 7 entirely.

---

## 2. Install prerequisites

> **Tip:** Run all `winget install` commands in a regular (non-admin) PowerShell window. Some installers will trigger their own UAC prompts — click **Yes** when they appear.

### 2.1 Open PowerShell

Press **Win + X**, choose **Terminal** (or **PowerShell**). You'll see a prompt like:
```
PS C:\Users\YourName>
```

### 2.2 Install Git

```powershell
winget install --id Git.Git --silent --accept-source-agreements --accept-package-agreements
```

Verify (close and reopen PowerShell first so `PATH` refreshes):
```powershell
git --version
```
Expected output:
```
git version 2.xx.x.windows.x
```

### 2.3 Install Node.js LTS

```powershell
winget install --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
```

Verify (new PowerShell window):
```powershell
node --version
npm --version
```
Expected:
```
v20.x.x   (or higher)
10.x.x
```

### 2.4 Install Docker Desktop ⚠️ requires UAC

```powershell
winget install --id Docker.DockerDesktop --silent --accept-source-agreements --accept-package-agreements
```

**Watch carefully:** a UAC prompt will appear (sometimes behind other windows — check the taskbar for a flashing shield icon). **Click Yes.** The actual install takes 3–5 minutes after that.

If `winget` reports `Installer failed with exit code: 4294967291` (= -5), the UAC prompt was missed or denied. See [Troubleshooting #2](#troubleshooting-issue-2) below.

Verify:
```powershell
# Open a NEW PowerShell window so PATH picks up the docker CLI
docker --version
```
Expected:
```
Docker version 29.x.x, build xxxxxxx
```

### 2.5 (Optional) Install MSYS2 — only if you have the SandGrain hardware

```powershell
winget install --id MSYS2.MSYS2 --silent --accept-source-agreements --accept-package-agreements
```

This installs to `C:\msys64\`. The actual gcc/make/library packages get installed by `setup.ps1` later (see step 7.1). No need to do anything here beyond the install itself.

### 2.6 Allow PowerShell scripts to run (one-time, per user)

Windows ships with a `Restricted` execution policy that blocks all `.ps1` files from running. Switch to `RemoteSigned` so local scripts (anything you wrote or cloned to your own machine) can execute. Run this once per user account:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

When prompted `Do you want to change the execution policy?`, type **`Y`** and press Enter.

> No admin / UAC needed — `-Scope CurrentUser` only affects your account. `RemoteSigned` is the recommended developer setting: it allows your local scripts to run while still requiring a signature on scripts downloaded from the internet (which we handle in step 3.3 below).

---

## 3. Get the code

### 3.1 Pick a directory

Anywhere is fine. Suggested:
```powershell
mkdir C:\dev\trustbridge
cd C:\dev\trustbridge
```

### 3.2 Clone the four repos as siblings

```powershell
git clone <BE-repo-url>          TrustBridge-BE
git clone <FE-repo-url>          TrustBridge-FE
git clone <SDK-repo-url>         trustbridge-sdk-v3
git clone <orchestrator-repo>    .   # contains start-all.ps1 and SETUP-WINDOWS.md
```

> Replace `<...-repo-url>` with the actual GitLab / GitHub URLs from your team.
> The fourth repo holds `start-all.ps1` + this guide; if your team keeps it elsewhere, just copy `start-all.ps1` and `SETUP-WINDOWS.md` into the parent dir manually.

### 3.3 If you downloaded as a ZIP instead of `git clone` — unblock the scripts

> **Skip this step if you used `git clone` in 3.2** — files cloned by Git don't carry the "downloaded from internet" tag.

When Windows downloads a ZIP from the web (or extracts files from one), every file inside gets stamped with a "Mark of the Web" alternate data stream. The `RemoteSigned` policy treats those tagged files as *remote* and blocks unsigned ones. Strip the tag from every `.ps1` in the project at once:

```powershell
Get-ChildItem -Path . -Recurse -Filter *.ps1 | Unblock-File
```

Run this from inside the project directory (the one containing `start-all.ps1`). Takes about a second; no admin / UAC needed.

> **Pro tip for future ZIPs:** before extracting, right-click the `.zip` → **Properties** → check the **Unblock** box → click **OK**. That unblocks every file at extract time, no per-file fix-up needed.

### 3.4 Verify layout

After cloning you should have:
```
C:\dev\trustbridge\
├── start-all.ps1
├── SETUP-WINDOWS.md
├── TrustBridge-BE\
│   ├── docker-compose.yml
│   ├── package.json
│   └── ...
├── TrustBridge-FE\
│   ├── docker-compose.yml
│   ├── package.json
│   └── ...
└── trustbridge-sdk-v3\
    ├── setup.ps1         # one-time: installs MSYS2 toolchain + libs
    ├── start-local.ps1   # writes .env + builds + launches test_gw / test_device
    └── ...
```

Quick check:
```powershell
ls
```
You should see all four entries.

---

## 4. Start Docker Desktop (one-time)

The first launch needs your input — Docker won't auto-accept the EULA.

### 4.1 Launch Docker Desktop

- **Start menu** → search "Docker Desktop" → click it.
- A window appears titled "Docker Subscription Service Agreement". Click **Accept**.
- Docker may show "Use WSL 2 based engine" — leave it checked, click **Finish**.
- A whale icon appears in your system tray (bottom-right, near the clock). **Wait for it to stop animating** and become solid white. This takes 30–60 seconds on first launch.

### 4.2 Verify Docker is ready

```powershell
docker info
```
Expected (ignore the warnings, look for `Server Version`):
```
Server:
 Server Version: 29.x.x
 ...
```

If you see `error during connect: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`, Docker isn't started yet — wait another 30s and retry.

> From now on, Docker Desktop **auto-starts at login**. You won't need to launch it manually again unless you reboot.

---

## 5. Bring up the Docker stack (FE + BE + Cloud)

### 5.1 Run the orchestrator

```powershell
cd C:\dev\trustbridge
.\start-all.ps1
```

Expected output (truncated):
```
[start-all] Creating Docker network: trustbridge-net
[start-all] Starting BE stack (mysql + mosquitto + be) - C:\dev\trustbridge\TrustBridge-BE
 ... lots of `docker compose` build output (~5-10 min on first run) ...
 Container tb-mysql Started
 Container tb-mosquitto Started
 Container tb-be Started
[start-all] Starting FE - C:\dev\trustbridge\TrustBridge-FE
 ...
 Container tb-fe Started
[start-all] Starting Cloud SDK - C:\dev\trustbridge\trustbridge-sdk-v3\Cloud
 ...
 Container tb-cloud-sdk Started

[start-all] All services started.
[start-all]   FE      -> http://localhost:5173
[start-all]   BE      -> http://localhost:3000/docs
[start-all]   MySQL   -> localhost:3306
[start-all]   MQTT    -> localhost:1883
```

**On first run this takes 5–15 minutes** (Docker is downloading base images and building the BE / FE / Cloud SDK images). On subsequent runs, ~30 seconds.

### 5.2 What `start-all.ps1` did

If you're curious:

1. Verified Docker engine is reachable
2. Created a shared Docker network `trustbridge-net` so containers can find each other by name
3. Copied `.env.example` → `.env` in any repo missing it
4. Ran `docker compose up -d --build` in each of the three project dirs (`TrustBridge-BE\`, `TrustBridge-FE\`, `trustbridge-sdk-v3\Cloud\`)
5. The BE container's entrypoint waits for MySQL to be healthy, runs the database seed once, then starts the NestJS API

---

## 6. Verify the stack is working

### 6.1 Containers running

```powershell
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```
Expected (5 containers):
```
NAMES          STATUS                   PORTS
tb-be          Up X minutes             0.0.0.0:3000->3000/tcp
tb-cloud-sdk   Up X minutes
tb-fe          Up X minutes             0.0.0.0:5173->5173/tcp
tb-mosquitto   Up X minutes             0.0.0.0:1883->1883/tcp
tb-mysql       Up X minutes (healthy)   0.0.0.0:3306->3306/tcp
```

If any container is missing or shows `Restarting` or `Exited`, see [Troubleshooting #5](#troubleshooting-issue-5).

### 6.2 Frontend in the browser

Open <http://localhost:5173> — you should see the TrustBridge login page.

### 6.3 Backend API + Swagger

Open <http://localhost:3000/docs> — you should see the Swagger UI with all the API endpoints.

### 6.4 (Optional) MQTT round-trip

```powershell
.\start-all.ps1 logs be
```
You should see lines like:
```
tb-be  | Connected to MQTT broker at mosquitto:1883
tb-be  | Subscribed to device presence: sandgrain/v1/+/status
tb-be  | Subscribed to gateway logs: sandgrain/v1/+/gw_log
```
Press **Ctrl+C** to stop tailing.

---

## 7. Run the device-side SDK + Gateway (optional)

**Skip this section if you don't have the SandGrain USB device.** The Docker stack from step 5 is enough on its own.

If you have the device:

### 7.1 One-time: install build deps

This installs the C toolchain (gcc + cc1 + make + binutils) plus libmosquitto and libftdi inside MSYS2, so `test_gw` and `test_device` can compile natively on Windows. It does **not** write `.env` — that happens in step 7.3 when you run `start-local.ps1`.

```powershell
cd C:\dev\trustbridge\trustbridge-sdk-v3
.\setup.ps1
```

Expected output:
```
[setup] MSYS2 found at C:\msys64
[setup] Refreshing pacman package database...
 ... pacman -Sy output ...
[setup] Installing build deps (gcc, make, mosquitto, libftdi)...
[setup]  -> pacman -S --needed --noconfirm mingw-w64-x86_64-toolchain mingw-w64-x86_64-mosquitto mingw-w64-x86_64-libftdi
 ... pacman -S output ...

[setup] Build deps installed successfully:
[setup]   gcc:        C:\msys64\mingw64\bin\gcc.exe
[setup]   cc1:        C:\msys64\mingw64\libexec\gcc\x86_64-w64-mingw32\<version>\cc1.exe
[setup]   mosquitto:  C:\msys64\mingw64\bin\libmosquitto.dll
[setup]   coreutils:  C:\msys64\usr\bin\mkdir.exe

[setup] This machine's hostname: <yours>  (others can reach it as <yours>.local via mDNS;
[setup] if .local lookups fail on Windows, install Apple's "Bonjour Print Services" or
[setup] use IP-mode on the Pis).

[setup] Next - pick one:
[setup]   All-on-this-machine:                   .\start-local.ps1
[setup]   This is a gateway / device Pi:         ./bootstrap-pi.sh   (from the Pi, not here)
```

> **If you see `cannot execute 'cc1': CreateProcess: No such file or directory`** when you later run `start-local.ps1`, your MSYS2 has a partial-install of the toolchain (the `gcc.exe` wrapper is there but its backend `cc1.exe` is missing). `pacman -Syu` alone won't fix it — pacman thinks the package is already installed and skips it. Re-run setup with `-Force`, which drops `--needed` and adds `--overwrite='*'` so pacman actually reinstalls and clobbers the broken files:
>
> ```powershell
> .\setup.ps1 -Force
> ```
>
> Re-running plain `.\setup.ps1` on an already-complete toolchain is a no-op (~50ms) — it detects gcc/cc1/libmosquitto/coreutils and exits without touching pacman. `setup.ps1` searches recursively for `cc1.exe` anywhere under `C:\msys64\mingw64\`, so it works regardless of the gcc version's libexec layout.

### 7.2 Plug in the SandGrain device

Plug it into any USB port. Verify Windows sees it:
```powershell
Get-PnpDevice -Class Ports -PresentOnly | Where-Object { $_.InstanceId -like 'USB*' }
```
You should see something like:
```
Status     Class FriendlyName
------     ----- ------------
OK         Ports USB Serial Device (COM7)
```
The COM number doesn't matter — `start-local.ps1` auto-detects it. If nothing shows up, see [Troubleshooting #6](#troubleshooting-issue-6).

### 7.3 Launch the SDK

```powershell
.\start-local.ps1
```

Expected output in the parent shell:
```
=== Loading config from C:\dev\trustbridge\trustbridge-sdk-v3\.env ===
=== Auto-detected SandGrain device on COM7 ===
=== Killing previous instances (if any) ===
=== Recompiling test_sdk ===
... gcc build output ...
=== Recompiling test_device ===
... gcc build output ...
=== Recompiling test_gw ===
... gcc build output ...
=== All builds successful - launching terminals ===
Launched test_sdk, test_device, and test_gw in separate terminal windows.
```

Three new cmd.exe windows pop up:
- **test_sdk (enrollment / online listener)** — should print `[port_spi] Opening SERIAL7:...` followed by SDK init success
- **test_device (TrustBridge auth)** — same `[port_spi] Opening SERIAL7:...` then auth flow
- **test_gw (gateway)** — fetches whitelist from BE, listens for device requests, polls every 10s for whitelist changes

Leave these windows open — they need to be running for the auth flow to work end-to-end.

---

## 8. Daily workflow

After everything is set up once, the daily commands are:

```powershell
cd C:\dev\trustbridge

# Start everything (Docker stack)
.\start-all.ps1

# Status
.\start-all.ps1 status

# Tail one service's logs (Ctrl+C to stop tailing — does NOT stop the container)
.\start-all.ps1 logs be          # be | fe | cloud-sdk | mysql | mosquitto

# Stop everything (volumes preserved — DB data and seed marker stay)
.\start-all.ps1 down

# Stop AND wipe volumes (forces re-seed on next up — use when DB is corrupted or you want a fresh start)
.\start-all.ps1 wipe

# FORCE --no-cache rebuild + start (use when an image is stuck on old source —
# e.g. cloud-sdk container is "Up" but the auth flow hangs at gateway step 2/6
# because Docker reused a cached image layer from before a code fix landed)
.\start-all.ps1 rebuild

# SDK side
cd .\trustbridge-sdk-v3
.\start-local.ps1               # rebuilds + launches device/gateway in 3 windows
```

**Common scenarios:**

- **Reboot** — Docker Desktop auto-starts; just run `.\start-all.ps1` again.
- **Pulled new code in BE / FE / Cloud SDK** — `.\start-all.ps1` re-runs `docker compose up --build` which rebuilds **incrementally** based on source changes. If Docker doesn't detect the change (e.g. layer cache still valid), the old image keeps running. If you're sure new code should be in but isn't, run `.\start-all.ps1 rebuild` to force `--no-cache`.
- **Pulled new code in the SDK** — re-run `.\start-local.ps1` (it always recompiles). Cloud-side changes also require `.\start-all.ps1 rebuild` since the cloud-sdk image bundles the SDK's `Cloud/` source.
- **Changed `.env` in BE** — `.\start-all.ps1 down` then `.\start-all.ps1` to pick up the change.
- **Moved the USB device to a different port** — just re-run `.\start-local.ps1`; auto-detect handles it.

---

## 9. Troubleshooting

### Troubleshooting issue 1
**Symptom:** `winget` says "Successfully installed" but the tool isn't on `PATH`.

**Fix:** Open a **new** PowerShell window. Existing windows have a stale `PATH`. If still missing, the install may have failed silently — check the troubleshooting issue for that specific tool below.

---

### Troubleshooting issue 2
**Symptom:** `winget install Docker.DockerDesktop` reports `Installer failed with exit code: 4294967291` (or `-5`).

**Cause:** Docker Desktop's MSI installer requires admin privileges (UAC). The prompt was either denied, dismissed, or hidden behind other windows.

**Fix:**

1. Check for a leftover folder from the failed attempt:
   ```powershell
   Test-Path C:\ProgramData\DockerDesktop
   ```
   If `True`, delete it:
   ```powershell
   Remove-Item -Recurse -Force C:\ProgramData\DockerDesktop
   ```

2. Download the installer manually:
   ```powershell
   curl.exe -sSL -o $env:USERPROFILE\Downloads\DockerDesktopInstaller.exe `
     "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
   ```

3. Run it by double-clicking `C:\Users\YourName\Downloads\DockerDesktopInstaller.exe` in File Explorer.

4. **Watch for the UAC prompt** — it might appear behind other windows, or the taskbar icon might flash. **Click Yes within 30 seconds** or it auto-cancels.

5. Click through the installer (default options are fine — keep "Use WSL 2 instead of Hyper-V" checked).

---

### Troubleshooting issue 3
**Symptom:** `start-all.ps1` fails with `Docker engine isn't responding`.

**Cause:** Docker Desktop is installed but not running.

**Fix:** Open Docker Desktop from the Start menu, wait for the whale icon to stop animating (solid white in the system tray). First-launch takes ~60 seconds. Then re-run `.\start-all.ps1`.

---

### Troubleshooting issue 4
**Symptom:** `Port already in use` or one of the containers fails to bind to 3000 / 3306 / 1883 / 5173.

**Fix:** Find what's holding the port:
```powershell
$port = 3306   # change to the conflicting port
$conn = Get-NetTCPConnection -LocalPort $port -State Listen
$conn
Get-Process -Id $conn.OwningProcess
```
Then either kill that process (`Stop-Process -Id <pid>`) or change the port mapping in the relevant `docker-compose.yml` and the corresponding `.env` value.

Common offenders on Windows:
- A previously installed MySQL service (port 3306) — check `Get-Service MySQL*`
- IIS holding port 80 — not relevant here, just FYI

---

### Troubleshooting issue 5
**Symptom:** A container shows `Restarting` or `Exited` status.

**Fix:** Look at its logs:
```powershell
.\start-all.ps1 logs be     # or fe / mysql / etc.
```
Or directly:
```powershell
docker logs tb-be --tail 50
```

Most common causes:
- **BE crashes immediately** — usually a `.env` problem (wrong DB password, MQTT host). Check `TrustBridge-BE\.env`.
- **MySQL exits** — disk space issue, or a stale corrupt volume. Try `.\start-all.ps1 wipe` then `.\start-all.ps1`.
- **FE exits** — usually a missing dep. Try `cd .\TrustBridge-FE; npm install` then `.\start-all.ps1` again.

---

### Troubleshooting issue 6
**Symptom:** `start-local.ps1` says `WARNING: no USB serial device found`.

**Fix:** Windows isn't seeing your device. Step through:

1. **Is it physically connected and powered?** Most SandGrain devices have a power LED; check it.

2. **Open Device Manager** (Win+X → Device Manager). Look at:
   - **Ports (COM & LPT)** — your device should appear here as `USB Serial Device (COMx)`. ✓ → re-run `start-local.ps1`.
   - **Other devices** with a yellow ⚠ — driver missing. STM32-based devices use Windows' built-in USB CDC driver (no install required); try:
     - A different USB cable
     - A different USB port (avoid USB hubs for first try; plug directly into the PC)
     - A reboot (Windows sometimes hangs onto a stale enumeration)

3. **Try a manual override** — if you know the COM number from Device Manager, set it in `.env`:
   ```
   USB_COM_PORT=7
   ```
   Then re-run `start-local.ps1`. This bypasses auto-detect.

---

### Troubleshooting issue 7
**Symptom:** `test_sdk` window opens, prints `[port_spi] Opening SERIAL7:...`, then `[CRYPTO] failed to read valid TID after 5 attempts`.

**Cause:** The COM port opened successfully but the device on the other end isn't responding to SDK commands.

**Fix:**
1. **Unplug + replug** the device, wait 5 seconds, re-run `start-local.ps1`.
2. Confirm the COM number matches Device Manager.
3. The device's firmware may need to be in a specific mode — confirm with whoever provided the hardware.
4. Try a different USB cable (some are charge-only with no data lines).

---

### Troubleshooting issue 8
**Symptom:** PowerShell error `running scripts is disabled on this system` when running `.\start-all.ps1`.

**Fix:** Allow local scripts to run for your user:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```
Type `Y` to confirm. This is a one-time setting.

---

### Troubleshooting issue 9
**Symptom:** `start-all.ps1 down` reports "Stopping" but containers keep running.

**Cause:** You're on an older version of `start-all.ps1` that had the `$Args` reserved-variable bug. Update to the latest version.

---

### Troubleshooting issue 10
**Symptom:** Device enrolls successfully (visible in the FE device list, BE logs say `Gateway whitelist synced — N device(s)`), all three SDK windows are running, `test_sdk` prints `[PORT][MQTT] Published online status on sandgrain/v1/<TID>/status`, and `test_gw` says `[GW] Listening for device requests...` — but the device still shows **offline** in the UI.

**Tell-tale BE log line:**
```
[DeviceService] Current onlineTids: []
[DeviceService] isDeviceOnline result: false
```
Subscribed correctly, no presence ever received.

**Cause:** A native Mosquitto service is running on the host (often left over from a previous install) and is holding port 1883. The Docker `tb-mosquitto` container still runs on the internal Docker network so the BE reaches it as `mosquitto:1883`, but the host port mapping is shadowed by the native broker. `test_sdk` on the host connects to `localhost:1883` and lands on the **native** broker, so its publish never reaches the broker the BE is subscribed to. Two brokers, split brain.

**Fix:** Open PowerShell **as Administrator** (Win → search PowerShell → right-click → **Run as administrator**), then:

```powershell
# 1. Confirm a native service is running
Get-Service mosquitto*

# 2. If a Running service appeared, stop it and prevent it from auto-starting
Get-Service mosquitto* | Stop-Service
Get-Service mosquitto* | Set-Service -StartupType Disabled

# 3. Bounce the Docker stack (does NOT need admin — can be a normal PS window)
cd C:\dev\trustbridge
.\start-all.ps1 down
.\start-all.ps1

# 4. Re-run the device SDK
cd .\trustbridge-sdk-v3
.\start-local.ps1
```

Refresh the FE — the device should flip to online within a few seconds of `test_sdk` connecting.

If `Get-Service mosquitto*` returns nothing, the diagnosis is wrong; check what's on port 1883 with `Get-NetTCPConnection -LocalPort 1883 -State Listen` (see [Troubleshooting #4](#troubleshooting-issue-4)).

---

### Troubleshooting issue 11
**Symptom:** Auth flow stalls at gateway step **`[CH0][2/6] Asking CR to generate CW for this TID...`** and the device sits at `[1/4] Auth request sent OK`. Cloud-sdk container is `Up` in `docker ps`. No errors printed anywhere.

**Diagnostic — paste these two lines:**
```powershell
docker ps --filter "name=tb-cloud-sdk" --format "{{.Names}}  {{.CreatedAt}}"
docker logs --tail 5 tb-cloud-sdk
```

If the `CreatedAt` says days or weeks ago AND the most recent log line is also days/weeks old → the image is stale. The paho-mqtt `_on_disconnect` callback fix (`Cloud/application_PoC_MQTT/app/mqtt_transport.py`) is on disk in the latest source, but the Docker image was built before that commit. First mosquitto reconnect after the broker bounced silently killed the MQTT loop thread inside the container. The Python process is still alive (container stays `Up`) but it never processes another `sandgrain/v1/+/req/+` message.

**Cause:** `start-all.ps1 up` uses `docker compose up -d --build`, which is *incremental* — it only rebuilds layers Docker thinks have changed. If your SDK source on disk wasn't pulled (or even if it was, but Docker's cache still has a valid layer for the COPY step), the old image keeps running.

**Fix:**

```powershell
# 1. Make sure the SDK source actually has the fix
cd C:\dev\trustbridge\trustbridge-sdk-v3
git pull

# 2. Force a full --no-cache rebuild
cd C:\dev\trustbridge\TrustBridge-BE
.\start-all.ps1 rebuild

# 3. Verify
docker ps --filter "name=tb-cloud-sdk" --format "{{.CreatedAt}}"     # should say minutes ago, not days
docker logs --tail 10 tb-cloud-sdk                                    # must include "Subscribed to sandgrain/v1/+/req/+"
```

Then re-run `.\start-local.ps1` and trigger another auth. Step 2/6 should advance to 3/6 (CW received from cloud-agent) and then through to 6/6.

If `start-all.ps1` complains the `rebuild` subcommand is unknown, your `TrustBridge-BE` clone is also pre-fix — `git pull` it first.

---

## 10. Uninstall / clean slate

### Just remove the docker stack (keep tools installed)

```powershell
cd C:\dev\trustbridge
.\start-all.ps1 wipe
docker network rm trustbridge-net
```

### Full nuke — uninstall everything

```powershell
.\start-all.ps1 wipe
docker network rm trustbridge-net

# Uninstall (all require UAC)
winget uninstall Docker.DockerDesktop
winget uninstall MSYS2.MSYS2
winget uninstall OpenJS.NodeJS.LTS

# Optional cleanup
Remove-Item -Recurse -Force C:\msys64
Remove-Item -Recurse -Force C:\Program Files\Docker
Remove-Item -Recurse -Force C:\dev\trustbridge
```

---

## Appendix: where things live

| What | Where |
|---|---|
| Orchestrator script | `C:\dev\trustbridge\start-all.ps1` |
| BE source + Dockerfile | `TrustBridge-BE\` |
| FE source + Dockerfile | `TrustBridge-FE\` |
| Device-side SDK source + binaries | `trustbridge-sdk-v3\` |
| Cloud SDK source + Dockerfile | `trustbridge-sdk-v3\Cloud\` |
| MSYS2 (gcc / make / libs) | `C:\msys64\` |
| Docker Desktop | `C:\Program Files\Docker\` |
| MySQL data (Docker volume) | managed by Docker, see `docker volume ls` |
| BE `.env` | `TrustBridge-BE\.env` |
| FE `.env` | `TrustBridge-FE\.env` |
| SDK `.env` | `trustbridge-sdk-v3\.env` |
| SDK launchers (per-binary cmd files) | `%TEMP%\tb-sdk-launchers\` |

---

**That's the whole guide.** If something here is unclear, broken, or out of date, fix it and commit — this file is meant to be a living doc.
