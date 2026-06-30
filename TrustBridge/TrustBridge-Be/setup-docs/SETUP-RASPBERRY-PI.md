# TrustBridge — Raspberry Pi Setup Guide

How to deploy the TrustBridge SDK across **two Raspberry Pis** — one running the
device-side SDK (with the SandGrain USB hardware), one running the gateway —
while the **backend / frontend / MQTT broker** continue to run as Docker
containers on a separate laptop.

This is a distributed deployment, not the all-in-one developer setup. For the
all-on-one-machine flow, see [SETUP-LINUX-MACOS.md](SETUP-LINUX-MACOS.md) or
[SETUP-WINDOWS.md](SETUP-WINDOWS.md).

---

## 1. Topology

```
┌──────────── Laptop (LAPTOP_IP) ──────────────────┐
│  Docker stack                                    │
│   - BE         :3000                             │
│   - FE         :5173                             │
│   - Mosquitto  :1883                             │
│   - MySQL      :3306                             │
│   - Cloud SDK                                    │
└──────────────────────────────────────────────────┘
       ▲                                ▲
       │ HTTP + MQTT                    │ HTTP + MQTT
       │                                │
┌──── Pi #2: GATEWAY (PI_GW_IP) ──┐   ┌─── Pi #1: DEVICE (PI_DEV_IP) ────┐
│  test_gw :8080                  │◀──│  test_sdk        (background)    │
│                                 │   │  test_device     (foreground)    │
│  No USB hardware                │   │  SandGrain USB plugged in here   │
└─────────────────────────────────┘   └──────────────────────────────────┘
```

| Box | Role | Binaries it runs | USB? |
|---|---|---|---|
| Laptop | Docker host | `tb-be`, `tb-fe`, `tb-mysql`, `tb-mosquitto`, `tb-cloud-sdk` | No |
| Pi #2 | Gateway | `test_gw` | No |
| Pi #1 | Device | `test_sdk` + `test_device` | Yes (SandGrain) |

---

## 2. Prerequisites

**Hardware**
- 2× Raspberry Pi (any 64-bit model — Pi 4 / Pi 5 / Pi 400 — running 64-bit
  Raspberry Pi OS or Ubuntu Server. ARMv7 also works but rebuild times are
  slower).
- 1× SandGrain USB device (plugs into Pi #1).
- 1× Laptop with the Docker stack already up — see SETUP-LINUX-MACOS.md or
  SETUP-WINDOWS.md if you haven't done that yet.

**Network — critically important**
All three boxes (laptop + both Pis) **must be on the same IP subnet**. Most
home/office routers use a `/24` mask, which means the first three octets of
the IPs must match. For example all on `10.10.8.x` or all on `192.168.1.x`.

If your laptop's Wi-Fi gives it `10.10.10.x` but the Pis' Wi-Fi gives them
`10.10.8.x`, the boxes can't reach each other directly — fix this before
continuing. Easiest fix: connect all three to the same SSID.

Pick consistent labels for your IPs. Throughout this guide:

| Label | Meaning |
|---|---|
| `LAPTOP_IP` | The laptop's LAN IP (find with `ipconfig` on Windows or `ip -4 addr show` on Linux/macOS) |
| `PI_GW_IP` | Pi #2's IP (find with `hostname -I` on Pi #2) |
| `PI_DEV_IP` | Pi #1's IP (find with `hostname -I` on Pi #1) |

---

## 3. Laptop preparation (one-time)

### 3.1 Find the laptop's LAN IP

**Windows:**
```powershell
ipconfig | findstr /i "ipv4"
```
Pick the address on the Wi-Fi/Ethernet adapter you'll share with the Pis. Skip
anything starting with `169.254.`, `172.`, or labelled `vEthernet (WSL)` /
`Tailscale`.

**Linux/macOS:**
```bash
ip -4 addr show | grep inet      # Linux
ifconfig | grep 'inet '          # macOS
```

### 3.2 Open the Windows firewall (Windows hosts only)

PowerShell as administrator:
```powershell
New-NetFirewallRule -DisplayName "TrustBridge BE 3000"   -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
New-NetFirewallRule -DisplayName "TrustBridge MQTT 1883" -Direction Inbound -Protocol TCP -LocalPort 1883 -Action Allow
New-NetFirewallRule -DisplayName "TrustBridge FE 5173"   -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow
```

On Linux/macOS, the default firewall (`ufw` / `firewalld` / pf) usually allows
outbound LAN traffic without configuration — verify with your distro's docs if
you've hardened anything.

### 3.3 Point the FE at the LAN IP — *no longer required*

The FE now resolves the BE URL at runtime via `GET /api/discover`. On every
page load it reads the browser's current host (whatever IP/hostname you typed
into the URL bar) and asks the BE running there for its public URL — so the
laptop's IP can change freely without rebuilding the FE.

