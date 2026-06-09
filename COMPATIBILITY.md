# Compatibility Matrix

This document describes platform compatibility and support status for SDK releases.

## Supported Release Streams

| Release Branch     | Latest Version | Status              |
| ------------------ | -------------- | ------------------- |
| release/v3.1.0     | v3.1.1         | Maintenance Support |
| release/v3.2.0     | v3.2.2         | Active Support      |
| release/v3.3.0     | v3.3.2         | Active Support      |
| development/v3.4.0 | N/A            | In Development      |

## Platform Compatibility

| SDK Version | Device Firmware | Gateway Version |
| ----------- | --------------- | --------------- |
| v3.1.x      | 3.1+            | 3.x             |
| v3.2.x      | 3.2+            | 3.x             |
| v3.3.x      | 3.3+            | 3.x             |
| v3.4.x      | 3.4+            | 4.x             |

## Compatibility Policy

### Within a Release Stream

Versions within the same release stream are fully compatible.

Examples:

```text
v3.2.0 → v3.2.1
v3.2.1 → v3.2.2

v3.3.0 → v3.3.1
v3.3.1 → v3.3.2
```

No application changes are required.

### Across Release Streams

Migration testing is recommended when upgrading between release streams.

Examples:

```text
v3.1.x → v3.2.x
v3.2.x → v3.3.x
```

## End of Support Policy

Older release branches may continue to receive:

* Critical bug fixes
* Security patches

New features are developed only in the active development branch and future release streams.
