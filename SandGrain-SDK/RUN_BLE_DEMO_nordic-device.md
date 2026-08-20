# Run the demo: Nordic device · Pi gateway · Laptop cloud

End-to-end mutual authentication:

```
 Nordic nRF54L15-DK              Raspberry Pi                     Your laptop (Docker)
 ┌─────────────────┐   BLE NUS   ┌───────────────────────┐  MQTT   ┌───────────────────────┐
 │ device SDK      │◀──────────▶│ test_gw (GW_BLE=1)    │◀──────▶│EMQX broker :1883      │
 │ + SGT1001 (SPI) │  (direct,   │ BLE central + cloud   │  HTTP   │ TrustBridge BE :3000  │
 │ adv 'SandGrain- │   no relay) │ uplink                │◀──────▶│ + frontend            │
 │  Dev'           │             └───────────────────────┘         └───────────────────────┘
 └─────────────────┘
```

The cloud is **unchanged**; the Pi is the BLE central. The board is a BLE
peripheral, the Pi scans for `SandGrain-Dev`, connects, and bridges the
newline-framed JSON auth stream to the cloud over MQTT + the TrustBridge backend.

The board has no IP stack, so the gateway also stands in for it on MQTT: it
publishes the board's online/offline status and subscribes to the board's
authentication trigger topic, relaying triggers over the BLE link. That is what
lets TrustBridge show the board and drive it - see step 4.

> Running more than one device against a single gateway (a second board, or a
> Raspberry Pi as the device) is the same setup with `GW_BLE_DEVICES` raised.
> That variant has its own runbook, `RUN_MULTI_BLE_DEMO.md`.

## Branch (one branch for every machine)

Everything is on `trustbridge-0.4-BLE`; the topology is selected by build flags.

| Machine | Role | Path | Build |
|---------|------|------|-------|
| Laptop | TrustBridge cloud (Docker) | `Cloud/` | `docker compose up -d --build` |
| Raspberry Pi | BLE central gateway | `PoC_SDK_v3/poc_sdk_gateway/` | `make GW_BLE=1 GW_BLE_DEVICES=1` |
| Nordic nRF54L15-DK | BLE peripheral device | `PoC_SDK_v3/poc_sdk_device_nrf/` | `flash_device.ps1` / `.sh` |

```bash
git checkout trustbridge-0.4-BLE
git pull
```

> Find the laptop's LAN IP first (the Pi must reach it): `ipconfig` (Windows) →
> note the IPv4 address, e.g. `192.168.12.10`. Referred to below as `<LAPTOP_IP>`.

---

## 1 · Laptop - TrustBridge cloud stack (Docker)

```bash
cd TrustBridge-BE
./start-all.ps1  # for windows
./start-all.sh   # for linux/macOS
docker ps        # TrustBridge BE, FE, mosquitto, mysql and sandgrain-cloud-app should be Up
```

Then in the **TrustBridge frontend**, register/enroll the board so its **TID is
whitelisted** (this is the "register a new device" step in the demo).

> If the Pi can't reach the broker later, allow inbound `1883` and `3000` through
> the laptop firewall (or set those Docker ports open on the LAN).

---

## 2 · Raspberry Pi - BLE central gateway

```bash
cd PoC_SDK_v3/poc_sdk_gateway
```

**First time on this Pi** - run the setup script (installs deps, builds the
pinned gattlib, builds `test_gw GW_BLE=1`, grants BLE caps, writes env + launcher):

```bash
./scripts/pi_ble_gateway_setup.sh --broker <LAPTOP_IP>
```

`--broker` fills in both the broker and the backend URL, since the laptop runs
them together. Check the generated env:

```bash
cat app/.env.ble.gateway
#   MQTT_BROKER=<LAPTOP_IP>
#   MQTT_PORT=1883
#   MQTT_USER=sandgrain          # match your broker creds (template default)
#   MQTT_PASS=admin
#   BE_URL=http://<LAPTOP_IP>:3000/api
```

