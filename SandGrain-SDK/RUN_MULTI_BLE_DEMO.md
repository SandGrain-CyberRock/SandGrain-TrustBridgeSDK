# Run the multi-device BLE demo: Nordic board(s) + Pi device + Pi gateway + laptop cloud

One Raspberry Pi gateway serves several BLE devices at the same time. Each
device runs the full mutual authentication (Phase 1 + Phase 2) against the
TrustBridge cloud, and the flows run concurrently - you will see interleaved
`[CH0]` / `[CH1]` lines in the gateway log.

```
 Device 1: nRF54L15-DK            Raspberry Pi gateway              Laptop/PC (Docker)
 ┌─────────────────┐   BLE NUS    ┌────────────────────────┐  MQTT    ┌───────────────────────┐
 │ device SDK      │◀───────────▶│ test_gw (GW_BLE=1,     │◀───────▶│ EMQX broker :1883     │
 │ + SGT1001 (SPI) │              │  GW_BLE_DEVICES=2)     │  HTTP    │ TrustBridge BE :3000  │
 │ 'SandGrain-Dev' │              │ BLE central, one       │◀───────▶│ + frontend            │
 └─────────────────┘              │ channel per device     │          └───────────────────────┘
 Device 2: Raspberry Pi           │                        │
 ┌─────────────────┐   BLE NUS    │                        │
 │ test_device     │◀───────────▶│                        │
 │ + SGT1001 (USB) │              └────────────────────────┘
 │ 'SandGrain-Dev2'│
 └─────────────────┘
```

Device 2 can also be a second Nordic board instead of a Pi - see section 3.
The laptop only runs Docker; all BLE happens between the devices and the
gateway Pi.

Authentication can be started two ways, and both are worth showing:

- from the device itself, with its menu, or
- from TrustBridge, with no keystroke on the device at all. A BLE device has
  no MQTT client, so the gateway subscribes to that device's trigger topic on
  its behalf and relays the request over the BLE link. The backend never
  learns that the device is on Bluetooth. See section 6.

Hardware-verified 2026-07-28: Nordic board and Pi device authenticating
simultaneously against one Pi gateway, driven both from the device menus and
from the TrustBridge frontend, including first-enrollment claim and recovery
from device restarts and Bluetooth stack restarts.

## Branch (one branch for every machine)

Everything now lives on a single branch, `trustbridge-0.4-BLE`. The topology
is chosen by build flags, not by checking out different branches.

| Machine | Role | Path | Build |
|---------|------|------|-------|
| Laptop/PC | TrustBridge cloud (Docker) | `TrustBridge-Be/` | `./start-all.ps1 (windows) or ./start-all.sh (linux/macOS)` |
| Raspberry Pi (gateway) | BLE central, N channels | `PoC_SDK_v3/poc_sdk_gateway/` | `make GW_BLE=1 GW_BLE_DEVICES=n` |
| Nordic nRF54L15-DK | BLE peripheral device | `PoC_SDK_v3/poc_sdk_device_nrf/` | `flash_device.ps1` / `.sh` |
| Raspberry Pi (device, optional) | BLE peripheral device | `PoC_SDK_v3/poc_sdk_device/` | `make DEV_BLE=1 [DEV_SPI=1]` |

```bash
git checkout trustbridge-0.4-BLE
git pull
```

> Find the laptop's LAN IP first (the Pis must reach it): `ipconfig` on
> Windows, note the IPv4 address, e.g. `192.168.12.10`. Referred to below as
> `<LAPTOP_IP>`.

> Copying the repo from a Windows checkout to a Pi? Use
> `git archive --format=tar.gz -o sdk.tar.gz trustbridge-0.4-BLE` and extract
> on the Pi. A raw file copy carries CRLF line endings that break Makefiles
> and shell scripts. Pulling directly on the Pi is fine and simpler.

---

## 1 - Laptop/PC: TrustBridge cloud stack (Docker)

