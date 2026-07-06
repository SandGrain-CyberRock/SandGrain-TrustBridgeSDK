# PoC SDK — Device

Proof-of-concept application for the Sandgrain SGR SDK running in **DEVICE_MODE**.
The device authenticates against a Gateway (see `../poc_sdk_gateway/`), verifies
firmware images with the crypto token, and requests installation authorization.

## Layout

- `app/` — the PoC application (interactive menu, port-layer implementations, fault injection).
- `sdk_fw/` — the SGR SDK sources (see [`sdk_fw/README.md`](./sdk_fw/README.md)).
- `setup-debug.sh` — Linux helper enabling passwordless-`sudo` GDB for VS Code (F5) debugging.

## What the app does

`app/main_device.c` initializes the SDK (`SGR_SDK_Initialize()`) and presents an
interactive menu:

| Option | Action |
| ------ | ------ |
| 1 | Normal authentication via Gateway (`SGR_SDK_Authenticate_Via_GW`) |
| 2 | Authentication with fault injection (CW: 2 bit flips, CW echo: 1, RW: 1) |
| 3 | Authentication with Error-Management stress (CW: 3 bit flips RX, CW echo: 2 TX) |
| 4 | FW verification with correct RW — expects `FW_OK` (`SGR_SDK_Verification_FW`) |
| 5 | FW verification with wrong (all-zero) RW — expects `FW_NOK` |
| 6 | Installation request (`SGR_SDK_Installation`) — run option 4 first |
| 0 | Exit |

FW verification computes SHA-256 over a built-in 64-byte test firmware blob, uses
the hash as CW, obtains the RW from the crypto token, and sends the result to the
Gateway (frame type `"6"`). Installation sends TID + CW + RW (frame type `"7"`)
and waits for the Gateway/Cloud verdict.

### Fault injection

`app/fault_injection/fi_device.{h,c}` provides runtime bit-flip injection into the
hex-encoded CW / CW-echo / RW fields of the JSON frames. It is enabled purely at
runtime by menu options 2 and 3 (no build flag needed); the flips are applied
inside `app/port/port_comm.c`. Additional comm-level (byte corruption) and
SPI-level fault-injection hooks exist in the port layer.

## Port layer used by this PoC

The compiled port implementations live in `app/port/`:

- `port_comm.c` — Gateway link over **TCP socket** to `127.0.0.1:8080`
  (implements the `port_comm_ctx_t` API from `sdk_fw/port/port_comm.h`).
- `port_comm_device.c` — socket helper for the device↔GW channel.
- `port_spi_usb.c` — crypto token over **USB serial / FTDI** (VID 0x0403, PID 0x6014)
  using the bundled rs232 library; port selected via `USB_PORT_STRING` in `app/config_poc.h`.
- `port_delay.c`, `port_random.c` — timing (`usleep`) and CSPRNG
  (`BCryptGenRandom` on Windows, `/dev/urandom` on Linux).

`app/port/example_port_comm/` contains two alternative **reference** transports
(not compiled): `port_comm_mqtt/` (mosquitto, `sandgrain/v1/<id>/req|rsp/...`
topics) and `port_comm_socket/` (raw TCP, the template for the active port).

Client-tunable settings (socket port/IP, USB COM/tty port) are in `app/config_poc.h`.

## Build and run

Requires `gcc`, `make` and `libmosquitto` (linked even though the active comm
port is socket-based). The rs232 serial library is bundled under
`sdk_fw/src/utils/rs232/`. Works on Linux and Windows (MinGW; links `ws2_32`, `bcrypt`).

```bash
cd app
make            # builds ./test_device with -DSDK_MODE=0 (DEVICE_MODE)
./test_device
make clean
```

A Gateway must be listening on `127.0.0.1:8080` for the flows to complete
(see `../poc_sdk_gateway/`). The crypto token must be connected via USB for
options that compute RWs.

## Documentation

Full integration guide: `sdk_fw/docs/User Guide - SDK v3.pdf`.
