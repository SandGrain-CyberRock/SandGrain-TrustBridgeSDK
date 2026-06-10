# Compatibility Matrix — v3.2.x

## Release Stream Status

| Release Branch | Latest Tag | Status              |
| -------------- | ---------- | ------------------- |
| release/v3.1.1 | v3.1.1     | Maintenance Support |
| release/v3.2.0 | v3.2.0     | Active Support      |

## SDK ↔ Gateway ↔ Firmware

| SDK Version | Device Firmware | Gateway Version |
| ----------- | --------------- | --------------- |
| v3.1.x      | 3.1+            | 3.x             |
| v3.2.x      | 3.2+            | 3.x             |

## OS Compatibility

| Component       | Platform | Minimum Version |
| --------------- | -------- | --------------- |
| TrustBridge FE  | iOS      | 15.0            |
| TrustBridge FE  | Android  | 9.0 (API 28)    |
| TrustBridge BE  | Linux    | Ubuntu 20.04    |
| TrustBridge BE  | Linux    | Debian 11       |
| SDK (host SDK)  | macOS    | 12.0 (Monterey) |

## Notes

* v3.2.x is the **active** support stream — receives features, fixes, and security updates.
* v3.1.x remains in maintenance support (security + critical fixes only).
* Cross-stream upgrade `v3.1.x → v3.2.x` requires re-enrolment to pick up biometric attestation.
