#!/usr/bin/env bash
#
# run_all.sh — per-run launcher for the SandGrain PoC_SDK_v3 stack.
#
# Run ./setup.sh ONCE first: it installs the system packages, creates the venv
# and installs the Python deps. This script then, on every run:
#   1. Prompts for CyberRock/Device/Cloudflare settings, the tenant login, and the
#      MQTT broker credentials (defaults come from .env / device_credentials.json).
#   2. Writes the cloud app's .env and the tenant block of device_credentials.json.
#   3. Verifies the Python venv exists (created by setup.sh).
#   4. Rebuilds the device and gateway firmware (`make clean` + `make`).
#   5. Detects the device TID via BIST and verifies it has a credentials entry
#      in device_credentials.json, warning if not (skip with --no-detect-tid).
#      Per-TID device logins are maintained directly in that file, not prompted.
#   6. Opens the three components (Cloud / Gateway / Device), auto-detecting how:
#        - WSL / Windows  : three Windows Terminal windows (wt.exe + wsl.exe)
#        - Linux + GUI    : three terminal windows (gnome-terminal/konsole/xterm/...)
#        - Headless Linux : three panes in a tmux session named "sandgrain"
#
# Run it from a WSL shell or a Linux shell:  bash run_all.sh
# (On Windows you can also use run_all.ps1, which just calls this via WSL.)
#
# Options:
#   --no-build       skip the build, use the existing binaries
#   --no-detect-tid  skip the device TID auto-detection step
#   -h | --help      show this help
#
set -euo pipefail

# --------------------------------------------------------------------------
# Resolve paths (this script lives at the repo root)
# --------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$SCRIPT_DIR"

CLOUD_DIR="$REPO_ROOT/PoC_SDK_v3/sdk_cloud"
APP_DIR="$CLOUD_DIR/application_PoC_MQTT"
# run_all's OWN env file — separate from the Docker cloud's .env. The Docker
# cloud needs MQTT_HOST=mosquitto (a compose service name); the native
# gateway/device/local-cloud need a real host IP. Sharing one .env let run_all
# clobber the Docker cloud's broker host and crash it, so they're kept apart.
# (.env.runall is gitignored via the .env.* rule.)
ENV_FILE="$APP_DIR/.env.runall"
VENV_DIR="$CLOUD_DIR/venv"
DEVICE_DIR="$REPO_ROOT/PoC_SDK_v3/poc_sdk_device/app"
GW_DIR="$REPO_ROOT/PoC_SDK_v3/poc_sdk_gateway/app"
WHITELIST_FILE="$GW_DIR/trustbridge_whitelist.txt"   # static gateway whitelist (standalone)

# --------------------------------------------------------------------------
# Args
# --------------------------------------------------------------------------
DO_BUILD=1
DETECT_TID=1
RUN_CLOUD=1
TRACE=1; TRACE_DEBUG=0     # traceability is ON by default (INFO); --debug adds request_data
for arg in "$@"; do
  case "$arg" in
    --no-build)      DO_BUILD=0 ;;
    --no-detect-tid) DETECT_TID=0 ;;
    --no-cloud)      RUN_CLOUD=0 ;;
    --info)          TRACE=1 ;;   # INFO is the default; accepted for back-compat
    --debug)         TRACE=1; TRACE_DEBUG=1 ;;
    -h|--help)
      cat <<'USAGE'
Usage: bash run_all.sh [--no-build] [--no-detect-tid] [--no-cloud]
  --no-build       Skip the build (make clean + make); use existing binaries
  --no-detect-tid  Skip device TID auto-detection (default: detect on every run).
                   Detection reads the TID via BIST and warns if it has no entry
                   in device_credentials.json (needs the chip connected).
  --no-cloud       Do NOT launch the local Python cloud agent. Use this when the
                   cloud agent runs elsewhere (e.g. the TrustBridge BE/FE stack in
                   Docker). Launches only Gateway + Device; they connect to the
                   MQTT broker you configure at the prompt -- point MQTT host/port
                   at the TrustBridge broker so its cloud agent answers.
                   Also runs the DEVICE in --listen mode (BE-driven via
                   cmd/run_auth from the FE/BE) with the interactive menu still
                   available in parallel.
  --debug          Add DEBUG-level detail to the trace: the masked `request_data`
                   field on each line (sets TRACE_LOG_DEBUG), ALONGSIDE the info
                   fields. Local traceability is ON BY DEFAULT at INFO level (sets
                   TRACE_LOG_PATH): Gateway -> <gw dir>/trace_gateway.jsonl,
                   Device -> <device dir>/trace_device.jsonl, Cloud -> <app
                   dir>/trace_cloud.jsonl (one JSON object per line). tail -f any
                   file to watch.
  -h, --help       Show this help

Opens Cloud (unless --no-cloud), Gateway and Device. The launch method is auto-detected:
  WSL / Windows  -> Windows Terminal windows
  Linux + GUI    -> gnome-terminal / konsole / xterm / ... windows
  Headless Linux -> a tmux session named 'sandgrain' (3 panes)
USAGE
      exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

