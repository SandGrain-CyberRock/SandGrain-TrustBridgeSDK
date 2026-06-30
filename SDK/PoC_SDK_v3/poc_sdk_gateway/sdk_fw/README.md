# SGR SDK

Software Development Kit for mutual authentication between tokens and servers.

For detailed integration instructions, API reference, and protocol specifications, see **`docs/User_Guide_SDK.pdf`**

---

## 📁 Directory Structure

### `include/`
Public API headers and configuration.

- **`sdk_sgr_user_api.h`**: Main SDK API (init, authentication functions)
- **`sdk_sgr_config.h`**: **Client configuration file** (MQTT broker, retries, debug flags)
- **`sdk_sgr_types.h`**: Data types and structures
- **`sdk_sgr_errors.h`**: Error codes and status definitions

**Note:** `sdk_sgr_config.h` is the **only file** the client should modify.

---

### `port/`
Port layer interface headers. The client must provide implementations for their target platform.

- **`port_comm.h`**: Communication interface (server connectivity)
- **`port_spi.h`**: Token interface (SPI/USB communication)
- **`port_delay.h`**: Timing functions

---

### `src/`
Platform-independent SDK implementation.

#### `src/application/`
Public API implementation. Entry point for all SDK functions.

#### `src/middleware/`
Protocol orchestration and state machine. Coordinates authentication flows.

#### `src/services/`
Core services:
- **`comm/`**: Communication service (uses `port_comm.h`)
- **`crypto/`**: Token cryptographic operations (uses `port_spi.h`)
- **`delay/`**: Timing service (uses `port_delay.h`)
- **`protocol/`**: Protocol formatting and parsing

#### `src/utils/`
Utility modules:
- **`crc/`**: CRC16 calculation
- **`encoding/`**: Hex encoding/decoding
- **`json/`**: JSON message building and parsing
- **`rs232/`**: Serial communication library (platform-specific binaries)

---

### `examples/`
Reference implementations of the port layer.

#### `examples/PC_USB_SGR/port/`
Example implementation for Linux/Windows using:
- MQTT (Mosquitto) for server communication
- USB/FTDI for token communication
- Standard system timing functions

**Note:** Copy these files to your application and adapt them to your platform.

---

## 🚀 Quick Integration

1. Include `sdk_fw/` in your project
2. Configure `include/sdk_sgr_config.h`
3. Implement the port layer (`port_comm.c`, `port_spi.c`, `port_delay.c`)
4. Link against the SDK sources in `src/`
5. Call the SDK API from `sdk_sgr_user_api.h`

See the PoC application in `../app/` for a complete working example.

---

## 📖 Documentation

Complete integration guide: **`docs/User_Guide_SDK.pdf`**

