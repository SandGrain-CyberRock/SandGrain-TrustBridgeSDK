# TrustBridge-FE

Frontend for TrustBridge (`trustbridge-fe`) — the admin dashboard for the
device-fleet management layer that sits on top of the SandGrain SDK auth stack.

## What's here

- **React 19 + Vite + TypeScript**, Chakra UI.
- Admin dashboard: devices, device hierarchies/groups, auth & comm events,
  audit logs, organizations, users and RBAC.
- Talks REST to the backend via **`VITE_APP_ENDPOINT`** (e.g.
  `http://localhost:3000/`).
- Dev server runs on **`:5173`**.
- `docker-compose.yml` + `Dockerfile` — containerized dev server, joined to the
  stack on the external `trustbridge-net` network.

## Running it

### As part of the full stack (recommended)

The FE comes up automatically with the rest of the stack via the orchestrator in
TrustBridge-BE — this is the normal path:

```bash
cd ../TrustBridge-BE
./start-all.sh up          # or  .\start-all.ps1 up  on Windows
```

That builds this repo's image and starts the dev server on `:5173`, wired to the
BE on `:3000`.

### Standalone (local dev, no Docker)

```bash
npm install                # lockfiles are gitignored; `npm install`, not `npm ci`
npm run dev                # Vite dev server on :5173
```

Point it at a running BE by setting `VITE_APP_ENDPOINT` (via `.env` or the
shell) before `npm run dev`.

npm scripts: `dev` (Vite dev server), `build` (`tsc -b && vite build`),
`preview` (serve the production build), `lint` (ESLint).

> **Note on the Dockerfile:** `package-lock.json` (and `yarn.lock`) are
> gitignored in this repo, so the image build uses `npm install` with an
> optional lockfile rather than `npm ci` — a fresh clone has no committed
> lockfile for `npm ci` to consume.

## More

- **[Readme_setup.md](./Readme_setup.md)** — the formal TrustBridge local
  environment deployment & setup guide (TB-TDD-001), covering BE + FE + Cloud +
  SDK device simulators end to end.
- **[root README](../../README.md)** — the full stack architecture and the
  no-cloud SDK run walkthrough.
