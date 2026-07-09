#!/usr/bin/env bash
# =============================================================================
# start-all.sh — bring up the full TrustBridge Docker stack
#
# Brings up: BE (+ MySQL + Mosquitto), FE, Cloud SDK — each via its own
# docker-compose.yml inside its respective repo, joined by a shared external
# Docker network.
#
# PATHS
#   By default the script looks for the three repos as siblings of THIS
#   script's parent directory (i.e. ../TrustBridge-Be, ../TrustBridge-FE,
#   ../sdk-v3 relative to this folder).
#
#   Override with environment variables when needed:
#       BE_REPO=/abs/path/to/TrustBridge-Be \
#       FE_REPO=/abs/path/to/TrustBridge-FE \
#       SDK_REPO=/abs/path/to/sdk-v3 \
#       ./start-all.sh up
#
# COMMANDS
#       ./start-all.sh up        # incremental build + start all (default)
#       ./start-all.sh down      # stop all (keeps volumes)
#       ./start-all.sh wipe      # stop all + DELETE volumes (re-seed on next up)
#       ./start-all.sh rebuild   # FORCE --no-cache rebuild + start all (use
#                                # when an image is stuck on old source - e.g.
#                                # cloud-sdk has the paho `_on_disconnect`
#                                # bug because Docker reused a cached layer)
#       ./start-all.sh logs [svc]
#       ./start-all.sh status
#
# OS
#   Tested on macOS, Linux, Windows (Git Bash / WSL). Requires:
#     - bash 3.2+
#     - docker (with the `docker compose` v2 plugin)
# =============================================================================

set -e

# ── Resolve paths (script-dir relative, env-overridable) ─────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

BE_REPO="${BE_REPO:-$ROOT_DIR/TrustBridge-BE}"
FE_REPO="${FE_REPO:-$ROOT_DIR/TrustBridge-FE}"
# Locate the SDK repo across layouts, newest first:
#   $ROOT_DIR/../SandGrain-SDK  SandGrain-TrustBridgeSDK layout: the SDK is a
#                               top-level dir, sibling of TrustBridge/ (BE/FE).
#   $ROOT_DIR/../SDK            older layout, before the SDK dir was renamed.
#   $ROOT_DIR/sandgrain-sdk     flat clone, repo renamed trustbridge-sdk-v3 -> sandgrain-sdk.
#   $ROOT_DIR/trustbridge-sdk-v3  legacy name, kept so existing clones still work.
if [ -n "${SDK_REPO:-}" ]; then
    :
elif [ -d "$ROOT_DIR/../SandGrain-SDK" ]; then
    SDK_REPO="$(cd "$ROOT_DIR/../SandGrain-SDK" && pwd)"
elif [ -d "$ROOT_DIR/../SDK" ]; then
    SDK_REPO="$(cd "$ROOT_DIR/../SDK" && pwd)"
elif [ -d "$ROOT_DIR/sandgrain-sdk" ]; then
    SDK_REPO="$ROOT_DIR/sandgrain-sdk"
else
    SDK_REPO="$ROOT_DIR/trustbridge-sdk-v3"
fi
CLOUD_DIR="$SDK_REPO/PoC_SDK_v3/sdk_cloud"

NETWORK_NAME="trustbridge-net"

# The integrated Docker stack ALWAYS runs the cloud in TrustBridge mode: device,
# tenant and CF credentials are resolved live from the BE database. These are
# read by sdk_cloud/docker-compose.yml via ${CREDENTIALS_SOURCE}/${BE_URL} and
# override whatever is in the cloud .env — so a fresh clone (whose .env is
# seeded from .env.example = standalone) still runs TrustBridge mode here.
# Standalone runs the cloud NATIVELY (run_standalone.*), not via this script, and
# defaults to file-based creds.
export CREDENTIALS_SOURCE="trustbridge"
export BE_URL="http://be:3000/api"

# ── Helpers ──────────────────────────────────────────────────────────────────
err()  { printf "\033[31m[start-all] %s\033[0m\n" "$*" >&2; }
log()  { printf "\033[36m[start-all] %s\033[0m\n" "$*"; }

# Best-effort detection of the laptop's primary LAN IPv4. Skips loopback /
# link-local / Docker / Tailscale. Empty stdout if nothing usable.
lan_ip() {
    local ip=""
    case "$(uname -s)" in
        Darwin)
            for iface in en0 en1 en2 en3; do
                ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
                [ -n "$ip" ] && break
            done
            ;;
        Linux)
            # `hostname -I` lists all non-loopback IPs, primary first
            ip="$(hostname -I 2>/dev/null | awk '{
                for (i = 1; i <= NF; i++) {
                    if ($i !~ /^127\./ && $i !~ /^169\.254\./ && $i !~ /^172\.1[7-9]\./ && $i !~ /^172\.2[0-9]\./ && $i !~ /^172\.3[01]\./) {
                        print $i; exit
                    }
                }
            }')"
            ;;
    esac
    echo "$ip"
}

