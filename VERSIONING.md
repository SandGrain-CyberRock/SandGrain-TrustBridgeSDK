# TrustBridge SDK — Changelog

All notable changes to the TrustBridge SDK are recorded here per release stream.

## v3.3.x

### v3.3.0 — 2025-09-30

Third stream of the v3.x TrustBridge platform.

#### Added

* Windows 10+ host SDK target.
* `TrustBridge BE` session pool (`SDK/src/pool.ts`).
* Streaming telemetry with explicit backpressure.
* OpenTelemetry trace propagation across FE → BE.

#### Changed

* `SDK/src/session.ts` handshake reduced from 4 → 2 round-trips.
* `TrustBridge BE` now ships an embedded health endpoint.

#### Notes

* Forward-compatible with v3.2.x device firmware.

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
