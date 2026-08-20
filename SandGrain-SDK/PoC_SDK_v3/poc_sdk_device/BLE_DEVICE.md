# BLE_DEVICE.md — Raspberry Pi as the SandGrain BLE device

The Raspberry Pi replaces the nRF54L15 board as the **BLE peripheral/device**.
It advertises the Nordic UART Service (NUS) as **`SandGrain-Dev`** — the exact
wire contract of the board — so the gateway (BLE central, branch
`gateway-ble-central`) and the TrustBridge cloud run **unchanged** and cannot
tell the difference.

**Branch: `pi-ble-device`.** Verified end-to-end on hardware (2026-07-03):
full mutual authentication (Phase 1 + Phase 2), Pi device ↔ Pi gateway over
BLE ↔ TrustBridge cloud over MQTT, SGT1001 crypto chip on the device Pi.

---

## 1. Architecture

```
┌────────────────────────┐   BLE (NUS)    ┌──────────────────────┐   MQTT    ┌────────────┐
│ DEVICE Pi              │ ─────────────► │ GATEWAY Pi           │ ────────► │ TrustBridge│
│ test_device DEV_BLE=1  │  SandGrain-Dev │ test_gw GW_BLE=1     │           │ cloud (PC) │
│ + SGT1001 /dev/ttyACM0 │ ◄───────────── │ (gattlib central,    │ ◄──────── │            │
│ (BlueZ GATT server)    │                │  unchanged)          │           │            │
└────────────────────────┘                └──────────────────────┘           └────────────┘
```

- **Wire contract** (identical to the nRF board): advertise `SandGrain-Dev` +
  service `6e400001-b5a3-f393-e0a9-e50e24dcca9e`; TX char `6e400003…` (notify,
  device→gw); RX char `6e400002…` (write, gw→device). Newline-framed
  single-line JSON, `OPEN`/`CLOSE` session markers.
