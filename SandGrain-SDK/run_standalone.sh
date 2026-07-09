#!/usr/bin/env bash
#
# run_standalone.sh — per-run launcher for the SandGrain PoC_SDK_v3 stack,
# WITHOUT any TrustBridge BE dependency.
#
# This is the sibling of run_all.sh. It runs the SandGrain SDK on its own:
#   * Cloud  uses device_credentials.json (the bundled JsonFileCredentialsStore),
#            NOT the BE-backed credentials store. BE_URL/TRUSTBRIDGE_BASE_URL are
#            explicitly unset so the cloud never tries to reach a BE.
#   * Gateway uses a STATIC whitelist file (trustbridge_whitelist.txt). BE_URL is
#            NOT set, so refresh_whitelist() skips the curl and just loads the file.
#   * Device runs in the interactive MENU mode (no BE cmd/run_auth trigger needed).
#
# It still talks to CyberRock + the tenant API directly (that is SandGrain's own
# backend, not TrustBridge), so you get the full mutual-auth / auto-claim flow.
#
# Run ./setup.sh ONCE first (installs packages, venv, Python deps). Then, each run:
#   1. Prompts for CyberRock/Device/Cloudflare settings, the tenant login, and the
#      MQTT broker credentials (defaults come from .env / device_credentials.json).
#   2. Writes the cloud app's .env and the tenant block of device_credentials.json.
#   3. Verifies the Python venv exists (created by setup.sh).
#   4. Rebuilds the device and gateway firmware (`make clean` + `make`).
#   5. Detects the device TID via BIST; if new, prompts for its credentials and adds
#      it to device_credentials.json AND to the gateway whitelist (skip with
#      --no-detect-tid, in which case the existing whitelist file is used as-is).
#   6. Opens the three components (Cloud / Gateway / Device), auto-detecting how:
#        - WSL / Windows  : three Windows Terminal windows (wt.exe + wsl.exe)
#        - Linux + GUI    : three terminal windows (gnome-terminal/konsole/xterm/...)
#        - Headless Linux : three panes in a tmux session named "sandgrain"
#
# Run it from a WSL shell or a Linux shell:  bash run_standalone.sh
# (On Windows you can also use run_standalone.ps1, which just calls this via WSL.)
#
# Options:
#   --no-build       skip the build, use the existing binaries
#   --no-detect-tid  skip the device TID auto-detection / whitelist auto-add step
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
# Own env file, separate from the Docker cloud's .env (which needs
# MQTT_HOST=mosquitto). Standalone runs a NATIVE cloud against a local broker, so
# it must not clobber the Docker cloud's broker host. (.env.standalone is
# gitignored via the .env.* rule.)
ENV_FILE="$APP_DIR/.env.standalone"
VENV_DIR="$CLOUD_DIR/venv"
DEVICE_DIR="$REPO_ROOT/PoC_SDK_v3/poc_sdk_device/app"
GW_DIR="$REPO_ROOT/PoC_SDK_v3/poc_sdk_gateway/app"
WHITELIST_FILE="$GW_DIR/trustbridge_whitelist.txt"

# --------------------------------------------------------------------------
# Args
# --------------------------------------------------------------------------
DO_BUILD=1
DETECT_TID=1
for arg in "$@"; do
  case "$arg" in
    --no-build)      DO_BUILD=0 ;;
    --no-detect-tid) DETECT_TID=0 ;;
    -h|--help)
      cat <<'USAGE'
Usage: bash run_standalone.sh [--no-build] [--no-detect-tid]

Runs the SandGrain SDK standalone (Cloud + Gateway + Device) with NO TrustBridge BE:
  * Cloud   -> JsonFileCredentialsStore (device_credentials.json); BE_URL unset.
  * Gateway -> STATIC whitelist file (trustbridge_whitelist.txt); BE_URL unset, so
               it never curls a BE for the whitelist.
  * Device  -> interactive menu mode.

  --no-build       Skip the build (make clean + make); use existing binaries.
  --no-detect-tid  Skip device TID auto-detection. Detection reads the TID via BIST
                   and adds it to device_credentials.json AND the gateway whitelist
                   if missing (needs the chip connected). When skipped, the existing
                   trustbridge_whitelist.txt is used exactly as-is.
  -h, --help       Show this help

