# SGR SDK - Proof of Concept

Proof of Concept application demonstrating mutual authentication between a token and a server using the SGR SDK.

For complete documentation, see **`sdk_fw/docs/User Guide - SDK.pdf`**

---

## 📁 Repository Structure
```
POC_SDK_FW/
├── app/              # PoC application and platform-specific code
├── sdk_fw/           # SGR SDK
├── .vscode/          # VSCode debug configurations
├── setup-debug.sh    # Debug setup script (Linux only)
└── README.md
```

- **`app/`**: Contains the PoC application with interactive demo and fault injection scenarios
- **`sdk_fw/`**: The SGR SDK core library
- **Complete documentation**: `sdk_fw/docs/User Guide - SDK.pdf`

---

## 🚀 Quick Start

### Clone the Repository
```bash
git clone git@github.com:SandGrain-CyberRock/sandgrain-sdk.git
```

---

### Build and Run

Refer to **Chapter 7 (Proof of Concept)** in `sdk_fw/docs/User Guide - SDK.pdf` for:

- Installing dependencies (GCC, MQTT, USB libraries)
- Configuring the SDK (`sdk_sgr_config.h`)
- Building the PoC (`make`)
- Running the demo (`sudo ./test_sdk`)
- Debugging with VSCode

---

## 📖 Documentation

All integration instructions, API reference, and troubleshooting are available in:

**`sdk_fw/docs/User Guide - SDK.pdf`**

---
