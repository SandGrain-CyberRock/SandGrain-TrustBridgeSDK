# TrustBridge SDK — v3.1.x

TrustBridge is Sandgrain's secure device-to-cloud bridge platform. It provides identity verification, attested device handshake, and encrypted telemetry between embedded devices and the Sandgrain cloud.

This repository contains the three deliverables that make up a TrustBridge release stream:

| Component       | Description                                                        |
| --------------- | ------------------------------------------------------------------ |
| `SDK`           | Shared client SDK consumed by FE and BE — protocol, crypto, types. |
| `TrustBridge FE` | Device-side firmware client that runs on the embedded gateway.    |
| `TrustBridge BE` | Cloud-side service that terminates device sessions and brokers data. |

## Release Stream

This branch holds the **v3.1.0** release.

```text
release/v3.1.0
└── v3.1.0   — initial release
```

## Components

### SDK

Core protocol and cryptography library used by both FE and BE. Ships as a versioned package; FE and BE pin the matching minor version.

### TrustBridge FE

Embedded client. Runs on supported gateway firmware and handles enrollment, attested handshake, and outbound telemetry.

### TrustBridge BE

Cloud service. Accepts device sessions, validates attestations, and brokers telemetry into downstream Sandgrain services.

## Documentation

* `VERSIONING.md` — release stream and tagging strategy
* `COMPATIBILITY.md` — supported firmware, OS, and gateway versions