Opens Cloud, Gateway and Device. The launch method is auto-detected:
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
  tmux new-session  -d -s "$sess" -n stack "bash '$L_CLOUD'"
  tmux split-window -t "$sess" "bash '$L_GW'"
  tmux split-window -t "$sess" "bash '$L_DEV'"
  tmux select-layout -t "$sess" even-vertical >/dev/null
  tmux set-option -t "$sess" mouse on 2>/dev/null || true
}

# Add a TID to the static gateway whitelist file, non-destructively (keeps the
# existing entries; skips if already present). Standalone uses this file as the
# authoritative whitelist because there is no BE to sync from.
add_tid_to_whitelist() {  # add_tid_to_whitelist TID
  local tid="$1"
  [[ -z "$tid" ]] && return 0
  touch "$WHITELIST_FILE"
  if grep -qiE "^${tid}$" "$WHITELIST_FILE" 2>/dev/null; then
    say "TID already in whitelist: $WHITELIST_FILE"
    return 0
  fi
  # Make sure the file ends with a newline before appending (the upstream file
  # ships without a trailing newline, which would otherwise join two TIDs).
  if [[ -s "$WHITELIST_FILE" && -n "$(tail -c1 "$WHITELIST_FILE")" ]]; then
    printf '\n' >> "$WHITELIST_FILE"
  fi
  printf '%s\n' "$tid" >> "$WHITELIST_FILE"
  say "Added TID to whitelist: $WHITELIST_FILE"
}

# Read the connected device's TID via BIST (chip only — no GW/Cloud needed) and,
# if it is not already in device_credentials.json, prompt for creds and add it.
# Also adds the TID to the static gateway whitelist. Best-effort: any problem is
# a warning, never aborts the launch.
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

  # Standalone: this TID must be in the gateway's static whitelist to be authorized.
  add_tid_to_whitelist "$tid"

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

  if python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); sys.exit(0 if sys.argv[2] in d.get("devices",{}) else 1)' "$creds_file" "$tid"; then
    say "TID already present in $creds_file — nothing to add."
    return 0
  fi

  # Defaults pulled from an existing device entry (else sensible fallbacks).
  local def_user def_pass in_user in_pass username password
  def_user="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); v=next(iter(d.get("devices",{}).values()),{}); print(v.get("username","sgdemo-chip"))' "$creds_file")"
  def_pass="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); v=next(iter(d.get("devices",{}).values()),{}); print(v.get("password","P@ss1234"))' "$creds_file")"

  say "New TID is not in $creds_file — enter its credentials:"
  read -rp "  username [${def_user}]: " in_user || true; username="${in_user:-$def_user}"
  read -rp "  password [${def_pass}]: " in_pass || true; password="${in_pass:-$def_pass}"

  TID="$tid" UNAME="$username" PWORD="$password" python3 -c '
import json, os, sys
p = sys.argv[1]
d = json.load(open(p))
d.setdefault("devices", {})[os.environ["TID"]] = {
    "username": os.environ["UNAME"],
    "password": os.environ["PWORD"],
}
open(p, "w").write(json.dumps(d, indent=2) + "\n")
' "$creds_file"
  say "Added TID to $creds_file"
}

# --------------------------------------------------------------------------
# Pre-flight checks
# --------------------------------------------------------------------------
[[ -d "$APP_DIR"    ]] || die "Cloud app dir not found: $APP_DIR"
[[ -d "$DEVICE_DIR" ]] || die "Device dir not found: $DEVICE_DIR"
[[ -d "$GW_DIR"     ]] || die "Gateway dir not found: $GW_DIR"
command -v make    >/dev/null || die "make not found. Run ./setup.sh first (setup.ps1 on Windows)."

# Decide how we'll open the three components (fail fast if there's no way).
GUI_TERM=""
if command -v wt.exe >/dev/null 2>&1; then
  LAUNCH_MODE="wt"                                   # WSL / Windows
elif [[ "$(uname -s)" == "Darwin" ]] && command -v osascript >/dev/null 2>&1; then
  LAUNCH_MODE="mac"                                  # macOS Terminal.app
elif [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]] && GUI_TERM="$(detect_gui_term)"; then
  LAUNCH_MODE="gui"                                  # Linux desktop
elif command -v tmux >/dev/null 2>&1; then
  LAUNCH_MODE="tmux"                                 # headless Linux / SSH (or macOS via brew)
else
  die "No way to open the three terminals. Install one of: Windows Terminal (WSL), a GUI terminal emulator (Linux desktop), or tmux (headless / macOS)."
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
cur_cr="$(read_env CYBERROCK_BASE_URL https://device-api.sandbox.sandgrain.io)"
read -rp "  CyberRock base URL      [${cur_cr}]: " in_cr || true; CYBERROCK_BASE_URL="${in_cr:-$cur_cr}"

