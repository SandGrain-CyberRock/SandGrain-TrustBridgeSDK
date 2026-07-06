# Compatibility — `release/v3.6.0`

| Field            | Value |
| ---------------- | ----- |
| Versioning branch | `release/v3.6.0` |
| sandgrain-sdk source | `trustbridge-0.4` |
| Stream version   | 3.6.0 (TrustBridge integration) |
| TrustBridge BE   | `trustbridge-be` 1.0.0 (upstream `trustbridge-0.4`) |
| TrustBridge FE   | `trustbridge-fe` (upstream `trustbridge-0.4`) |

All components on this branch are developed and tested together — mix with
other streams at your own risk. The BE-integrated flows (whitelist sync,
credentials-by-TID, `gw_log` telemetry, `cmd/run_auth`) require this branch's
gateway, cloud agent and BE together.

## Component chain

```
FE (React :5173) --REST--> BE (NestJS :3000, MySQL+Mosquitto) --MQTT cmd/run_auth--> Device (C, --listen)
Device --TCP :8080--> Gateway (C) --MQTT :1883--> Cloud agent (Python) --HTTPS--> CyberRock
Gateway --MQTT gw_log/auth_result--> BE ; Cloud agent <--HTTPS creds-by-TID-- BE ; Gateway <--HTTPS whitelist-- BE
```

## TrustBridge FE <-> BE

| Aspect | Value |
| ------ | ----- |
| Transport | REST; FE reads `VITE_APP_ENDPOINT` (`http://localhost:3000/` dev, `https://trustbridge.sandgrain.dev/` prod) |
| BE API | NestJS 10 on port 3000 (`/api`, Swagger); JWT auth, RBAC |
| Storage | MySQL 8.0 via TypeORM |

## BE <-> SDK stack (device / gateway / cloud agent)

| Aspect | Value |
| ------ | ----- |
| Broker | Mosquitto 2 (`tb-mosquitto`, :1883) — shared by BE, gateway, device and cloud agent on Docker network `trustbridge-net` (no standalone EMQX on this stream) |
| Commands | BE → device: `sandgrain/v1/{TID}/cmd/run_auth` (`{"mode":N}`); device publishes `status` |
| Telemetry | Gateway → BE: per-step `gw_log` (labels `1/6`…`6/6`, `cw_fail`, `em`, …) + terminal `auth_result`; drives device state idle→inprogress→claimed→authenticated |
| Credentials | Cloud agent → BE: `GET {BE_URL}/devices/credentials-by-tid` (`TrustBridgeCredentialsStore`) |
| Whitelist | Gateway polls `GET {BE_URL}/devices/whitelist` (~3 s) into `trustbridge_whitelist.txt` (`GW_WHITELIST_PATH`) |
| Standalone mode | No `BE_URL`: local `device_credentials.json` + static `trustbridge_whitelist.txt` (see `SDK/RUNNING_STANDALONE.md`) |

## Device <-> Gateway <-> Cloud agent

| Aspect | Value |
| ------ | ----- |
| Device↔GW transport | TCP socket, port 8080 (`PORT_BASE`) |
| Framing | JSON frames `"4"`/`"5"` (auth), `"6"` (FW verification), `"7"` (installation) + Phase-2 mutual auth exchange |
| Crypto opcodes | `TOKEN_AUTH 0x03000800` (Phase 1), `HOST_AUTH 0x05000800` (Phase 2 + FW flows) |
| GW↔Cloud topics | `sandgrain/v1/<tid>/req|rsp/{requestCW, replyRW, requestRW, checkAuthStatusCloud, fwVerification, fwInstallation, computeRW, computeFWVerification, computeInstallation}` |
| Error management | Gateway bit-flip recovery (brute-forces 2^N CW candidates) |

## Cloud agent <-> CyberRock

| Aspect | Value |
| ------ | ----- |
| SDK package | `sandgrain-cloud-sdk` **0.3.0** (async, `aiohttp`) |
| Backends | `device-api.sandbox.sandgrain.io` (device flows) + `tenant-api.sandbox.sandgrain.io/api` (BE tenant API, auto-claim on `CLAIM_TOKEN`) |
| Auth | Per-TID device tokens (from BE or local store) + tenant token; optional Cloudflare Access headers |

## Platform / toolchain requirements

| Component | Requirement |
| --------- | ----------- |
| C firmware + apps | `gcc` (C11), Linux, Windows/WSL (`usb-attach.ps1` for USB passthrough) or **macOS**; `libmosquitto`; POSIX termios serial |
| Cloud agent | Python >= 3.10, `aiohttp`, `paho-mqtt` v2 |
| TrustBridge BE | Node.js (NestJS 10), MySQL 8.0, Mosquitto 2 (via `TrustBridge-Be/docker-compose.yml`) |
| TrustBridge FE | Node.js (React 19 + Vite 7 + TypeScript), port 5173 |
| Docker | All services join the external network `trustbridge-net` |

## SDK <-> Firmware <-> Gateway <-> TrustBridge

| SDK stream | Device firmware | Gateway | Cloud SDK | TrustBridge BE | TrustBridge FE |
| ---------- | --------------- | ------- | --------- | -------------- | -------------- |
| 3.6.0 | 3.6.0 (this branch) | 3.6.0 (this branch) | sandgrain-cloud-sdk 0.3.0 | trustbridge-be 1.0.0 | trustbridge-fe (trustbridge-0.4) |
