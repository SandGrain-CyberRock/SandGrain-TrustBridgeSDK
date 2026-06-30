# Changes — sandgrain-sdk @ rev3.2-ARM → TrustBridge integration

This document lists every change applied to the upstream `rev3.2-ARM` SDK
(commit [`847c95d`](https://github.com/SandGrain-CyberRock/sandgrain-sdk/commit/847c95d)
"Mutual Auth Integration with Error Management") to make it work end-to-end
with the TrustBridge stack (BE + FE + Mosquitto + CyberRock).

**Authoritative copy of the integrated tree:**
`SandGrain-CyberRock/trustbridge-sdk-v3` branch `trustbridge-0.4-sdk3.2ARM`,
commit `a054429` (single orphan commit, no inherited history).

**Verified live on hardware** (USB SandGrain chip, macOS arm64) — modes 1/2/3
all pass end-to-end, auto-claim against CyberRock tenant API succeeds,
error-management bit-flip recovery proven.

---

## Architecture in one diagram

```
device ──TCP──► gateway ──MQTT──► cloud-agent ──HTTPS──► CyberRock
test_device     test_gw            application_PoC_MQTT   device-api.* + tenant-api.*
(C, chip)       (C, MQTT broker)  (Python, Docker)        (SandGrain hosted)

TrustBridge BE  ──MQTT cmd/run_auth──►  test_device   (trigger auth)
TrustBridge BE  ◄──MQTT gw_log──────────  test_gw     (per-step telemetry)
TrustBridge BE  ◄──MQTT auth_result─────  test_gw     (terminal verdict)
TrustBridge BE  ◄──HTTPS /devices/credentials-by-tid──  cloud-agent
                  (creds-on-demand for device+tenant+CF-Access)
```

The full mutual-auth flow:

```
Phase 1 — device→cloud identity (TOKEN_AUTH opcode 0x03000800)
   1) BE          ──cmd/run_auth {"mode":N}──►   device
   2) device      ──TCP type-4 auth req────►     gateway
   3) gateway     ──MQTT req/requestCW────►      cloud-agent
   4) cloud-agent ──HTTPS /api/device/requestCW►  CyberRock device host
   5) cloud-agent ◄──CW + transactionId─────    CyberRock
   6) gateway     ◄──MQTT rsp/requestCW──────   cloud-agent
   7) device      ◄──TCP type-5 CW────────────  gateway
   8) device chip:   crypto_get_rw(CW, RW, TOKEN_AUTH)         [0x03000800]
   9) device      ──TCP type-5 CW echo + RW──►  gateway
   10) gateway    verifies CW echo
   11) gateway    ──MQTT req/replyRW──────►     cloud-agent
   12) cloud-agent ──HTTPS /api/device/replyRW►  CyberRock
   13) cloud-agent ──poll /api/device/checkAuthStatus─►  CyberRock
   14) on CLAIM_TOKEN: cloud-agent ──HTTPS /api/auth/tenantUserLogin─►
       CyberRock tenant host
   15) cloud-agent ──HTTPS /api/tenantApi/claim-token─►  CyberRock tenant host
   16) cloud-agent returns AUTH_OK + claimTokenId + claim_result
   17) gateway    ──MQTT gw_log + auth_result──► TrustBridge BE

Phase 2 — cloud→device identity (HOST_AUTH opcode 0x05000800)
   18) device chip:  HCW = RW || RW, crypto_get_rw(HCW, HRW, HOST_AUTH)  [0x05000800]
   19) device     ──TCP type-8 HCW──►  gateway
   20) gateway    ──MQTT req/requestRW──►  cloud-agent
   21) cloud-agent ──HTTPS /api/device/requestHRW + checkRequestHRWStatus─►  CyberRock
   22) gateway    ◄──HRW──── cloud-agent
   23) gateway    ──TCP type-8 HRW──► device
   24) device chip: HRW_cloud == HRW_token ?
   25) MUTUAL AUTH OK ✓
```

---

## Changes by area

### 1. Chip / crypto — two-phase opcodes

The chip exposes **two** auth opcodes; mutual-auth needs both, in sequence.
Upstream `crypto_get_rw` always picked the opcode from a chip-variant global,
which collapsed to a single opcode per session — the cloud returned
`AUTH_NOT_OK` because the chip's RW didn't match what CyberRock computes.

Ported from `rev3.2-Mutual`:

- Added `sgr_crypto_auth_mode_t` enum with `SGR_CRYPTO_MODE_TOKEN_AUTH = 0`
  (header `0x03000800`, used for Phase 1 — device→cloud identity proof)
  and `SGR_CRYPTO_MODE_HOST_AUTH = 1` (header `0x05000800`, used for Phase 2,
  FW verify, and Installation).
- Extended `crypto_get_rw` signature to take a `mode` parameter; opcode is now
  picked from `mode`, not from `g_sgr_chip_variant`.
- Updated every `crypto_get_rw` call site across both `device` and `gateway`
  middleware to pass the correct mode for its phase (4 + 5 sites respectively,
  plus FW-verify / Installation which are scoped HOST_AUTH).
- `main_device.c` FW-verify standalone call also tagged `HOST_AUTH`.

| File | Status |
|---|---|
| `PoC_SDK_v3/poc_sdk_device/sdk_fw/src/services/crypto/crypto.h` | modified |
| `PoC_SDK_v3/poc_sdk_device/sdk_fw/src/services/crypto/crypto.c` | modified |
| `PoC_SDK_v3/poc_sdk_gateway/sdk_fw/src/services/crypto/crypto.h` | modified |
| `PoC_SDK_v3/poc_sdk_gateway/sdk_fw/src/services/crypto/crypto.c` | modified |
| `PoC_SDK_v3/poc_sdk_device/sdk_fw/src/middleware/sgr_mw.c` | modified (4 call sites) |
| `PoC_SDK_v3/poc_sdk_gateway/sdk_fw/src/middleware/sgr_mw.c` | modified (5 call sites — see also next section) |
| `PoC_SDK_v3/poc_sdk_device/app/main_device.c` | modified (FW-verify call tagged HOST_AUTH) |

---

### 2. Gateway FSM rewired (rev3.2-Mutual port)

`rev3.2-ARM`'s gateway FSM made up its own CW locally and called the legacy
`requestRW` endpoint, which assumes the device is already provisioned in the
cloud — fine for the SandGrain sandbox demo, but doesn't work for a real
TrustBridge tenant where every device must be **claimed** in CyberRock first.

Replaced with the `rev3.2-Mutual` flow:

```
OPEN
 → RECEIVE_AUTH_REQUEST
 → SERVER_OPEN
 → CR_REQUEST_CW       (publish req/requestCW → cloud → CyberRock)
 → CR_RECEIVE_CW       (CW + transactionId)
 → SEND_CW             (forward to device)
 → RECEIVE_RW          (from device, with CW echo)
 → VERIFY_CW           (clean echo → REPLY_RW; bit-flipped → EM_GET_RW_*)
 → CR_REPLY_RW         (publish req/replyRW)
 → CR_RECEIVE_VERDICT  (AUTH_OK / AUT_NOK from cloud — incl. auto-claim)
 → SEND_RESULT
 → CLOSE
```

Error-management bit-flip recovery (`GW_STEP_EM_*`) brute-forces 2^N CW
candidates against the cloud until one's RW matches the device's RW
within `RW_BITFLIP_THRESHOLD`. Verified working on hardware in mode 3
("Error Stress") — candidate 7/7 recovered AUT_OK after device injected
3-bit CW + 2-bit echo flips.

The legacy single-call HOST_AUTH path (`GW_STEP_GET_RW_SERVER_*`) is preserved
as a parallel state machine the device hits via type-8 frames for Phase 2.

| File | Notes |
|---|---|
| `PoC_SDK_v3/poc_sdk_gateway/sdk_fw/src/middleware/sgr_mw.c` | 486-line rewrite from rev3.2-Mutual + gw_log glue + miss-handler call |
| `PoC_SDK_v3/poc_sdk_gateway/sdk_fw/src/middleware/sgr_mw.h` | drop the unused `SGR_MW_MUTUAL_AUTH_FAILED` enum |
| `PoC_SDK_v3/poc_sdk_device/sdk_fw/src/middleware/sgr_mw.c` | Phase 1 `VGW_STEP_COMPUTE_RW` uses `TOKEN_AUTH`; Phase 2 `VGW_STEP_PHASE2_COMPUTE_HRW_TOKEN` uses `HOST_AUTH`; FI fault-injection harness flips back to `HOST_AUTH` to emulate single-phase behavior |

---

### 3. Cloud agent — BE-backed credentials + auto-claim

Upstream `application_PoC_MQTT` reads device/tenant credentials from a local
`device_credentials.json` and only knows the CyberRock **device** API host.
For TrustBridge we replaced both:

#### 3a. `TrustBridgeCredentialsStore` (new file)

`Cloud/application_PoC_MQTT/app/trustbridge_credentials_store.py` — implements
the SDK's `CredentialsStore` interface, but fetches creds on demand from
`GET {BE_URL}/devices/credentials-by-tid?tid=<TID>`. Returns device login +
tenant login + CF-Access creds in a single call. Per-TID in-memory cache,
populated by `await prewarm(tid)`.

CF-Access creds are mirrored onto the SDK's `CyberRockClient` at prewarm
time so the SDK's HTTPS calls flow without `CF_ACCESS_*` env vars.

#### 3b. Auto-claim on `CLAIM_TOKEN`

`Cloud/application_PoC_MQTT/app/handlers.py` — when `check_auth_status`
returns `auth_status: CLAIM_TOKEN` + a `claim_token_id`, `_handle_reply_rw`
now redeems the claim **directly** via aiohttp against
`https://tenant-api.sandbox.sandgrain.io/api`:

1. `POST /auth/tenantUserLogin` with the BE-supplied `tenant_email` /
   `tenant_password` + CF-Access headers → tenant access token
2. `POST /tenantApi/claim-token` with the token + `claimTokenId` → claim
   succeeds
3. Response payload promoted to `auth_status: "AUTH_OK"` so the gateway
   parses success on the first try (instead of seeing CLAIM_TOKEN and
   returning `AUT_NOK` for the device)

We bypass the bundled SDK's `claim_token` method because the SDK is
configured with a single `base_url` (the **device** host); the **tenant**
host is different. Matches what `TrustBridge-BE/src/modules/device/device-auth.service.ts:14`
does (`TENANT_API_BASE_URL = "https://tenant-api.sandbox.sandgrain.io/api"`).

#### 3c. paho-mqtt v2 disconnect handler

`mqtt_transport.py:_on_disconnect` — added the `disconnect_flags` arg
that `CallbackAPIVersion.VERSION2` inserts before `reason_code`. Without
this, paho calls the handler with 5 args but the method only takes 4,
the loop thread crashes silently, and the cloud agent stops processing
messages on the first reconnect after a broker bounce.

#### 3d. Config + factory wiring

- `app/config.py` — added `be_url` field (reads `BE_URL` or
  `TRUSTBRIDGE_BASE_URL` env var).
- `app/sdk_factory.py` — when `BE_URL` is set, instantiates
  `TrustBridgeCredentialsStore` instead of `JsonFileCredentialsStore` and
  attaches the SDK client so CF-Access mirroring works.
- `app/handlers.py` — every cloud-touching handler now calls
  `await prewarm_if_supported(sdk.creds, tid)` at the top to populate the
  cache before the SDK reads it.

#### 3e. `Cloud/docker-compose.yml`

- Removed standalone `emqx` (uses the BE's `mosquitto` on `trustbridge-net`).
- Adds `BE_URL: http://be:3000/api` and `TRUSTBRIDGE_BASE_URL` overrides
  (env_file's `localhost` would resolve to the container itself inside
  Docker; we have to point at the BE service by compose name).
- Removed the dead `device_credentials.json` volume mount.

| File | Status |
|---|---|
| `Cloud/application_PoC_MQTT/app/trustbridge_credentials_store.py` | new |
| `Cloud/application_PoC_MQTT/app/handlers.py` | modified |
| `Cloud/application_PoC_MQTT/app/config.py` | modified |
| `Cloud/application_PoC_MQTT/app/sdk_factory.py` | modified |
| `Cloud/application_PoC_MQTT/app/mqtt_transport.py` | modified |
| `Cloud/docker-compose.yml` | modified |

---

### 4. Gateway telemetry: `gw_log.{c,h}` + auto-reconnect

`Cloud/`-driven MQTT works on the gateway's `port_comm.c` already; what was
missing is a **second, persistent** MQTT client dedicated to publishing
per-step telemetry + the terminal `auth_result` to TrustBridge BE.

`PoC_SDK_v3/poc_sdk_gateway/app/port/gw_log.{c,h}` (new) — exposes:

```c
void gw_log_init(void);
void gw_log_publish(const char *tid_hex, const char *step,
                    const char *status, const char *message, int attempt);
void gw_log_publish_auth_result(const char *tid_hex, int auth_ok);
void gw_log_close(void);
```

Uses `mosquitto_loop_start()` (background thread) + `on_disconnect` callback
+ `mosquitto_reconnect_delay_set(1, 30, true)` — so the gw_log client
auto-reconnects with exponential backoff when the broker bounces.
Without this, a docker restart silently kills the telemetry path: gateway
keeps "publishing" but nothing reaches the BE, which times out at 90s.

`sgr_mw.c` (gateway) inserts `gw_log_publish` calls at every step boundary
of the new Phase-1 FSM. The labels match TrustBridge BE's `handleGwLog`
terminal-detection logic:

| Label | When | Status |
|---|---|---|
| `1/6 ok`/`fail` | auth request received / device not in whitelist | mid / fail |
| `2/6 ok` | requestCW sent to CyberRock | mid |
| `3/6 ok` | CW received from CyberRock | mid |
| `4/6 ok` | CW relayed to device chip | mid |
| `5/6 ok` | CW echo + RW received from device chip (`0x03000800`) | mid |
| `auth ok` | token authentication verified by CyberRock | mid (Phase-1 narrative) |
| `claim ok` | device claim finalized in CyberRock tenant | mid (Phase-1 narrative) |
| `6/6 ok` | **terminal: Phase 1 complete** | success ✓ |
| `cw_fail fail` | CW echo bit-diff exceeds threshold | terminal fail |
| `em info` | entering Error Management (bit-flip recovery) | info |
| `err_mgt ok`/`fail` | EM candidate recovered / exhausted | success / fail |
| `retry info` | retrying after transient comm error | info |
| `failed fail` | **terminal: exhausted all retries** | fail ✗ |
| `auth_result` (terminal) | `gw_log_publish_auth_result` at `CLOSE` | success / fail |

`main_gw.c` calls `gw_log_init()` once at startup.

| File | Status |
|---|---|
| `PoC_SDK_v3/poc_sdk_gateway/app/port/gw_log.c` | new |
| `PoC_SDK_v3/poc_sdk_gateway/app/port/gw_log.h` | new |
| `PoC_SDK_v3/poc_sdk_gateway/sdk_fw/src/middleware/sgr_mw.c` | added gw_log calls at FSM step boundaries |
| `PoC_SDK_v3/poc_sdk_gateway/app/main_gw.c` | `gw_log_init()` at boot |
| `PoC_SDK_v3/poc_sdk_gateway/app/Makefile` | added `gw_log.c` to `POC_SRCS` |

---

### 5. Gateway whitelist: BE-synced + miss-handler hook

Upstream `auth_db_whitelist.c` is a static C array compiled in. For TrustBridge
the gateway needs to authorize whatever devices the BE has currently registered,
without recompiling.

#### 5a. Dynamic file-backed whitelist

`auth_db_whitelist.c` rewritten as a runtime loader:

- `auth_db_load_whitelist(file_path)` reads one 64-hex TID per line from
  `GW_WHITELIST_PATH` (env) or `./trustbridge_whitelist.txt`.
- `auth_db_whitelist_count` is no longer `const` — it's set at runtime by
  the loader.

#### 5b. BE sync in `main_gw.c`

`refresh_whitelist()` in `main_gw.c`:

- `curl -fsS --max-time 3 "$BE_URL/devices/whitelist" -o $WHITELIST_PATH.tmp`,
  then `cmp -s` against the current file, and only `mv` if the content
  changed (keeps mtime stable when nothing's new, so the (`mtime`, size)
  reload gate below doesn't fire every poll).
- (`mtime`, size) gate: only reload + re-register when either changed.
- Calls `auth_db_load_whitelist` and `auth_db_register` for each TID.

Called once at startup + every ~3s in the dispatcher loop.

#### 5c. `auth_db` cache-miss hook (avoid the race window)

New API in `auth_db.h`:

```c
typedef int (*auth_db_miss_handler_t)(uint32_t missing_crc32);
void auth_db_set_miss_handler(auth_db_miss_handler_t handler);
```

`auth_db_resolve()` invokes the registered handler when a CRC32 lookup misses,
gives the handler a chance to refresh the whitelist, then retries the lookup.
`main_gw.c` registers a handler that calls `refresh_whitelist()`. This closes
the race where a device starts authenticating immediately after being enrolled
in TrustBridge but before the polling refresh has picked up its TID — without
this fix, the device burns its 4 retries (under 2 sec) before the 3-sec
refresh sees the new TID.

| File | Status |
|---|---|
| `PoC_SDK_v3/poc_sdk_gateway/sdk_fw/src/services/database/auth_db_whitelist.c` | rewritten as dynamic loader |
| `PoC_SDK_v3/poc_sdk_gateway/sdk_fw/src/services/database/auth_db.h` | added miss-handler API |
| `PoC_SDK_v3/poc_sdk_gateway/sdk_fw/src/services/database/auth_db.c` | invoke miss-handler on resolve miss |
| `PoC_SDK_v3/poc_sdk_gateway/app/main_gw.c` | refresh_whitelist + (mtime,size) gate + miss-handler registration |
| `PoC_SDK_v3/poc_sdk_gateway/app/config_poc.h` | env-aware MQTT_BROKER/PORT |

---

### 6. Device — BE-driven listener + macOS USB path

#### 6a. `--listen` mode

`PoC_SDK_v3/poc_sdk_device/app/main_device.c` — adds a wholly new run mode
selected by `--listen` (or `RUN_MODE=listener` env). In this mode the binary:

- Reads the chip's TID via `crypto_get_id()`.
- Connects MQTT to `MQTT_BROKER:MQTT_PORT`, subscribes to
  `sandgrain/v1/{TID}/cmd/run_auth`.
- Publishes `sandgrain/v1/{TID}/status` `online` (LWT-style offline on disconnect).
- On `{"mode":N}` trigger, runs `sgr_mw_authenticate_via_gw` with the
  matching FI mode (1=Normal, 2=Fault Injection, 3=Error Stress).

The interactive menu is preserved as fallback when neither `--listen` nor
`RUN_MODE=listener` is set.

#### 6b. Env-aware config

`config_poc.h` + `port_comm_device.c` — every previously-hardcoded value
(`MQTT_BROKER`, `MQTT_PORT`, `GW_HOST`, `GW_PORT`) is now `getenv()`-driven
with the old hardcoded as fallback.

#### 6c. macOS chip path

`port_spi_usb.c` — `linux_tty_path()` now branches on `#ifdef __APPLE__`:
- macOS: `/dev/cu.<USB_TTY_PORT>` (call-out device, not blocking on DCD)
  if `USB_TTY_PORT` is set, or auto-scan `glob("/dev/cu.usbmodem*")` then
  `glob("/dev/cu.usbserial*")` as fallback.
- Linux: original `/dev/tty<USB_TTY_PREFIX><USB_TTY_PORT>` path preserved.

Without this branch, macOS users hit `crypto chip not responding` because
`/dev/ttyACM0` doesn't exist on Darwin.

| File | Status |
|---|---|
| `PoC_SDK_v3/poc_sdk_device/app/main_device.c` | listener mode + run_auth handler |
| `PoC_SDK_v3/poc_sdk_device/app/config_poc.h` | env-aware config |
| `PoC_SDK_v3/poc_sdk_device/app/port/port_comm_device.c` | env-aware GW_HOST/GW_PORT |
| `PoC_SDK_v3/poc_sdk_device/app/port/port_spi_usb.c` | macOS `/dev/cu.*` branch |

---

### 7. Build + launchers

#### 7a. macOS Makefile branch

Both `Makefile` (device + gateway) — added a `PLATFORM=MACOS` branch that
brew-detects the mosquitto include + lib paths:

```make
else ifeq ($(PLATFORM),MACOS)
BREW_PREFIX := $(shell brew --prefix 2>/dev/null || echo /opt/homebrew)
CFLAGS  += -Wall -Wextra -std=c11 -D_GNU_SOURCE -DLINUX -DSDK_MODE=… \
           -I$(BREW_PREFIX)/include -I$(BREW_PREFIX)/opt/mosquitto/include …
LDFLAGS += -L$(BREW_PREFIX)/lib -L$(BREW_PREFIX)/opt/mosquitto/lib -lmosquitto
```

The original Windows and Linux branches are untouched.

Gateway `Makefile` also adds `gw_log.c` to `POC_SRCS`.

#### 7b. `start-local.sh` (macOS + Linux)

New launcher: builds + launches `test_gw` + `test_device --listen` in separate
terminal windows against localhost defaults. Notable specifics:

- **bash 3.2 safe**: uses a `default_for_key()` case function + indexed
  `VALS=()` array (NOT `declare -A`, which silently collapses to index 0 =
  "8080" on macOS bash 3.2, the real cause of the recurring "everything is
  8080" bug).
- Per-key `valid_for_key()` validator — rejects values whose shape is
  obviously wrong (e.g. port number landing in `ROLE`/`BE_URL`/host fields).
- Holistic `env_is_corrupt()` guard — distrusts the whole `.env` if it
  looks poisoned.
- CRLF strip in `prev_env()` — defends against `.env` saved on Windows.
- Auto-detects `USB_TTY_PORT` on macOS (glob `/dev/cu.usbmodem*` /
  `usbserial*`).

#### 7c. `start-local.ps1` (Windows)

Sibling launcher for Windows. Same env contract (`BE_URL`, `MQTT_BROKER`,
`MQTT_LOG_BROKER`, `GW_HOST`/`PORT`/`BIND_HOST`/`BIND_PORT`, `USB_TTY_PORT`
defaulting to `COM3`). Launches `test_gw.exe` and `test_device.exe --listen`
in separate `cmd.exe` windows.

#### 7d. `bootstrap-pi.sh` (Raspberry Pi)

For the laptop-hosts-BE + Pi-runs-the-SDK split deployment. Auto-installs
`libmosquitto-dev`, BE-discovers via `GET {LAPTOP}:3000/api/discover`,
reads `BE_BASE_URL` + `MQTT_BROKER`/`MQTT_PORT`, prompts for `GW_HOST` if
device role, builds and launches the role's binary (`./test_gw` or
`./test_device --listen`).

#### 7e. `.env.example` (root)

Reference for the env-var contract the launchers use.

#### 7f. `Cloud/.env.example`

Marker file so `TrustBridge-BE/start-all.sh`'s `require_env` check passes
at `$CLOUD_DIR`. The real cloud-agent config lives at
`Cloud/application_PoC_MQTT/.env`.

| File | Status |
|---|---|
| `PoC_SDK_v3/poc_sdk_device/app/Makefile` | added macOS branch |
| `PoC_SDK_v3/poc_sdk_gateway/app/Makefile` | added macOS branch + `gw_log.c` |
| `start-local.sh` | new |
| `start-local.ps1` | new |
| `bootstrap-pi.sh` | new |
| `.env.example` | new |
| `Cloud/.env.example` | new |

---

### 8. Misc cleanup

- `.gitignore` — added comprehensive ignores: `.env*`, secrets (`*.pem`,
  `*.key`), Python caches, C/C++ binaries (`*.o`, `*.a`, `*.so`, `*.dll`,
  `*.exe`, `*.out`, etc.), Docker `*.pid`, IDE folders, OS junk, logs, and
  the SDK binaries themselves (`test_sdk`, `test_device`, `test_gw`).
  Whitelists `.env.example` so templates stay tracked.
- `Cloud/application_PoC_MQTT/device_credentials_example.json` — pulled
  from `rev3.2-Mutual` as a reference for the fallback `JsonFileCredentialsStore`
  schema (only consulted when `BE_URL` is unset).
- **Removed compiled binaries from tracking:** `test_device`, `test_gw`
  (these had been checked in upstream).

| File | Status |
|---|---|
| `.gitignore` | modified |
| `PoC_SDK_v3/poc_sdk_device/app/test_device` | **deleted from tracking** |
| `PoC_SDK_v3/poc_sdk_gateway/app/test_gw` | **deleted from tracking** |

---

## Full file-by-file diff stat

```
 .env.example                                                    |  40 +
 .gitignore                                                      |  12 +/-
 Cloud/.env.example                                              |   9 +
 Cloud/application_PoC_MQTT/app/config.py                        |  12 +/-
 Cloud/application_PoC_MQTT/app/handlers.py                      | 174 +/-
 Cloud/application_PoC_MQTT/app/mqtt_transport.py                |   9 +/-
 Cloud/application_PoC_MQTT/app/sdk_factory.py                   |  19 +/-
 Cloud/application_PoC_MQTT/app/trustbridge_credentials_store.py | 179 +
 Cloud/docker-compose.yml                                        |  94 +/-
 PoC_SDK_v3/poc_sdk_device/app/Makefile                          |  15 +
 PoC_SDK_v3/poc_sdk_device/app/config_poc.h                      |  16 +/-
 PoC_SDK_v3/poc_sdk_device/app/main_device.c                     | 129 +/-
 PoC_SDK_v3/poc_sdk_device/app/port/port_comm_device.c           |   6 +/-
 PoC_SDK_v3/poc_sdk_device/app/port/port_spi_usb.c               |  57 +/-
 PoC_SDK_v3/poc_sdk_device/app/test_device                       | Bin (removed)
 PoC_SDK_v3/poc_sdk_device/sdk_fw/src/middleware/sgr_mw.c        |  43 +/-
 PoC_SDK_v3/poc_sdk_device/sdk_fw/src/services/crypto/crypto.c   |  19 +/-
 PoC_SDK_v3/poc_sdk_device/sdk_fw/src/services/crypto/crypto.h   |  32 +/-
 PoC_SDK_v3/poc_sdk_gateway/app/Makefile                         |  18 +/-
 PoC_SDK_v3/poc_sdk_gateway/app/config_poc.h                     |   8 +/-
 PoC_SDK_v3/poc_sdk_gateway/app/main_gw.c                        |  83 +
 PoC_SDK_v3/poc_sdk_gateway/app/port/gw_log.c                    | 161 +
 PoC_SDK_v3/poc_sdk_gateway/app/port/gw_log.h                    |  33 +
 PoC_SDK_v3/poc_sdk_gateway/app/test_gw                          | Bin (removed)
 PoC_SDK_v3/poc_sdk_gateway/sdk_fw/src/middleware/sgr_mw.c       | 486 +/-
 PoC_SDK_v3/poc_sdk_gateway/sdk_fw/src/middleware/sgr_mw.h       |   3 +/-
 PoC_SDK_v3/poc_sdk_gateway/sdk_fw/src/services/crypto/crypto.c  |  19 +/-
 PoC_SDK_v3/poc_sdk_gateway/sdk_fw/src/services/crypto/crypto.h  |  24 +/-
 PoC_SDK_v3/poc_sdk_gateway/sdk_fw/src/services/database/auth_db.c           |  25 +/-
 PoC_SDK_v3/poc_sdk_gateway/sdk_fw/src/services/database/auth_db.h           |  24 +/-
 PoC_SDK_v3/poc_sdk_gateway/sdk_fw/src/services/database/auth_db_whitelist.c |  95 +/-
 bootstrap-pi.sh                                                 | 193 +
 start-local.ps1                                                 | 144 +
 start-local.sh                                                  | 271 +
─────────────────────────────────────────────────────────────────────────────
 34 files changed, 2042 insertions(+), 410 deletions(-)
```

(Counts from `git diff --stat 847c95d..8c223be`.)

---

## Verified end-to-end on hardware

SandGrain USB chip on macOS arm64 (`/dev/cu.usbmodemCOMP0011`),
TrustBridge BE + FE + Mosquitto + cloud-agent in Docker.

- **Mode 1 (Normal Flow)** — enrollment + lifecycle re-auths
  - Device chip computes RW with token-auth opcode `0x03000800`
  - Gateway: `[6/6] CR verdict: AUT_OK ✔ (token-auth verified + auto-claim finalized)`
  - Cloud agent: `replyRW ok auth_status=AUTH_OK claim_token_id=… claim_result=CLAIMED`
  - Phase 2: `HRW_token == HRW_cloud — MUTUAL AUTH OK ✔`
- **Mode 2 (Fault Injection)** — gateway tolerates the injected flips
  via candidate recovery; auth succeeds.
- **Mode 3 (Error Stress)** — heavy injection; gateway brute-forces
  7 CW candidates, candidate 7/7 matches with bit-diff=0 → AUT_OK ✓.

`TrustBridge BE` shows three success activity-log events per Phase-1 run:

- `Phase 1 — token authentication verified by CyberRock`
- `Phase 1 — device claim finalized in CyberRock tenant`
- `Phase 1 complete — token auth + claim verified`

Device transitions through `idle → inprogress → claimed → authenticated`
in the TrustBridge DB based on the gw_log labels above.

---

## How to reproduce

```bash
# 1. BE + FE + Mosquitto in Docker (TrustBridge stack)
cd ~/TrustBridge/TrustBridge-BE
./start-all.sh                          # brings up BE + FE + mosquitto + cloud-agent

# 2. Single-machine SDK launch (macOS / Linux)
cd ~/TrustBridge/sandgrain-sdk            # this repo, with integration restored
./start-local.sh                        # interactive prompts; -y for defaults

# - opens two terminals
#   * test_gw     (gateway, listens on :8080 + MQTT to localhost:1883)
#   * test_device (listener, subscribes to cmd/run_auth)

# 3. Trigger from TrustBridge UI
#    Enroll a device → publishes cmd/run_auth {"mode":1}
#    Click "Move to Lifecycle" on a claimed device → mode 3
#    Click "Inject Fault" on an active device → mode 2
```

For Pi: copy `bootstrap-pi.sh` to the Pi, set `LAPTOP_HOST`,
`ROLE=gateway` or `ROLE=device`, run.
For Windows: `.\start-local.ps1` (or `.\start-local.ps1 -y` for defaults).

---

## Where this branch lives

```
SandGrain-CyberRock/trustbridge-sdk-v3
└── trustbridge-0.4-sdk3.2ARM       a054429 (orphan, single root commit)
```

`SandGrain-CyberRock/sandgrain-sdk` itself — upstream `rev3.2-ARM` plus
this integration is **not** pushed there (write access not granted by
the SandGrain SDK team). Local-only commit `8c223be` on this clone is
preserved in the reflog as a recoverable backup.
