# TrustBridge SDK — v3.4.x

TrustBridge is Sandgrain's secure device-to-cloud bridge platform. It provides identity verification, attested device handshake, biometric authentication, and encrypted telemetry between embedded devices and the Sandgrain cloud.

This branch is the **v3.4.x release stream**, cut from `development/v3.4.0` at code freeze.

This repository contains the three deliverables that make up a TrustBridge release stream:

| Component        | Description                                                        |
| ---------------- | ------------------------------------------------------------------ |
| `SDK`            | Shared client SDK consumed by FE and BE — protocol, crypto, types. |
| `TrustBridge FE` | Device-side firmware client that runs on the embedded gateway.     |
| `TrustBridge BE` | Cloud-side service that terminates device sessions and brokers data. |

## Release Stream

```text
release/v3.4.0
└── v3.4.0   — initial release
```

## What's new in v3.4.x

* **Linux host SDK** — Ubuntu 22.04+ and Debian 12+ as first-class FE targets.
* **WebAssembly SDK** — browser-embeddable SDK build for in-page TrustBridge integrations.
* **Gateway v4 protocol** — backwards-incompatible handshake bump; `TrustBridge BE` ships a v3/v4 dual stack during the migration window.
* **Post-quantum signatures** — Dilithium attestation alongside existing Ed25519.
* **Streaming control channel** — bidirectional commands from BE to FE.

## Branch Strategy

| Branch                       | Purpose                                            |
| ---------------------------- | -------------------------------------------------- |
| `main`                       | Stable trunk pointing at the latest released stream |
| `development/v3.4.0`         | Active development for the v3.4 stream             |
| `release/v3.1.0`             | Maintenance (security only)                        |
| `release/v3.2.0`             | Active support                                     |
| `release/v3.3.0`             | Active support                                     |
| `release/v3.4.0`             | Cut from `development/v3.4.0` at code-freeze       |
| `hotfix/*`                   | Off the matching release branch                    |
| `feature/*`                  | Off the active development branch                  |

## Documentation

* `VERSIONING.md` — release stream and tagging strategy
* `COMPATIBILITY.md` — supported firmware, OS, and gateway versions