In short: **skip this step**. The FE will work whether you reach it at
`http://localhost:5173` (laptop browser) or `http://LAPTOP_IP:5173` (any other
device on the LAN).

> If for some reason the discovery call fails (BE unreachable, browser blocks
> mixed content, etc.) the FE falls back to `import.meta.env.VITE_APP_ENDPOINT`
> from `TrustBridge-FE/.env`. So you *can* still set it as a safety net, but
> you no longer need to.

### 3.4 Verify from the laptop

Open `http://LAPTOP_IP:5173` in a browser **on the laptop** (use the IP, not
`localhost` — this confirms the LAN-facing URL works). You should see the
TrustBridge login page.

---

## 4. Pi setup — common to both Pis

Repeat these steps on **both** Raspberry Pis.

### 4.1 Install build dependencies

```bash
sudo apt update
sudo apt install -y git build-essential libmosquitto-dev libftdi1-dev curl
```

> `libftdi1-dev` is only needed on Pi #1 (the device side links against
> `-lftdi1`), but installing it on both is harmless and keeps the steps
> identical.

### 4.2 Add yourself to `dialout` (USB serial access)

```bash
sudo usermod -aG dialout $USER
```

**Log out and log back in** (or reboot) so the group membership takes effect.
Verify with `groups | grep dialout`.

### 4.3 Fix clock skew (optional but recommended)

If `make` later complains about *"file has modification time in the future"* /
*"clock skew detected"*, sync the Pi's clock:

```bash
sudo apt install -y systemd-timesyncd
sudo systemctl enable --now systemd-timesyncd
sudo timedatectl set-ntp true
date    # should now show current UTC time
```

### 4.4 Get the SDK code

```bash
mkdir -p ~/Desktop && cd ~/Desktop
git clone <SDK-repo-url> trustbridge-sdk-v3
cd trustbridge-sdk-v3
chmod +x setup.sh start-local.sh bootstrap-pi.sh
```

Replace `<SDK-repo-url>` with your team's repo URL.

### 4.5 Apply ARM-compatibility patches

The SDK ships with prebuilt x86_64 binaries (`librs232lib.so`, stale `.o`
files in `build/`) and a few `usleep`/`CRTSCTS` calls that don't compile under
strict `-std=c11` on Linux. Apply these patches once per Pi:

```bash
cd ~/Desktop/trustbridge-sdk-v3

# Add _DEFAULT_SOURCE so usleep, CRTSCTS, etc. are visible under -std=c11.
sed -i '1i #define _DEFAULT_SOURCE' Device/poc_sdk_fw/app/port/port_delay.c
sed -i '1i #define _DEFAULT_SOURCE' PoC_SDK_v3/poc_sdk_device/app/port/port_delay.c
sed -i '1i #define _DEFAULT_SOURCE' PoC_SDK_v3/poc_sdk_gateway/app/port/port_delay.c
sed -i '1i #define _DEFAULT_SOURCE' PoC_SDK_v3/poc_sdk_device/app/port/port_comm.c

sed -i '/^#include "..\/..\/sdk_fw\/src\/utils\/rs232\/rs232.h"/i #define _DEFAULT_SOURCE' \
    Device/poc_sdk_fw/app/port/rs232_macos.c
sed -i '/^#include "..\/..\/sdk_fw\/src\/utils\/rs232\/rs232.h"/i #define _DEFAULT_SOURCE' \
    PoC_SDK_v3/poc_sdk_device/app/port/rs232_macos.c
sed -i '/^#include "..\/..\/sdk_fw\/src\/utils\/rs232\/rs232.h"/i #define _DEFAULT_SOURCE' \
    PoC_SDK_v3/poc_sdk_gateway/app/port/rs232_macos.c
```

If your repo already includes these patches (commit hash recent), the `sed -i
'1i …'` calls are idempotent — they'll prepend a duplicate `#define`, which is
harmless. The `/^#include …/i` form will too.