```bash
cd TrustBridge-BE
./start-all.ps1  # for windows
./start-all.sh   # for linux/macOS
docker ps        # TrustBridge BE, FE, mosquitto, mysql and sandgrain-cloud-app should be Up
```

Then, in the TrustBridge frontend, enroll EVERY device you plan to run.
Each device has its own TID (from its own SGT1001 crypto chip) and each TID
must be whitelisted. With one board and one Pi device that is two
enrollments; with two boards it is also two, but different ones.

To read a device's TID: menu option `0` (BIST) prints it, on the board's
serial terminal and on the Pi device's console alike. It is the 64-hex-digit
value starting with `8000...`.

> If the gateway later cannot reach the broker or backend, allow inbound
> `1883` and `3000` through the laptop firewall.

---

## 2 - Raspberry Pi: the multi-device gateway

```bash
cd PoC_SDK_v3/poc_sdk_gateway
```

The gateway is more than a BLE-to-cloud relay. It also acts as the MQTT
citizen its devices cannot be: for every device that announces itself it
publishes that device's retained online/offline status, and, for devices that
ask, subscribes to that device's authentication trigger topic. That is what
makes a BLE device visible and driveable in TrustBridge (section 6).

First time on this Pi, run the setup script (installs dependencies, builds
the pinned gattlib from source, builds `test_gw`, grants BLE capabilities,
masks PipeWire, writes the env file and launcher):

```bash
./scripts/pi_ble_gateway_setup.sh --broker <LAPTOP_IP>
```

> The PipeWire step matters on the GATEWAY too, not just on the device Pi.
> PipeWire/WirePlumber register an encrypted BLE-MIDI GATT service on
> whichever machine they run on, and the quirk bites in both directions:
> the device discovers services on the gateway, hits the encrypted
> characteristic, gets `Insufficient Encryption`, and asks to pair. Pairing
> lands on numeric comparison, nobody confirms it, SMP times out at 30s and
> bluetoothd hangs up. On hardware that killed the link every ~35 seconds
> while the auth itself passed whenever it fitted inside the window. If you
> are not running the setup script, do it by hand:

> ```bash
> systemctl --user mask --now wireplumber pipewire pipewire-pulse pipewire.socket pipewire-pulse.socket
> sudo systemctl restart bluetooth
> ```

`--broker` fills in both the broker and the backend URL, since the laptop runs
them together. Check the generated env:

```bash
cat app/.env.ble.gateway
#   MQTT_BROKER=<LAPTOP_IP>
#   MQTT_PORT=1883
#   MQTT_USER=sandgrain          # match your broker credentials
#   MQTT_PASS=admin
#   BE_URL=http://<LAPTOP_IP>:3000/api
```

Only edit it if your credentials differ, or if the backend is on a different
host - in that case pass `--be-url http://<host>:3000/api` (or `--be-port` for
a different port) instead. Re-running the script leaves an existing env file
untouched, so change it by hand if it already exists.

### Build for N devices

`GW_BLE_DEVICES` sets how many devices the gateway serves - one BLE
connection (one gateway channel) per device. The default is 2. To change it,
rebuild:

```bash
cd app
make clean && make GW_BLE=1 GW_BLE_DEVICES=2     # or =3 for three devices, etc.
sudo setcap 'cap_net_raw,cap_net_admin+eip' ./test_gw
```

Notes on the count:
- Devices are matched by advertised-name prefix `SandGrain-Dev`, so
  `SandGrain-Dev`, `SandGrain-Dev2`, `SandGrain-Dev3` all qualify.
- A discovered device binds to the first free channel; binding is by MAC
  address, so several devices with the same name still work.
