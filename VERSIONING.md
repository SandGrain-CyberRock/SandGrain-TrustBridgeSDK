# TrustBridge SDK — Changelog

All notable changes to the TrustBridge SDK are recorded here per release stream.

## v3.1.x

### v3.1.0 — 2025-02-18

Initial public release of the v3.x TrustBridge platform.

#### Added

* New `SDK` package implementing the v3 device-handshake protocol.
* `TrustBridge FE` embedded client for supported gateway firmware.
* `TrustBridge BE` cloud broker service.
* Identity verification via attested device certificates.
* Encrypted telemetry channel over the Sandgrain backbone.

#### Notes

* First release stream cut from `development/v3.1.0`.
* Replaces the legacy v2 monolithic agent.