> **Why these patches exist:** the SDK was originally built for x86_64 Linux
> with macOS as a secondary target. `rs232_macos.c` is actually pure POSIX
> termios, so it works on Linux/ARM too — but the Makefile only enables it on
> macOS. The relevant Makefiles have been updated in this repo to also use it
> on Linux. If you're working with an older copy that still links
> `-lrs232lib`, see "Manual Makefile fix" in §9.

### 4.6 Bootstrap — choose hostname or IP mode

You will run **`./bootstrap-pi.sh`** from §5 (gateway) or §6 (device). On its
first prompt it asks how you want to reach the laptop and the other Pi:

| Mode | Pro | Con |
|---|---|---|
| **`hostname`** (default) | "Set once" — works across DHCP IP changes. Type `my-acer.local` instead of `10.10.8.42`. | Requires mDNS on all boxes (`avahi-daemon` on the Pis — `setup.sh` installs it; Bonjour/LLMNR on Windows). Fails on enterprise networks that block multicast. |
| **`ip`** | Works on any network. | Re-prompt every time the laptop's IP changes. |

You can switch modes any time by re-running `./bootstrap-pi.sh` and picking
the other choice.

`bootstrap-pi.sh` is idempotent — overwrites `.env` cleanly, reads previous
values for prompt defaults, safe to re-run any time.

