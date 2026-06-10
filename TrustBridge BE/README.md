# TrustBridge BE — cloud broker

Cloud-side service that terminates device sessions, validates attestations, and forwards telemetry into downstream Sandgrain services. v3.3.x introduces a session pool for faster handshakes and OpenTelemetry trace propagation.

* Version: **3.3.0**
* Stream:  `release/v3.3.0`
* Depends on: `@sandgrain/trustbridge-sdk@3.3.x`
* Requires: Postgres 14+ for the attestation cache.