say()  { printf '\n==> %s\n' "$*"; }
warn() { printf '[warn] %s\n' "$*" >&2; }
die()  { printf '[error] %s\n' "$*" >&2; exit 1; }

# True if a TCP listener is accepting connections at host:port.
broker_reachable() { (: < "/dev/tcp/${1:-127.0.0.1}/${2:-1883}") 2>/dev/null; }

# Standalone needs a local MQTT broker. If none is running, start mosquitto
# (bare = localhost-only, anonymous — exactly what the local cloud/gateway/device
# need). No-op if a broker is already up; warns (doesn't die) if mosquitto isn't
# installed so the user can start their own.
ensure_local_broker() {
  local port="${1:-1883}" bin="" c
  if broker_reachable 127.0.0.1 "$port"; then
    say "MQTT broker already running on 127.0.0.1:$port ✔"; return 0
  fi
  for c in mosquitto /opt/homebrew/sbin/mosquitto /usr/local/sbin/mosquitto /usr/sbin/mosquitto; do
    if command -v "$c" >/dev/null 2>&1; then bin="$(command -v "$c")"; break; fi
    [ -x "$c" ] && { bin="$c"; break; }
  done
  if [ -z "$bin" ]; then
    warn "No MQTT broker on 127.0.0.1:$port and mosquitto isn't installed."
    warn "Install it (macOS: brew install mosquitto; Debian/Pi: sudo apt install mosquitto) or start your own broker, then retry."
    return 0
  fi
  say "Starting local mosquitto broker ($bin -p $port) — standalone needs one"
  nohup "$bin" -p "$port" >/tmp/sgr_standalone_mosquitto.log 2>&1 &
  disown 2>/dev/null || true
  local i
  for i in $(seq 1 12); do
    broker_reachable 127.0.0.1 "$port" && { say "Broker up on 127.0.0.1:$port ✔"; return 0; }
    sleep 0.5
  done
  warn "Started mosquitto but it isn't reachable on 127.0.0.1:$port yet — see /tmp/sgr_standalone_mosquitto.log"
}

# First GUI terminal emulator on PATH (prefer specific ones so we can set titles).
detect_gui_term() {
  local t
  for t in gnome-terminal konsole xfce4-terminal mate-terminal tilix lxterminal xterm x-terminal-emulator; do
    if command -v "$t" >/dev/null 2>&1; then printf '%s' "$t"; return 0; fi
  done
  return 1
}

# Open one GUI terminal window running a launcher script (backgrounded).
open_gui_terminal() {  # TITLE SCRIPT
  local title="$1" script="$2"
  case "$GUI_TERM" in
    gnome-terminal|mate-terminal|tilix)
      "$GUI_TERM" --title="$title" -- bash "$script" >/dev/null 2>&1 & ;;
    konsole)
      konsole --hold -p tabtitle="$title" -e bash "$script" >/dev/null 2>&1 & ;;
    xfce4-terminal)
      xfce4-terminal --title="$title" -x bash "$script" >/dev/null 2>&1 & ;;
    lxterminal)
      lxterminal --title="$title" -e "bash $script" >/dev/null 2>&1 & ;;
    xterm)
      xterm -T "$title" -e bash "$script" >/dev/null 2>&1 & ;;
    *)
      "$GUI_TERM" -e bash "$script" >/dev/null 2>&1 & ;;
  esac
}

# Run all three components as panes in a (fresh) tmux session.
launch_tmux() {
  local sess="sandgrain"
  tmux kill-session -t "$sess" 2>/dev/null || true
  if [[ "$RUN_CLOUD" == 1 ]]; then
    tmux new-session  -d -s "$sess" -n stack "bash '$L_CLOUD'"
    tmux split-window -t "$sess" "bash '$L_GW'"
  else
    tmux new-session  -d -s "$sess" -n stack "bash '$L_GW'"
  fi
  tmux split-window -t "$sess" "bash '$L_DEV'"
  tmux select-layout -t "$sess" even-vertical >/dev/null
  tmux set-option -t "$sess" mouse on 2>/dev/null || true
}

# Read the connected device's TID via BIST (chip only — no GW/Cloud needed) and
# verify it has a credentials entry in device_credentials.json (warn if not).
# Best-effort: any problem is a warning, never aborts the launch.
# Add a TID to the static gateway whitelist, non-destructively. In standalone
# there is no BE to sync the whitelist from, so the gateway loads this file and
# only accepts devices listed here. (case-insensitive de-dup; keeps existing.)
add_tid_to_whitelist() {  # add_tid_to_whitelist TID
  local tid="$1"
  touch "$WHITELIST_FILE"
  if grep -qiE "^${tid}$" "$WHITELIST_FILE" 2>/dev/null; then
    say "TID already in gateway whitelist."
    return 0
  fi
  # ensure a trailing newline before appending
  if [[ -s "$WHITELIST_FILE" && -n "$(tail -c1 "$WHITELIST_FILE")" ]]; then
    printf '\n' >> "$WHITELIST_FILE"
  fi
  printf '%s\n' "$tid" >> "$WHITELIST_FILE"
  say "Added TID to gateway whitelist: $WHITELIST_FILE"
}

