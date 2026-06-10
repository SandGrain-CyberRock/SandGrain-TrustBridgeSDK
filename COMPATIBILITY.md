# Compatibility Matrix — v3.4.x

## Release Stream Status

| Release Branch | Latest Tag | Status              |
| -------------- | ---------- | ------------------- |
| release/v3.1.0 | v3.1.1     | Maintenance Support |
| release/v3.2.0 | v3.2.2     | Maintenance Support |
| release/v3.3.0 | v3.3.2     | Active Support      |
| release/v3.4.0 | v3.4.0     | Active Support      |

## SDK ↔ Gateway ↔ Firmware

| SDK Version | Device Firmware | Gateway Version |
| ----------- | --------------- | --------------- |
| v3.1.x      | 3.1+            | 3.x             |
| v3.2.x      | 3.2+            | 3.x             |
| v3.3.x      | 3.3+            | 3.x             |
| v3.4.x      | 3.4+            | 4.x             |

## OS Compatibility

| Component       | Platform | Minimum Version  |
| --------------- | -------- | ---------------- |
| TrustBridge FE  | iOS      | 16.0             |
| TrustBridge FE  | Android  | 10.0 (API 29)    |
| TrustBridge FE  | Windows  | 11               |
| TrustBridge FE  | Linux    | Ubuntu 22.04     |
| TrustBridge FE  | Linux    | Debian 12        |
| TrustBridge FE  | Browser  | WASM (Chromium 110+, Firefox 110+, Safari 16.4+) |
| TrustBridge BE  | Linux    | Ubuntu 22.04     |
| TrustBridge BE  | Linux    | Debian 12        |
| SDK (host SDK)  | macOS    | 13.0 (Ventura)   |
| SDK (host SDK)  | Windows  | 11               |

## Migration Notes

* Cross-stream upgrade `v3.3.x → v3.4.x` is **not drop-in**: device firmware must be updated to 3.4+ and re-enrolled against the v4 gateway.
* `TrustBridge BE` v3.4.x ships a v3/v4 dual stack — operators can run mixed-version fleets during rollout.
* WebAssembly target is currently CSP-restricted; embedders must allow `wasm-unsafe-eval` for the duration of v3.4.x.
