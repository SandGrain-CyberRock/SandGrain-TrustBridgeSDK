#!/usr/bin/env bash
# =============================================================================
# install_gateway_service.sh
#
# Install the BLE-central gateway as a systemd service so it starts on boot.
# Nothing is hardcoded: the app directory is derived from where this script
# lives and the run user from whoever invokes it, so the same script works on
# any Pi (or any Linux box) regardless of username or checkout path.
#
# Run ON THE PI, after ./scripts/pi_ble_gateway_setup.sh has built the gateway
# and written .env.ble.gateway:
#     chmod +x scripts/install_gateway_service.sh
#     ./scripts/install_gateway_service.sh
#
# Re-runnable (idempotent) - re-running rewrites the unit with current paths,
# which is what you want after moving or re-cloning the repo.
#
# Flags:
#     --user <name>       run the service as this user (default: the invoking
#                         user, or SUDO_USER when run under sudo)
#     --name <unit>       service name without .service (default:
#                         sandgrain-gateway) - use this to run two gateways
#                         off one box
#     --no-enable         write the unit but do not enable/start it
#     --uninstall         stop, disable and remove the unit
#     -h | --help         show this help
# =============================================================================
set -euo pipefail

SERVICE_NAME="sandgrain-gateway"
RUN_USER="${SUDO_USER:-${USER:-$(id -un)}}"
DO_ENABLE=1
DO_UNINSTALL=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --user)      RUN_USER="${2:?--user needs a value}"; shift 2 ;;
        --name)      SERVICE_NAME="${2:?--name needs a value}"; shift 2 ;;
        --no-enable) DO_ENABLE=0; shift ;;
        --uninstall) DO_UNINSTALL=1; shift ;;
        -h|--help)   grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "Unknown arg: $1 (try --help)" >&2; exit 2 ;;
    esac
done

c_grn=$'\033[32m'; c_yel=$'\033[33m'; c_red=$'\033[31m'; c_rst=$'\033[0m'
say()  { echo "${c_grn}==>${c_rst} $*"; }
warn() { echo "${c_yel}[!]${c_rst} $*" >&2; }
die()  { echo "${c_red}[FATAL]${c_rst} $*" >&2; exit 1; }

UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

# ---- uninstall ---------------------------------------------------------------
if [[ $DO_UNINSTALL -eq 1 ]]; then
    sudo systemctl disable --now "$SERVICE_NAME" 2>/dev/null || true
    sudo rm -f "$UNIT_PATH"
    sudo systemctl daemon-reload
    say "Removed $UNIT_PATH"
    exit 0
fi

# ---- locate the gateway app dir (this script lives in <gw>/scripts/) ---------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GW_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$GW_DIR/app"
[[ -f "$APP_DIR/Makefile" ]] || die "Can't find the gateway Makefile at $APP_DIR."

BIN="$APP_DIR/test_gw"
RUN="$APP_DIR/run_ble_gateway.sh"
ENV_FILE="$APP_DIR/.env.ble.gateway"

[[ -x "$BIN" ]] || die "$BIN missing. Build it first: ./scripts/pi_ble_gateway_setup.sh"
[[ -f "$RUN" ]] || die "$RUN missing. It is written by pi_ble_gateway_setup.sh."

# systemd needs a literal ExecStart, so a space in the path would silently
# split into extra arguments. Catch it here rather than at first boot.
case "$APP_DIR" in
    *' '*) die "The checkout path contains a space ('$APP_DIR'). Move it somewhere without one." ;;
esac

id "$RUN_USER" >/dev/null 2>&1 || die "No such user: $RUN_USER (override with --user)."

# ---- pre-flight warnings (not fatal - the service can be fixed and restarted)
if [[ ! -f "$ENV_FILE" ]]; then
    warn "$ENV_FILE not found. The gateway will fall back to its built-in"
    warn "defaults and probably reach no broker. Run:"
    warn "    ./scripts/pi_ble_gateway_setup.sh --broker <laptop-ip> --build-only"
elif grep -q 'CHANGE-ME' "$ENV_FILE"; then
    warn "$ENV_FILE still contains CHANGE-ME - set MQTT_BROKER and BE_URL."
fi

if [[ ! -f "$APP_DIR/trustbridge_whitelist.txt" ]]; then
    warn "No trustbridge_whitelist.txt in $APP_DIR - every device will be"
    warn "rejected before the gateway makes any cloud call."
fi

# ---- setcap: path differs across distros, and every rebuild drops the caps ---
# Running it from ExecStartPre with a '+' prefix (root regardless of User=)
# means a rebuild can never leave the service unable to touch the adapter.
SETCAP="$(command -v setcap || true)"
if [[ -z "$SETCAP" ]]; then
    warn "setcap not found (install libcap2-bin). Falling back to running the"
    warn "service as root, since BLE needs CAP_NET_RAW/CAP_NET_ADMIN."
    RUN_USER="root"
fi

# ---- write the unit ----------------------------------------------------------
say "Service:   $SERVICE_NAME"
say "App dir:   $APP_DIR"
say "Run user:  $RUN_USER"

{
    echo "[Unit]"
    echo "Description=SandGrain BLE gateway"
    echo "Documentation=file://$GW_DIR/BLE_GATEWAY.md"
    echo "Wants=bluetooth.service network-online.target"
    echo "After=bluetooth.service network-online.target"
    echo
    echo "[Service]"
    echo "Type=simple"
    echo "User=$RUN_USER"
    echo "WorkingDirectory=$APP_DIR"
    [[ -n "$SETCAP" ]] && \
    echo "ExecStartPre=+$SETCAP cap_net_raw,cap_net_admin+eip $BIN"
    echo "ExecStart=/bin/bash $RUN"
    echo "Restart=always"
    echo "RestartSec=5"
    echo
    echo "[Install]"
    echo "WantedBy=multi-user.target"
} | sudo tee "$UNIT_PATH" >/dev/null

sudo systemctl daemon-reload
say "Wrote $UNIT_PATH"

if [[ $DO_ENABLE -eq 1 ]]; then
    sudo systemctl enable --now "$SERVICE_NAME"
    say "Enabled and started."
else
    say "Not enabled (--no-enable). Start it with: sudo systemctl enable --now $SERVICE_NAME"
fi

cat <<EOF

${c_grn}Done.${c_rst}
  watch:    journalctl -u $SERVICE_NAME -f
  restart:  sudo systemctl restart $SERVICE_NAME     # needed after every rebuild
  stop:     sudo systemctl stop $SERVICE_NAME        # before running by hand
  remove:   ./scripts/install_gateway_service.sh --uninstall

Stop the service before starting the gateway by hand - two of them fighting
over the same BLE adapter and MQTT client ID is hard to read in the logs.
EOF
