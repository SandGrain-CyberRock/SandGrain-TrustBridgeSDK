# Gateway over Bluetooth LE (no relay)

This builds the gateway so it talks to the nRF54L15 board **directly over BLE**,
acting as the BLE central. It replaces the TCP server (`port_comm_device.c`) with
a BlueZ/gattlib transport (`port_comm_device_ble.c`). The board firmware and the
gateway↔cloud (MQTT) path are **unchanged** — only the gateway's device-facing
transport changes, and the laptop relay disappears entirely.

```
 Board (nRF54L15)            Raspberry Pi / Linux gateway              Cloud
 ┌──────────────┐   BLE NUS  ┌────────────────────────────┐   MQTT   ┌──────────┐
 │ device SDK    │◀─────────▶│ test_gw (GW_BLE) — BLE       │◀───────▶│ mosquitto│
 │ + SGT1001     │           │ central + cloud uplink       │         │ + CR/BE  │
 └──────────────┘           └────────────────────────────┘         └──────────┘
```

> **Hardware requirement:** the gateway must run on a host with a real Bluetooth
> adapter and a running `bluetoothd` (Raspberry Pi, or any Linux box/laptop).
> This does **not** work under WSL2 — WSL2 has no Bluetooth access, which is the
> whole reason the relay existed.

## 1. Install dependencies (Raspberry Pi OS / Debian / Ubuntu)
```bash
sudo apt update
sudo apt install -y build-essential pkg-config \
                    libbluetooth-dev libglib2.0-dev libdbus-1-dev \
                    bluez libmosquitto-dev

# gattlib is not in apt. This code targets the current (DBus) gattlib API
# (gattlib_mainloop + async gattlib_connect), built from source at a PINNED
# commit. The setup script (scripts/pi_ble_gateway_setup.sh) does this for you:
#   GATTLIB_REF=1580056bce260f0d8ad7ccc8b105c34057cd1fbd  (labapart/gattlib)
# Manual equivalent:
#   git clone https://github.com/labapart/gattlib && cd gattlib
#   git checkout 1580056bce260f0d8ad7ccc8b105c34057cd1fbd
#   mkdir build && cd build && cmake .. && make && sudo make install && sudo ldconfig
```

Verify pkg-config can see gattlib (the Makefile uses it):
```bash
pkg-config --exists gattlib glib-2.0 && echo OK || echo "set PKG_CONFIG_PATH"
# if installed under /usr/local: export PKG_CONFIG_PATH=/usr/local/lib/pkgconfig
```

Make sure Bluetooth is up:
```bash
sudo systemctl status bluetooth     # bluetoothd running
rfkill unblock bluetooth
hciconfig hci0 up                   # adapter up (or: bluetoothctl power on)
```

## 2. Build
```bash
cd PoC_SDK_v3/poc_sdk_gateway/app
make clean
make GW_BLE=1
```
This compiles `port_comm_device_ble.c` (instead of the TCP `port_comm_device.c`)
and links `gattlib` + `glib-2.0` + `pthread`.
(Plain `make` still builds the original TCP gateway.)

### Multiple BLE devices (branch `multi-ble-gateway`)
**Hardware-verified 2026-07-06**: nRF54L15 board + Pi device against one Pi
gateway, interleaved `[CH0]`/`[CH1]` Phase 1 + Phase 2 flows, both `AUTH_OK`,
stable across repeated rounds.

The BLE central serves **one peripheral per gateway channel**. `GW_BLE_DEVICES`
sets the channel count at build time (default **2** — e.g. one nRF board + one
Pi device):
```bash
make GW_BLE=1 GW_BLE_DEVICES=2
```
- Peripherals are matched by advertised-name **prefix** `SandGrain-Dev`
  (override at runtime with env `BLE_TARGET_PREFIX`), so `SandGrain-Dev`
  (board) and `SandGrain-Dev2` (Pi, via its `BLE_NAME` env) both qualify.
- A discovered peripheral binds to the first free channel; one MAC is never
  bound to two channels. Identical names still work (binding is by MAC), but
  distinct names make logs readable.
- Auth flows on different channels run **concurrently** — the middleware keeps
  per-channel FSM state and each cloud flow uses its own MQTT client.
- With fewer devices present than channels, the spare channels just keep
  re-scanning; that's harmless.

### Raising the device count

`GW_BLE_DEVICES` is a build-time knob: one BLE connection (gateway channel)
per device. To serve three devices, rebuild with:

```bash
make clean && make GW_BLE=1 GW_BLE_DEVICES=3
```

Nothing else changes - the middleware initializes one channel per device and
each channel runs its own auth flow with its own MQTT client. Practical
limits: every extra channel is another concurrent BLE connection on the Pi's
adapter (fine for a handful of devices), and every device's TID must be
enrolled in TrustBridge and present in the gateway's whitelist file.

