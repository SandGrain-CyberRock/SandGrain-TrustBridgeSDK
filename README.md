# Sandgrain SDK — `release/v3.6.0`

Consolidated Sandgrain / TrustBridge versioning repository.
This branch mirrors the upstream `sandgrain-sdk` branch **`trustbridge-0.4`**.

## Layout

- `SDK/` — the Sandgrain SDK (device + gateway + cloud) for this stream.
- `TrustBridge/TrustBridge-Be` — TrustBridge backend (NestJS), `trustbridge-0.4`.
- `TrustBridge/TrustBridge-FE` — TrustBridge frontend (React/Vite), `trustbridge-0.4`.

## Branch map (sandgrain-sdk -> versioning)

| Versioning branch    | sandgrain-sdk source | Notes                          |
| -------------------- | -------------------- | ------------------------------ |
| `main`               | `main`               | Stable trunk                   |
| `development/v3.1.0` | `rev3.1-Spinnov`     | Spinnov development line        |
| `release/v3.1.0`     | `rev3.1`             | v3.1 release stream             |
| `release/v3.2.0`     | `rev3.2-ARM`         | ARM host port                   |
| `release/v3.3.0`     | `rev3.2-Mutual`      | Mutual-auth integration         |
| `release/v3.4.0`     | `rev3.2`             | v3.2 baseline                   |
| `release/v3.5.0`     | `rev3.3`             | v3.3 stream                     |
| `release/v3.6.0`     | `trustbridge-0.4`    | TrustBridge integration (+ FE/BE) |

See [COMPATIBILITY.md](./COMPATIBILITY.md) and [VERSIONING.md](./VERSIONING.md).
