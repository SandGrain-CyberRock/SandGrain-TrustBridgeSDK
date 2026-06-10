# TrustBridge SDK — Changelog

All notable changes to the TrustBridge SDK are recorded here per release stream.

## v3.4.0 (development)

> In development on `development/v3.4.0`. Subject to change until the release branch is cut.

#### Planned

* Linux host SDK (Ubuntu 22.04+, Debian 12+).
* WebAssembly SDK build for browser-embedded integrations.
* Post-quantum attestation (Dilithium) alongside Ed25519.
* Gateway v4 protocol with bidirectional control channel.
* `TrustBridge BE` v3/v4 dual stack for the migration window.

#### Breaking

* Gateway protocol bumped from v3 to v4 — v3.3.x devices require firmware update to enroll against v3.4 BE.

## v3.3.x

### v3.3.2 — 2025-12-04

* OTel span context propagation fix; Windows host locale crash.

### v3.3.1 — 2025-10-28

* Configurable BE session pool; backpressure propagation fix.

### v3.3.0 — 2025-09-30

* Windows host SDK, BE session pool, streaming telemetry, OTel propagation.

## v3.2.x

### v3.2.2 — 2025-08-21

* Biometric prompt cancellation race fix.

### v3.2.1 — 2025-07-09

* Configurable biometric timeout.

### v3.2.0 — 2025-06-12

* Biometric authentication, macOS host SDK, replay-protected handshake.

## v3.1.x

### v3.1.1 — 2025-04-02

* Handshake retry loop fix; `libsodium` CVE patch.

### v3.1.0 — 2025-02-18

* Initial public release of the v3.x TrustBridge platform.
