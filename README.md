# TrustBridge SDK — v3.3.x

TrustBridge is Sandgrain's secure device-to-cloud bridge platform. It provides identity verification, attested device handshake, biometric authentication, and encrypted telemetry between embedded devices and the Sandgrain cloud.

This repository contains the three deliverables that make up a TrustBridge release stream:

| Component        | Description                                                        |
| ---------------- | ------------------------------------------------------------------ |
| `SDK`            | Shared client SDK consumed by FE and BE — protocol, crypto, types. |
| `TrustBridge FE` | Device-side firmware client that runs on the embedded gateway.     |
| `TrustBridge BE` | Cloud-side service that terminates device sessions and brokers data. |

## Release Stream

This branch holds the **v3.3.0** release.

```text
release/v3.3.0
└── v3.3.0   — initial release (Windows host, perf)
```

## What's new in v3.3.x

* Windows 10+ host SDK support.
* Session pooling in `TrustBridge BE` — ~40% reduction in p95 handshake latency.
* Streaming telemetry with backpressure.
* OpenTelemetry trace propagation across FE → BE.

## Documentation

* `VERSIONING.md` — release stream and tagging strategy
* `COMPATIBILITY.md` — supported firmware, OS, and gateway versions
