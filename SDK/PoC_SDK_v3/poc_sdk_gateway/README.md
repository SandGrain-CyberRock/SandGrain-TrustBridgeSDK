# PoC SDK — Gateway

Proof-of-concept application for the Sandgrain SGR SDK running in **GATEWAY_MODE**.
The Gateway bridges devices (see `../poc_sdk_device/`) to the Cloud application
(`../sdk_cloud/`): it accepts device connections over TCP, resolves device
identities against a whitelist, and forwards authentication / firmware flows to
the Cloud over MQTT.

## Layout

- `app/` — the PoC application (main loop, port-layer implementations).
- `sdk_fw/` — the SGR SDK sources (see [`sdk_fw/README.md`](./sdk_fw/README.md)).
- `setup-debug.sh` — Linux helper enabling passwordless-`sudo` GDB for VS Code (F5) debugging.

## What the app does

`app/main_gw.c` is a minimal dispatcher loop:

1. `SGR_SDK_Initialize()` — registers every TID from the compile-time whitelist
   (`sdk_fw/src/services/database/auth_db_whitelist.c`) and opens one listening
   socket per device channel.
2. `while (1) { SGR_SDK_GW_Run(); }` — the unified non-blocking dispatcher polls
   all device channels, peeks the incoming frame type, and routes to the right flow:
   - device authentication (frame `"4"`/`"5"`): DEVICE ↔ GW ↔ SERVER bridge,
   - FW verification (frame `"6"`): forwards the device's `FW_OK`/`FW_NOK` result to the Cloud,
   - installation (frame `"7"`): forwards TID + CW + RW to the Cloud and relays the verdict back.

   `SGR_SDK_BUSY` means no channel has data yet; any other status is logged and
   the loop continues.

The blocking single-flow API calls (`SGR_SDK_Authentication_Token_To_Server`,
`SGR_SDK_Authentication_Server_To_Token`, `SGR_SDK_GW_Handle_Device_Auth`,
`SGR_SDK_GW_Handle_FW_Verification`, `SGR_SDK_GW_Handle_Installation`) are
available in the SDK but not used by this PoC — `SGR_SDK_GW_Run()` replaces them.

Devices are identified by the CRC32 of their TID; unregistered devices (CRC32
not resolvable via the whitelist) are rejected.

## Transports

- **Device side** (`app/port/port_comm_device.c`) — TCP sockets, one listening
  port per channel: `PORT_BASE + channel` (8080, 8081, 8082 for `MAX_DEVICES=3`).
  Non-blocking accept; devices may disconnect and reconnect freely.
- **Cloud side** (`app/port/port_comm.c`) — MQTT (mosquitto), QoS 1. Per-device
  topics keyed by TID:
  - publish: `sandgrain/v1/<tid>/req/{requestCW, replyRW, requestRW, checkAuthStatusCloud, fwVerification, fwInstallation}`
    (topic chosen from the JSON `"type"` field: 0/1/2/3/6/7),
  - subscribe: `sandgrain/v1/<tid>/rsp/#`.
- **Crypto token** (`app/port/port_spi_usb.c`) — USB serial / FTDI (VID 0x0403,
  PID 0x6014) via the bundled rs232 library. This build sets `GW_CRYPTO_ENABLED=0`
  (default), so no token is required at runtime.

`app/port/port_comm_input.c` is a legacy single-socket implementation that is
**not** compiled by the Makefile (superseded by `port_comm_device.c`).

All client-tunable settings are in `app/config_poc.h`: `PORT_BASE`, USB COM/tty
port, and the MQTT broker (`MQTT_BROKER`/`MQTT_PORT`/`MQTT_USER`/`MQTT_PASS`).

## Build and run

Requires `gcc`, `make` and `libmosquitto`; the rs232 library is bundled under
`sdk_fw/src/utils/rs232/`. Works on Linux and Windows (MinGW; links `ws2_32`, `bcrypt`).

```bash
cd app
make            # builds ./test_gw with -DSDK_MODE=1 (GATEWAY_MODE) -DMAX_DEVICES=3
./test_gw
make clean
```

Prerequisites at runtime:

- An MQTT broker reachable at the address configured in `app/config_poc.h`
  (the Cloud PoC in `../sdk_cloud/` provides an EMQX broker via docker-compose).
- The Cloud application subscribed to `sandgrain/v1/+/req/+`.
- Devices connecting to `127.0.0.1:8080+` (see `../poc_sdk_device/`).

## Documentation

Full integration guide: `sdk_fw/docs/User Guide - SDK v3.pdf`.
