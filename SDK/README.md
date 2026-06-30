# SandGrain SDK v3.3

End-to-end mutual-authentication SDK for IoT devices built around the
**SGT1001 CyberRock-Token** (immutable HMAC-SHA256 authentication IC).
This repository contains all three sides of the system needed to demo and
develop against the SandGrain platform.

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   sdk_device    │  ◄────► │   sdk_gateway   │  ◄────► │    sdk_cloud    │
│  Device + SGT   │  socket │   GW relay      │  MQTT   │   Python svc +  │
│  1001 chip      │  (TCP)  │   FSM + EM      │ (EMQX)  │   CyberRock API │
└─────────────────┘         └─────────────────┘         └─────────────────┘
   Phase 1: token RW (CW → RW)                Phase 2: host RW (HCW → HRW)
   Two-phase MUTUAL auth + bit-flip-tolerant Error Management
```

---

## Repository layout

| Path | What it is | More detail |
|------|-----------|-------------|
| `SDK_v3.3/sdk_device/` | Embedded reference app + portable SDK firmware for the **device** (the thing holding the SGT1001 chip). C, builds for Linux / Windows / MCU port. | [`SDK_v3.3/sdk_device/sdk_fw/README.md`](SDK_v3.3/sdk_device/sdk_fw/README.md) |
| `SDK_v3.3/sdk_gateway/` | Embedded reference app + portable SDK firmware for the **gateway** (relays device ↔ cloud over MQTT, runs the Error-Management state machine). | [`SDK_v3.3/sdk_gateway/sdk_fw/README.md`](SDK_v3.3/sdk_gateway/sdk_fw/README.md) |
| `SDK_v3.3/sdk_cloud/sandgrain_cloud_sdk/` | Pure-Python SDK (async, `aiohttp`) wrapping the SandGrain / CyberRock REST APIs. Transport-agnostic. | [`SDK_v3.3/sdk_cloud/sandgrain_cloud_sdk/README.md`](SDK_v3.3/sdk_cloud/sandgrain_cloud_sdk/README.md) |
| `SDK_v3.3/sdk_cloud/application_PoC_MQTT/` | Runnable Python service: MQTT broker client + dispatcher + `CloudSDK`. This is what the gateway talks to. | [`SDK_v3.3/sdk_cloud/application_PoC_MQTT/README.md`](SDK_v3.3/sdk_cloud/application_PoC_MQTT/README.md) |
| `SDK_v3.3/SGT1001_Datasheet.pdf` | Chip datasheet — SPI mode, opcodes, timing, BIST. | — |
| `SDK_v3.3/User Guide - SDK v3.pdf` | Full integration guide for the device-side SDK. | — |

---

## The two-phase authentication flow

| Phase | What proves what | Frames involved |
|-------|------------------|-----------------|
| **Phase 1** — Token → Cloud | Device proves it holds a legitimate SGT1001 by computing an RW for the cloud's challenge (CW). | `"4"` auth req, `"5"` CW / CW echo + RW, `"4"` AUT_OK/NOK |
| **Phase 2** — Cloud → Token | Cloud proves its identity by computing a host RW (HRW) that the device verifies locally. | `"8"` HCW + HRW |

If the device's CW echo differs from the gateway's issued CW by ≤ `CW_BITFLIP_THRESHOLD` bits (default 3), the gateway runs **Error Management**: builds CW candidates, asks the cloud `requestRW` for each, and accepts whichever recovers the device's RW within `RW_BITFLIP_THRESHOLD` bits.

---

## Quick start

Assumes Linux, `gcc`, `libmosquitto-dev`, a running MQTT broker, and a running
`SDK_v3.3/sdk_cloud/application_PoC_MQTT` connected to that broker.

```bash
# 1. Build the gateway
cd SDK_v3.3/sdk_gateway/app
make clean && make
./test_gw                     # listens on TCP for the device, talks MQTT to the cloud

