# Run the cellular demo: nRF9151 board straight to the hosted TrustBridge over LTE

One nRF9151-DK runs the device AND the gateway roles combined: the gateway-mode
SDK runs on the board with the SGT1001 crypto chip attached locally over SPI,
talking MQTT over LTE directly to the hosted TrustBridge broker. There is no PC
gateway, no BLE, no LAN and nothing to run locally except the build - the cloud
side is the hosted TrustBridge instance.

```
 nRF9151-DK (device+gateway combined)                Hosted TrustBridge (AWS EC2)
 ┌──────────────────────────────┐    MQTT over LTE   ┌──────────────────────────┐
 │ gateway SDK (self-auth path) │◀──────────────────▶│ mosquitto broker :1883    │
 │ + SGT1001 on the SPI header  │   (outbound only)  │ TrustBridge BE + frontend │
 │ + LTE modem (nano SIM)       │                    │ trustbridge.sandgrain.dev │
 └──────────────────────────────┘                    └──────────────────────────┘
```

Every connection is outbound from the board, so carrier-grade NAT (the norm on
cellular) never gets in the way. TrustBridge triggers authentication by
publishing on a topic the board subscribes to - the same "online device flow"
the standard trustbridge-0.4 setup uses.

Hardware-verified 2026-07-23: FE-triggered mutual authentication (Phase 1 +
Phase 2), presence online/offline including a retained "offline" after a power
cut, against trustbridge.sandgrain.dev.

## Branch

| Machine | Role | Branch | Path |
|---------|------|--------|------|
| PC (build) | build + flash the firmware | `trustbridge-0.4-LTE` | `PoC_SDK_v3/poc_sdk_cellular_nrf9151/` |
| nRF9151-DK | device + gateway combined | (flashed from the PC) | - |
| Cloud | TrustBridge | hosted - nothing to check out or run | - |

---

## 1 - What you need

- **nRF9151-DK** (tested on HW rev 1.4.0) with a USB cable in the DEBUG port
  (the one nearest the power switch).
- **A nano SIM with LTE-M coverage** in the board's SIM slot (tested with a
  physical Onomondo SIM; the DK's bundled iBasis eSIM should also work). The
  SIM must be activated with its provider.
- **SGT1001 crypto chip** wired to the Arduino header:

  | SGT1001 signal | DK pin |
  |----------------|--------|
  | CLK            | D13    |
  | MISO           | D12    |
  | MOSI           | D11    |
  | CSN            | D10    |
  | VCC            | 3V3    |
  | GND            | GND    |

  The chip runs at 3.3 V - never feed it from 5 V.