Only edit it if your credentials differ, or if the backend is on a different
host - in that case pass `--be-url http://<host>:3000/api` (or `--be-port` for
a different port) instead. Re-running the script leaves an existing env file
untouched, so change it by hand if it already exists.

Verify Bluetooth is up, then run:

```bash
sudo systemctl status bluetooth      # bluetoothd active
rfkill unblock bluetooth
cd app && ./run_ble_gateway.sh       # sources .env.ble.gateway, runs test_gw
```

**Manual equivalent** (if you skip the launcher):

```bash
cd PoC_SDK_v3/poc_sdk_gateway/app
make clean && make GW_BLE=1 GW_BLE_DEVICES=1
sudo setcap 'cap_net_raw,cap_net_admin+eip' ./test_gw   # once
export MQTT_BROKER=<LAPTOP_IP> MQTT_PORT=1883 MQTT_USER=sandgrain MQTT_PASS=admin
export BE_URL=http://<LAPTOP_IP>:3000/api
sudo -E ./test_gw
```

`GW_BLE_DEVICES` is how many devices this gateway serves, one BLE connection
per device; the build default is `2`. Set it to `1` for this single-board demo.
A channel that never gets filled keeps scanning, and scanning competes with the
link that is already up - the gateway backs off progressively when scans come up
empty (2s, 5s, 10s, 30s, then 60s), but an exactly-sized count is calmest.

The gateway connects to MQTT/cloud, then prints `scanning for BLE peripheral
'SandGrain-Dev' ...` and keeps re-scanning until the board appears. Once it
binds the board you should see, in order:

```
[ch0] connected to SandGrain-Dev @ .., subscribed to NUS - link ready
[ch0] HELLO from SandGrain-Dev - TID 80000000... (marking online, trigger proxy requested)
[TRIGGER] 80000000... subscribed to sandgrain/v1/<tid>/cmd/run_auth
[PRESENCE] 80000000... -> online (retained)
```

That last pair is the board becoming visible and driveable in TrustBridge. On a
gateway restart you will also see `evicted N cached 'SandGrain-Dev*'
peripheral(s) at startup`, which is what lets it re-discover a board it was
connected to in the previous run.

---

## 3 · Nordic nRF54L15-DK - BLE peripheral device

Firmware is the interactive-menu build. The board offers the same options as the
PC/Pi device app, with the same numbering:

- `0` - BIST (PCC / ID / RW / EK / status byte) and print the TID
- `1` - Mutual Authentication, no fault injection
- `2` - Fault injection (CW: 2 bits, CW echo: 1 bit, RW: 1 bit)
- `3` - Fault injection, Error Management stress (CW: 3 bits, CW echo: 2 bits)
- `4` - FW Verification with the correct RW (expect `FW_OK`; saves `RW_verify`)
- `5` - FW Verification with a wrong RW (expect `FW_NOK`)
- `6` - Installation - request install authorization (run `4` first)

There is no `7` (Exit) - a board has nothing to exit to. Options `1`-`3` are also
what TrustBridge selects with `{"mode":N}` when it triggers the board remotely.

### Prerequisites - Nordic toolchain (one-time per machine)