`bootstrap-pi.sh` curls `GET /api/discover` from the laptop's BE to pull
deployment-specific values (DB host, MQTT host, BE base URL), so you only
answer 2–3 prompts (role, hostname-vs-IP, the laptop's name/address). If
`/api/discover` is unreachable from the Pi, see §9.10 — bootstrap-pi.sh has
a `--no-discover` fallback that asks for the values inline.

---

## 5. Pi #2 — the GATEWAY

### 5.1 Bootstrap

**Hostname mode (recommended):**
```bash
cd ~/Desktop/trustbridge-sdk-v3
./bootstrap-pi.sh --role gateway --mode hostname --laptop-host my-acer.local
```

**IP mode:**
```bash
./bootstrap-pi.sh --role gateway --mode ip --laptop-host 10.10.8.42
```

**Or just run it interactively** and answer the prompts:
```bash
./bootstrap-pi.sh --role gateway
# > Connect by: [hostname/ip] [hostname]:        ← Enter to accept
# > Laptop hostname [my-acer.local]:             ← Enter or new
# bootstrap-pi.sh writes .env, builds test_gw, and launches it in one step
```

When the gateway is up, the script prints how the device Pi should reach it
(both as a `.local` hostname and as a one-line command to paste on Pi #1).

`--no-launch` is supported here if you want to inspect `.env` before the
gateway binary starts. The script writes the same `.env` you'd get from the
manual flow — `GW_HOST` defaults to `127.0.0.1` (unused on the gateway),
`GW_BIND_HOST=0.0.0.0` so Pi #1 can dial in, ports default to `8080`.

### 5.2 Smoke test (already covered by bootstrap, but useful when debugging)

```bash
ping -c 2 LAPTOP_IP
nc -zv LAPTOP_IP 1883
nc -zv LAPTOP_IP 3000
```

All three must succeed. If any fail, fix that link before launching the
gateway. See §9 for diagnostics.

### 5.3 Launch (skip if bootstrap auto-launched)

```bash
./bootstrap-pi.sh --role gateway
```

Expected output (truncated):
```
[bootstrap-pi] Role: gateway
[bootstrap-pi] Mode: hostname
[bootstrap-pi] Laptop host: my-acer.local
[bootstrap-pi] Fetching http://my-acer.local:3000/api/discover
[bootstrap-pi] BE_URL=http://my-acer.local:3000/api  MQTT=my-acer.local:1883
[bootstrap-pi] Gateway socket: 127.0.0.1:8080
[bootstrap-pi] Wrote /home/pi/Desktop/trustbridge-sdk-v3/.env
[bootstrap-pi] Building test_gw in /home/pi/Desktop/trustbridge-sdk-v3/PoC_SDK_v3/poc_sdk_gateway/app
... lots of gcc -c lines on first run ...
[bootstrap-pi] Launching test_gw ...
... test_gw output (refresh_whitelist, listening on :8080, ...)
```

The gateway then runs `test_gw` in the foreground. It polls the BE for the
whitelist every ~3 seconds and listens on :8080 for device connections. Leave
the terminal running. Ctrl+C stops it.

---

## 6. Pi #1 — the DEVICE

> Make sure Pi #2 is **already running** before you launch Pi #1 — `test_device`
> tries to connect to the gateway at startup.

### 6.1 Plug in the SandGrain USB device

Plug it into Pi #1, wait a couple of seconds, then verify the kernel sees it:

```bash
ls /dev/ttyACM* /dev/ttyUSB* 2>/dev/null
```

You should see at least one path (e.g. `/dev/ttyACM0`). If nothing appears,
try a different USB port or cable (some are charge-only).

### 6.2 Bootstrap

**Hostname mode (recommended):**
```bash
cd ~/Desktop/trustbridge-sdk-v3
./bootstrap-pi.sh --role device \
                  --mode hostname \
                  --laptop-host my-acer.local \
                  --gateway-host trustbridge-gw.local
```

**IP mode:**
```bash
./bootstrap-pi.sh --role device \
                  --mode ip \
                  --laptop-host 10.10.8.42 \
                  --gateway-host 10.10.8.45
```

**Or interactively:**
```bash
./bootstrap-pi.sh --role device
# > Connect by: [hostname/ip] [hostname]:        ← Enter to accept
# > Laptop hostname [my-acer.local]:             ← Enter or new
# > Gateway Pi hostname [trustbridge-gw.local]:  ← Enter or new
# bootstrap-pi.sh writes .env, builds test_sdk + test_device, launches them
```

`--no-launch` is supported here too if you want to inspect `.env` before the
binaries start.

### 6.3 Smoke test (debugging only)

```bash
ping -c 2 LAPTOP_IP        # to BE/MQTT
nc -zv LAPTOP_IP 1883      # MQTT
nc -zv LAPTOP_IP 3000      # BE
ping -c 2 PI_GW_IP         # to gateway
nc -zv PI_GW_IP 8080       # gateway socket
```

All five must succeed.

### 6.4 Launch (skip if bootstrap auto-launched)

```bash
./bootstrap-pi.sh --role device
```

The script:
1. Writes a fresh `.env` from the BE's `/api/discover` response.
2. Runs `make clean && make` in `PoC_SDK_v3/poc_sdk_device/app/` to build
   `test_device` natively on the Pi.
3. Auto-detects the USB device (`/dev/ttyACM*` or `/dev/ttyUSB*`) and exports
   `USB_TTY_PORT` so the binary picks it up.
4. **Launches `test_device --listen` in the foreground.** In `--listen` mode,
   `test_device` connects to MQTT, subscribes to `cmd/run_auth`, and waits for
   the TrustBridge BE/FE to trigger an auth (`{"mode":N}`). Ctrl+C stops it.

> **No separate `test_sdk` process anymore.** `PoC_SDK_v3/poc_sdk_device`
> bundles enrollment + lifecycle mutual auth into a single binary, so the
> launcher no longer needs to coordinate two processes (no `test_sdk` in the
> background, no `tmux` pane split). The Windows/macOS `start-local.*` and
> the Pi `bootstrap-pi.sh` all use this same single-binary flow now.

Expected first run output (truncated):
```
[bootstrap-pi] Role: device
[bootstrap-pi] Mode: hostname
[bootstrap-pi] Laptop host: my-acer.local
[bootstrap-pi] Fetching http://my-acer.local:3000/api/discover
[bootstrap-pi] BE_URL=http://my-acer.local:3000/api  MQTT=my-acer.local:1883
[bootstrap-pi] Gateway socket: trustbridge-gw.local:8080
[bootstrap-pi] Wrote /home/pi/Desktop/trustbridge-sdk-v3/.env
[bootstrap-pi] Auto-detected USB_TTY_PORT=ACM0
[bootstrap-pi] Building test_device in /home/pi/Desktop/trustbridge-sdk-v3/PoC_SDK_v3/poc_sdk_device/app
... lots of gcc -c lines on first run ...
[bootstrap-pi] Launching test_device ...

=====================================================
  SGR SDK - DEVICE  (TrustBridge mode, listener)
=====================================================

[PORT] crypto chip on /dev/ttyACM0
[MW] SDK ready
[MQTT] Connected - subscribed to sandgrain/v1/<TID>/cmd/run_auth
```

The device then sits idle, waiting for a `cmd/run_auth` MQTT trigger from the
TrustBridge BE (clicking "Enroll" / "Move to Lifecycle" / "Inject Fault" in
the FE publishes that trigger).

---

## 7. Daily workflow

After everything is set up once, the day-to-day flow is:

| Where | Command |
|---|---|
| Laptop | `docker compose -f TrustBridge-Docker/docker-compose.yml up -d` (or your `start-all.sh`) |
| Pi #2 | `./bootstrap-pi.sh --role gateway` |
| Pi #1 | `./bootstrap-pi.sh --role device` |

Always **start in this order**: Laptop → Pi #2 → Pi #1. This way the device
finds the gateway already listening, and the gateway finds the BE already up.

**To stop:**
- Pi #1: `Ctrl+C` in the foreground terminal (kills both `test_device` and `test_sdk`).
- Pi #2: `Ctrl+C`.
- Laptop: `docker compose down` from `TrustBridge-Docker/`.

---

## 8. Verifying end-to-end

1. **Browser on any device on the same Wi-Fi:** `http://LAPTOP_IP:5173`
   — TrustBridge login page loads.
2. **Pi #2 gateway logs:** `[run_gw] Whitelist loaded: N device(s)` (N > 0
   once you've registered your SandGrain device in the BE admin panel).
3. **Pi #1 device logs:** `✔ Device SDK initialized OK` and
   `✔ MQTT connected`.
4. **In the FE**, trigger an authentication for the registered device. You
   should see auth events flow:
   - FE / BE → MQTT publish → Pi #2 gateway receives → forwards over TCP to Pi #1 → Pi #1's `test_device` runs the auth handshake against the SandGrain hardware → result flows back to BE → FE updates.

---

## 9. Troubleshooting

### 9.1 `ping LAPTOP_IP` from a Pi hangs forever

**Cause:** the laptop and Pis are on different IP subnets. With a `/24`
netmask, `10.10.8.x` and `10.10.10.x` are isolated unless your router does
inter-VLAN routing.

**Fix:** put all three boxes on the same Wi-Fi SSID — preferably one whose
DHCP gives the same first-three-octets to every client. Verify with:

```bash
# On each Pi
ip -4 addr show | grep inet

# On the laptop
ipconfig | findstr /i ipv4
```

The first three octets of all three IPs must match (e.g. `10.10.8.42`,
`10.10.8.44`, `10.10.8.45`).

### 9.2 Build fails with `file format not recognized` on a `.o` file

**Cause:** the repo includes prebuilt x86_64 `.o` files in `build/`. The Pi's
ARM linker can't read them.

**Fix:** the `bootstrap-pi.sh` and `bootstrap-pi.sh` scripts already
do `make clean` on first build. If you're calling `make` directly, do:

```bash
cd <app dir>
make clean && make
```

### 9.3 Build fails with `cannot find -lrs232lib` / `skipping incompatible`

**Cause:** the prebuilt `librs232lib.so` is x86_64 only.

**Fix:** the Makefiles in this repo have been patched to compile
`port/rs232_macos.c` (a portable POSIX implementation) on Linux instead of
linking the prebuilt lib. If you're working with an older Makefile that still
links `-lrs232lib` on Linux, change the relevant block from:

```makefile
ifeq ($(PLATFORM),MACOS)
POC_SRCS += port/rs232_macos.c
else
LDFLAGS += -L$(SDK_DIR)/src/utils/rs232 -lrs232lib ...
endif
```

To:

```makefile
ifeq ($(PLATFORM),WINDOWS)
LDFLAGS += -L$(SDK_DIR)/src/utils/rs232 -lrs232lib ...
else
POC_SRCS += port/rs232_macos.c
endif
```

(Apply to all three Makefiles: `Device/poc_sdk_fw/app/Makefile`,
`PoC_SDK_v3/poc_sdk_device/app/Makefile`,
`PoC_SDK_v3/poc_sdk_gateway/app/Makefile`.)

### 9.4 Build fails with `implicit declaration of 'usleep'` / `'CRTSCTS' undeclared`

**Cause:** strict `-std=c11` hides POSIX/BSD extensions.

**Fix:** the §4.5 patches add `#define _DEFAULT_SOURCE` to the affected
files. Re-apply them if you've pulled fresh code:

```bash
sed -i '1i #define _DEFAULT_SOURCE' <affected file>
```

### 9.5 `Permission denied: '/dev/ttyACM0'` on Pi #1

**Cause:** user not in the `dialout` group.

**Fix:**
```bash
sudo usermod -aG dialout $USER
# log out + log back in
groups | grep dialout
```

### 9.6 `Cannot connect to MQTT broker` on Pi #1

**Possible causes (in order of likelihood):**
1. Wrong subnet — see §9.1.
2. Laptop firewall blocking 1883 — see §3.2.
3. Mosquitto container not running — `docker ps | grep mosquitto` on the laptop.
4. Wrong `MQTT_BROKER` in `.env` — re-run `./bootstrap-pi.sh` (overwrites
   `.env` cleanly) or `sed -i 's/<old>/<new>/g' .env` for a one-off edit.

Diagnose with:
```bash
nc -zv LAPTOP_IP 1883          # connectivity
mosquitto_pub -h LAPTOP_IP -t test -m hello   # full MQTT round-trip
```

### 9.7 `test_sdk` and `test_device` both try to open `/dev/ttyACM0`

This is expected — only `test_sdk` actually holds the USB. `test_device`
talks to `test_sdk` via TCP and fails-soft on its USB open. If you see
`[CRYPTO] failed to read valid TID` errors, give `test_sdk` more time to
initialize before `test_device` connects (the launcher script's `sleep 2`
usually handles this; bump it if your hardware is slow).

### 9.8 `make: file 'Makefile' has modification time in the future`

**Cause:** clock skew between laptop (where files were edited) and Pi.

**Fix:** see §4.3.

### 9.10 `bootstrap-pi.sh` fails with "Could not fetch discovery"

**Cause:** the Pi can reach `LAPTOP_IP` at the network level but `GET
/api/discover` doesn't respond. Either:
- The BE container isn't running yet (run `./start-all.sh up` on the laptop).
- This BE doesn't have the `DiscoverModule` (older repo) — pass
  `--no-discover` to `bootstrap-pi.sh`, which falls back to inline prompts for
  the values normally fetched from `/api/discover`.
- The laptop firewall is blocking 3000 (re-check §3.2).

**Fallback path:**
```bash
./bootstrap-pi.sh --role gateway --no-discover   # or --role device
```

`--no-discover` asks for `MQTT_BROKER`, `BE_URL`, etc. inline instead of
curling them. Once the BE is upgraded with `/api/discover`, drop the flag.

---

### 9.9 Need to wipe everything and re-install

```bash
cd ~/Desktop/trustbridge-sdk-v3
make -C Device/poc_sdk_fw/app clean
make -C PoC_SDK_v3/poc_sdk_device/app clean
make -C PoC_SDK_v3/poc_sdk_gateway/app clean
rm -f .env test_sdk.log
./bootstrap-pi.sh           # writes a fresh .env + rebuilds + (optionally) launches
```

---

## 10. Quick reference

```bash
# Find IPs
ipconfig | findstr /i ipv4              # Windows laptop
hostname -I                             # Pi (any)
ip -4 addr show | grep inet             # Pi (any)

# Test reachability from a Pi
ping -c 2 LAPTOP_IP
nc -zv LAPTOP_IP 1883
nc -zv LAPTOP_IP 3000
nc -zv PI_GW_IP 8080

# On Pi #2 (gateway)
./bootstrap-pi.sh --role gateway        # write .env + build + launch
pgrep -af test_gw                       # check it's running

# On Pi #1 (device)
./bootstrap-pi.sh --role device         # write .env + build + launch
tail -f test_sdk.log                    # watch test_sdk's output

# Just update IPs without rerunning the full bootstrap
sed -i 's/<old-ip>/<new-ip>/g' .env
```

---

## 11. Where things live

| What | On which box | Path |
|---|---|---|
| Docker stack orchestrator | Laptop | `TrustBridge/TrustBridge-BE/start-all.sh` |
| BE source | Laptop | `TrustBridge/TrustBridge-BE/` |
| FE source | Laptop | `TrustBridge/TrustBridge-FE/` |
| Cloud SDK source | Laptop | `TrustBridge/trustbridge-sdk-v3/Cloud/` |
| Device SDK source | Pi #1 | `~/Desktop/trustbridge-sdk-v3/` |
| Gateway source | Pi #2 | `~/Desktop/trustbridge-sdk-v3/` |
| Device launcher | Pi #1 | `~/Desktop/trustbridge-sdk-v3/bootstrap-pi.sh --role device` |
| Gateway launcher | Pi #2 | `~/Desktop/trustbridge-sdk-v3/bootstrap-pi.sh --role gateway` |
| `.env` (per Pi) | Both | `~/Desktop/trustbridge-sdk-v3/.env` |
| `test_sdk` background log | Pi #1 | `~/Desktop/trustbridge-sdk-v3/test_sdk.log` |

---

**That's the whole guide.** If something here is unclear, broken, or has been
fixed in code, edit this file and commit — it's meant to be a living doc.