require_dir() {
    if [ ! -f "$1/docker-compose.yml" ]; then
        err "Missing docker-compose.yml in: $1"
        err "Set the corresponding repo env var (BE_REPO/FE_REPO/SDK_REPO) and retry."
        exit 1
    fi
}

require_env() {
    if [ ! -f "$1/.env" ]; then
        if [ -f "$1/.env.example" ]; then
            log "No .env in $1 — copying from .env.example"
            cp "$1/.env.example" "$1/.env"
        else
            err "No .env or .env.example in $1"
            exit 1
        fi
    fi
}

ensure_network() {
    if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
        log "Creating Docker network: $NETWORK_NAME"
        docker network create "$NETWORK_NAME" >/dev/null
    fi
}

# A NATIVE mosquitto (left over from a standalone run_all/run_standalone) squats
# host port 1883 and fights the Docker broker (tb-mosquitto), silently breaking
# auth. The containerized broker is NOT a host process, so pgrep only finds the
# native one. Stop it so Docker owns 1883 cleanly. (TrustBridge and standalone
# are mutually exclusive on 1883 — one mode at a time.)
stop_native_broker() {
    if pgrep -x mosquitto >/dev/null 2>&1; then
        log "Stopping a native mosquitto broker (standalone leftover) so Docker can use port 1883"
        pkill -x mosquitto 2>/dev/null || true
        sleep 1
    fi
}

# The cloud compose bind-mounts device_credentials.json. If that path doesn't
# exist when Docker starts, Docker creates it as an empty DIRECTORY — which then
# breaks the cloud (and run_all's writes). Ensure it's a real file first.
ensure_creds_file() {
    local f="$CLOUD_DIR/application_PoC_MQTT/device_credentials.json"
    if [ -d "$f" ]; then
        log "device_credentials.json is a directory (Docker bind-mount artifact) — recreating as a file"
        rm -rf "$f"
    fi
    if [ ! -e "$f" ]; then
        printf '{\n  "devices": {}\n}\n' > "$f"
        log "Seeded an empty device_credentials.json (so Docker mounts a file, not a directory)"
    fi
}

# The cloud/emqx container names are hardcoded in compose. A leftover container
# with one of those names (from the old Cloud/ path, a previous project, or a
# standalone-docker run) blocks `up` with a name conflict. Clear them:
#  - sandgrain-cloud-app: remove only if it belongs to a DIFFERENT compose
#    project (so the current one isn't needlessly recreated).
#  - emqx-enterprise: always remove — the integrated stack uses Docker mosquitto,
#    not the bundled EMQX, and a leftover would also squat port 1883.
clear_conflicting_containers() {
    local proj want
    want="$(basename "$CLOUD_DIR" | tr '[:upper:]' '[:lower:]')"
    if docker container inspect sandgrain-cloud-app >/dev/null 2>&1; then
        proj="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' sandgrain-cloud-app 2>/dev/null || true)"
        if [ "$proj" != "$want" ]; then
            log "Removing conflicting cloud container 'sandgrain-cloud-app' (project='${proj:-none}', need '$want')"
            docker rm -f sandgrain-cloud-app >/dev/null 2>&1 || true
        fi
    fi
    if docker container inspect emqx-enterprise >/dev/null 2>&1; then
        log "Removing leftover 'emqx-enterprise' (integrated stack uses mosquitto, not EMQX)"
        docker rm -f emqx-enterprise >/dev/null 2>&1 || true
    fi
}

compose() {
    # $1 = repo dir, rest = compose args
    local dir="$1"; shift
    (cd "$dir" && docker compose "$@")
}

# ── Pre-flight ───────────────────────────────────────────────────────────────
require_dir "$BE_REPO"
require_dir "$FE_REPO"
require_dir "$CLOUD_DIR"

CMD="${1:-up}"

