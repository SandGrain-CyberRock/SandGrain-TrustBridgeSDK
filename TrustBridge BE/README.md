# TrustBridge BE — cloud broker

Cloud-side service that terminates device sessions, validates attestations, and brokers telemetry. The v3.4 development line introduces a v3/v4 dual stack so operators can roll v3.4 fleets out gradually.

* Version: **3.4.0-dev**
* Branch:  `development/v3.4.0`
* Depends on: `@sandgrain/trustbridge-sdk@3.4.x`
* Requires: Postgres 15+ for the attestation cache.