### Two Nordic boards (instead of board + Pi)

Works with no code changes. Binding is by MAC address, not by name: the
first scan discovers both boards, queues both, and binds one per channel.
Both boards can keep the identical default name `SandGrain-Dev`.

Things to know:
- The logs will show the same name for both channels; only the MAC tells the
  boards apart. For readable logs, give the second board its own name by
  changing `CONFIG_BT_DEVICE_NAME` in `poc_sdk_device_nrf/prj.conf` (any name
  starting with `SandGrain-Dev`, e.g. `SandGrain-Dev3`) and re-flashing.
- Each board authenticates with the TID of its own SGT1001 chip, so both
  TIDs must be whitelisted in TrustBridge.
- Boards are the simple case: no PipeWire or bluetoothd quirks (their BLE
  stack is Zephyr, not BlueZ). Power them on and they advertise.
- All the recovery behavior (direct reconnect after a drop, cache eviction
  when a device stays gone) is per-MAC and applies to boards identically.

Implementation notes hard-won on hardware (already in `port_comm_device_ble.c`,
keep them if you rework it):
- Discovered candidates go into a **persistent queue** and are connected one at
  a time; a scan pass only runs when the queue is dry. bluetoothd caches a
  device after its first advertisement and does **not** re-report it in later
  scans, so any candidate you discard is lost until the cache is cleared.
- Never call `gattlib_adapter_scan_disable()` from inside the discovery
  callback (wedges discovery), and never `gattlib_disconnect()` from gattlib's
  callback thread (corrupts its bookkeeping → double free). Both are deferred
  to the BLE task thread.
- A channel stays `connecting` until its connect callback fully settles —
  freeing it early lets the next candidate bind onto the same channel.
- A dropped device is **reconnected directly, never re-scanned for**: once a
  peripheral has been connected, BlueZ marks it non-temporary — later
  advertisements only update the cached object and never surface as a new
  discovery (in gattlib a device is only reported while its internal state is
  NOT_FOUND). So the disconnect handler re-queues the MAC and
  `gattlib_connect` is issued against the cached object (works without a
  scan); only if the connect retries exhaust is the device **evicted from
  BlueZ's cache** (`Adapter1.RemoveDevice` — the `bluetoothctl remove`
  equivalent), which makes its next advertisement a fresh discovery again.
- **Connect events must be filtered.** gattlib reports a failed attempt both
  ways (error callback *and* error return from `gattlib_connect`), and every
  attempt leaves a watcher behind that can fire again — with success — when
  the device finally connects (observed: 4× "connected", 4 notification
  subscriptions, every frame quadrupled, auth wrecked). `prv_on_connect`
  ignores any event unless the channel is `connecting` to exactly that
  address, and the candidate queue rejects empty MACs.
- Scans use the **non-blocking** enable + our own sleep + `scan_disable` —
  never the blocking enable with gattlib's own timeout. At the pinned gattlib
  commit the timeout path never issues `StopDiscovery`, and `scan_disable()`
  skips `StopDiscovery` once its internal `is_scanning` flag is false; the
  leaked BlueZ discovery session then made **every** later `StartDiscovery`
  fail with `org.bluez.Error.InProgress` — an endless
  `scan failed (rc=268476708)` loop that could only be cleared by restarting
  `test_gw`.

If connections to the **Pi device** die within seconds (`failed to subscribe
to NUS TX`, btmon: `Insufficient Encryption` on `03b80e5a…` then
`Authentication Failure`): PipeWire's BLE-MIDI service is back on the device
Pi — see "PipeWire came back" in `../poc_sdk_device/BLE_DEVICE.md`.

## 3. Run
Set the same gateway env you already use (broker, BE), e.g. via `run_gateway.sh`
or directly:
```bash
export MQTT_BROKER=<broker-host>   MQTT_PORT=1883
export BE_URL=http://<be-host>:3000/api
# BLE GATT usually needs privileges; either run with sudo or grant caps once:
#   sudo setcap 'cap_net_raw,cap_net_admin+eip' ./test_gw
sudo -E ./test_gw
```