- **A PC with the nRF Connect SDK v3.3.0** installed via Nordic's Toolchain
  Manager, either way works:
  - nRF Connect for VS Code: install the "nRF Connect for VS Code Extension
    Pack", then in the nRF Connect side panel choose "Install Toolchain",
    then "Manage SDKs" and install SDK `v3.3.0`, or
  - nRF Connect for Desktop: open the Toolchain Manager app and install SDK
    `v3.3.0`.

  The bundle includes west, the Zephyr SDK, GCC, CMake, Ninja, Python and
  nrfutil - nothing needs to be installed separately or put on PATH. Also
  install the SEGGER J-Link / USB drivers (they come with nRF Connect for
  Desktop or SEGGER's J-Link installer).

---

## 2 - TrustBridge side (one-time per chip)

The board authenticates against the hosted development instance. Two things to
know:

1. **The chip's TID must be registered in TrustBridge.** Menu option `0` on
   the board's serial terminal prints it - the 64-hex-digit value starting
   with `8000...`. Enroll it in the TrustBridge frontend before expecting
   Phase 1 to pass ("server rejected token" on every attempt = TID not
   registered).
2. **The broker address is the instance's Elastic IP, not the hostname.**
   `trustbridge.sandgrain.dev` resolves to Cloudflare, which only proxies web
   traffic and drops raw MQTT on 1883. The firmware therefore connects to the
   EC2 origin IP directly - it is defined as `APP_MQTT_BROKER_HOST` in
   `src/ports/app_mqtt.h`, together with the broker credentials. Pointing the
   board at a different TrustBridge instance means editing that define and
   rebuilding.

---

## 3 - Build and flash

`flash_cellular.ps1` sits next to the firmware and works like the BLE branch's
`flash_device.ps1`: it auto-discovers the toolchain install (no hardcoded
paths, toolchain hashes or serial ports), builds pristine for
`nrf9151dk/nrf9151/ns`, flashes with a full chip erase and resets the board:

```powershell
git checkout trustbridge-0.4-LTE
cd PoC_SDK_v3\poc_sdk_cellular_nrf9151

.\flash_cellular.ps1              # build + flash + reset
.\flash_cellular.ps1 -Monitor     # same, then open a serial monitor
```

Optional flags: `-NcsRoot C:\ncs` (NCS installed elsewhere), `-NcsVersion`
(different SDK version), `-NoFlash` (build only), `-Snr <jlink-serial>` (more
than one board attached), `-Port COM5` (force a serial port for `-Monitor`).
The script prints the root, toolchain and board it resolved so you can confirm
what it picked.

### Board on a different machine than the toolchain

If the board is attached to another PC (e.g. a remote machine), build a
shipping zip instead and flash there - the far machine only needs nrfutil,
no toolchain:

```powershell
.\flash_cellular.ps1 -NoFlash -Zip     # build PC: produces out\poc_sdk_cellular_nrf9151.zip
```

Copy the zip over, extract it, then on the board machine:

```powershell
.\flash_cellular.ps1 -PrebuiltHex .\merged.hex
```

---

## 4 - Serial terminal and what boot looks like

The board talks over the J-Link CDC UART at 115200. Use a terminal that can
send keystrokes - PuTTY is the safe choice. (Passive log viewers show the
output but menu keys do nothing; the VS Code serial monitor has been seen
swallowing input on some machines.) Close the terminal before flashing.

Expected boot sequence:

```
SandGrain DEVICE+GATEWAY - mutual auth over LTE
[BIST] status byte: 0x00 (PASS)
TID: 8000...                                  <- enroll this in TrustBridge
[LTE] Attaching to the network (can take a few minutes)...
[LTE] Connected - IP address assigned
[MQTT] Connecting to <broker>:1883 ...
[MQTT] Connected to broker - credentials OK
[MQTT] Presence: online (retained)
[MQTT] Listening for TrustBridge auth triggers on sandgrain/v1/<tid>/cmd/run_auth
```

then the menu: `0` = BIST / print TID, `1` = mutual authentication.

Note the order: the chip is read BEFORE the network comes up. The firmware
builds its MQTT identity from the TID at runtime (client ID, presence topic
and the broker-held "offline" will), so the same hex works on any board and
any chip with no rebuild. The first LTE attach on a fresh SIM or new location
can genuinely take a few minutes - later attaches are much faster.

---

## 5 - The demo moment

1. Board powered, boot sequence complete, device shows **Online** in the
   TrustBridge frontend.
2. Trigger authentication **from the TrustBridge frontend** (online device
   flow). No touching the board: it receives the trigger over MQTT, runs
   Phase 1 (cloud verifies the chip) and Phase 2 (chip verifies the cloud) on
   its own, and reports every step back.
3. What success looks like:
   - Serial: `[MQTT] Auth trigger received from TrustBridge`, then
     `MUTUAL AUTHENTICATION OK`.
   - Frontend activity board: the attempt closes SUCCESS, with the gateway
     steps ("Auth Request Received", "RW Verified", "Phase 2") and the final
     `AUTH_OK`.
4. Menu `1` on the serial terminal starts the identical flow manually - the
   frontend shows that attempt too.
5. Presence check: pull the board's power. The frontend flips the device to
   **Offline** within about 45 seconds - the broker publishes a retained
   "offline" on the board's behalf (MQTT Last Will), so the status stays
   correct even across a backend restart.

## Recovery behavior (what you do NOT need to do)

- **LTE or broker drops:** the firmware reconnects by itself with backoff
  (5 s doubling to 60 s, forever), re-subscribes its topics and re-announces
  "online". An auth run interrupted mid-flight fails cleanly and can simply
  be retriggered.
- **Chip swap:** wire a different SGT1001 and reboot - identity follows the
  chip automatically. If you swap without power-cycling, menu `0` reads the
  new chip and reconnects with the new identity (it also retracts the old
  chip's retained "online" first).
- **Several boards at once:** fine - each board's MQTT client ID is derived
  from its own TID, so they do not kick each other off the broker.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `No devices with requested serial number(s) or trait(s) found` when flashing | The PC cannot see the DK: board power switch OFF, USB cable not in the DEBUG port, J-Link missing in Device Manager, or nRF Connect Programmer holding the debugger. `nrfutil device list` shows what is visible. |
| `[BIST] error` / `[INIT] FAILED - crypto chip not responding` | SGT1001 wiring (table in section 1). The firmware prints the expected wiring and retries on the next menu `0` - no reflash needed. |
| Phase 1 rejected on every attempt (`is TID ... registered in TrustBridge?`) | The chip's TID is not enrolled in this TrustBridge instance. Enroll it (section 2) and run again. |
| `[MQTT] No CONNACK` / broker unreachable | Wrong broker IP for the instance (Cloudflare note in section 2), or credentials mismatch in `app_mqtt.h`. The board keeps retrying in the background. |
| LTE attach never completes | SIM not activated, no LTE-M coverage at the location, SIM seated badly, or antenna issue. First attach at a new location can take several minutes - give it time before concluding failure. |
| Pressing `1` or `0` does nothing | The COM port is open in a passive log viewer. Use PuTTY (or another terminal that sends keystrokes). |
| Menu looks dead after an FE-triggered run | It is not - the run scrolled the console and the firmware reprints the menu when it finishes. Press Enter if in doubt. |
| Device stays Online in the frontend after power-off | Firmware older than the raw-MQTT rewrite (no Last Will). Reflash from this branch. |
| `?` garbage characters in the serial output | Firmware or SDK sources older than the ASCII sweep. Reflash from this branch. |

## Notes

- This build is the SDK's "gateway authenticates its own token" path
  (`SGR_SDK_Authentication_Token_To_Server` / `Server_To_Token`) with the chip
  local to the gateway - the same shape as the original PC-with-USB-chip PoC,
  with LTE replacing Ethernet. Production keeps device and gateway separate;
  this combined build is the development shortcut for the cellular phase.
- All MQTT runs on one connection: auth frames (`req`/`rsp` topics), step
  telemetry (`gw_log` + `auth_result`, so the frontend renders runs), presence
  (`status`) and the trigger subscription (`cmd/run_auth`).
- Keepalive is 30 s, so the broker declares a dead board at ~45 s. The
  presence "offline" is retained and QoS 1.