The build uses **west** (Zephyr's meta-build tool) driving the **nRF Connect SDK
(NCS)**, compiled by the **Zephyr SDK** (GCC + CMake + Ninja). The easiest, and
the layout `flash_device.ps1` expects, is to let Nordic's **Toolchain Manager**
install all of it bundled together. Do this once:

1. **Install the NCS + toolchain via the Toolchain Manager.** Either:
   - **nRF Connect for VS Code** (recommended): install the *nRF Connect for VS
     Code Extension Pack*, then in the nRF Connect side-panel: **Install
     Toolchain** → then **Manage SDKs → Install SDK** and pick the version the
     app targets (**`v3.3.0`**), *or*
   - **nRF Connect for Desktop → Toolchain Manager** app: install SDK `v3.3.0`.

   Either path produces the Toolchain-Manager layout the script reads:
   ```
   <NCS_ROOT>/
     toolchains/toolchains.json     # version → toolchain map (script reads this)
     toolchains/<hash>/             # bundled west, Zephyr SDK, GCC, CMake, Ninja, python
     v3.3.0/.west/                  # the west workspace (Zephyr + NCS modules)
   ```
   > Bundled means you do **not** separately `pip install west` or install a
   > standalone Zephyr SDK - it's all inside `toolchains/<hash>`. Install the
   > **same NCS version the app targets** (`v3.3.0`); for another version pass
   > `-NcsVersion` and install that one.

2. **`nrfutil` + its `device` command** (used to flash/reset the board):
   **Toolchain Manager users: skip this - nothing to install.** The toolchain
   bundle ships `nrfutil` with the `device` command pre-installed
   (`<NCS_ROOT>\toolchains\<hash>\nrfutil\bin`), and `flash_device.ps1` puts it
   on PATH automatically. Only needed for a **standalone** nrfutil setup:
   - Download the `nrfutil.exe` binary from Nordic's **nRF Util** product page,
     put it in a folder on your PATH, then in any PowerShell window:
     ```powershell
     nrfutil install device        # fetches the subcommand into your profile
     nrfutil device --version      # verify
     ```

3. **Install the SEGGER J-Link / USB drivers** (the DK's onboard debugger - needed
   to program and to expose the COM/serial port). These come with nRF Connect for
   Desktop / the J-Link installer. On some kits (e.g. the nRF9151-DK) you may need
   SEGGER's **legacy USB (kernel) J-Link driver** rather than the driverless
   WinUSB mode - run SEGGER's `InstDrivers.exe` if the board doesn't program or no
   COM port appears.

4. **Verify the environment is discoverable** (before flashing):
   ```powershell
   Test-Path "$env:NCS_ROOT\toolchains\toolchains.json"   # or your NCS root
   .\flash_device.ps1 -NoFlash                            # should build cleanly
   ```
   (`flash_device.ps1` finds `west` and `nrfutil` inside the toolchain bundle -
   neither needs to be on your PATH beforehand.)

> Prefer a **manual / standalone** setup (`pip install west` + `west init/update`
> + a separately-installed Zephyr SDK)? That layout has **no `toolchains.json`**,
> so `flash_device.ps1` won't auto-discover it - you'd set the Zephyr env and run
> `west build`/`west flash` yourself (see Zephyr's *Getting Started Guide*), or
> ask for the PATH-`west` fallback to be added to the script.

Official references:
- nRF Connect SDK install & VS Code: <https://docs.nordicsemi.com/> (search "Installing the nRF Connect SDK")
- nRF Connect for Desktop: <https://www.nordicsemi.com/Products/Development-tools/nRF-Connect-for-Desktop>
- nRF Util: <https://www.nordicsemi.com/Products/Development-tools/nRF-Util>

### Portable build + flash (recommended)

Use `flash_device.ps1` (Windows) or `flash_device.sh` (Linux/macOS), both in
this folder. They auto-discover the NCS install and the version-matched
toolchain from `toolchains/toolchains.json` - **no hardcoded toolchain hash,
drive letters, or COM ports** - so they run unchanged on any machine with NCS
installed via the Toolchain Manager or the VS Code extension.

```powershell
cd PoC_SDK_v3\poc_sdk_device_nrf

.\flash_device.ps1              # build (pristine) + flash + reset
.\flash_device.ps1 -Monitor     # ...then open the serial monitor on the auto-detected port
```

Common overrides (all optional):

| Need | Flag / env |
|------|-----------|
| NCS installed elsewhere | `$env:NCS_ROOT="C:\ncs"` or `-NcsRoot C:\ncs` |
| Different NCS version | `-NcsVersion v2.9.0` |
| Different board | `-Board nrf54l15dk/nrf54l15/cpuapp` |
| Build without flashing | `-NoFlash` |
| More than one board attached | `-Snr <jlink-serial>` |
| Force a specific serial port | `-Port COM5` |

Linux/macOS: same flags with dashes - `./flash_device.sh --monitor`,
`--no-flash`, `--snr <serial>`, `--port /dev/ttyACM1`, `--ncs-root ~/ncs`.
Linux one-time extras: SEGGER J-Link package + nrf-udev rules
(<https://github.com/NordicSemiconductor/nrf-udev>), user in `dialout`.

The script prints the resolved root/toolchain/board so you can confirm what it
picked. It flashes with `chip_erase_mode=ERASE_ALL` and resets, exactly as the
manual steps below.

### Serial terminal

Interact over the **J-Link CDC UART @ 115200** with a terminal that can **send
keystrokes** - PuTTY, VS Code Serial Monitor (with a send box), or `miniterm`.
`-Monitor` opens one automatically; otherwise:

```powershell
python -m serial.tools.miniterm COM3 115200   # your port may differ (COM5, …)
```

The board prints its banner, BIST/TID, then the menu.

<details>
<summary>Manual build + flash (fallback, machine-specific paths)</summary>

```powershell
$Toolchain = "D:\SDK\Nordic\Nordic\ncs\toolchains\936afb6332"   # <- hash differs per machine
$env:PATH = "$Toolchain\mingw64\bin;$Toolchain\bin;$Toolchain\opt\bin;$Toolchain\opt\bin\Scripts;$Toolchain\nrfutil\bin;$Toolchain\opt\zephyr-sdk\arm-zephyr-eabi\bin;$env:PATH"
$env:ZEPHYR_TOOLCHAIN_VARIANT = "zephyr"; $env:ZEPHYR_SDK_INSTALL_DIR = "$Toolchain\opt\zephyr-sdk"
$env:WEST_PYTHON = "$Toolchain\opt\bin\python.exe"
cd D:\SDK\Nordic\Nordic\ncs\v3.3.0
$west = "$Toolchain\opt\bin\Scripts\west.exe"

& $west build -p always -b nrf54l15dk/nrf54l15/cpuapp `
    -d D:\SDK\Nordic\Nordic\build\poc_sdk_device_nrf `
    D:\SDK\Nordic\sandgrain-sdk\PoC_SDK_v3\poc_sdk_device_nrf

& "$env:USERPROFILE\.nordic\bin\nrfutil.exe" device program `
    --firmware D:\SDK\Nordic\Nordic\build\poc_sdk_device_nrf\merged.hex `
    --options chip_erase_mode=ERASE_ALL
& "$env:USERPROFILE\.nordic\bin\nrfutil.exe" device reset
```
</details>

---

## 4 · Run order & the demo moment

1. **Laptop cloud up** (step 1); board's **TID enrolled** in TrustBridge.
2. **Pi gateway running** (step 2) - it's scanning for `SandGrain-Dev`.
3. **Power/flash the board** (step 3) - it advertises; the gateway connects and
   subscribes to NUS TX (gateway log shows the connection; board log shows the
   central subscribed).
4. Start the authentication either way:
   - **From the board**: on its COM3 terminal, press **`1`** → **Mutual
     Authentication** (or `2`/`3` for the fault-injection variants).
   - **From TrustBridge** (no keystroke): trigger the device flow in the
     frontend. The board has no MQTT client, so the gateway subscribes to
     `sandgrain/v1/<tid>/cmd/run_auth` on its behalf and relays the trigger over
     BLE - gateway logs `RUN_AUTH mode 1 -> SandGrain-Dev`, board logs
     `[BLE] RUN_AUTH from gateway (mode 1)` and authenticates on its own. The
     `mode` in the trigger picks the same 1/2/3 as the menu. This works for any
     BLE device, not just the board: the Pi device build asks for the same relay
     whenever it is not running its own MQTT listener.
5. Watch it flow:
   - **Board COM3**: CW received → RW computed → `AUT_OK` → Phase 2 → `Mutual Authentication OK`.
   - **Pi gateway**: `[CH0][1/6] Auth request received …` → CW from CR → RW → done.
   - **TrustBridge frontend**: **auth OK** and **claim OK** for the device.

A first-time (unclaimed) chip answers `CLAIM_TOKEN` instead of `AUTH_OK`. On the
TrustBridge-triggered path the board waits for the claim to settle and
re-authenticates by itself (4 passes, 3 s apart) so enrollment completes without
anyone touching the terminal; the menu path stays a single deliberate pass.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Gateway never finds the board | Board not advertising (re-flash/power); `rfkill unblock bluetooth`; run gateway with `sudo`. |
| Gateway BLE scan/connect permission error | `sudo -E ./test_gw` or `setcap cap_net_raw,cap_net_admin+eip ./test_gw`. |
| Gateway can't reach broker/BE | Wrong `<LAPTOP_IP>`, or laptop firewall blocking `1883`/`3000`. Test: `mosquitto_pub -h <LAPTOP_IP> -p 1883 -t sandgrain/ping -m up`. |
| Pressing `1` does nothing | COM3 open in a **passive log** monitor - use an interactive terminal (PuTTY / miniterm) that sends keystrokes. |
| `1` reports link not ready | Connect the gateway (and confirm the subscribe) **before** choosing `1`. |
| Auth fails at cloud | Board TID not enrolled/whitelisted in TrustBridge, or broker creds mismatch (`MQTT_USER`/`MQTT_PASS`). |
| Can't flash - COM3 busy | Close the serial monitor before `west`/`nrfutil program`. |
| Board stays Offline in TrustBridge although the gateway says `link ready` | Its HELLO was not proxied. The gateway should log `HELLO from ... (marking online...)` and `[PRESENCE] ... -> online`. If not, the board could not read its TID - press `0` on it. |
| TrustBridge trigger does nothing | Check the gateway logged `(marking online, trigger proxy requested)` and `[TRIGGER] ... subscribed to ...`. If the subscribe is missing, the board is stale firmware - pull and reflash. |
| Every attempt fails with `[MW] [ERROR] Failed to connect to GW`, though the gateway says the link is ready | Stale board firmware from before the device SDK moved to an application-supplied transport. Pull and reflash. |
| Board menu shows only `0` and `1` | Same cause as above - old firmware. Pull and reflash. |
| Installation (`6`) denied with `missing_or_expired_fw_verification` | Run `4` immediately before `6`, with no `5` in between - option `5` deliberately records a failed verification in the cloud. |
| Link drops every 20-30 s, or the gateway logs `failed to subscribe to NUS TX` | Diagnose with `sudo btmon \| grep -iE "Disconnect\|reason\|Encryption\|SMP"` and read the reason: `Connection Timeout (0x08)` is radio trouble (suspect 2.4 GHz Wi-Fi coexistence on the Pi - try Ethernet); `Authentication Failure (0x05)` with `Insufficient Encryption` is a Linux peripheral problem and does not apply to a board. |
| Gateway crashes with `g_object_unref: assertion 'G_IS_OBJECT (object)' failed` and a segfault | Known gattlib fault, triggered when connect or subscribe keeps timing out. Fix the underlying disconnect cause and it stops; restart the gateway. |

## Notes

- Auth frames are single-line JSON `< ~130 B`, one per NUS packet at MTU 247;
  `OPEN`/`CLOSE` control lines bracket each auth session.
- Two more control lines carry the TrustBridge integration: the board sends
  `HELLO <tid> TRIGGER` on every link-up (the gateway turns it into the retained
  `.../status` = `online` and subscribes to that TID's `cmd/run_auth`), and the
  gateway sends back `RUN_AUTH <mode>` when a trigger arrives. Neither reaches
  the auth state machine on either side.
- The BLE link is persistent across Phase 1/Phase 2 and repeated auths; the
  gateway auto-reconnects if the link drops.
- If a link dies mid-authentication, the board ends that run with a
  communication error rather than waiting for a verdict that can no longer
  arrive. Trigger again once the link is back. Note that TrustBridge may still
  show the attempt as complete: the gateway reports progress over MQTT,
  independently of the BLE link, so the cloud can finish an enrollment the
  board never heard about.
- Fault injection (`2` and `3`) is applied by the transport as frames pass
  through it. Look for `[FAULT]` lines when running those options - without
  them nothing was corrupted and the result means nothing.
- This is the relay-free path - no `ble_tcp_relay.py`, no laptop Bluetooth
  needed. The laptop only runs Docker; all BLE happens between the board and the Pi.