cur_did="$(read_env DEVICE_ID gw-001)"
read -rp "  Device ID               [${cur_did}]: " in_did || true; DEVICE_ID="${in_did:-$cur_did}"

cur_cfid="$(read_env CF_ACCESS_CLIENT_ID '')"
read -rp "  CF Access Client ID     [${cur_cfid:-<empty>}]: " in_cfid || true; CF_ACCESS_CLIENT_ID="${in_cfid:-$cur_cfid}"

cur_cfsec="$(read_env CF_ACCESS_CLIENT_SECRET '')"
if [[ -n "$cur_cfsec" ]]; then cfsec_hint="keep current"; else cfsec_hint="empty"; fi
read -rsp "  CF Access Client Secret [${cfsec_hint}]: " in_cfsec || true; echo
CF_ACCESS_CLIENT_SECRET="${in_cfsec:-$cur_cfsec}"

# --- Tenant login  (-> device_credentials.json) ---
if [[ "$HAVE_PY" == 1 ]]; then
  cur_temail="$(read_tenant email '')"
  read -rp "  Tenant email            [${cur_temail:-<empty>}]: " in_temail || true; TENANT_EMAIL="${in_temail:-$cur_temail}"
  cur_tpass="$(read_tenant password '')"
  if [[ -n "$cur_tpass" ]]; then tpass_hint="keep current"; else tpass_hint="empty"; fi
  read -rsp "  Tenant password         [${tpass_hint}]: " in_tpass || true; echo
  TENANT_PASSWORD="${in_tpass:-$cur_tpass}"
else
  warn "python3 not found; skipping tenant email/password (cannot edit $CREDS_FILE)."
fi

# --- MQTT broker  (-> .env) ---
cur_host="$(read_env MQTT_HOST localhost)"
cur_port="$(read_env MQTT_PORT 1883)"
cur_user="$(read_env MQTT_USERNAME '')"
cur_pass="$(read_env MQTT_PASSWORD '')"
read -rp "  MQTT host               [${cur_host}]: "          in_host || true; MQTT_HOST="${in_host:-$cur_host}"
read -rp "  MQTT port               [${cur_port}]: "          in_port || true; MQTT_PORT="${in_port:-$cur_port}"
read -rp "  MQTT username           [${cur_user:-<empty>}]: " in_user || true; MQTT_USERNAME="${in_user:-$cur_user}"
if [[ -n "$cur_pass" ]]; then pass_hint="keep current"; else pass_hint="empty"; fi
read -rsp "  MQTT password           [${pass_hint}]: "        in_pass || true; echo
MQTT_PASSWORD="${in_pass:-$cur_pass}"

# --------------------------------------------------------------------------
# 2) Write .env  (heredoc -> guaranteed LF endings, no BOM)
#    NOTE: no BE_URL / TRUSTBRIDGE_BASE_URL here — that is what keeps the cloud
#    on the bundled JsonFileCredentialsStore instead of the BE-backed store.
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
EOF

# --------------------------------------------------------------------------
# 2b) Write the tenant login into device_credentials.json (preserving devices)
# --------------------------------------------------------------------------
if [[ "$HAVE_PY" == 1 ]]; then
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

# --------------------------------------------------------------------------
# 3) Verify the Python venv exists (it is created by setup.sh)
# --------------------------------------------------------------------------
if [[ ! -f "$VENV_DIR/bin/activate" ]]; then
  die "Python venv not found at $VENV_DIR. Run ./setup.sh first (setup.ps1 on Windows)."
fi
say "Using venv at $VENV_DIR"

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
# 5) Detect the device TID -> device_credentials.json + static whitelist
# --------------------------------------------------------------------------
if [[ "$DETECT_TID" == 1 ]]; then
  detect_and_register_tid
else
  say "Skipping TID auto-detect (--no-detect-tid): using $WHITELIST_FILE as-is"
fi

