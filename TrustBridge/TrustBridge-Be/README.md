# TrustBridge-BE

Backend for TrustBridge (`trustbridge-be` 1.0.0) — the device-fleet management
layer that wraps the SandGrain SDK auth stack. **The scripts that orchestrate
the whole integrated Docker stack live in this directory** (`start-all.{sh,ps1}`),
so this is the entry point for bringing everything up.

## What's here

- **NestJS 10** service, TypeORM + **MySQL 8**, JWT / RBAC, Swagger.
- Modules: devices, device groups / profiles, organizations,
  users / roles / permissions, dashboards, system activity, tenant API, MQTT.
- `docker-compose.yml` — owns three containers: `mysql:8.0`,
  `eclipse-mosquitto:2`, and the BE itself.
- `start-all.sh` / `start-all.ps1` — stack orchestrators (below).
- `.env` — DB / JWT / MQTT / `PORT` config (not committed).

## Ports

| Service    | Port         | Notes                                    |
| ---------- | ------------ | ---------------------------------------- |
| BE API     | `:3000/api`  | REST; Swagger UI at `/docs`              |
| Mosquitto  | `:1883`      | shared MQTT broker for the whole stack   |
| MySQL      | `:3306`      | seeded on first `up`                     |

## Orchestration scripts — `start-all.{sh,ps1}`

`start-all` brings up the **entire** integrated stack — BE (+ MySQL +
Mosquitto), FE, and the SandGrain **Cloud SDK** — each from its own
`docker-compose.yml`, joined on a shared external Docker network
(`trustbridge-net`). The cloud always runs in **TrustBridge mode**: device /
tenant / CyberRock credentials resolve live from the BE database (the launcher
exports `CREDENTIALS_SOURCE=trustbridge` and `BE_URL`, overriding whatever is in
the cloud `.env`).

Run from this directory:

```bash
./start-all.sh up          # macOS / Linux / Git Bash / WSL
.\start-all.ps1 up         # Windows PowerShell
```

| Command         | Effect                                                              |
| --------------- | ------------------------------------------------------------------ |
| `up`            | Incremental build + start all (default)                            |
| `down`          | Stop all, keep volumes                                             |
| `wipe`          | Stop all **and delete volumes** (the DB re-seeds on the next `up`) |
| `rebuild`       | Force `--no-cache` rebuild + start (use when an image is stuck on a stale cached layer) |
| `logs [svc]`    | Tail logs — `svc` ∈ `be`, `fe`, `cloud-sdk`, `mysql`, `mosquitto`  |
| `status` / `ps` | Show container status                                              |

Both launchers accept the same commands and share the same path-resolution
logic, so the workflow is identical on Windows and Unix.

### Where it finds the other repos

The SandGrain Cloud SDK lives in the separate top-level **`SDK/`** repo, not
under `TrustBridge/`. `start-all` resolves the SDK repo in this order (first
match wins):

1. `$SDK_REPO` env var — explicit override
2. `../../SDK` — the SDK-Versioning layout (SDK is a top-level sibling of `TrustBridge/`)
3. `../sandgrain-sdk` — a flat clone with the renamed repo
4. `../trustbridge-sdk-v3` — legacy name, kept so older clones still work

The cloud compose is then `<SDK repo>/PoC_SDK_v3/sdk_cloud`. The BE and FE repos
default to `TrustBridge-BE` / `TrustBridge-FE` next to the script and can
likewise be overridden with `BE_REPO` / `FE_REPO`.

## Running the SandGrain SDK against this stack

Once the stack is up, the containerized `sandgrain-cloud-app` **is** the cloud
agent — so on the SDK side you run only the Gateway + Device in **no-cloud**
mode (`cd ../../SDK && ./run_all.sh --no-cloud`). See the
[root README](../../README.md#run-the-trustbridge-stack-with-the-sandgrain-sdk-no-cloud)
for the full end-to-end walkthrough.
