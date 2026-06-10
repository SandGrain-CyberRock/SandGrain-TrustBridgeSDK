# TrustBridge SDK — v3.2.x

TrustBridge is Sandgrain's secure device-to-cloud bridge platform. It provides identity verification, attested device handshake, biometric authentication, and encrypted telemetry between embedded devices and the Sandgrain cloud.

This repository contains the three deliverables that make up a TrustBridge release stream:

| Component        | Description                                                        |
| ---------------- | ------------------------------------------------------------------ |
| `SDK`            | Shared client SDK consumed by FE and BE — protocol, crypto, types. |
| `TrustBridge FE` | Device-side firmware client that runs on the embedded gateway.     |
| `TrustBridge BE` | Cloud-side service that terminates device sessions and brokers data. |

## Release Stream

This branch holds the **v3.2.0** release.

```text
release/v3.2.0
└── v3.2.0   — initial release (biometric auth, macOS host)
```

## What's new in v3.2.x

* Biometric authentication on enrolment (Face ID / Android BiometricPrompt).
* macOS host SDK support for desktop integrations.
* Hardened replay protection in the v3 handshake.

## Documentation

* `VERSIONING.md` — release stream and tagging strategy
* `COMPATIBILITY.md` — supported firmware, OS, and gateway versions