- Set the count to the number of devices you actually intend to run. A
  channel that never gets filled keeps scanning, and scanning shares the
  radio with the links that are already up. Two things limit the damage:
  discovery is suspended outright while any device is mid-exchange, and the
  backoff between empty scans climbs faster once a link is up (2s, 5s, 30s,
  120s, 600s, versus 2s, 5s, 10s, 30s, 60s with nothing connected). The
  ladder is NOT reset by a reconnect - only by a scan that actually finds
  something - because a device coming back after a drop is reconnected
  straight from the candidate queue and needs no scan at all. A spare
  channel is therefore cheap, but an exactly-sized count is still the
  calmest configuration.
- Every device's TID must be whitelisted in TrustBridge (section 1) and
  present in the gateway's `trustbridge_whitelist.txt`. Avoid editing that
  file while a run is in flight: a partly written file briefly de-enrolls
  devices, and you will see them released and re-registered in the log.

### Run

```bash
sudo systemctl status bluetooth      # bluetoothd active
rfkill unblock bluetooth
cd app && ./run_ble_gateway.sh       # sources .env.ble.gateway, runs test_gw
```

Expected start: the gateway connects to MQTT and the backend, then prints
`scanning for BLE peripherals 'SandGrain-Dev*'` and binds each device it
finds: `found ... -> [chN] connecting -> connected, subscribed to NUS -
link ready`.

Then, per device, as it announces itself:

```
[ch0] HELLO from SandGrain-Dev - TID 80000000... (marking online, trigger proxy requested)
[TRIGGER] 80000000... subscribed to sandgrain/v1/<tid>/cmd/run_auth
[PRESENCE] 80000000... -> online (retained)
```

At that point the device shows Online in the TrustBridge frontend and can be
triggered from there. If you restarted the gateway, it also prints
`evicted N cached 'SandGrain-Dev*' peripheral(s) at startup` - that clears
BlueZ's device cache so it can re-discover devices it was connected to in the
previous run.

---

## 3 - Nordic nRF54L15-DK board(s)

The board is a BLE peripheral advertising `SandGrain-Dev`, with the SGT1001
crypto chip on SPI. The firmware is the interactive-menu build, and it offers
the same options with the same numbering as the Pi device:

| Key | Action |
|-----|--------|
| `0` | BIST - crypto chip self-test (PCC / ID / RW / EK / status) and the TID |
| `1` | Mutual Authentication, no fault injection |
| `2` | Fault injection (CW: 2 bits, CW echo: 1 bit, RW: 1 bit) |
| `3` | Fault injection, Error Management stress (CW: 3 bits, CW echo: 2 bits) |
| `4` | FW Verification with the correct RW (expect `FW_OK`, saves `RW_verify`) |
| `5` | FW Verification with a wrong RW (expect `FW_NOK`) |
| `6` | Installation - request install authorization (run `4` first) |

There is no `7` (Exit) on the board - it has nothing to exit to. Options `1`
to `3` are also what TrustBridge selects when it triggers the board remotely.

Two ordering rules for the last three:
- Run `4` immediately before `6`. Option `4` is what records a valid firmware
  verification for this device in the cloud.
- Do not run `5` in between. It deliberately reports a failed verification,
  and the cloud will then refuse the installation with
  `missing_or_expired_fw_verification`.

### Toolchain (one-time per PC)

