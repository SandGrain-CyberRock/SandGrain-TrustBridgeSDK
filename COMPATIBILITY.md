# Compatibility Matrix — v3.1.x

## Release Stream Status

| Release Branch | Latest Tag | Status              |
| -------------- | ---------- | ------------------- |
| release/v3.1.0 | v3.1.0     | Active Support      |

## SDK ↔ Gateway ↔ Firmware

| SDK Version | Device Firmware | Gateway Version |
| ----------- | --------------- | --------------- |
| v3.1.x      | 3.1+            | 3.x             |

## OS Compatibility

| Component       | Platform | Minimum Version |
| --------------- | -------- | --------------- |
| TrustBridge FE  | iOS      | 14.0            |
| TrustBridge FE  | Android  | 8.0 (API 26)    |
| TrustBridge BE  | Linux    | Ubuntu 20.04    |
| TrustBridge BE  | Linux    | Debian 11       |
| SDK (host SDK)  | macOS    | 11.0 (Big Sur)  |

## Notes

* v3.1.0 is the initial public release of the v3.x platform.
* Maintenance tags within this stream are forward-compatible — applications can upgrade across v3.1.x without code changes.
