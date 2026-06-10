# TrustBridge BE — cloud broker

Cloud-side service that terminates device sessions, validates attestations (now including biometric binding), and forwards telemetry into downstream Sandgrain services.

* Version: **3.2.0**
* Stream:  `release/v3.2.0`
* Depends on: `@sandgrain/trustbridge-sdk@3.2.x`
* Requires: Postgres 14+ for the attestation cache.