# 2. Build the device (in another terminal)
cd SDK_v3.3/sdk_device/app
make clean && make            # default: TRANSPORT=usb
./test_device                 # interactive menu — pick 0 for BIST first
```

Menu options:

| # | Action |
|---|--------|
| 0 | BIST (Built-In Self-Test of the SGT1001) |
| 1 | Mutual auth — Phase 1 + Phase 2, no fault injection |
| 2 | Fault injection — CW: 2 bits / CW echo: 1 bit / RW: 1 bit (exercises Error Management; Phase 2 skipped) |
| 3 | Error-Management stress — CW echo: 3 bits total (Phase 2 skipped) |
| 4 | FW Verification (correct RW) |
| 5 | FW Verification (wrong RW — expect FW_NOK) |
| 6 | Installation (requires option 4 first) |
| 7 | Exit |

---

## Choosing the chip transport (USB vs SPI)

The device talks to the SGT1001 through a generic five-function port layer
(`sdk_fw/port/port_spi.h`). Two implementations ship in the box:

| `TRANSPORT=` | File | Wire | When to use |
|--------------|------|------|-------------|
| `usb` (default) | `app/port/port_spi_usb.c` | USB-CDC / USB-UART bridge — ASCII hex + `\r` | PC dev workflow with the SandGrain USB bridge board |
| `spi` | `app/port/port_spi_spidev.c` | Linux **native** SPI via `/dev/spidev` — binary, full-duplex | SBC (Raspberry Pi etc.) wired directly to the SGT1001 |

```bash
make                # default: TRANSPORT=usb (preserves the legacy bridge path)
make TRANSPORT=spi  # Linux native SPI (datasheet: Mode 0, fCLK ≤ 10 MHz, dedicated CSN)
```

Bad values are rejected by the Makefile, and `TRANSPORT=spi` on Windows
errors out (spidev is Linux-only).

### Native-SPI prerequisites (Raspberry Pi example)

1. **Wiring** (Pi 4 → SGT1001 SO-8):

   | Pi (BCM) | SGT1001 |
   |---|---|
   | GPIO10 / pin 19 — MOSI | pin 5 — MOSI |
   | GPIO9 / pin 21 — MISO | pin 2 — MISO |
   | GPIO11 / pin 23 — SCK | pin 6 — CLK |
   | GPIO8 / pin 24 — CE0 | pin 1 — CSN |
   | GND (pins 6, 14) | pins 4, 7 — VSS |
   | 3.3 V (pin 1) | pin 8 — VDD |

2. **Enable spidev:** `sudo raspi-config` → Interface Options → SPI → Enable → reboot.
   Verify with `ls /dev/spidev0.0`.

3. **Permissions** (so `./test_device` doesn't need sudo): `sudo usermod -aG spi $USER` then log out / back in.

4. **SPI parameters** (already locked in `config_poc.h` against the SGT1001 datasheet — change only if you wire to a different bus/CS):

   ```c
   SPI_DEVICE_PATH    "/dev/spidev0.0"
   SPI_MODE           0           // CPOL=0, CPHA=0
   SPI_MAX_HZ         10000000    // fCLK max per datasheet
   SPI_BITS_PER_WORD  8
   SPI_CS_MODE_HW     1           // kernel drives CSN
   ```

---

## Configuration — what you'll typically edit

All knobs live in **`app/config_poc.h`** of each binary (device and gateway).
Nothing under `sdk_fw/` should ever need to be edited for a normal integration.

| File | Knobs |
|------|-------|
| `SDK_v3.3/sdk_device/app/config_poc.h` | `SERVER_IP`, `PORT` (gateway socket); USB bridge port (`USB_TTY_PREFIX`, `USB_TTY_PORT`, `USB_COM_PORT`); SPI section (`SPI_*`) |
| `SDK_v3.3/sdk_gateway/app/config_poc.h` | `MAX_DEVICES`, `PORT_BASE` (device-facing TCP); USB bridge port (if GW also holds a token); `MQTT_BROKER`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASS` |
| `SDK_v3.3/sdk_cloud/application_PoC_MQTT/.env` | `CYBERROCK_BASE_URL`, `MQTT_HOST/PORT/USERNAME/PASSWORD`, `DEVICE_CREDENTIALS_JSON`, `CF_ACCESS_*` (optional) |

The device and gateway also read **whitelists** baked into the binary:

- `SDK_v3.3/sdk_device/sdk_fw/src/services/database/auth_db_whitelist.c` — TIDs the device knows.
- `SDK_v3.3/sdk_gateway/sdk_fw/src/services/database/auth_db_whitelist.c` — TIDs the gateway accepts (CRC32 → TID resolution).

Add a TID hex string to both whitelists before that device can authenticate.

---

## How the gateway talks to the cloud

MQTT, JSON, QoS 1, six actions over topics `sandgrain/v1/{TID}/req/{action}`
with responses on `sandgrain/v1/{TID}/rsp/{action}`.

| Frame | Action | Purpose |
|-------|--------|---------|
| `"0"` | `requestCW` | Cloud issues a fresh CW + transactionId |
| `"1"` | `replyRW` | GW submits device's RW; cloud says AUT_OK / NOK |
| `"2"` | `requestRW` | Cloud computes HRW for any CW (Phase 2 + Error-Mgmt) |
| `"3"` | `checkAuthStatusCloud` | Status poll (optional) |
| `"6"` | `fwVerification` | Device claims FW image is verified; cloud stores permission |
| `"7"` | `fwInstallation` | Device requests install; cloud gates against §"6" record |