detect_and_register_tid() {
  if ! command -v python3 >/dev/null 2>&1; then
    warn "python3 not found; skipping TID auto-detect (use --no-detect-tid to silence)."; return 0
  fi
  local bin="$DEVICE_DIR/test_device"
  if [[ ! -x "$bin" ]]; then
    warn "device binary not found ($bin); skipping TID auto-detect."; return 0
  fi

  # Cache sudo creds up front so the BIST run doesn't prompt mid-pipe.
  if [[ -n "$DEV_SUDO" ]] && ! sudo -v; then
    warn "sudo authentication failed; skipping TID auto-detect."; return 0
  fi

  say "Reading device TID via BIST (token chip must be connected)..."
  # Wrap the BIST probe in a timeout: a hung serial read or a paho MQTT-disconnect
  # stall (e.g. broker not up yet, seen on WSL) must NEVER block the launcher.
  # If `timeout` isn't available (stock macOS), run without it.
  local out pcc id tid TO=""
  command -v timeout >/dev/null 2>&1 && TO="timeout -k 5 25"
  out="$( (cd "$DEVICE_DIR" && printf '0\n7\n' | ${DEV_SUDO}${TO:+$TO }./test_device) 2>/dev/null || true )"
  pcc="$(printf '%s\n' "$out" | grep -E 'BIST \] PCC' | grep -oiE '[0-9a-f]{32}' | head -n1 || true)"
  id="$( printf '%s\n' "$out" | grep -E 'BIST \] ID'  | grep -oiE '[0-9a-f]{32}' | head -n1 || true)"
  if [[ ${#pcc} -ne 32 || ${#id} -ne 32 ]]; then
    warn "Could not read the TID from BIST (chip not connected, or the probe timed out)."
    warn "Continuing to launch. If the gateway rejects the device, add its TID to:"
    warn "  $WHITELIST_FILE   (or re-run; or use --no-detect-tid to skip this step)"
    return 0
  fi
  tid="$(printf '%s%s' "$pcc" "$id" | tr 'A-F' 'a-f')"
  say "Device TID: $tid"

  # Resolve the credentials file from .env (relative paths are under the app dir).
  local creds_rel creds_file
  creds_rel="$(read_env DEVICE_CREDENTIALS_JSON ./device_credentials.json)"
  case "$creds_rel" in
    /*) creds_file="$creds_rel" ;;
    *)  creds_file="$APP_DIR/$creds_rel" ;;
  esac
  if [[ ! -f "$creds_file" ]]; then
    warn "device credentials file not found: $creds_file; skipping."; return 0
  fi

  # We do NOT prompt for a device username/password here. Each TID has its own
  # CyberRock device login, so those are maintained directly in
  # device_credentials.json. This just VERIFIES the detected TID has a usable
  # entry and warns if it doesn't.
  if python3 -c '
import json, sys
d = json.load(open(sys.argv[1]))
e = (d.get("devices") or {}).get(sys.argv[2]) or {}
sys.exit(0 if (e.get("username") and e.get("password")) else 1)
' "$creds_file" "$tid"; then
    say "TID is configured in $creds_file ✔"
  else
    warn "TID $tid has no (or incomplete) entry in $creds_file."
    warn "Add its CyberRock device login there before authenticating, e.g.:"
    warn "  \"devices\": { \"$tid\": { \"username\": \"<device-user>\", \"password\": \"<device-pass>\" } }"
  fi

  # Auto-add the TID to the gateway's static whitelist so the gateway accepts
  # this device (standalone has no BE to sync the whitelist from).
  add_tid_to_whitelist "$tid"
}

# --------------------------------------------------------------------------
# Pre-flight checks
# --------------------------------------------------------------------------
[[ -d "$APP_DIR"    ]] || die "Cloud app dir not found: $APP_DIR"
[[ -d "$DEVICE_DIR" ]] || die "Device dir not found: $DEVICE_DIR"
[[ -d "$GW_DIR"     ]] || die "Gateway dir not found: $GW_DIR"
command -v make    >/dev/null || die "make not found. Run ./setup.sh first (setup.ps1 on Windows)."

# wt.exe can be on PATH yet UNUSABLE: enabling systemd in WSL makes
# systemd-binfmt skip registration, dropping the WSLInterop handler, so every
# Windows .exe (incl. wt.exe) fails with "MZ: command not found". Treat wt as
# available only if Windows-interop is actually registered — otherwise we'd pick
# "wt" and die at launch instead of falling back to tmux.
wt_usable() {
  command -v wt.exe >/dev/null 2>&1 || return 1
  if grep -qiE "microsoft|wsl" /proc/version 2>/dev/null; then
    [[ -e /proc/sys/fs/binfmt_misc/WSLInterop ]] || return 1
  fi
  return 0
}

# Decide how we'll open the three components (fail fast if there's no way).
GUI_TERM=""
if wt_usable; then
  LAUNCH_MODE="wt"                                   # WSL / Windows
elif [[ "$(uname -s)" == "Darwin" ]] && command -v osascript >/dev/null 2>&1; then
  LAUNCH_MODE="mac"                                  # macOS Terminal.app
elif [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]] && GUI_TERM="$(detect_gui_term)"; then
  LAUNCH_MODE="gui"                                  # Linux desktop
elif command -v tmux >/dev/null 2>&1; then
  LAUNCH_MODE="tmux"                                 # headless Linux / SSH (or macOS via brew)
else
  die "No way to open the three terminals. Install one of: Windows Terminal (WSL, needs interop), a GUI terminal emulator (Linux desktop), or tmux (headless / macOS)."
fi

# Explain the non-obvious case: Windows Terminal is present but interop is off,
# so we fell back. Point the user at the permanent fix (setup.sh installs it).
if [[ "$LAUNCH_MODE" != "wt" ]] && command -v wt.exe >/dev/null 2>&1 \
   && grep -qiE "microsoft|wsl" /proc/version 2>/dev/null \
   && [[ ! -e /proc/sys/fs/binfmt_misc/WSLInterop ]]; then
  warn "Windows Terminal is installed but WSL Windows-interop is OFF (systemd=true drops the WSLInterop binfmt handler)."
  warn "Falling back to '$LAUNCH_MODE'. Run ./setup.sh once to register interop permanently and restore windowed launch."
fi
say "Launch mode: $LAUNCH_MODE${GUI_TERM:+ ($GUI_TERM)}"

# The device/gateway binaries need root on native Linux (serial / raw sockets),
# but not on WSL. Only prefix sudo when on real Linux, not already root, and
# sudo is available. (The Cloud Python app never needs sudo.)
SUDO=""
if ! grep -qiE "microsoft|wsl" /proc/version 2>/dev/null; then
  if [[ "$(id -u)" -ne 0 ]] && command -v sudo >/dev/null 2>&1; then
    SUDO="sudo "
  fi
fi
[[ -n "$SUDO" ]] && say "Device/Gateway will run with sudo (native Linux)"

# The DEVICE binary also needs root to reach the chip's serial device (e.g. a
# usbip-attached /dev/ttyACM* under WSL), so it gets sudo even on WSL — where
# the gateway does not. No-op if already root or sudo is unavailable.
DEV_SUDO="$SUDO"
if [[ -z "$DEV_SUDO" && "$(id -u)" -ne 0 ]] && command -v sudo >/dev/null 2>&1; then
  DEV_SUDO="sudo "
fi
[[ -n "$DEV_SUDO" && -z "$SUDO" ]] && say "Device will run with sudo (WSL: needed for the chip serial device)"

# --------------------------------------------------------------------------
# 1) Prompt for configuration  (defaults from .env / device_credentials.json)
# --------------------------------------------------------------------------
read_env() {  # read_env KEY [DEFAULT]  -> echoes current value or default
  local key="$1" def="${2:-}" val=""
  if [[ -f "$ENV_FILE" ]]; then
    val="$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '\r' || true)"
  fi
  printf '%s' "${val:-$def}"
}

# Resolve the device-credentials JSON path (relative paths live under the app dir).
DEVICE_CREDENTIALS_JSON="$(read_env DEVICE_CREDENTIALS_JSON ./device_credentials.json)"
case "$DEVICE_CREDENTIALS_JSON" in
  /*) CREDS_FILE="$DEVICE_CREDENTIALS_JSON" ;;
  *)  CREDS_FILE="$APP_DIR/$DEVICE_CREDENTIALS_JSON" ;;
esac

HAVE_PY=0; command -v python3 >/dev/null 2>&1 && HAVE_PY=1
read_tenant() {  # read_tenant KEY DEFAULT  -> current tenant.<KEY> from the JSON, else DEFAULT
  local key="$1" def="${2:-}"
  if [[ "$HAVE_PY" == 1 && -f "$CREDS_FILE" ]]; then
    python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get("tenant",{}).get(sys.argv[2]) or sys.argv[3])' \
      "$CREDS_FILE" "$key" "$def" 2>/dev/null || printf '%s' "$def"
  else
    printf '%s' "$def"
  fi
}

say "Configuration  (press Enter to keep the [current] value)"

# --- CyberRock / device scope / Cloudflare Access  (-> .env) ---
# These configure the LOCAL Python cloud only: the CyberRock base URL, the
# Cloudflare Access headers it sends on requestRW/checkRequestRWStatus, and the
# DEVICE_ID topic scope. In --no-cloud the cloud runs in the external TrustBridge
# stack with its OWN .env, and nothing launched here consumes these — so don't
# prompt; just carry any previously-saved values forward as next-run defaults.
if [[ "$RUN_CLOUD" == 1 ]]; then
  cur_cr="$(read_env CYBERROCK_BASE_URL https://device-api-uat.sandgrain.dev)"
  read -rp "  CyberRock base URL      [${cur_cr}]: " in_cr || true; CYBERROCK_BASE_URL="${in_cr:-$cur_cr}"

  cur_did="$(read_env DEVICE_ID gw-001)"
  read -rp "  Device ID               [${cur_did}]: " in_did || true; DEVICE_ID="${in_did:-$cur_did}"

  cur_cfid="$(read_env CF_ACCESS_CLIENT_ID '')"
  read -rp "  CF Access Client ID     [${cur_cfid:-<empty>}]: " in_cfid || true; CF_ACCESS_CLIENT_ID="${in_cfid:-$cur_cfid}"

  cur_cfsec="$(read_env CF_ACCESS_CLIENT_SECRET '')"
  if [[ -n "$cur_cfsec" ]]; then cfsec_hint="keep current"; else cfsec_hint="empty"; fi
  read -rsp "  CF Access Client Secret [${cfsec_hint}]: " in_cfsec || true; echo
  CF_ACCESS_CLIENT_SECRET="${in_cfsec:-$cur_cfsec}"
else
  # --no-cloud: not consumed here; preserve saved values silently so a later
  # standalone run still finds its defaults in .env.runall.
  CYBERROCK_BASE_URL="$(read_env CYBERROCK_BASE_URL https://device-api-uat.sandgrain.dev)"
  DEVICE_ID="$(read_env DEVICE_ID gw-001)"
  CF_ACCESS_CLIENT_ID="$(read_env CF_ACCESS_CLIENT_ID '')"
  CF_ACCESS_CLIENT_SECRET="$(read_env CF_ACCESS_CLIENT_SECRET '')"
fi

# --- Tenant login  (-> device_credentials.json) ---
# Standalone only: the local cloud reads the tenant login from
# device_credentials.json. In --no-cloud the tenant login lives in the
# TrustBridge BE database, so there is nothing to prompt for or write here.
if [[ "$RUN_CLOUD" == 1 && "$HAVE_PY" == 1 ]]; then
  cur_temail="$(read_tenant email '')"
  read -rp "  Tenant email            [${cur_temail:-<empty>}]: " in_temail || true; TENANT_EMAIL="${in_temail:-$cur_temail}"
  cur_tpass="$(read_tenant password '')"
  if [[ -n "$cur_tpass" ]]; then tpass_hint="keep current"; else tpass_hint="empty"; fi
  read -rsp "  Tenant password         [${tpass_hint}]: " in_tpass || true; echo
  TENANT_PASSWORD="${in_tpass:-$cur_tpass}"
elif [[ "$RUN_CLOUD" == 1 ]]; then
  warn "python3 not found; skipping tenant email/password (cannot edit $CREDS_FILE)."
fi

# --- MQTT broker  (-> .env) ---
cur_host="$(read_env MQTT_HOST localhost)"
# 'mosquitto'/'be' are Docker service names that only resolve INSIDE the compose
# network -- useless for the native gateway/device here. Don't offer them as the
# default; fall back to localhost (or just type your TrustBridge host IP).
case "$cur_host" in mosquitto|be|"") cur_host="localhost" ;; esac
cur_port="$(read_env MQTT_PORT 1883)"
cur_user="$(read_env MQTT_USERNAME '')"
cur_pass="$(read_env MQTT_PASSWORD '')"
read -rp "  MQTT host               [${cur_host}]: "          in_host || true; MQTT_HOST="${in_host:-$cur_host}"
read -rp "  MQTT port               [${cur_port}]: "          in_port || true; MQTT_PORT="${in_port:-$cur_port}"
read -rp "  MQTT username           [${cur_user:-<empty>}]: " in_user || true; MQTT_USERNAME="${in_user:-$cur_user}"
if [[ -n "$cur_pass" ]]; then pass_hint="keep current"; else pass_hint="empty"; fi
read -rsp "  MQTT password           [${pass_hint}]: "        in_pass || true; echo
MQTT_PASSWORD="${in_pass:-$cur_pass}"

# --- TrustBridge BE IP + port  -> ONLY in --no-cloud (TrustBridge) mode ---
# The gateway syncs its device whitelist from the TrustBridge BE
# (curls http://<IP>:<PORT>/api/devices/whitelist). Standalone (run_all WITHOUT
# --no-cloud) runs a local cloud + static whitelist and needs no BE, so we skip
# this prompt entirely there.
if [[ "$RUN_CLOUD" == 0 ]]; then
  cur_be="$(read_env BE_HOST "$MQTT_HOST")"
  read -rp "  TrustBridge BE IP/host  [${cur_be}]: " in_be || true; BE_HOST="${in_be:-$cur_be}"
  # Be forgiving: accept a bare IP/host, or a pasted URL — reduce to just the host.
  BE_HOST="${BE_HOST#http://}"; BE_HOST="${BE_HOST#https://}"
  BE_HOST="${BE_HOST%%/*}"      # strip any /path
  BE_HOST="${BE_HOST%%:*}"      # strip any :port
  cur_beport="$(read_env BE_PORT 3000)"
  read -rp "  TrustBridge BE port     [${cur_beport}]: " in_beport || true; BE_PORT="${in_beport:-$cur_beport}"
  BE_URL_VAL="http://${BE_HOST}:${BE_PORT}/api"
else
  BE_HOST=""; BE_PORT=""; BE_URL_VAL=""
fi

# --------------------------------------------------------------------------
# 2) Write .env  (heredoc -> guaranteed LF endings, no BOM)
# --------------------------------------------------------------------------
say "Writing $ENV_FILE"
cat > "$ENV_FILE" <<EOF
# --- CyberRock / SandGrain ---
CYBERROCK_BASE_URL=${CYBERROCK_BASE_URL}

# --- MQTT / EMQX ---
MQTT_HOST=${MQTT_HOST}
MQTT_PORT=${MQTT_PORT}
MQTT_USERNAME=${MQTT_USERNAME}
MQTT_PASSWORD=${MQTT_PASSWORD}

# Device scope (topics include this)
DEVICE_ID=${DEVICE_ID}

# TID -> credentials mapping (JSON)
DEVICE_CREDENTIALS_JSON=${DEVICE_CREDENTIALS_JSON}

# Cloudflare Access (required for requestRW / checkRequestRWStatus)
CF_ACCESS_CLIENT_ID=${CF_ACCESS_CLIENT_ID}
CF_ACCESS_CLIENT_SECRET=${CF_ACCESS_CLIENT_SECRET}

# TrustBridge BE (gateway whitelist sync) — saved IP/port, used as defaults next run
BE_HOST=${BE_HOST}
BE_PORT=${BE_PORT}
EOF

# --------------------------------------------------------------------------
# 2b) Write the tenant login into device_credentials.json (preserving devices).
# Standalone ONLY — in --no-cloud (TrustBridge) credentials come from the BE
# database, so the local file is not used and must not be touched. (It may not
# even be a real file: a Docker bind-mount can leave it as an empty directory.)
# --------------------------------------------------------------------------
if [[ "$RUN_CLOUD" == 1 && "$HAVE_PY" == 1 ]]; then
  if [[ -d "$CREDS_FILE" ]]; then
    warn "$CREDS_FILE is a DIRECTORY (Docker bind-mount artifact), not a file."
    warn "Remove it and recreate as a file:  rm -rf '$CREDS_FILE'  (after stopping the Docker cloud), then re-run."
  else
    say "Updating tenant in $CREDS_FILE"
    TEMAIL="$TENANT_EMAIL" TPASS="$TENANT_PASSWORD" python3 -c '
import json, os, sys
p = sys.argv[1]
try:
    d = json.load(open(p))
except Exception:
    d = {}
d.setdefault("devices", {})
d["tenant"] = {"email": os.environ["TEMAIL"], "password": os.environ["TPASS"]}
open(p, "w").write(json.dumps(d, indent=2) + "\n")
' "$CREDS_FILE"
  fi
fi

# --------------------------------------------------------------------------
# 3) Verify the Python venv exists (it is created by setup.sh)
# --------------------------------------------------------------------------
if [[ "$RUN_CLOUD" == 1 ]]; then
  if [[ ! -f "$VENV_DIR/bin/activate" ]]; then
    die "Python venv not found at $VENV_DIR. Run ./setup.sh first (setup.ps1 on Windows)."
  fi
  say "Using venv at $VENV_DIR"
else
  say "Skipping local cloud (--no-cloud): venv not required; Gateway+Device will use an external cloud agent."
fi

# --------------------------------------------------------------------------
# 4) Build firmware
# --------------------------------------------------------------------------
if [[ "$DO_BUILD" == 1 ]]; then
  say "Building device firmware (clean)";  make -C "$DEVICE_DIR" clean; make -C "$DEVICE_DIR"
  say "Building gateway firmware (clean)"; make -C "$GW_DIR" clean;     make -C "$GW_DIR"
else
  say "Skipping build (--no-build)"
fi
[[ -x "$DEVICE_DIR/test_device" ]] || die "device binary missing: $DEVICE_DIR/test_device (run without --no-build)"
[[ -x "$GW_DIR/test_gw" ]]         || die "gateway binary missing: $GW_DIR/test_gw (run without --no-build)"

# --------------------------------------------------------------------------
# 5) Detect the device TID and verify it's in device_credentials.json (unless --no-detect-tid)
# --------------------------------------------------------------------------
# Standalone only: the local cloud reads device_credentials.json. In --no-cloud
# (TrustBridge) credentials come from the BE database, so there's nothing to add.
if [[ "$DETECT_TID" == 1 && "$RUN_CLOUD" == 1 ]]; then
  detect_and_register_tid
fi

# --------------------------------------------------------------------------
# 6) Generate per-window launcher scripts (in /tmp: a space-free path so the
#    Windows Terminal command line never has to quote it)
# --------------------------------------------------------------------------
write_launcher() {  # write_launcher FILE TITLE CMD...
  local file="$1" title="$2"; shift 2
  {
    echo '#!/usr/bin/env bash'
    echo "echo '============================================'"
    echo "echo '  $title'"
    echo "echo '============================================'"
    # Timestamp helper for the gateway/device launchers (they pipe through it).
    # Emits CR+LF so output stays aligned even if the TTY is left without ONLCR
    # after the sudo password prompt (plain LF would stair-step). `ts` emits LF
    # only, so it's intentionally not used here.
    echo '_stamp() { while IFS= read -r _l || [ -n "$_l" ]; do printf "[%s] %s\r\n" "$(date "+%Y-%m-%d %H:%M:%S")" "$_l"; done; }'
    # `stdbuf` (GNU coreutils) is absent on macOS/BSD. Fall back to Homebrew's
    # `gstdbuf`, else run with no wrapper. Expanded at launcher runtime ($STDBUF).
    echo 'if command -v stdbuf >/dev/null 2>&1; then STDBUF="stdbuf -oL -eL"; elif command -v gstdbuf >/dev/null 2>&1; then STDBUF="gstdbuf -oL -eL"; else STDBUF=""; fi'
    printf '%s\n' "$@"
    echo 'rc=${PIPESTATUS[0]}'
    echo "echo \"\""
    echo "echo \"[$title exited (status \$rc)]\""
    echo 'stty sane 2>/dev/null || true'   # restore TTY before dropping to a shell
    echo "echo 'This is now a normal shell — close the window when done.'"
    echo 'exec bash'
  } > "$file"
  chmod +x "$file"
}

L_CLOUD="/tmp/sgr_launch_cloud.sh"
L_GW="/tmp/sgr_launch_gw.sh"
L_DEV="/tmp/sgr_launch_device.sh"

# Optional local traceability for the cloud (--info / --debug): the Python cloud
# appends one JSON line per event to trace_cloud.jsonl in $APP_DIR (its cwd).
# Mirrors the gateway/device switches; a no-op unless TRACE_LOG_PATH is set.
CLOUD_TRACE_ENV=""
if [[ "$TRACE" == 1 ]]; then
  CLOUD_TRACE_ENV="TRACE_LOG_PATH='trace_cloud.jsonl' "
  [[ "$TRACE_DEBUG" == 1 ]] && CLOUD_TRACE_ENV+="TRACE_LOG_DEBUG='1' "
fi

if [[ "$RUN_CLOUD" == 1 ]]; then
  # Local cloud == STANDALONE: force file-based creds (JsonFileCredentialsStore)
  # and strip BE_URL/TRUSTBRIDGE_BASE_URL so an inherited trustbridge env can't
  # flip it. (--no-cloud skips this and uses the external TrustBridge cloud,
  # which start-all runs in trustbridge mode.)
  write_launcher "$L_CLOUD" "SandGrain CLOUD" \
    "cd '$APP_DIR'" \
    "source '$VENV_DIR/bin/activate'" \
    "set -a; . '$ENV_FILE'; set +a" \
    "env -u BE_URL -u TRUSTBRIDGE_BASE_URL ${CLOUD_TRACE_ENV}CREDENTIALS_SOURCE=standalone python -m app.main"
fi

# Pass the chosen broker into the C binaries' environment (config_poc.h reads
# MQTT_BROKER/MQTT_PORT via getenv). Point MQTT host/port at the TrustBridge
# broker and the gateway/device talk to whichever cloud agent listens there.
# BE_URL_VAL was built above from the TrustBridge BE IP/port prompts; it lets the
# gateway sync its whitelist from the TrustBridge BE (curls BE_URL/devices/whitelist).
# Optional local traceability (--info / --debug): each C binary appends one JSON line per
# event to a file in its OWN working dir, so the two processes never share a file
# (the in-process mutex only guards same-process threads). A relative path also
# sidesteps native-vs-WSL path-form issues — fopen resolves it against each
# binary's cwd ($GW_DIR / $DEVICE_DIR).
GW_TRACE_ENV=""; DEV_TRACE_ENV=""
if [[ "$TRACE" == 1 ]]; then
  GW_TRACE_ENV="TRACE_LOG_PATH='trace_gateway.jsonl' "
  DEV_TRACE_ENV="TRACE_LOG_PATH='trace_device.jsonl' "
  # DEBUG level rides on top of INFO (same file, same lines) — adds request_data.
  if [[ "$TRACE_DEBUG" == 1 ]]; then
    GW_TRACE_ENV+="TRACE_LOG_DEBUG='1' "
    DEV_TRACE_ENV+="TRACE_LOG_DEBUG='1' "
  fi
fi

write_launcher "$L_GW" "SandGrain GATEWAY" \
  "cd '$GW_DIR'" \
  "${SUDO}env ${GW_TRACE_ENV}MQTT_BROKER='$MQTT_HOST' MQTT_PORT='$MQTT_PORT' MQTT_USER='$MQTT_USERNAME' MQTT_PASS='$MQTT_PASSWORD' BE_URL='$BE_URL_VAL' \$STDBUF ./test_gw 2>&1 | _stamp"

# --no-cloud implies BE-driven listen mode (FE/BE triggers via cmd/run_auth);
# the interactive terminal menu still runs in parallel. Cloud mode (default)
# keeps the menu-only launch.
DEV_LAUNCH_ARGS=""
[[ "$RUN_CLOUD" == 0 ]] && DEV_LAUNCH_ARGS=" --listen"

# Pass the env THROUGH sudo via `env VAR=...`: a plain `export` before `sudo`
# is dropped (sudo resets the environment), which would make test_device fall
# back to the 127.0.0.1 default broker instead of the configured one.
# GW_HOST: the device dials the gateway socket here. In run_all the gateway runs
# on THIS same machine, so the device always reaches it on localhost. (This is
# distinct from the MQTT broker host, which may be elsewhere.)
write_launcher "$L_DEV" "SandGrain DEVICE" \
  "cd '$DEVICE_DIR'" \
  "${DEV_SUDO}env ${DEV_TRACE_ENV}MQTT_BROKER='$MQTT_HOST' MQTT_PORT='$MQTT_PORT' GW_HOST='127.0.0.1' GW_PORT='8080' \$STDBUF ./test_device${DEV_LAUNCH_ARGS} 2>&1 | _stamp"

# --------------------------------------------------------------------------
# 6b) Broker sanity (standalone): the local cloud/gateway/device need a NATIVE
# broker on MQTT_PORT, and the Docker TrustBridge stack must NOT be up — it owns
# 1883 and would fight a native broker (one mode at a time). Warn, don't block.
# --------------------------------------------------------------------------
if [[ "$RUN_CLOUD" == 1 ]]; then
  if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'tb-mosquitto'; then
    warn "TrustBridge Docker stack is running (tb-mosquitto owns port 1883) — standalone will conflict."
    warn "Stop it first:   (cd '$REPO_ROOT/../TrustBridge/TrustBridge-BE' && ./start-all.sh down)"
  else
    case "$MQTT_HOST" in
      localhost|127.0.0.1|::1|"")
        # Broker is local to this machine — bring it up automatically if needed.
        ensure_local_broker "$MQTT_PORT" ;;
      *)
        broker_reachable "$MQTT_HOST" "$MQTT_PORT" \
          || warn "No MQTT broker reachable at $MQTT_HOST:$MQTT_PORT — start one there before authenticating." ;;
    esac
  fi
fi

# --------------------------------------------------------------------------
# 7) Launch the three components (Cloud first), using the detected mode.
# --------------------------------------------------------------------------
say "Components:"
if [[ "$RUN_CLOUD" == 1 ]]; then
  echo "    Cloud   : $APP_DIR  ->  python -m app.main"
else
  echo "    Cloud   : (skipped --no-cloud; using external/TrustBridge cloud agent)"
fi
echo "    Gateway : $GW_DIR/test_gw  (MQTT $MQTT_HOST:$MQTT_PORT)"
if [[ "$RUN_CLOUD" == 0 ]]; then
  echo "    Device  : $DEVICE_DIR/test_device --listen  (BE-driven + menu; MQTT $MQTT_HOST:$MQTT_PORT)"
else
  echo "    Device  : $DEVICE_DIR/test_device  (menu; MQTT $MQTT_HOST:$MQTT_PORT)"
fi
if [[ "$TRACE" == 1 ]]; then
  echo "    Trace   : $GW_DIR/trace_gateway.jsonl  +  $DEVICE_DIR/trace_device.jsonl  (JSON lines; tail -f to watch)"
fi

case "$LAUNCH_MODE" in
  wt)
    # A distinct -w window name forces each into its own window.
    say "Opening Windows Terminal windows"
    if [[ "$RUN_CLOUD" == 1 ]]; then
      wt.exe -w SGR-Cloud  new-tab --title "SGR-Cloud"  wsl.exe bash "$L_CLOUD"
      sleep 2
    fi
    wt.exe -w SGR-GW     new-tab --title "SGR-GW"     wsl.exe bash "$L_GW"
    sleep 1
    wt.exe -w SGR-Device new-tab --title "SGR-Device" wsl.exe bash "$L_DEV"
    say "Launched components in separate Windows Terminal windows."
    ;;
  mac)
    say "Opening Terminal.app windows (macOS)"
    if [[ "$RUN_CLOUD" == 1 ]]; then
      osascript -e "tell application \"Terminal\" to do script \"bash '$L_CLOUD'\"" >/dev/null
      sleep 2
    fi
    osascript -e "tell application \"Terminal\" to do script \"bash '$L_GW'\"" >/dev/null
    sleep 1
    osascript -e "tell application \"Terminal\" to do script \"bash '$L_DEV'\"" >/dev/null
    osascript -e 'tell application "Terminal" to activate' >/dev/null
    say "Launched components in separate Terminal.app windows."
    ;;
  gui)
    say "Opening $GUI_TERM windows"
    if [[ "$RUN_CLOUD" == 1 ]]; then open_gui_terminal "SGR-Cloud" "$L_CLOUD"; sleep 2; fi
    open_gui_terminal "SGR-GW"     "$L_GW";    sleep 1
    open_gui_terminal "SGR-Device" "$L_DEV"
    disown -a 2>/dev/null || true   # keep windows alive after this script exits
    say "Launched components in separate $GUI_TERM windows."
    ;;
  tmux)
    say "Starting tmux session 'sandgrain' (3 stacked panes)"
    launch_tmux
    echo "    Detach: Ctrl-b d   Re-attach: tmux attach -t sandgrain   Kill: tmux kill-session -t sandgrain"
    if [[ -n "${TMUX:-}" ]]; then
      tmux switch-client -t sandgrain          # already inside tmux
    else
      tmux attach-session -t sandgrain         # attaches (this blocks)
    fi
    ;;
esac
