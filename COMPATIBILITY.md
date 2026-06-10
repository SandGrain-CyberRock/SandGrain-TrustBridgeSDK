# Compatibility Matrix — v3.3.x

## Release Stream Status

| Release Branch | Latest Tag | Status              |
| -------------- | ---------- | ------------------- |
| release/v3.1.1 | v3.1.1     | Maintenance Support |
| release/v3.2.2 | v3.2.2     | Active Support      |
| release/v3.3.0 | v3.3.0     | Active Support      |

## SDK ↔ Gateway ↔ Firmware

| SDK Version | Device Firmware | Gateway Version |
| ----------- | --------------- | --------------- |
| v3.1.x      | 3.1+            | 3.x             |
| v3.2.x      | 3.2+            | 3.x             |
| v3.3.x      | 3.3+            | 3.x             |

## OS Compatibility

| Component       | Platform | Minimum Version |
| --------------- | -------- | --------------- |
| TrustBridge FE  | iOS      | 15.0            |
| TrustBridge FE  | Android  | 9.0 (API 28)    |
| TrustBridge FE  | Windows  | 10 (build 1809) |
| TrustBridge BE  | Linux    | Ubuntu 22.04    |
| TrustBridge BE  | Linux    | Debian 12       |
| SDK (host SDK)  | macOS    | 12.0 (Monterey) |
| SDK (host SDK)  | Windows  | 10 (build 1809) |

## Notes

* v3.3.x is the **active** support stream alongside v3.2.x.
* v3.1.x remains in maintenance support (security + critical fixes only).
* Cross-stream upgrade `v3.2.x → v3.3.x` is drop-in for existing biometric-bound devices.