case "$CMD" in
    up)
        require_env "$BE_REPO"
        require_env "$FE_REPO"
        require_env "$CLOUD_DIR"
        require_env "$CLOUD_DIR/application_PoC_MQTT"
        stop_native_broker
        ensure_creds_file
        clear_conflicting_containers
        ensure_network

        log "Starting BE stack (mysql + mosquitto + be) — $BE_REPO"
        compose "$BE_REPO" up -d --build

        log "Starting FE — $FE_REPO"
        compose "$FE_REPO" up -d --build

        log "Starting Cloud SDK — $CLOUD_DIR"
        compose "$CLOUD_DIR" up -d --build

        log "All services started."
        log ""
        log "Local (this machine only):"
        log "  FE      → http://localhost:5173"
        log "  BE      → http://localhost:3000/docs"
        log "  MySQL   → localhost:3306"
        log "  MQTT    → localhost:1883"

        LAN_IP="$(lan_ip)"
        HOST_NAME="$(hostname 2>/dev/null | tr -d '\n')"

        if [ -n "$LAN_IP" ]; then
            log ""
            log "LAN (other devices on the same Wi-Fi/Ethernet, e.g. Raspberry Pis):"
            log "  FE        → http://${LAN_IP}:5173    or  http://${HOST_NAME}.local:5173"
            log "  BE        → http://${LAN_IP}:3000    or  http://${HOST_NAME}.local:3000"
            log "  MQTT      → ${LAN_IP}:1883          or  ${HOST_NAME}.local:1883"
            log "  Discovery → http://${LAN_IP}:3000/api/discover"
            log ""
            log "Raspberry Pi setup — on each Pi run ./bootstrap-pi.sh and answer:"
            log "  hostname mode (recommended): Laptop hostname [${HOST_NAME}.local]"
            log "  IP mode:                     Laptop IP       [${LAN_IP}]"
        else
            log ""
            log "(could not auto-detect LAN IP — for Pi setup, run 'ip -4 addr' (Linux) or 'ifconfig' (macOS))"
            log "(this machine's hostname for hostname mode: ${HOST_NAME}.local)"
        fi

        log ""
        log "Tail logs:  ./start-all.sh logs [be|fe|cloud-sdk|mysql|mosquitto]"
        ;;

    rebuild)
        # Force a from-scratch rebuild of every image, then bring everything
        # up. The default `up` runs `compose up -d --build` which is
        # INCREMENTAL: if Docker doesn't see source-file changes (or someone
        # ran it without pulling latest), the cached image layer is reused
        # and stale code keeps running. Symptom we've hit: cloud-sdk container
        # is "Up" but logs are days old + auth flow stalls at gateway step 2/6
        # because the image was built before the paho `_on_disconnect` fix.
        # `rebuild` forces --no-cache so the next `up` definitely picks up
        # whatever's on disk right now.
        require_env "$BE_REPO"
        require_env "$FE_REPO"
        require_env "$CLOUD_DIR"
        require_env "$CLOUD_DIR/application_PoC_MQTT"
        stop_native_broker
        ensure_creds_file
        clear_conflicting_containers
        ensure_network

        log "Stopping all containers first (so rebuilt images get used)..."
        compose "$CLOUD_DIR" down || true
        compose "$FE_REPO"   down || true
        compose "$BE_REPO"   down || true

        log "Forcing --no-cache rebuild of BE stack — $BE_REPO"
        compose "$BE_REPO"   build --no-cache
        log "Forcing --no-cache rebuild of FE — $FE_REPO"
        compose "$FE_REPO"   build --no-cache
        log "Forcing --no-cache rebuild of Cloud SDK — $CLOUD_DIR"
        compose "$CLOUD_DIR" build --no-cache

        log "Starting BE stack"
        compose "$BE_REPO"   up -d
        log "Starting FE"
        compose "$FE_REPO"   up -d
        log "Starting Cloud SDK"
        compose "$CLOUD_DIR" up -d

        log ""
        log "All services rebuilt + started."
        log "Verify cloud-sdk picked up latest source:"
        log "  docker logs --tail 5 tb-cloud-sdk     (timestamps should be NOW, not days/weeks ago)"
        ;;

    down)
        log "Stopping Cloud SDK"; compose "$CLOUD_DIR" down || true
        log "Stopping FE";        compose "$FE_REPO"   down || true
        log "Stopping BE stack";  compose "$BE_REPO"   down || true
        ;;

    wipe)
        log "Stopping + WIPING volumes (DB, MQTT, seed marker)"
        compose "$CLOUD_DIR" down -v || true
        compose "$FE_REPO"   down -v || true
        compose "$BE_REPO"   down -v || true
        ;;

    logs)
        SVC="${2:-}"
        if [ -z "$SVC" ]; then
            err "Usage: ./start-all.sh logs <service>"
            err "Services: be | fe | cloud-sdk | mysql | mosquitto"
            exit 1
        fi
        case "$SVC" in
            be|mysql|mosquitto) compose "$BE_REPO"   logs -f "$SVC" ;;
            fe)                 compose "$FE_REPO"   logs -f "$SVC" ;;
            cloud-sdk)          compose "$CLOUD_DIR" logs -f "$SVC" ;;
            *) err "Unknown service: $SVC"; exit 1 ;;
        esac
        ;;

    status|ps)
        compose "$BE_REPO"   ps
        compose "$FE_REPO"   ps
        compose "$CLOUD_DIR" ps
        ;;

    *)
        err "Unknown command: $CMD"
        err "Usage: ./start-all.sh [up|down|wipe|logs <svc>|status]"
        exit 1
        ;;
esac