Full protocol & payload schemas: [`SDK_v3.3/sdk_cloud/application_PoC_MQTT/README.md`](SDK_v3.3/sdk_cloud/application_PoC_MQTT/README.md).

---

## Building from sources — dependencies

### Device & Gateway (C)
- `gcc` 9+ (clang 13+ also works)
- `libmosquitto-dev` (Linux) / `mosquitto` MSYS2 lib (Windows)
- Linux: nothing else — `port_spi_usb.c` uses native `termios`, `port_spi_spidev.c` uses `linux/spi/spidev.h` (kernel-shipped)
- Windows: ships `librs232lib-static.a` for USB-serial (in `sdk_fw/src/utils/rs232/`)

### Cloud (Python)
- Python 3.11+ (asyncio, `aiohttp`, `paho-mqtt`). See `application_PoC_MQTT/requirements.txt`.
- An MQTT broker (EMQX recommended; mosquitto works for dev).
- Optional: Cloudflare Access credentials if the CyberRock API is behind CF.

---

## Troubleshooting — first places to look

| Symptom | Likely cause | Where to look |
|--------|--------------|---------------|
| Device: `[PORT][SOCKET] Receive failed or connection closed` immediately after sending auth request | Gateway closed the socket — probably failed to reach the broker or the cloud | gateway terminal: `[PORT][MQTT] Failed to open server connection` ⇒ MQTT config / broker not running |
| Gateway: `auth_db_resolve` fails (`Device not registered`) | The device's TID isn't in the gateway whitelist | `SDK_v3.3/sdk_gateway/sdk_fw/src/services/database/auth_db_whitelist.c` |
| Cloud: `requestRW` returns garbage; gateway Error Management exhausts all 7 candidates with `bit_diff ≈ 60` | Device's RW opcode flavor doesn't match `requestRW` (HRW) | confirm `g_sgr_chip_variant = SGR_CHIP_SGB` in `main_device.c` (uses `0x05000800` — matches cloud HRW) |
| Device on real SPI: BIST returns `Status: 0x70` or hangs | SPI mode / clock / wiring | start at `SPI_MAX_HZ = 1_000_000` (low-speed range, works even at 1.8 V); check CSN wiring is on the controller's native CE pin |
| Device on USB: `crypto_get_rw` times out | `/dev/ttyACM0` vs `/dev/ttyUSB0` — wrong prefix | `USB_TTY_PREFIX` in `config_poc.h` (`ACM` for USB-CDC, `USB` for FTDI/CH340) |

The device prints `[PORT][SOCKET]…` / `[PORT][SPI]…` / `[PORT][MQTT]…` lines for every operation — chase those first.

---

## Branches & versioning

| Branch | Purpose |
|--------|---------|
| `main` | First v3 release — single-phase auth, no SPI direct, original Cloud/* layout |
| `rev3.2` | Reorganized for v3.2 (PC USB bridge as default) |
| `rev3.2-ARM` | ARM-side port code added (single-phase auth) |
| `rev3.2-Mutual` | Phase-2 mutual auth + gateway Error Management restored |
| **`rev3.3`** *(current)* | Dual transport: build-time switch USB ↔ native SPI on the device; SGT1001 datasheet-locked SPI config |

Bug fixes for already-shipped features go to the matching `rev3.2-*` branch first, then forward-merge.

---

## Further reading

- **Full integration guide**: `SDK_v3.3/User Guide - SDK v3.pdf`
- **SGT1001 chip**: `SDK_v3.3/SGT1001_Datasheet.pdf` (opcodes, SPI timing, mode tables)
- **Cloud protocol cheat-sheet**: `SDK_v3.3/sdk_cloud/application_PoC_MQTT/README.md`
- **Python SDK API**: `SDK_v3.3/sdk_cloud/sandgrain_cloud_sdk/README.md`
- **Device SDK API**: `SDK_v3.3/sdk_device/sdk_fw/README.md`
- **Gateway SDK API**: `SDK_v3.3/sdk_gateway/sdk_fw/README.md`

---

## Support / contributing

- Report issues against the appropriate `rev3.x` branch.
- Code style: existing C uses 4-space indent, K&R braces, `snake_case` for SDK identifiers and `SCREAMING_SNAKE_CASE` for compile-time constants. Match what's there.
- Don't edit files under `sdk_fw/` for application-specific tweaks — extend the `app/` layer or contribute the change upstream.
