# TrustBridge SDK — Changelog

All notable changes to the TrustBridge SDK are recorded here per release stream.

## v3.2.x

### v3.2.0 — 2025-06-12

Second stream of the v3.x TrustBridge platform.

#### Added

* Biometric authentication during device enrolment (`SDK/src/auth.ts`).
* macOS host SDK target for desktop integrations.
* Replay-protected handshake nonce in `SDK/src/session.ts`.

#### Changed

* Bumped minimum OS targets — iOS 15, Android 9.
* `TrustBridge BE` now requires Postgres 14+ for the attestation cache.

#### Notes

* Forward-compatible with v3.1.x device firmware in passthrough mode.

## v3.1.x

### v3.1.1 — 2025-04-02

* Handshake retry loop fix; `libsodium` CVE patch.

### v3.1.0 — 2025-02-18

* Initial public release of the v3.x TrustBridge platform.