# Standalone has no BE to repopulate the whitelist, so warn loudly if it is empty
# — otherwise the gateway authorizes nothing and every auth fails NOT_FOUND.
if [[ ! -s "$WHITELIST_FILE" ]] || ! grep -qiE '^[0-9a-f]{64}$' "$WHITELIST_FILE" 2>/dev/null; then
  warn "Whitelist $WHITELIST_FILE has no valid 64-hex TID — the gateway will authorize NO device."
  warn "Connect the chip and re-run (auto-add), or add a TID line manually, then relaunch."
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
    printf '%s\n' "$@"
    echo 'rc=$?'
    echo "echo \"\""
    echo "echo \"[$title exited (status \$rc)]\""
    echo "echo 'This is now a normal shell — close the window when done.'"
    echo 'exec bash'
  } > "$file"
  chmod +x "$file"
}

L_CLOUD="/tmp/sgr_standalone_cloud.sh"
L_GW="/tmp/sgr_standalone_gw.sh"
L_DEV="/tmp/sgr_standalone_device.sh"

# Cloud: force standalone credential mode (JsonFileCredentialsStore) and strip
# BE_URL/TRUSTBRIDGE_BASE_URL, so the SDK factory uses device_credentials.json
# even if CREDENTIALS_SOURCE=trustbridge or BE_URL was exported in this shell
# (e.g. by a prior start-all run).
write_launcher "$L_CLOUD" "SandGrain CLOUD (standalone)" \
  "cd '$APP_DIR'" \
  "source '$VENV_DIR/bin/activate'" \
  "set -a; . '$ENV_FILE'; set +a" \
  "env -u BE_URL -u TRUSTBRIDGE_BASE_URL CREDENTIALS_SOURCE=standalone python -m app.main"

# Gateway: NO BE_URL (and -u BE_URL to strip an inherited one), plus an explicit
# GW_WHITELIST_PATH so the static whitelist file is unambiguous regardless of CWD.
# With BE_URL unset, refresh_whitelist() in main_gw.c skips the curl entirely and
# just loads this file.
write_launcher "$L_GW" "SandGrain GATEWAY (standalone)" \
  "cd '$GW_DIR'" \
  "${SUDO}env -u BE_URL -u TRUSTBRIDGE_BASE_URL GW_WHITELIST_PATH='$WHITELIST_FILE' MQTT_BROKER='$MQTT_HOST' MQTT_PORT='$MQTT_PORT' MQTT_USER='$MQTT_USERNAME' MQTT_PASS='$MQTT_PASSWORD' ./test_gw"

# Device: interactive menu mode (no --listen; no BE trigger). Pass env THROUGH
# sudo via `env VAR=...` (a plain export before sudo is dropped).
write_launcher "$L_DEV" "SandGrain DEVICE (standalone)" \
  "cd '$DEVICE_DIR'" \
  "${DEV_SUDO}env MQTT_BROKER='$MQTT_HOST' MQTT_PORT='$MQTT_PORT' ./test_device"

# --------------------------------------------------------------------------
# 7) Launch the three components (Cloud first), using the detected mode.
# --------------------------------------------------------------------------
say "Components (standalone — no TrustBridge BE):"
echo "    Cloud   : $APP_DIR  ->  python -m app.main  (JsonFileCredentialsStore)"
echo "    Gateway : $GW_DIR/test_gw  (MQTT $MQTT_HOST:$MQTT_PORT; static whitelist)"
echo "    Device  : $DEVICE_DIR/test_device  (menu; MQTT $MQTT_HOST:$MQTT_PORT)"

case "$LAUNCH_MODE" in
  wt)
    # A distinct -w window name forces each into its own window.
    say "Opening Windows Terminal windows"
    wt.exe -w SGR-Cloud  new-tab --title "SGR-Cloud"  wsl.exe bash "$L_CLOUD"
    sleep 2
    wt.exe -w SGR-GW     new-tab --title "SGR-GW"     wsl.exe bash "$L_GW"
    sleep 1
    wt.exe -w SGR-Device new-tab --title "SGR-Device" wsl.exe bash "$L_DEV"
    say "Launched components in separate Windows Terminal windows."
    ;;
  mac)
    say "Opening Terminal.app windows (macOS)"
    osascript -e "tell application \"Terminal\" to do script \"bash '$L_CLOUD'\"" >/dev/null; sleep 2
    osascript -e "tell application \"Terminal\" to do script \"bash '$L_GW'\"" >/dev/null;    sleep 1
    osascript -e "tell application \"Terminal\" to do script \"bash '$L_DEV'\"" >/dev/null
    osascript -e 'tell application "Terminal" to activate' >/dev/null
    say "Launched components in separate Terminal.app windows."
    ;;
  gui)
    say "Opening $GUI_TERM windows"
    open_gui_terminal "SGR-Cloud" "$L_CLOUD"; sleep 2
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