The gateway will:
1. Initialize, connect to MQTT/cloud as before.
2. Open the BLE adapter and **scan for `SandGrain-Dev`**, connect, and subscribe
   to the NUS TX characteristic (you'll see `[COMM_BLE]` logs if debug is on).
3. From then on it's identical to the TCP path: `[CH0][1/6] Auth request
   received …` → CW from CR → RW → `AUT_OK` → Phase 2 → done.

### End-to-end run order
1. Cloud + mosquitto up; every device's TID enrolled/whitelisted (as before).
2. **Power the board** so it advertises as `SandGrain-Dev` (the gateway keeps
   re-scanning, so order isn't strict — it connects whenever the board appears).
3. Multi-device: start the Pi device too — `BLE_NAME=SandGrain-Dev2 sudo -E
   ./test_device` (note `sudo -E`: plain `sudo` drops `BLE_NAME` and the names
   clash). Wait for its `advertising as 'SandGrain-Dev2'` line.
4. Start the gateway (`GW_BLE`) last. No relay, no Python — just the gateway.

## How it maps to the existing protocol
The board still frames messages exactly as before (newline-delimited, with
`OPEN`/`CLOSE` session markers). The BLE transport:
- subscribes to **NUS TX** (`6e400003…`) for board→gateway frames, reassembles
  newline-delimited lines into a queue;
- writes **NUS RX** (`6e400002…`) for gateway→board frames (`<json>\n`);
- **consumes `OPEN`/`CLOSE`** and surfaces them as NO_DATA, so the gateway's
  frame-type dispatch (type 4 = Phase 1, type 8 = Phase 2) sees only real frames
  — exactly as TCP connect/disconnect bracketed each request before.

The BLE link is persistent (kept across Phase 1/Phase 2 and repeated auths); a
background GLib-loop thread delivers notifications and auto-reconnects if the
link drops.

Two things about discovery are worth knowing, both consequences of how BlueZ
caches devices:

- **Startup eviction.** Once a peripheral has been connected, bluetoothd marks it
  non-temporary and never purges it, and gattlib reports a device to a scan only
  while its state is `NOT_FOUND` — so a restarted gateway could never re-discover
  the devices it was just talking to. At init the gateway removes the cached
  object for every *disconnected* peripheral matching the target prefix, which
  makes their next advertisement a fresh discovery. Connected devices are left
  alone; they belong to someone else.
- **Scan backoff.** Scans pause 2s → 5s → 10s → 30s → 60s after consecutive
  empty passes, resetting the moment anything is found. Without it a channel
  that will never be filled (`GW_BLE_DEVICES` higher than the number of devices
  present) holds the radio in a 6s-on/2s-off discovery cycle forever, which is
  enough to destabilise the links that are already up.

## MQTT proxy for BLE devices (`port/gw_presence.c`)
TrustBridge talks to devices over two MQTT topics that a board with no IP stack
can neither publish nor subscribe to. The gateway does both on its behalf, using
one mosquitto client per board (created the first time that board says HELLO):

- **Presence.** Retained `sandgrain/v1/<tid>/status` = `online`, with a retained
  `offline` Last Will, so the dashboard dot and the backend's auto-auth trigger
  behave exactly as for a native device. `offline` is also published when the
  BLE layer gives up reconnecting to that board.
- **Trigger.** Subscribes to `sandgrain/v1/<tid>/cmd/run_auth` and relays what
  arrives as a `RUN_AUTH <mode>` line on that board's NUS link. The board runs
  the authentication as if its menu key had been pressed, and the gateway's
  normal device-relay path publishes `gw_log` + `auth_result` — so TrustBridge
  can drive a BLE board with no backend changes at all.

Only devices that ask get the trigger proxy: the announcement is
`HELLO <tid> [TRIGGER]`. Any BLE device can ask — the nRF board always does, and
the Pi device build does whenever it has no MQTT listener of its own (override
with `BLE_TRIGGER_PROXY=1`/`0`). A device whose own listener is running omits the
flag, so one backend request never authenticates it twice. Retained
`cmd/run_auth` messages are ignored — they would be redelivered on every
subscribe, i.e. on every device or broker reconnect, and re-authenticate it each
time.

## Known iterate-on-hardware points
First build/run on real BT hardware may need a tweak — likely candidates:
- **gattlib API version.** This code targets the current (DBus) gattlib API and
  is **pinned** to commit `1580056bce260f0d8ad7ccc8b105c34057cd1fbd` in
  `scripts/pi_ble_gateway_setup.sh` — i.e. `gattlib_mainloop()` + asynchronous
  `gattlib_connect()` (connection delivered to a `gatt_connect_cb_t` callback),
  opaque `gattlib_adapter_t`/`gattlib_connection_t`. If you intentionally move to
  a different gattlib version and the API has shifted again, the spots to adjust
  are `prv_on_connect()`, `prv_scan()`/`prv_connect_next()` and `prv_ble_task()` in
  `port/port_comm_device_ble.c`. To reproduce the verified build, keep the pin.
- **Write thread-safety.** Writes happen on the gateway's main thread while the
  GLib loop runs on the BLE thread; they're mutex-guarded. If writes flake under
  load, marshal them onto the GLib thread (`g_idle_add`).
- **MTU.** The board negotiated a 247-byte MTU; gattlib should negotiate up. If
  frames look truncated, check the negotiated MTU.
- **No pairing needed** — the board exposes NUS openly, so no bonding step.
- **Permissions** — if scan/connect fail with permission errors, use `sudo` or
  `setcap` as above.
