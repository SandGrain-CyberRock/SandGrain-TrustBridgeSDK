# TrustBridge — Linux & macOS Setup Guide

A complete, step-by-step guide to running the entire TrustBridge stack on a fresh Linux (Ubuntu / Debian / Fedora / Arch) or macOS machine.

**You'll get:**
- **Frontend** at <http://localhost:5173>
- **Backend API** at <http://localhost:3000/api> (Swagger at `/docs`)
- **MySQL** + **Mosquitto MQTT** + **Cloud SDK** running in Docker
- **Device-side SDK + Gateway** running natively (only needed if you have the SandGrain USB hardware)

**Time required:** 20–40 min on first install (mostly downloads). After that, `./TrustBridge-BE/start-all.sh up` brings everything up in under a minute.

---

## Table of Contents

1. [What you'll install](#1-what-youll-install)
2. [Install prerequisites](#2-install-prerequisites)
3. [Get the code](#3-get-the-code)
4. [Verify Docker is ready](#4-verify-docker-is-ready)
5. [Bring up the Docker stack (FE + BE + Cloud)](#5-bring-up-the-docker-stack-fe--be--cloud)
6. [Verify the stack is working](#6-verify-the-stack-is-working)
7. [Run the device-side SDK + Gateway (optional)](#7-run-the-device-side-sdk--gateway-optional)
8. [Daily workflow](#8-daily-workflow)
9. [Troubleshooting](#9-troubleshooting)
10. [Uninstall / clean slate](#10-uninstall--clean-slate)

---

## 1. What you'll install

| # | Tool | Why |
|---|---|---|
| 1 | **Git** | clone the repos |
| 2 | **Node.js LTS** (≥ 20) | BE seed runner uses ts-node, FE uses Vite |
| 3 | **Docker Engine** + **docker compose v2** | runs MySQL + Mosquitto + BE + FE + Cloud SDK as containers |
| 4 | **gcc / make / libmosquitto / libftdi** | builds the C device-side SDK *(only if you have the SandGrain hardware)* |

If you don't have the SandGrain USB device, you can skip step 4 and section 7 entirely.

> **Linux ≠ Docker Desktop.** On Linux you install **Docker Engine** (the headless daemon) plus the **`docker compose` v2 plugin** — no GUI, no licensing concerns. macOS does use **Docker Desktop** (or alternatives like OrbStack / Colima).

---

## 2. Install prerequisites

Pick your OS / distro below.

### 2a. Ubuntu / Debian / Linux Mint / Pop!_OS

```bash
# Refresh package index
sudo apt update

# Git, Node.js, build tools, USB serial libs
sudo apt install -y git nodejs npm \
                    build-essential libmosquitto-dev libftdi1-dev \
                    ca-certificates curl gnupg

# Docker Engine + docker compose v2 (official Docker repo gives you the latest)
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
     -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
      https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
                    docker-buildx-plugin docker-compose-plugin

# Add yourself to the `docker` (run docker without sudo) and `dialout` (USB serial) groups
sudo usermod -aG docker,dialout $USER

# IMPORTANT: log out and back in for group membership to take effect
echo "→ Log out and back in now, then continue with section 3."
```

> Debian users: replace `ubuntu` with `debian` in the two URLs above.

### 2b. Fedora / RHEL / Rocky / Alma

```bash
# Git, Node.js, build tools, USB serial libs
sudo dnf install -y git nodejs npm gcc make \
                    mosquitto-devel libftdi-devel

# Docker Engine
sudo dnf -y install dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io \
                    docker-buildx-plugin docker-compose-plugin

sudo systemctl enable --now docker

# Groups
sudo usermod -aG docker,dialout $USER

echo "→ Log out and back in now, then continue with section 3."
```

### 2c. Arch / Manjaro / EndeavourOS

```bash
sudo pacman -Syu --needed git nodejs npm \
                          base-devel mosquitto libftdi \
                          docker docker-compose

sudo systemctl enable --now docker
sudo usermod -aG docker,uucp $USER     # `uucp` is Arch's serial-port group (equivalent of `dialout`)

echo "→ Log out and back in now, then continue with section 3."
```

### 2d. macOS (Apple Silicon or Intel)

Install Homebrew if you don't have it:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Then:
```bash
brew install git node mosquitto libftdi
brew install --cask docker      # installs Docker Desktop
```

Launch **Docker Desktop** from `/Applications` once. Accept the license, click **Finish**. Wait for the whale icon in the menu bar to be solid (not animated). After this it auto-starts at login.

> **Don't want Docker Desktop?** Lighter alternatives that work transparently with `docker` and `docker compose`:
> - `brew install orbstack` — free for personal use, much faster startup than Docker Desktop
> - `brew install colima docker docker-compose` — open-source, CLI-only

### 2e. Verify the install (any OS)

Open a **new** terminal (so group memberships and `PATH` updates apply):

```bash
git --version
node --version       # must be v20.x or higher
npm --version
docker --version
docker compose version
gcc --version        # only if you'll build the SDK
```

All should print version info, none should say "not found".

---

## 3. Get the code

### 3.1 Pick a directory

```bash
mkdir -p ~/dev/trustbridge
cd ~/dev/trustbridge
```

### 3.2 Clone the four repos as siblings

```bash
git clone <BE-repo-url>          TrustBridge-BE
git clone <FE-repo-url>          TrustBridge-FE
git clone <SDK-repo-url>         trustbridge-sdk-v3
git clone <orchestrator-repo>    TrustBridge-Docker
```

> Replace `<...-repo-url>` with the actual GitLab / GitHub URLs from your team.

### 3.3 Verify layout

```bash
ls -1
```

Expected:
```
TrustBridge-BE
TrustBridge-Docker
TrustBridge-FE
trustbridge-sdk-v3
```

### 3.4 Make the scripts executable

(Most clones preserve the `+x` bit; this is a belt-and-braces step.)
```bash
chmod +x TrustBridge-BE/start-all.sh
chmod +x trustbridge-sdk-v3/{setup.sh,start-local.sh,bootstrap-pi.sh}
```

---

## 4. Verify Docker is ready

### Linux

```bash
docker info
```
Expected (look for `Server Version`):
```
Server:
 Server Version: 26.x.x
 ...
```

If you see `permission denied while trying to connect to the Docker daemon socket` → you didn't log out + back in after `usermod -aG docker $USER`. Fix:
```bash
newgrp docker     # or simply log out and back in
docker info
```

### macOS

Make sure the whale icon in the menu bar is solid (not animated). Then:
```bash
docker info
```
Same expected output as Linux. If you see `Cannot connect to the Docker daemon`, Docker Desktop isn't fully started — wait another 30 seconds and retry.

---

## 5. Bring up the Docker stack (FE + BE + Cloud)

### 5.1 Run the orchestrator

```bash
cd ~/dev/trustbridge
./TrustBridge-BE/start-all.sh up
```

Expected output (truncated):
```
[start-all] Creating Docker network: trustbridge-net
[start-all] Starting BE stack (mysql + mosquitto + be) — .../TrustBridge-BE
 ... lots of `docker compose` build output (~5–10 min on first run) ...
 Container tb-mysql Started
 Container tb-mosquitto Started
 Container tb-be Started
[start-all] Starting FE — .../TrustBridge-FE
 ...
 Container tb-fe Started
[start-all] Starting Cloud SDK — .../trustbridge-sdk-v3/Cloud
 ...
 Container tb-cloud-sdk Started
[start-all] All services started.
[start-all]   FE      → http://localhost:5173
[start-all]   BE      → http://localhost:3000/docs
[start-all]   MySQL   → localhost:3306
[start-all]   MQTT    → localhost:1883
```

**On first run this takes 5–15 minutes** (downloading base images, building BE/FE/Cloud images). Subsequent runs: ~30 seconds.

### 5.2 What `start-all.sh` did

If you're curious — same as the Windows orchestrator:
1. Verified Docker is reachable
2. Created shared Docker network `trustbridge-net`
3. Copied each `.env.example` → `.env` if missing
4. Ran `docker compose up -d --build` in each of the three project directories (`TrustBridge-BE/`, `TrustBridge-FE/`, `trustbridge-sdk-v3/Cloud/`)
5. The BE container's entrypoint waits for MySQL to be healthy, runs the seed once, starts the NestJS API

---

## 6. Verify the stack is working

### 6.1 Containers running

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```
Expected (5 containers, ports mapped):
```
NAMES          STATUS                   PORTS
tb-be          Up X minutes             0.0.0.0:3000->3000/tcp
tb-cloud-sdk   Up X minutes
tb-fe          Up X minutes             0.0.0.0:5173->5173/tcp
tb-mosquitto   Up X minutes             0.0.0.0:1883->1883/tcp
tb-mysql       Up X minutes (healthy)   0.0.0.0:3306->3306/tcp
```

If a container is missing or shows `Restarting` / `Exited`, see [Troubleshooting #5](#troubleshooting-issue-5).

### 6.2 Frontend in the browser

Open <http://localhost:5173>. You should see the TrustBridge login page.

### 6.3 Backend API + Swagger

Open <http://localhost:3000/docs>. Swagger UI with all endpoints.

### 6.4 (Optional) MQTT round-trip

```bash
./TrustBridge-BE/start-all.sh logs be
```
Look for:
```
tb-be  | Connected to MQTT broker at mosquitto:1883
tb-be  | Subscribed to device presence: sandgrain/v1/+/status
```
**Ctrl+C** to stop tailing.

---

## 7. Run the device-side SDK + Gateway (optional)

**Skip this section if you don't have the SandGrain USB device.** The Docker stack from section 5 is enough on its own.

### 7.1 One-time: install build deps

```bash
cd ~/dev/trustbridge/trustbridge-sdk-v3
./setup.sh
```

`setup.sh` auto-detects your OS and installs the right packages (`apt` / `dnf` / `pacman` / `brew`):

- gcc + make (or `build-essential` on Debian/Ubuntu)
- libmosquitto + libftdi development headers
- `avahi-daemon` on Linux (for `<hostname>.local` mDNS — only matters in the distributed Pi setup, harmless otherwise)
- Xcode Command Line Tools on macOS if you don't already have a compiler

`setup.sh` does **not** write `.env` — `start-local.sh` (next step) does that. Expected output:

```
[setup] Debian/Ubuntu detected - installing deps via apt...
 ... apt-get output ...
[setup] Build deps installed successfully.
[setup]   gcc:       /usr/bin/gcc
[setup]   make:      /usr/bin/make
[setup]   mosquitto: (header + lib found)
[setup] Next - pick one:
[setup]   All-on-this-machine:                ./start-local.sh
[setup]   This is a gateway / device Pi:      ./bootstrap-pi.sh
```

Re-running `./setup.sh` on an already-complete box is a no-op (~50ms) — it detects gcc / make / `mosquitto.h` / `libmosquitto` and exits without touching the package manager.

If a previous half-broken install left things in an inconsistent state (e.g. the header is present but the lib is missing, or vice versa), force a reinstall:

```bash
./setup.sh --force        # brew reinstall / apt --reinstall / dnf reinstall / pacman --overwrite='*'
```

### 7.2 Plug in the SandGrain device

Plug it in. Verify the OS sees it:

#### Linux
```bash
ls /dev/ttyACM* /dev/ttyUSB* 2>/dev/null
```
Expected: at least one of `/dev/ttyACM0`, `/dev/ttyUSB0`, etc.

You can also see the kernel log:
```bash
sudo dmesg | tail -20
```
Look for a line like `cdc_acm 1-2:1.0: ttyACM0: USB ACM device`.

If nothing shows up, see [Troubleshooting #6](#troubleshooting-issue-6).

#### macOS
```bash
ls /dev/tty.usbmodem* /dev/tty.usbserial-* 2>/dev/null
```
Expected: at least one of `/dev/tty.usbmodem1234`, `/dev/tty.usbserial-XXXX`.

System Information also has a USB device list (Apple menu → About This Mac → System Report → USB).

### 7.3 Launch the SDK

```bash
./start-local.sh
```

Expected output in the parent terminal:
```
=== Loading config from /home/you/dev/trustbridge/trustbridge-sdk-v3/.env ===
=== Auto-detected SandGrain device: USB_TTY_PORT=ACM0 ===     # Linux example
=== Killing previous instances (if any) ===
=== Recompiling test_sdk ===
... gcc build output ...
=== Recompiling test_device ===
=== Recompiling test_gw ===
=== All builds successful — launching terminals ===
Launched test_sdk, test_device, and test_gw in separate terminal windows.
```

Three new terminal windows / tabs open (using `gnome-terminal`, `xfce4-terminal`, `konsole`, or `xterm` on Linux; macOS Terminal on macOS):
- **test_sdk (enrollment / online listener)** — `[port_spi] Opening SERIAL...`, then SDK init success
- **test_device (TrustBridge auth)** — same, then auth flow
- **test_gw (gateway)** — fetches whitelist, listens for device requests, polls every 10s

Leave them running.

---

## 8. Daily workflow

After everything is set up once:

```bash
cd ~/dev/trustbridge

# Start everything
./TrustBridge-BE/start-all.sh up

# Status
./TrustBridge-BE/start-all.sh status

# Tail one service (Ctrl+C stops tailing — does NOT stop the container)
./TrustBridge-BE/start-all.sh logs be          # be | fe | cloud-sdk | mysql | mosquitto

# Stop everything (volumes preserved)
./TrustBridge-BE/start-all.sh down

# Stop AND wipe volumes (forces re-seed on next up)
./TrustBridge-BE/start-all.sh wipe

# FORCE --no-cache rebuild + start (use when an image is stuck on old source —
# e.g. cloud-sdk container is "Up" but the auth flow hangs at gateway step 2/6
# because Docker reused a cached layer from before a code fix landed)
./TrustBridge-BE/start-all.sh rebuild

# SDK side
cd trustbridge-sdk-v3
./start-local.sh
```

**Common scenarios:**

- **Reboot.** Docker Engine starts at boot on Linux (we ran `systemctl enable --now docker`). On macOS, Docker Desktop auto-starts. Just run `./TrustBridge-BE/start-all.sh up`.
- **Pulled new BE / FE / Cloud SDK code.** `start-all.sh up` re-runs `docker compose up --build` so changed images rebuild automatically.
- **Pulled new device-side SDK code.** Re-run `./start-local.sh` (it always recompiles).
- **Changed `.env` in BE.** `start-all.sh down` then `start-all.sh up`.
- **Moved USB device to a different port.** Just re-run `./start-local.sh`; auto-detect handles it.

---

## 9. Troubleshooting

### Troubleshooting issue 1
**Symptom:** `permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock` (Linux only).

**Cause:** You're not in the `docker` group, or you haven't logged out + back in since being added.

**Fix:**
```bash
groups | grep -q docker && echo "Already in docker group; just need to log out + log in."
sudo usermod -aG docker $USER
# Then log out and log back in (full logout, not just close the terminal)
```
Quick re-test in current shell without re-login:
```bash
newgrp docker
docker info
```

---

### Troubleshooting issue 2
**Symptom:** `Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?`

**Linux fix:**
```bash
sudo systemctl status docker
sudo systemctl start docker             # start it
sudo systemctl enable --now docker      # start now AND start at boot
```

**macOS fix:** Docker Desktop isn't running. Open it from `/Applications`, wait for the whale icon to be solid in the menu bar.

---

### Troubleshooting issue 3
**Symptom:** `Permission denied: '/dev/ttyACM0'` or similar when running `test_sdk` / `test_device`.

**Cause:** You're not in the `dialout` group (Debian/Ubuntu/Fedora) or `uucp` group (Arch).

**Fix:**
```bash
# Find the right group for your distro:
ls -l /dev/ttyACM0 /dev/ttyUSB0 2>/dev/null     # see "root <group>" — usually `dialout` or `uucp`

# Add yourself
sudo usermod -aG dialout $USER          # or uucp on Arch
# Log out + back in

# Verify
groups | grep -E 'dialout|uucp'
```

---

### Troubleshooting issue 4
**Symptom:** Port already in use (3000 / 3306 / 1883 / 5173).

**Find the offender:**
```bash
sudo ss -ltnp | grep -E ':3306|:1883|:3000|:5173'
# or
sudo lsof -i :3306
```

**Common offenders:**
- A previously installed MySQL: `sudo systemctl stop mysql; sudo systemctl disable mysql`
- A previously installed Mosquitto: `sudo systemctl stop mosquitto; sudo systemctl disable mosquitto`
- A previous npm dev server you forgot about: `pkill -f 'vite\|nest'`

If you genuinely need to keep the host service running, change the port mapping in the relevant `docker-compose.yml` and the corresponding `.env` value.

---

### Troubleshooting issue 5
**Symptom:** A container shows `Restarting` or `Exited`.

**Find out why:**
```bash
./TrustBridge-BE/start-all.sh logs be    # or fe / mysql / mosquitto / cloud-sdk
# or
docker logs tb-be --tail 50
```

**Common causes:**
- BE crashes: usually a `.env` problem (wrong DB password, MQTT host). Check `TrustBridge-BE/.env`.
- MySQL exits: corrupted volume → `./TrustBridge-BE/start-all.sh wipe; ./TrustBridge-BE/start-all.sh up`
- FE exits: missing dep → `cd TrustBridge-FE && npm install`, then re-run `start-all.sh`

---

### Troubleshooting issue 6
**Symptom:** `start-local.sh` says `WARNING: no USB serial device found`.

**Check the OS sees the device:**

Linux:
```bash
ls /dev/ttyACM* /dev/ttyUSB* 2>/dev/null
sudo dmesg | tail -20                # kernel ring buffer; look for cdc_acm or ftdi_sio lines
lsusb                                # all connected USB devices
```

macOS:
```bash
ls /dev/tty.usbmodem* /dev/tty.usbserial-*
ioreg -p IOUSB                       # USB device tree
```

**If nothing appears:**
- Try a different USB cable (some cables are charge-only, no data)
- Try a different USB port (USB-A → USB-C adapters can be unreliable)
- Reconnect the device, wait 5 seconds for udev / IOKit to enumerate

**If the device appears but `start-local.sh` doesn't pick it up:**
- You may have multiple USB-serial devices and auto-detect picked the wrong one. Set `USB_TTY_PORT` explicitly in `.env`:
  ```
  USB_TTY_PORT=ACM0          # Linux: /dev/ttyACM0
  USB_TTY_PORT=USB0          # Linux: /dev/ttyUSB0
  USB_TTY_PORT=usbmodem1234  # macOS: /dev/tty.usbmodem1234 (the suffix after /dev/tty.)
  ```

---

### Troubleshooting issue 7
**Symptom:** `test_sdk` opens the port (`[port_spi] Opening SERIAL0:...`) but then `[CRYPTO] failed to read valid TID after 5 attempts`.

**Cause:** OS opened the port, but the device on the other end isn't responding to SDK commands.

**Fix:**
1. Unplug + replug the device, wait 5 seconds, re-run `./start-local.sh`.
2. Confirm the COM number printed matches what you saw in `ls /dev/tty*`.
3. Try a different USB cable (some are charge-only — no data lines).
4. Power-cycle the device if it has a separate power input.
5. The firmware may need a specific mode — confirm with whoever provided the hardware.

---

### Troubleshooting issue 8
**Symptom:** Build fails with `mosquitto.h: No such file or directory` or `ftdi.h: No such file or directory`.

**Cause:** The development headers aren't installed (you have the runtime libraries but not the `-dev` / `-devel` package).

**Linux fix:**
```bash
# Debian/Ubuntu
sudo apt install -y libmosquitto-dev libftdi1-dev

# Fedora/RHEL
sudo dnf install -y mosquitto-devel libftdi-devel

# Arch (already includes headers in the main package)
sudo pacman -S mosquitto libftdi
```

**macOS fix:**
```bash
brew install mosquitto libftdi
# Brew installs headers under $(brew --prefix)/include — the Makefile uses `brew --prefix` to find them automatically
```

---

### Troubleshooting issue 9
**Symptom:** `start-local.sh` opens the three windows but they exit immediately.

**Cause:** The terminal emulator launching them auto-closes when the binary exits with non-zero status.

**Fix:** Run each binary in the foreground in a manual terminal to see its exit error:
```bash
cd trustbridge-sdk-v3/PoC_SDK_v3/poc_sdk_device/app
./run.sh                                # sources .env then runs test_device — stays in your shell
```
Or:
```bash
cd trustbridge-sdk-v3/PoC_SDK_v3/poc_sdk_gateway/app
bash run_gw.sh
```

---

### Troubleshooting issue 10
**Symptom:** "I just want to nuke everything and start over."

```bash
./TrustBridge-BE/start-all.sh wipe                  # delete docker volumes (DB, MQTT data, seed marker)
docker network rm trustbridge-net                       # delete the shared network
rm -rf TrustBridge-BE/node_modules TrustBridge-FE/node_modules
./TrustBridge-BE/start-all.sh up
```

---

### Troubleshooting issue 11
**Symptom:** Auth flow stalls at gateway step **`[CH0][2/6] Asking CR to generate CW for this TID...`** and the device sits at `[1/4] Auth request sent OK`. `tb-cloud-sdk` container is `Up` in `docker ps`. No errors printed anywhere.

**Diagnostic:**
```bash
docker ps --filter "name=tb-cloud-sdk" --format "{{.Names}}  {{.CreatedAt}}"
docker logs --tail 5 tb-cloud-sdk
```

If `CreatedAt` says days or weeks ago AND the most recent log line is also days/weeks old → the image is stale. The paho-mqtt `_on_disconnect` callback fix (`Cloud/application_PoC_MQTT/app/mqtt_transport.py`) is on disk in the latest SDK source, but the Docker image was built before that commit landed. First mosquitto reconnect silently killed the MQTT loop thread inside the container — the Python process is still alive (container stays `Up`) but it never processes another `sandgrain/v1/+/req/+` message.

**Why `start-all.sh up` didn't catch it:** `docker compose up -d --build` is *incremental*. If Docker doesn't detect source changes (or if the SDK repo on disk wasn't pulled), the cached image layer is reused.

**Fix:**
```bash
# 1. Make sure the SDK source has the fix
cd ~/dev/trustbridge/trustbridge-sdk-v3
git pull

# 2. Force a full --no-cache rebuild
cd ~/dev/trustbridge/TrustBridge-BE
./start-all.sh rebuild

# 3. Verify
docker ps --filter "name=tb-cloud-sdk" --format "{{.CreatedAt}}"      # should say minutes ago, not days
docker logs --tail 10 tb-cloud-sdk                                    # must include "Subscribed to sandgrain/v1/+/req/+"
```

Then re-run `./start-local.sh` and trigger another auth. Step 2/6 should advance to 3/6 (CW received) and through to 6/6.

If `start-all.sh` complains `rebuild` is unknown, your `TrustBridge-BE` clone is also pre-fix — `git pull` it first.

---

## 10. Uninstall / clean slate

### Just remove the docker stack (keep tools installed)
```bash
./TrustBridge-BE/start-all.sh wipe
docker network rm trustbridge-net
```

### Remove docker images you no longer need
```bash
docker image rm trustbridge-be-be trustbridge-fe-fe cloud-cloud-sdk
docker image rm mysql:8.0 eclipse-mosquitto:2     # only if no other project uses them
```

### Full uninstall

#### Linux (Ubuntu/Debian)
```bash
./TrustBridge-BE/start-all.sh wipe
docker network rm trustbridge-net

sudo apt purge -y docker-ce docker-ce-cli containerd.io \
                  docker-buildx-plugin docker-compose-plugin \
                  libmosquitto-dev libftdi1-dev
sudo rm -rf /var/lib/docker /etc/docker
sudo rm -rf ~/dev/trustbridge
```

#### macOS
```bash
./TrustBridge-BE/start-all.sh wipe
docker network rm trustbridge-net

brew uninstall --cask docker         # or `brew uninstall orbstack` / colima
brew uninstall mosquitto libftdi node
rm -rf ~/dev/trustbridge
```

---

## Appendix A: where things live

| What | Where |
|---|---|
| Orchestrator script | `~/dev/trustbridge/TrustBridge-BE/start-all.sh` |
| BE source + Dockerfile | `TrustBridge-BE/` |
| FE source + Dockerfile | `TrustBridge-FE/` |
| Device-side SDK source + binaries | `trustbridge-sdk-v3/` |
| Cloud SDK source + Dockerfile | `trustbridge-sdk-v3/Cloud/` |
| Per-repo `.env` | `<repo>/.env` |
| MySQL data (Docker volume) | managed by Docker — see `docker volume ls \| grep mysql` |
| Linux: docker config + state | `/etc/docker/`, `/var/lib/docker/` |
| macOS: Docker Desktop config | `~/Library/Containers/com.docker.docker/` |

---

## Appendix B: Linux ↔ macOS ↔ Windows command map

| Task | Linux / macOS | Windows |
|---|---|---|
| Setup SDK build deps (one-time) | `./trustbridge-sdk-v3/setup.sh` | `.\trustbridge-sdk-v3\setup.ps1` |
| Start full stack | `./TrustBridge-BE/start-all.sh up` | `.\TrustBridge-BE\start-all.ps1` |
| Stop full stack | `./TrustBridge-BE/start-all.sh down` | `.\TrustBridge-BE\start-all.ps1 down` |
| Wipe volumes | `./TrustBridge-BE/start-all.sh wipe` | `.\TrustBridge-BE\start-all.ps1 wipe` |
| Tail BE logs | `./TrustBridge-BE/start-all.sh logs be` | `.\TrustBridge-BE\start-all.ps1 logs be` |
| Status | `./TrustBridge-BE/start-all.sh status` | `.\TrustBridge-BE\start-all.ps1 status` |
| Run SDK locally (single machine) | `./trustbridge-sdk-v3/start-local.sh` | `.\trustbridge-sdk-v3\start-local.ps1` |
| Run SDK on Pi (distributed) | `./trustbridge-sdk-v3/bootstrap-pi.sh` | n/a (Pi only) |

---

**That's the whole guide.** If something here is unclear, broken, or out of date, fix it and commit — this file is meant to be a living doc.