- **Transport implementation**: `app/port/port_comm_ble.c`, selected with
  `make DEV_BLE=1` (drop-in replacement for the TCP `port_comm.c`; mirrors the
  gateway's `GW_BLE=1`). gattlib is central-only, so the peripheral side is a
  hand-rolled **BlueZ GATT server over D-Bus** (GLib/GIO): `RegisterApplication`
  + `RegisterAdvertisement`, notifications via `PropertiesChanged`. The BLE
  stack runs on a background GLib thread started from a constructor, so
  `main_device.c` is untouched.
- **Standalone smoke tool**: `tools/ble_peripheral/nus_peripheral.c` — the same
  GATT server without the SDK. Use it to prove the link before involving the
  SDK.
- **Crypto chip**: SGT1001 as USB dongle on `/dev/ttyACM0` — the existing
  `port_spi_usb.c` works as-is.

## 2. Setup

On the device Pi, from the repo root (`pi-ble-device` branch):

```bash
cd PoC_SDK_v3/poc_sdk_device
chmod +x scripts/pi_device_ble_setup.sh
./scripts/pi_device_ble_setup.sh
```

The script installs deps (GLib/GIO, libmosquitto, BlueZ), applies the system
quirks from section 4, builds `nus_peripheral` and `test_device` (DEV_BLE=1),
grants them `cap_net_raw,cap_net_admin`, and adds you to `dialout` for the
crypto dongle.

> **Copying the repo from Windows?** Use `git archive` on the PC —
> `git archive --format=tar.gz -o sdk.tar.gz pi-ble-device` — and extract on
> the Pi. A raw copy of a Windows checkout carries CRLF line endings that
> break Makefiles and shell scripts.

## 3. Running

Order matters: **device first, gateway second** (the gateway's scan wedges if
it starts with nothing advertising).

1. **Device Pi:** `cd app && ./test_device`
   Wait for: `[COMM_BLE] advertising as 'SandGrain-Dev' (kernel mgmt fallback)`
   (~4 s after start; the fallback message is normal — see quirk 2).
2. **Gateway Pi:** `./run_ble_gateway.sh`
   Expect: `found SandGrain-Dev` → `connected to , subscribed to NUS — link ready`.
   The device prints `central subscribed — link ready`.
3. **Device menu:** choose `1` (Mutual Authentication). Expected finale:
   `HRW_token == HRW_cloud — MUTUAL AUTH OK ✔`.

The whole menu works over BLE, not just option `1`. The fault-injection options
`2` and `3` flip bits in the JSON frames on their way through the transport;
that happens in `port_comm.c` for the TCP build, so the BLE port calls the same
`fi_apply_tx_frame` / `fi_apply_rx_frame` helpers (`fault_injection/fi_device.c`)
— otherwise those options would authenticate cleanly and look like a pass.

### TrustBridge-triggered auth without an MQTT client

This device can also be driven from TrustBridge over BLE alone, with no broker
connection of its own. On link-up it announces `HELLO <tid> TRIGGER`; the gateway
subscribes to `sandgrain/v1/<tid>/cmd/run_auth` on its behalf and relays what
arrives as a `RUN_AUTH <mode>` line, which runs the same path the `--listen`
trigger would. `mode` picks the same 1/2/3 as the menu.

The flag is decided at startup: **off** when this device's own MQTT listener came
up (`--listen` / `RUN_MODE=listener`), because both paths firing would
authenticate it twice for one request, and **on** otherwise — which is the
interesting case, since it is the same shape a real IP-less device has. Force it
either way with `BLE_TRIGGER_PROXY=1` or `BLE_TRIGGER_PROXY=0`.

Expect on the device: `sent HELLO (presence + trigger proxy) for TID ...` then,
when triggered, `RUN_AUTH from gateway (mode 1) - TrustBridge trigger`.

If the BLE link drops mid-authentication the run ends with a communication
error (`link lost mid-session - aborting this exchange`) rather than waiting for
a reply that can never arrive — the gateway unbinds its channel on disconnect,
so there is no session left to resume. Just trigger again once the link is back.

Environment knobs (device): `BLE_WAIT_MS` — how long `port_comm_init` waits
for the central to subscribe (default 60000 ms, `0` = forever); `HCI` — adapter
override (e.g. `hci1`); `BLE_NAME` — advertised name override (default
`SandGrain-Dev`, max 29 bytes). Use e.g. `BLE_NAME=SandGrain-Dev2 ./test_device`
when running alongside the nRF board against a **multi-device gateway**
(branch `multi-ble-gateway`, `make GW_BLE=1 GW_BLE_DEVICES=2` — it accepts any
name starting with `SandGrain-Dev`).

Benign log noise on the gateway (do not chase): empty name in
`connected to ,` and one `'SandGrain-Dev' not found in scan` *after*
link-ready.

**Ctrl-C is a clean shutdown**: `test_device` catches SIGINT/SIGTERM and tears
down what would otherwise outlive the process — removes the advertising
instance (kernel-owned when the mgmt fallback registered it), disconnects the
central, unregisters the GATT app — so back-to-back reruns no longer need a
`systemctl restart bluetooth` in between. A second Ctrl-C force-quits. The
restart ritual still applies after a crash/`kill -9` or any weirdness.

## 4. The quirk ladder (why peripheral mode needs system prep)

Every one of these was hit on real hardware (Pi OS Trixie, kernel 6.18,
BlueZ 5.82) and every one is required. The setup script applies 1–3; 4–5 are
built into the binaries.

| # | Symptom | Cause | Fix |
|---|---------|-------|-----|
| 1 | Adapter won't power on | Bluetooth soft-blocked at boot | `sudo rfkill unblock bluetooth` |
| 2 | `RegisterAdvertisement` always fails; journal shows `Invalid Parameters (0x0d)` | Kernel rejects bluetoothd's `Add Extended Advertising Data (0x0055)` (both Pis — systemic) | Binaries fall back to the **legacy kernel mgmt `Add Advertising (0x003e)`** over the HCI control socket after 3 D-Bus failures (what `btmgmt add-adv` uses). Needs `CAP_NET_ADMIN` |
| 3 | Gateway sees the advert but connections never arrive | Adapter not connectable | The mgmt fallback also issues `Set Connectable`; manual: `sudo btmgmt connectable on` |
| 4 | Gateway "connects" then pairing fails / device vanishes; btmon shows **BR/EDR `Create Connection`** | Dual-mode adapter ⇒ advert lacks "BR/EDR Not Supported" ⇒ central picks classic Bluetooth | `ControllerMode = le` in `/etc/bluetooth/main.conf` (device Pi), restart bluetooth |
| 5 | Gateway: `failed to subscribe to NUS TX`; btmon shows `Insufficient Encryption (0x0f)` on char `7772e5db…` then `Pairing Failed` | **PipeWire/WirePlumber** register an encrypted BLE-MIDI GATT service (`03b80e5a…`) that derails the central's service discovery | `systemctl --user mask --now wireplumber pipewire pipewire-pulse pipewire.socket pipewire-pulse.socket`. Note: `bluetoothd --noplugin=midi` is NOT the owner, and the wireplumber `bluez5.enable-midi=false` drop-in did not stick (units enabled in global scope) |

Bonus (code-level, already fixed in `port_comm_ble.c`): GLib sources for the
BLE thread must be attached to its **private `ble_ctx`** — `g_timeout_add()`
targets the global default context, which nothing in `test_device` iterates,
so callbacks scheduled with it silently never fire.

## 5. Recovery recipe — gateway stuck at `found SandGrain-Dev`

Seen after repeated failed attempts or reboots: the gateway prints `found` but
never `connected`, and **btmon on the device Pi shows no incoming connection
at all** (the "found" came from the gateway's stale cache). Reset both stacks:

```bash
# BOTH Pis:
sudo systemctl restart bluetooth

# Gateway Pi only (MAC = device Pi's adapter):
bluetoothctl remove 88:A2:9E:CD:8A:20

# Then restart the programs: device first, gateway second.
```

Persistent `scan failed (rc=268476708)` spam on the gateway was a gattlib
discovery-session leak, fixed in the gateway transport (non-blocking scan +
explicit stop — see BLE_GATEWAY.md). On a pre-fix binary, restarting
`test_gw` clears it.

### PipeWire came back (quirk #5 resurrects)

Seen on real hardware (2026-07-06) despite the units having been masked earlier:
connections to the Pi device die **within seconds**; gateway logs
`failed to subscribe to NUS TX`; btmon on either side shows the BLE-MIDI
service `03b80e5a…` back in the GATT table, `Insufficient Encryption (0x0f)`
on its characteristic, `SMP Pairing Failed`, then
`Disconnect Complete — Reason: Authentication Failure (0x05)`.

Fix: re-apply the mask (or just re-run `scripts/pi_device_ble_setup.sh`, which
re-asserts it):
```bash
systemctl --user mask --now wireplumber pipewire pipewire-pulse \
                           pipewire.socket pipewire-pulse.socket
sudo systemctl restart bluetooth
# then restart test_device
```

### bluetoothd restarts are survived automatically

The GATT application registration lives in bluetoothd and dies with it, while
the advertising instance is kernel-owned and survives. Historically that made
a bluetoothd restart under a running `test_device` leave a zombie advertiser —
centrals kept connecting but found no NUS service — hence the old rule
"restart bluetooth first, start test_device second". `test_device` now
watches the `org.bluez` bus name and re-registers by itself when bluetoothd
comes back:

```
[COMM_BLE] bluetoothd went away — GATT registration lost, waiting for it to return
[COMM_BLE] bluetoothd is up — registering GATT application
[COMM_BLE] GATT application registered
[COMM_BLE] advertising as 'SandGrain-Dev2' (kernel mgmt fallback)
```

An auth in flight at the moment of the restart fails (its connection drops
with bluetoothd); the gateway rebinds on its own and the next round works.

## 6. Files

| Path | Role |
|------|------|
| `app/port/port_comm_ble.c` | SDK BLE transport (peripheral), `make DEV_BLE=1` |
| `app/Makefile` | `DEV_BLE=1` swaps `port_comm.c` → `port_comm_ble.c`, links GIO |
| `tools/ble_peripheral/nus_peripheral.c` | Standalone echo peripheral (link smoke test) |
| `scripts/pi_device_ble_setup.sh` | Deps + quirks + build, idempotent |
| `../poc_sdk_gateway/BLE_GATEWAY.md` | Gateway-side (central) counterpart |
