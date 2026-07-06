# Sandgrain SDK — `release/v3.6.0`

Consolidated Sandgrain / TrustBridge versioning repository.
This branch mirrors the upstream `sandgrain-sdk` branch **`trustbridge-0.4`** —
the **TrustBridge integration**, which wraps the SandGrain SDK auth stack in a
full device-fleet management layer (frontend + backend + broker).

Each branch of this repository is a complete, self-contained snapshot of one
SDK stream (see [VERSIONING.md](./VERSIONING.md) and
[COMPATIBILITY.md](./COMPATIBILITY.md)).

## Architecture (end-to-end chain)

```
TrustBridge-FE (React 19 + Vite, :5173)
      | REST (VITE_APP_ENDPOINT)
      v
TrustBridge-Be (NestJS 10, :3000/api; MySQL 8 + Mosquitto 2)
      | MQTT cmd/run_auth                 ^ MQTT gw_log / auth_result
      v                                   |
Device (C, test_device --listen, SGT chip via USB) -- TCP :8080 --> Gateway (C, test_gw)
                                                                        | MQTT :1883
                                                                        v
                                                          Cloud agent (Python application_PoC_MQTT)
                                                                        | HTTPS
                                                                        v
                                                CyberRock (device-api.* / tenant-api.sandbox.sandgrain.io)
```

Return/control paths: the Gateway publishes per-step `gw_log` and terminal
`auth_result` messages consumed by the BE (device state
idle→inprogress→claimed→authenticated); the cloud agent fetches per-TID
credentials from the BE (`GET /devices/credentials-by-tid`); the Gateway
refreshes its whitelist from the BE (`GET /devices/whitelist`, ~3 s poll).
All Docker services rendezvous on the external network `trustbridge-net`; the
shared Mosquitto broker lives in TrustBridge-Be (the standalone EMQX from
earlier streams is dropped).

## Layout

- `SDK/` — the SandGrain auth stack + launcher tooling:
  - `README.md` — PoC runner guide (BE-integrated mode).
  - `RUNNING_STANDALONE.md` — **standalone mode** (no TrustBridge BE): the
    cloud reads a local `device_credentials.json`, the gateway authorizes from
    a static `trustbridge_whitelist.txt`, the device runs the interactive menu.
  - `changes.md` — the full trustbridge-0.4 integration changelog.
  - Scripts: `setup.{sh,ps1}` (one-time env), `run_all.{sh,ps1}` (BE mode:
    build + TID auto-detect via BIST + launch Cloud→Gateway→Device),
    `run_standalone.{sh,ps1}`, `run_device.sh`, `run_gateway.sh`,
    `usb-attach.ps1` (attach the USB chip to WSL via usbipd).
  - `PoC_SDK_v3/` — `poc_sdk_device/` (C; adds `--listen` mode driven over
    MQTT `cmd/run_auth`, macOS support), `poc_sdk_gateway/` (C; gateway FSM
    with error-management bit-flip recovery, `gw_log` telemetry, BE-synced
    whitelist), `sdk_cloud/` (Python `sandgrain_cloud_sdk` 0.3.0 +
    `application_PoC_MQTT` with `TrustBridgeCredentialsStore` and auto-claim).
- `TrustBridge/TrustBridge-Be` — **backend** (`trustbridge-be` 1.0.0): NestJS
  10, TypeORM + MySQL, JWT/RBAC, Swagger; modules for devices, device groups
  and profiles, organizations, users/roles/permissions, dashboards, system
  activity, tenant API and MQTT. Compose: `mysql:8.0`, `eclipse-mosquitto:2`,
  the BE itself.
- `TrustBridge/TrustBridge-FE` — **frontend** (`trustbridge-fe`): React 19 +
  Vite + TypeScript, Chakra UI; admin dashboard for devices, hierarchies,
  auth/comm events, audit logs, organizations, users and RBAC. Talks REST to
  the BE via `VITE_APP_ENDPOINT`.

## What changed in the SDK for TrustBridge (`SDK/changes.md`)

- Two-phase crypto opcodes: `TOKEN_AUTH` (`0x03000800`, Phase 1) and
  `HOST_AUTH` (`0x05000800`, Phase 2 + FW flows); `crypto_get_rw` takes a mode.
- Gateway FSM rewrite (full CR flow with auto-claim and bit-flip
  error-management recovery) + persistent `gw_log` MQTT telemetry client.
- BE-synced runtime whitelist (`GW_WHITELIST_PATH` / `trustbridge_whitelist.txt`).
- Device `--listen` mode: subscribes `sandgrain/v1/{TID}/cmd/run_auth`,
  publishes `status`, runs auth on command; interactive menu kept as fallback.
- macOS build support (device + gateway); tracked test binaries removed.

## Quick start

```bash
cd SDK
./setup.sh          # once per machine
./run_all.sh        # BE-integrated mode (requires TrustBridge-Be running)
# or
./run_standalone.sh # no BE: local credentials + static whitelist
```

Bring up TrustBridge first for BE mode: `docker compose up` in
`TrustBridge/TrustBridge-Be/` (MySQL + Mosquitto + BE on :3000), then
`TrustBridge/TrustBridge-FE/` (Vite dev server on :5173,
`VITE_APP_ENDPOINT=http://localhost:3000/`).

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
