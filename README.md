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

- `SandGrain-SDK/` — the SandGrain auth stack + launcher tooling:
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

## What changed in the SDK for TrustBridge (`SandGrain-SDK/changes.md`)

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
cd SandGrain-SDK
./setup.sh          # once per machine
./run_all.sh        # BE-integrated mode (requires TrustBridge-Be running)
# or
./run_standalone.sh # no BE: local credentials + static whitelist
```

Bring up TrustBridge first for BE mode: `docker compose up` in
`TrustBridge/TrustBridge-Be/` (MySQL + Mosquitto + BE on :3000), then
`TrustBridge/TrustBridge-FE/` (Vite dev server on :5173,
`VITE_APP_ENDPOINT=http://localhost:3000/`).

## Run the TrustBridge stack with the SandGrain SDK (no-cloud)

The TrustBridge Docker stack already contains the SandGrain cloud agent
(`sandgrain-cloud-app`), so you do **not** run the SDK's local Python cloud. On
the SDK side you launch only the **Gateway + Device** and point them at the
stack — this is `run_all.sh`'s `--no-cloud` mode. Credentials resolve from the
BE database, and the gateway syncs its whitelist from `GET /devices/whitelist`.

**1. Bring up the TrustBridge stack** (MySQL + Mosquitto + BE :3000 + FE :5173 +
`sandgrain-cloud-app`):

```bash
cd TrustBridge/TrustBridge-Be
./start-all.sh up          # macOS / Linux / Git Bash / WSL
# Windows PowerShell:  .\start-all.ps1 up
```

The launchers resolve the SDK cloud compose from `../../SandGrain-SDK` automatically; see
[TrustBridge-BE/README.md](./TrustBridge/TrustBridge-BE/README.md) for the full
command set.

**2. Launch the SDK Gateway + Device against the stack:**

```bash
cd ../../SandGrain-SDK
./setup.sh                 # once per machine
./run_all.sh --no-cloud
```

`--no-cloud` skips the local cloud agent and prompts for the TrustBridge BE
IP/port and the MQTT broker host/port — point both at the stack's host (use
`localhost` when everything runs on one machine). The Device starts in
`--listen` mode, so auth is triggered from the FE/BE via
`sandgrain/v1/{TID}/cmd/run_auth` (the interactive menu stays available too).

**3. Drive auth from the frontend** at <http://localhost:5173> (or via the BE
API) and watch device state advance idle → inprogress → claimed → authenticated.

### Split across two Pis

Run the gateway and device on separate hosts, each pointing at the stack:

```bash
./run_gateway.sh   # gateway Pi — syncs the whitelist from the BE, relays MQTT to the broker
./run_device.sh    # device Pi  — has the USB chip, dials the gateway on :8080
```

### The three run modes

| Mode               | Command                 | Cloud agent            | Credentials source              |
| ------------------ | ----------------------- | ---------------------- | ------------------------------- |
| No-cloud (above)   | `run_all.sh --no-cloud` | TrustBridge container  | BE database                     |
| Local cloud        | `run_all.sh`            | local Python agent     | `device_credentials.json`       |
| Standalone (no BE) | `run_standalone.sh`     | local Python agent     | local creds + static whitelist  |

---

Per-branch mapping (sandgrain-sdk → versioning) lives in
[VERSIONING.md](./VERSIONING.md); platform support is in
[COMPATIBILITY.md](./COMPATIBILITY.md).
