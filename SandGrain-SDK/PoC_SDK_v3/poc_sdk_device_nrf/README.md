# poc_sdk_device_nrf — SandGrain device SDK on the nRF54L15-DK (mutual auth over BLE)

Runs the **real** device-side SandGrain flow (`SGR_SDK_Authenticate_Via_GW` —
the full Challenge-Word / Response-Word mutual authentication) on the board,
with the device↔gateway link carried over **Bluetooth LE** instead of TCP.
The gateway and the TrustBridge cloud run **unmodified**.

```
 Board (this app)                Laptop                         Laptop / Docker
 ┌───────────────┐   BLE NUS    ┌──────────────────┐  TCP:8080  ┌───────────┐  MQTT  ┌────────────┐
 │ device SDK     │◀───────────▶│ ble_tcp_relay.py │◀──────────▶│  gateway  │◀──────▶│ TrustBridge│
 │ + SGT1001(SPI) │  (NUS RX/TX)│ (transparent pipe)│           │ (poc_sdk_  │        │  + mosq.   │
 └───────────────┘             └──────────────────┘           │  gateway)  │        │  (Docker)  │
                                                               └───────────┘        └────────────┘
```

## Why this works
The device↔gateway protocol is a small **single-line JSON** byte stream over the
SDK's `port_comm_*` interface (auth request → CW → RW → result). This app
replaces the TCP `port_comm.c` with a **BLE NUS** `port_comm.c`; everything else
in the SDK is reused as-is (DEVICE_MODE). The relay is a dumb byte pipe, so the
gateway still thinks it's talking TCP to a device. See the repo memory
`sandgrain-transport-topology` for the full transport map.

## Layout
```
poc_sdk_device_nrf/
  CMakeLists.txt                       # pulls in ../poc_sdk_device/sdk_fw sources (DEVICE_MODE)
  prj.conf                             # BLE peripheral + NUS + SPI + console, MTU 247
  boards/nrf54l15dk_nrf54l15_cpuapp.overlay   # sgt1001 on &spi22, console on uart30
  dts/bindings/zephyr,sgt1001.yaml
  src/main.c                           # init → BIST/TID → wait for relay → auth loop
  src/ports/port_spi.c                 # SGT1001 over Zephyr spi_transceive_dt
  src/ports/port_comm.c                # device↔gateway over BLE NUS (+ BLE link mgmt)
  src/ports/port_delay.c , port_random.c
  src/ports/app_ble.h , mosquitto.h    # BLE hooks; mosquitto.h is a compile stub
  relay/ble_tcp_relay.py               # laptop BLE↔TCP bridge (needs: pip install bleak)
```

## Build & flash (board)
From a normal PowerShell window (uses the same NCS toolchain as the rest of the project):

```powershell
$Toolchain = "D:\SDK\Nordic\Nordic\ncs\toolchains\936afb6332"
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

The board prints its banner, BIST/TID, then `Waiting for the relay ...` on
**COM3 @ 115200**.

## Run the end-to-end demo
1. **Cloud** (Docker): mosquitto + TrustBridge already running.
2. **Gateway**: build & run `poc_sdk_gateway` (listens on TCP `127.0.0.1:8080`,
   talks MQTT to the cloud). Make sure the board's TID is enrolled/whitelisted
   in TrustBridge.
3. **Relay** (laptop, BLE radio on):
   ```powershell
   cd D:\SDK\Nordic\sandgrain-sdk\PoC_SDK_v3\poc_sdk_device_nrf\relay
   python ble_tcp_relay.py            # --host/--port if the gateway isn't 127.0.0.1:8080
   ```
4. Watch: board COM3 shows the CW/RW exchange and `Mutual Authentication OK`;
   the relay prints each `board->gw` / `gw->board` frame; the gateway logs the
   flow and the cloud renders the verdict.

> COM3 is shared — close any serial monitor before flashing, and the relay uses
> the BLE radio (not COM3), so you can keep a serial monitor open while it runs.

## Interactive menu vs. auto-auth loop
Controlled by `CONFIG_SANDGRAIN_INTERACTIVE_MENU` in `prj.conf` (default **y**):

- **`y` — interactive menu (default).** The board shows a menu on the COM port:
  `0` = BIST (print TID), `1` = Mutual Authentication. Auth runs over BLE exactly
  as in the auto mode. You must open COM3 with an **interactive serial terminal
  that can send keystrokes** — PuTTY, `screen`, VS Code Serial Monitor (send box),
  or `python -m serial.tools.miniterm COM3 115200` — not a passive log monitor.
  Connect the relay/gateway *before* choosing `1` (it checks the link is up).
- **`n` — auto loop.** Original behaviour: wait for the relay/gateway link, then
  authenticate automatically every ~10 s (good for unattended soak tests).

The menu uses Zephyr's console input subsystem (`CONFIG_CONSOLE_SUBSYS` +
`CONFIG_CONSOLE_GETCHAR`, set in `prj.conf`). The same firmware works with both
the laptop relay and the direct BLE gateway.

## Notes / limitations
- Frames are small (< ~130 B) so each fits one NUS packet at MTU 247. The relay
  re-frames the gateway's TCP stream into complete JSON objects by brace
  counting; the board frames board→relay messages with newlines.
- `OPEN`/`CLOSE` control lines map the device's per-auth connection lifecycle
  onto the relay's TCP connect/close, mirroring the PC device exactly.
- Phase-2 / fault-injection menu options from the PC `main_device.c` are not
  wired here — this app drives a clean mutual auth on a loop.