The build uses west (Zephyr's build tool) driving the nRF Connect SDK,
compiled by the Zephyr SDK. Install all of it bundled through Nordic's
Toolchain Manager, either way works:

- nRF Connect for VS Code: install the "nRF Connect for VS Code Extension
  Pack", then in the nRF Connect side panel choose "Install Toolchain",
  then "Manage SDKs" and install SDK `v3.3.0`, or
- nRF Connect for Desktop: open the Toolchain Manager app and install SDK
  `v3.3.0`.

The bundle includes west, the Zephyr SDK, GCC, CMake, Ninja, Python and
nrfutil - nothing needs to be installed separately or put on PATH.

Also install the SEGGER J-Link / USB drivers (they come with nRF Connect for
Desktop or SEGGER's J-Link installer). They are needed to program the board
and to expose its serial (COM) port.

### Build and flash

`flash_device.ps1` (Windows) and `flash_device.sh` (Linux/macOS) sit next to
the firmware. They auto-discover the toolchain install (no hardcoded paths,
toolchain hashes or serial ports), build pristine, flash with a full chip
erase and reset the board:

```powershell
cd PoC_SDK_v3\poc_sdk_device_nrf

.\flash_device.ps1              # build + flash + reset
.\flash_device.ps1 -Monitor     # same, then open a serial monitor
```

Optional flags: `-NcsRoot C:\ncs` (NCS installed elsewhere), `-NcsVersion`
(different SDK version), `-Board` (different target), `-NoFlash` (build
only), `-Snr <jlink-serial>` (more than one board attached), `-Port COM5`
(force a serial port). The script prints the root, toolchain and board it
resolved so you can confirm what it picked.

On Linux/macOS use the dashed equivalents: `./flash_device.sh --monitor`,
`--no-flash`, `--snr <serial>`, `--port /dev/ttyACM1`, `--ncs-root ~/ncs`.
Linux one-time extras: the SEGGER J-Link package, the nrf-udev rules
(https://github.com/NordicSemiconductor/nrf-udev) and your user in the
`dialout` group. Serial ports are `/dev/ttyACM*` (Linux) or
`/dev/tty.usbmodem*` (macOS) instead of COMx.

A correctly flashed board shows the seven-option menu on its serial terminal
after the banner and BIST. Two signs of stale firmware, both fixed by pulling
the branch and reflashing once:

- it starts authenticating by itself right after power-on (old auto-run
  build), or
- it shows only options `0` and `1`, or every authentication fails
  immediately with `[MW] [ERROR] Failed to connect to GW` even though the
  gateway reports the link is ready (build from before the device SDK moved
  to an application-supplied transport).

### Serial terminal

The board talks over the J-Link CDC UART at 115200. Use a terminal that can
send keystrokes (PuTTY, VS Code Serial Monitor with a send box, or
miniterm):

```powershell
python -m serial.tools.miniterm COM3 115200    # your port may differ
```

The board prints its banner, the BIST result with the TID, then the menu.
Menu `1` starts the mutual authentication. If pressing `1` does nothing,
the terminal is a passive log viewer - switch to one that sends keystrokes.

A terminal is only needed to drive the board by hand and to read its TID. Once
the TID is enrolled, TrustBridge can run the authentication with no keystroke
at all (section 6), and the board will print the run as it happens.

### Running two Nordic boards

Two boards instead of board + Pi works with no code changes:

- Both boards may keep the identical default name `SandGrain-Dev`. The
  gateway binds by MAC address, so identical names do not clash. The only
  downside is the logs: both channels show the same name and only the MAC
  tells them apart.
- For readable logs, give the second board its own name: edit
  `CONFIG_BT_DEVICE_NAME` in `PoC_SDK_v3/poc_sdk_device_nrf/prj.conf` to any
  name starting with `SandGrain-Dev` (for example `SandGrain-Dev3`), rebuild
  and flash that board.
- Each board authenticates with its own TID, so both TIDs must be enrolled
  in TrustBridge.
- Boards are the simple case on the radio side: no Linux Bluetooth quirks
  apply to them. Power them on and they advertise.

---

## 4 - Raspberry Pi as a device (optional second device)

A second Raspberry Pi can play the device role. The SGT1001 crypto chip can
be attached in either of two ways:

- **USB dongle** on `/dev/ttyACM0` (the original setup), or
- **directly on the Pi's SPI header** (`/dev/spidev0.0`) - the same wiring
  role the nRF54L15 board plays, but the Pi drives the chip itself through
  Linux spidev.

On that Pi:

```bash
cd PoC_SDK_v3/poc_sdk_device
chmod +x scripts/pi_device_ble_setup.sh
./scripts/pi_device_ble_setup.sh          # chip on USB dongle
./scripts/pi_device_ble_setup.sh --spi    # chip on the SPI header
```

The Pi device has the same menu as the board (section 3), plus `7` to exit.

### SPI wiring (--spi)

Wire the SGT1001 to SPI0 / CE0 on the 40-pin header:

| SGT1001 signal | Pi pin | BCM GPIO |
|----------------|--------|----------|
| MOSI           | 19     | GPIO10   |
| MISO           | 21     | GPIO9    |
| SCLK           | 23     | GPIO11   |
| CS             | 24     | GPIO8 (CE0) |
| VDD (3.3 V)    | 1 or 17| -        |
| GND            | 6/9/14 | -        |

The chip runs at 3.3 V - never feed it from the 5 V pins. The bus runs SPI
mode 0, MSB first, 1 MHz (the same parameters the nRF54L15 devicetree node
uses). Overrides via environment: `SPI_DEV` (default `/dev/spidev0.0`, use
`/dev/spidev0.1` for CE1 on pin 26) and `SPI_SPEED_HZ` (default `1000000`).

The `--spi` flag enables the SPI interface (`raspi-config nonint do_spi 0`;
first-time enable may need one reboot before `/dev/spidev0.0` appears) and
builds with `make DEV_BLE=1 DEV_SPI=1`, which swaps the USB-serial transport
(`port_spi_usb.c`) for the native spidev one (`port_spi_dev.c`).

The setup script installs the dependencies (GLib/GIO, libmosquitto, BlueZ)
and builds `test_device`. It also applies the system preparation a Pi needs
before it can act as a BLE peripheral, so you do not have to do any of this
by hand:

- unblocks Bluetooth (`rfkill`) - it is often soft-blocked at boot
- sets `ControllerMode = le` in `/etc/bluetooth/main.conf` - without it a
  dual-mode adapter gets connected over classic Bluetooth and pairing fails
- masks the PipeWire/WirePlumber user services - they register an encrypted
  BLE-MIDI GATT service that breaks the central's service discovery
- grants the binaries BLE capabilities and adds you to `dialout` for the
  crypto dongle

### Run

Give the Pi device a name that does not clash with the board:

```bash
cd app
BLE_NAME=SandGrain-Dev2 sudo -E ./test_device
```

Note the `sudo -E`: plain `sudo` drops the `BLE_NAME` variable and the
device would advertise as `SandGrain-Dev`, clashing with the board.

Wait for this line before starting the gateway:

```
[COMM_BLE] advertising as 'SandGrain-Dev2' (kernel mgmt fallback)
```

The "kernel mgmt fallback" wording is normal on Raspberry Pi OS: the kernel
rejects bluetoothd's extended-advertising command, so the binary registers
the advertisement itself through the kernel management socket. A
"bluetoothd advertising failed ... kernel mgmt fallback" line right before
it is part of the same expected sequence.

Environment knobs: `BLE_NAME` (advertised name, max 29 bytes), `BLE_WAIT_MS`
(how long an auth waits for the gateway to subscribe, default 60000, 0 =
forever), `HCI` (adapter override, e.g. `hci1`), `BLE_TRIGGER_PROXY` (`1`/`0`,
forces the gateway relay on or off - see below).

Menu `0` prints the TID for enrollment, menu `1` starts the mutual
authentication. Ctrl-C is a clean shutdown; you can restart the program
immediately without touching Bluetooth.

Because this device runs on a Pi, it *could* talk to the broker itself. For
the demo it should not - the interesting configuration is the one a real
IP-less device has. Started plainly, as above, it asks the gateway to relay
its TrustBridge triggers and prints:

```
[TRIGGER] Asking the gateway to relay TrustBridge triggers over BLE
[COMM_BLE] sent HELLO (presence + trigger proxy) for TID 8000000000000000...
```

Started with `--listen` (or `RUN_MODE=listener`) it instead connects to the
broker itself and says `Own MQTT listener is up - not asking the gateway to
relay triggers`. Both work; it must not do both at once, or one request from
TrustBridge would authenticate it twice, which is exactly what the message
above is confirming it avoided.

---

## 5 - Run order and the demo moment

1. Laptop cloud up (section 1); every device TID enrolled.
2. Power the board(s). Start the Pi device if used (section 4) and wait for
   its advertising line.
3. Start the gateway last: `./run_ble_gateway.sh`. Watch it bind every
   device: one `link ready` line per channel.
4. Confirm every device is Online in the TrustBridge frontend. That happens
   on its own, from the gateway's presence proxy, a second or two after each
   `link ready`.
5. Trigger authentication, either way - or both, on different devices:
   - **From the devices**: menu `1` on the board's serial terminal, menu `1`
     on the Pi device's console. The flows run at the same time.
   - **From TrustBridge**: start the device flow in the frontend. No
     keystroke anywhere. This is the better demo moment - it is the flow a
     real deployment uses.
6. What success looks like:
   - Gateway: interleaved `[CH0]` / `[CH1]` Phase 1 and Phase 2 lines, each
     ending in `AUTH_OK`.
   - Each device: `MUTUAL AUTH OK` (board serial / Pi console).
   - TrustBridge frontend: auth OK and claim OK per device.

The order is not strict - the gateway keeps re-scanning, so a device that
appears later still gets bound. Starting the devices first just makes the
first scan find everything at once.

### First-time chips claim themselves

A chip that has never been claimed authenticates correctly but the cloud
answers `CLAIM_TOKEN` instead of `AUTH_OK`. TrustBridge then claims the token,
and a second authentication a moment later succeeds.

On a TrustBridge-triggered run the device drives that second pass itself:

```
  Token ready to be claimed: 4e784c9b-2946-46e8-833d-268c9d932230
  Waiting 3s for claim to settle, re-authenticating (pass 1/4)...
  ...
  Mutual Authentication OK
```

Up to four passes, three seconds apart. Nothing to do but watch. From the
device menu it is a single deliberate pass instead - press `1` again after
the claim lands.

---

## 6 - How TrustBridge drives a BLE device

Worth understanding, because it is what makes the demo hands-free.

TrustBridge has no concept of Bluetooth. It publishes and subscribes to MQTT
topics named after a device's TID, and that is all. A BLE device cannot reach
the broker, so the gateway acts on those topics on its behalf. The backend
never learns the difference.

```
  TrustBridge FE/BE          Gateway (Pi)                    Device
        |                         |                             |
        |                         |<--- "HELLO <tid> TRIGGER" --|  on every link-up
        |                         |                             |
        |<-- SUB .../cmd/run_auth |  the gateway subscribes     |
        |<-- PUB .../status ------|  "online", retained         |
        |                         |                             |
   (device shows Online)          |                             |
        |                         |                             |
        |--- PUB .../cmd/run_auth |                             |
        |      {"mode":1}         |                             |
        |                         |--- "RUN_AUTH 1" ----------->|
        |                         |                             |
        |                         |     the device authenticates as if its
        |                         |     menu key had been pressed
        |                         |<========= auth frames =====>|
        |<-- gw_log, auth_result -|                             |
```

Points that matter in practice:

- **The device asks for this.** Its announcement is `HELLO <tid> TRIGGER`, and
  the `TRIGGER` part is a request, not a default. A device that reaches the
  broker itself omits it, so it is never triggered twice for one request.
- **`mode` picks the same option as the menu** - `1` normal, `2` fault
  injection, `3` error-management stress.
- **Stored triggers are ignored.** A retained `cmd/run_auth` message would be
  redelivered every time the gateway subscribes, which is every device
  reconnect and every broker reconnect, and would re-authenticate the device
  on a loop. The gateway logs `retained cmd/run_auth ignored` and drops it.
- **The device's progress is reported by the gateway**, over MQTT, independent
  of the BLE link. If a link dies mid-run you can therefore see a completed
  attempt in TrustBridge while the device itself never received the verdict.
  The device reports that as a communication error and the next trigger runs
  cleanly.

## Recovery behavior (what you do NOT need to do anymore)

The transports clean up after themselves:

- Ctrl-C on the Pi device is a clean shutdown (it disconnects the central,
  removes its advertisement, unregisters its GATT service). You can restart
  it immediately without touching Bluetooth.
- If bluetoothd restarts on the device Pi (manually or by a system update),
  the device re-registers automatically and the gateway reconnects.
- If a device drops, the gateway reconnects to it directly. If it stays
  gone, the gateway gives up after 3 attempts, evicts it from the BlueZ
  cache, and re-finds it by scanning whenever it comes back.
- Restarting the gateway is safe. At startup it clears BlueZ's cached
  objects for its peripherals, so it can re-discover devices it was
  connected to a moment earlier. Without that step a restarted gateway is
  blind to them: bluetoothd keeps a device forever once connected, and a
  cached device is never re-reported to a scan.
- If a link dies in the middle of an authentication, the device ends that run
  with a communication error rather than waiting forever for a verdict that
  cannot arrive. Just trigger it again once the link is back.

So the old ritual (restart bluetooth on both Pis, `bluetoothctl remove`,
strict start order) is no longer needed in normal operation.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Gateway never finds a device | Device not advertising (power the board / start `test_device`); `rfkill unblock bluetooth` on the gateway Pi. |
| Gateway scan or connect permission error | Run via `run_ble_gateway.sh` (uses setcap binary), or `sudo -E ./test_gw`. |
| Gateway cannot reach broker/backend | Wrong `<LAPTOP_IP>` or laptop firewall blocking `1883`/`3000`. Test: `mosquitto_pub -h <LAPTOP_IP> -p 1883 -t sandgrain/ping -m up`. |
| Auth fails at the cloud | That device's TID is not enrolled/whitelisted, or broker credentials mismatch (`MQTT_USER`/`MQTT_PASS`). |
| Both devices bound but only one authenticates | Nothing wrong: flows start when you trigger them on each device. |
| A device stays Offline in TrustBridge although the gateway says `link ready` | Its HELLO has not been proxied. Check the gateway printed `HELLO from ... (marking online...)` and `[PRESENCE] ... -> online`. If not, the device could not read its TID - run menu `0` on it. |
| TrustBridge trigger does nothing on a device | That device did not ask for the relay. The gateway logs `(marking online, trigger proxy requested)` only for devices that did. On the Pi device, drop `--listen`/`RUN_MODE=listener`, or force it with `BLE_TRIGGER_PROXY=1`. |
| A device authenticates twice for one TrustBridge request | It is running both paths: its own MQTT listener and the gateway relay. Start it without `--listen`, or set `BLE_TRIGGER_PROXY=0` to keep the listener. |
| Board says `[MW] [ERROR] Failed to connect to GW` on every attempt, gateway says the link is ready | Stale board firmware from before the device SDK moved to an application-supplied transport. Pull and reflash. |
| Installation (`6`) denied with `missing_or_expired_fw_verification` | Run `4` immediately before `6`, with no `5` in between - option `5` deliberately records a failed verification. |
| Links die every 20-30 s, gateway logs `failed to subscribe to NUS TX` or repeated reconnects | Almost always PipeWire's BLE-MIDI service - on EITHER Pi. It bites in both directions, so mask it on the gateway as well as the device; a gateway Pi that still runs it kills the link every ~35s while the auth itself keeps passing. Confirm with `sudo btmon \| grep -iE "Disconnect\|reason\|Encryption\|SMP"` - reason `Authentication Failure (0x05)` with `Insufficient Encryption` is the signature. Fix: `systemctl --user mask --now wireplumber pipewire pipewire-pulse pipewire.socket pipewire-pulse.socket`, `sudo systemctl restart bluetooth` with `test_device` stopped, then restart it. It has come back after masking before; `sudo apt remove libspa-0.2-bluetooth` removes the plugin for good. A `Connection Timeout (0x08)` reason instead means radio trouble, not PipeWire - suspect 2.4 GHz Wi-Fi coexistence and try the gateway Pi on Ethernet. |
| Gateway crashes with `g_object_unref: assertion 'G_IS_OBJECT (object)' failed` and a segfault | Known gattlib fault, triggered when connect or subscribe keeps timing out - fix the underlying disconnect cause (row above) and it stops happening. Restart the gateway. |
| Device says `advertising as '...'` but no scanner ever sees it | The adapter is not connectable. Check `sudo btmgmt info` on the device Pi - if `connectable` is missing from `current settings`, that is it. Fixed in the app as of this branch (`SET_CONNECTABLE` is now sent every time bluetoothd appears, not only on the kernel-mgmt fallback path); on older builds, or to confirm, run `sudo btmgmt power off; sudo btmgmt le on; sudo btmgmt connectable on; sudo btmgmt power on`. It looks intermittent because the setting lives on the adapter and survives process restarts, so a Pi that once took the fallback path keeps working while a freshly booted one never does. |
| Device advertises but the gateway connects and finds no service | A previous `test_device` was killed hard, or bluetoothd was restarted underneath it: the kernel-owned advertisement outlives the process while its GATT server is gone. Stop `test_device`, restart bluetooth, then start the device again. Never restart bluetoothd while `test_device` is running. |
| Pressing `1` on the board does nothing | The COM port is open in a passive log monitor. Use a terminal that sends keystrokes (PuTTY, miniterm). |
| Cannot flash the board, COM port busy | Close the serial monitor before flashing. |
| `stale connect event ignored` lines in the gateway log | Normal after reconnect retries; the gateway is filtering duplicate connect events. |
| `cannot open crypto-chip SPI device '/dev/spidev0.0'` (`--spi` build) | SPI interface not enabled: `sudo raspi-config nonint do_spi 0` and reboot. If the node exists but permission is denied, add yourself to the `spi` group (`sudo usermod -aG spi $USER`, re-login) or run with `sudo -E`. |
| `--spi` build opens the bus but auth fails / RX is all `0x00` or `0xFF` | Wiring: MOSI/MISO swapped, CS not on CE0 (pin 24; or set `SPI_DEV=/dev/spidev0.1` for CE1), missing GND, or chip not on 3.3 V. Long jumper wires can also corrupt the bus - try `SPI_SPEED_HZ=500000`. |
| Behavior does not match the docs after an update | Stale binary. Verify the build picked up the new source, e.g. `strings ./test_gw | grep "will reconnect"` should print a line. |

## Notes

- Wire format per device: newline-framed single-line JSON over the Nordic
  UART Service (NUS). Alongside the JSON frames the link carries four control
  lines, consumed by the transport on each side so that neither authentication
  state machine ever sees them:

  | Line | Direction | Meaning |
  |------|-----------|---------|
  | `HELLO <tid> [TRIGGER]` | device to gateway | presence announce, plus an optional request to relay this device's trigger topic |
  | `RUN_AUTH <mode>` | gateway to device | a TrustBridge trigger, relayed |
  | `OPEN` / `CLOSE` | device to gateway | session brackets, the equivalent of a TCP connect and close |

- Each channel's cloud flow uses its own MQTT client, so concurrent auths do
  not collide. Presence and triggers use one further MQTT client per device,
  because each carries that device's own retained offline Last Will.
- The BLE links are persistent across Phase 1 / Phase 2 and repeated auths.
- Fault injection (menu `2` and `3`) is applied by the transport as frames
  pass through it, so it works the same over BLE as it does over TCP. Look for
  `[FAULT]` lines when running those options - without them the option ran
  clean and the result means nothing.
