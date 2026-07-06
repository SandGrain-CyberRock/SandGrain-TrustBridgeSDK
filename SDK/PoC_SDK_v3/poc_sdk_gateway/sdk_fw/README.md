# SGR SDK

Software Development Kit for mutual authentication between devices, gateways and
the Sandgrain server, plus firmware verification / installation authorization.

A single code base serves both roles — `SDK_MODE` (a compiler define) selects it:

- **`DEVICE_MODE` (0)** — the device authenticates via a Gateway, verifies
  firmware with its crypto token, and requests installation authorization.
- **`GATEWAY_MODE` (1)** — the gateway authenticates itself to the server and
  bridges device flows (auth / FW verification / installation) to the Cloud.

For detailed integration instructions, API reference, and protocol
specifications, see **`docs/User Guide - SDK v3.pdf`**.

---

## 📁 Directory Structure

### `include/`
Public API headers and configuration.

- **`sdk_sgr_user_api.h`**: Public SDK API. Common: `SGR_SDK_Initialize()`.
  Device mode: `SGR_SDK_Authenticate_Via_GW()` (blocking) and the non-blocking
  variant (`_NonBlocking()` / `_Poll()` / `_GetStep()` / `_Abort()`),
  `SGR_SDK_Verification_FW()`, `SGR_SDK_Installation()`.
  Gateway mode: `SGR_SDK_GW_Run()` (unified dispatcher) plus blocking per-flow
  handlers (`SGR_SDK_Authentication_Token_To_Server()`,
  `SGR_SDK_Authentication_Server_To_Token()`, `SGR_SDK_GW_Handle_Device_Auth()`,
  `SGR_SDK_GW_Handle_FW_Verification()`, `SGR_SDK_GW_Handle_Installation()`).
- **`sdk_sgr_config.h`**: SDK internal configuration. **Do not modify this
  file** — every parameter is overridable via compiler flags, e.g.
  `-DSDK_MODE=1 -DMAX_DEVICES=3 -DCRC_ENABLE=1 -DGW_CRYPTO_ENABLED=0`.
  Also holds retry limits, CW/RW bit-flip thresholds and per-module debug flags.
  Application-level settings (ports, broker, USB port) belong in the client's
  own config (see the PoC's `app/config_poc.h`).
- **`sdk_sgr_types.h`**: Data types and sizes (`N_BYTES_ID`/`N_BYTES_CW` = 32,
  `N_BYTES_RW` = 16, transaction id = 36-char UUID, `sdk_sgr_param_t`).
- **`sdk_sgr_errors.h`**: `sgr_sdk_status_t` return codes (`SGR_SDK_OK`,
  `SGR_SDK_BUSY`, `SGR_SDK_AUTH_FAILED`, `SGR_SDK_COMM_ERROR`,
  `SGR_SDK_TOKEN_ERROR`, `SGR_SDK_TIMEOUT`, ...).

---

### `port/`
Port layer interface headers. The client must provide implementations for their
target platform.

- **`port_comm.h`**: Server/Cloud communication interface (`port_comm_ctx_t`).
- **`port_comm_device.h`**: Device↔Gateway channel interface (`port_comm_device_t`).
- **`port_spi.h`**: Crypto token interface (SPI / USB transport).
- **`port_delay.h`**: Timing functions.
- **`port_random.h`**: Cryptographically secure random bytes.

---

### `src/`
Platform-independent SDK implementation.

#### `src/application/`
Public API implementation (`api.c`). Entry point for all SDK functions;
dispatches by `SDK_MODE`.

#### `src/middleware/`
Protocol orchestration and state machines (`sgr_mw.c`). Coordinates the
authentication, FW-verification and installation flows, including the
non-blocking device auth FSM and the gateway's per-channel dispatcher
(`sgr_mw_gw_run`).

#### `src/services/`
Core services:
- **`crypto/`**: Crypto token operations via `port_spi.h` (`crypto_get_id`, `crypto_get_rw`).
- **`database/`**: Device auth database (CRC32 → TID resolution) and the
  compile-time whitelist of authorized TIDs (`auth_db_whitelist.c`).
- **`devices/`**: Device↔Gateway frame service (build/parse JSON frames, peek frame type).
- **`protocol/`**: JSON protocol formatting/parsing and CRC validation.
- **`server/`**: Server connection service with typed send/receive (uses `port_comm.h`).

#### `src/utils/`
Utility modules:
- **`bit_flip/`**: Bit-flip tolerance checks and fault-injection mutations.
- **`crc/`**: CRC16 (CRC-CCITT) calculation.
- **`encoding/`**: Hex encoding/decoding.
- **`json/`**: JSON message building (`json_tx_build`) and JSMN-based parsing (`json_rx_parser.h`).
- **`random/`**: Random bytes (delegates to `port_random.h`).
- **`rs232/`**: Serial communication library (headers + prebuilt platform binaries).
- **`sha256/`**: SHA-256 (used for firmware hashing in FW verification).

---

### `examples/`
Reference implementations of the port layer.

#### `examples/PC_USB_SGR/port/`
Example implementation for Linux/Windows PC using:
- MQTT (mosquitto) for server communication (`port_comm.c`)
- USB/FTDI serial for the crypto token (`port_spi_usb.c`)
- Standard system timing functions (`port_delay.c`)

**Note:** Copy these files to your application and adapt them to your platform.
The PoC application in `../app/port/` is the up-to-date reference for the
current context-based port API.

---

## Protocol frames

JSON frames with a `"type"` field, hex-string payload fields, and optional CRCs:

| Type | Direction | Meaning |
| ---- | --------- | ------- |
| `"0"`–`"3"` | GW/Device ↔ Server | request CW / reply RW / request RW / auth status |
| `"4"` | Device ↔ GW | auth request / auth result (`AUT_OK`/`AUT_NOK`) |
| `"5"` | Device ↔ GW | CW delivery / CW echo + RW |
| `"6"` | Device → GW → Server | FW verification result (`FW_OK`/`FW_NOK`) |
| `"7"` | Device → GW → Server | installation request (TID + CW + RW) |

---

## 🚀 Quick Integration

1. Include `sdk_fw/` in your project.
2. Pass configuration via compiler flags (`-DSDK_MODE=...`, `-DMAX_DEVICES=...`, ...).
3. Implement the port layer (`port_comm`, `port_comm_device`, `port_spi`,
   `port_delay`, `port_random`) for your platform.
4. Link against the SDK sources in `src/`.
5. Call the SDK API from `sdk_sgr_user_api.h`.

See the PoC application in `../app/` for a complete working example
(including the Makefile flags and port implementations).

---

## 📖 Documentation

Complete integration guide: **`docs/User Guide - SDK v3.pdf`**
