#!/usr/bin/env bash
#
# run_gateway.sh — build + run the SandGrain GATEWAY (test_gw) on a Raspberry Pi.
#
# Split deploy (two Pis): the laptop hosts the TrustBridge Docker stack
# (BE + FE + Mosquitto + cloud-agent); THIS Pi runs only the gateway.
#
#   device Pi ──TCP :8080──► gateway Pi ──MQTT──► laptop broker ──► cloud-agent
#                                       ──curl BE_URL/devices/whitelist──► laptop BE
#
# The gateway needs to reach the laptop for:
#   * MQTT       (MQTT_BROKER:MQTT_PORT) — auth requests + gw_log telemetry
#   * BE whitelist sync (BE_URL/devices/whitelist) — authorizes enrolled devices
#
# One-time on this Pi:   bash setup.sh            (installs libmosquitto-dev, etc.)
# Every run:             bash run_gateway.sh      (prompts; remembers in .env.gateway)
#
# Options:
#   --no-build      use the existing test_gw binary, don't rebuild
#   -h | --help     show this help
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
GW_DIR="$SCRIPT_DIR/PoC_SDK_v3/poc_sdk_gateway/app"
ENV_FILE="$SCRIPT_DIR/.env.gateway"

DO_BUILD=1
while [ $# -gt 0 ]; do
  case "$1" in
    --no-build) DO_BUILD=0; shift ;;
    -h|--help)
      sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
done

say()  { printf '\n==> %s\n' "$*"; }
warn() { printf '[warn] %s\n' "$*" >&2; }
die()  { printf '[error] %s\n' "$*" >&2; exit 1; }

# Read a KEY from the persisted .env.gateway (strips CR for Windows-saved files).
prev_env() {
  [ -f "$ENV_FILE" ] || { printf '%s' ""; return; }
  awk -F= -v k="$1" '$1==k { sub(/^[^=]+=/,""); sub(/\r$/,""); print; exit }' "$ENV_FILE"
}
valid_host() { [ -n "$1" ] && [[ "$1" =~ ^[A-Za-z0-9._-]+$ ]]; }

[ -d "$GW_DIR" ] || die "gateway app dir not found: $GW_DIR"
command -v make >/dev/null || die "make not found — run 'bash setup.sh' first."
command -v curl >/dev/null || warn "curl not found — gateway can't sync the BE whitelist (apt install curl)."

# ── 1. Cloud / BE host (TrustBridge backend lives here) ──────────────────────
def="$(prev_env LAPTOP)"
# Derive a default from a previously stored BE_URL if LAPTOP wasn't saved.
[ -z "$def" ] && def="$(prev_env BE_URL | sed -E 's|^https?://([^:/]+).*|\1|')"
case "$def" in 127.*|localhost) def="" ;; esac
if [ -n "$def" ]; then read -rp "Cloud / BE host (LAN IP / hostname) [$def]: " LAPTOP; LAPTOP="${LAPTOP:-$def}"
else                  read -rp "Cloud / BE host LAN IP / hostname (runs TrustBridge BE): " LAPTOP; fi
valid_host "$LAPTOP" || die "'$LAPTOP' is not a valid host/IP."

# ── 2. MQTT + gateway settings (sensible defaults; Enter to keep) ────────────
# Broker host is asked separately so it can differ from the BE host; defaults
# to the BE host for the common "everything on one laptop" deployment.
MQTT_BROKER="$(prev_env MQTT_BROKER)"
case "$MQTT_BROKER" in 127.*|localhost) MQTT_BROKER="" ;; esac
MQTT_BROKER="${MQTT_BROKER:-$LAPTOP}"
MQTT_PORT="$(prev_env MQTT_PORT)";   MQTT_PORT="${MQTT_PORT:-1883}"
MQTT_USER="$(prev_env MQTT_USER)"    # empty → binary falls back to sandgrain/admin
MQTT_PASS="$(prev_env MQTT_PASS)"
GW_BIND_PORT="$(prev_env GW_BIND_PORT)"; GW_BIND_PORT="${GW_BIND_PORT:-8080}"
BE_URL="http://${LAPTOP}:3000/api"

read -rp "MQTT broker host     [$MQTT_BROKER]: " a; MQTT_BROKER="${a:-$MQTT_BROKER}"
valid_host "$MQTT_BROKER" || die "'$MQTT_BROKER' is not a valid host/IP."
read -rp "MQTT port            [$MQTT_PORT]: " a; MQTT_PORT="${a:-$MQTT_PORT}"
read -rp  "MQTT username        [$MQTT_USER]: "    a; MQTT_USER="${a:-$MQTT_USER}"
read -rsp "MQTT password        [${MQTT_PASS:+****}]: " a; echo; MQTT_PASS="${a:-$MQTT_PASS}"
read -rp "Gateway listen port  [$GW_BIND_PORT]: " a; GW_BIND_PORT="${a:-$GW_BIND_PORT}"

# ── 3. Persist (LF endings, no BOM) ──────────────────────────────────────────
{
  echo "# run_gateway.sh — gateway Pi config. Re-run run_gateway.sh to refresh."
  echo "ROLE=gateway"
  echo "LAPTOP=$LAPTOP"
  echo "MQTT_BROKER=$MQTT_BROKER"
  echo "MQTT_PORT=$MQTT_PORT"
  echo "MQTT_USER=$MQTT_USER"
  echo "MQTT_PASS=$MQTT_PASS"
  echo "BE_URL=$BE_URL"
  echo "GW_BIND_PORT=$GW_BIND_PORT"
} > "$ENV_FILE"
say "Wrote $ENV_FILE  (broker=$MQTT_BROKER:$MQTT_PORT  BE=$BE_URL  listen=:$GW_BIND_PORT)"

# ── 4. Build ─────────────────────────────────────────────────────────────────
if [ "$DO_BUILD" = 1 ]; then
  say "Building test_gw"; make -C "$GW_DIR" clean; make -C "$GW_DIR"
else
  say "Skipping build (--no-build)"
fi
[ -x "$GW_DIR/test_gw" ] || die "gateway binary missing: $GW_DIR/test_gw (run without --no-build)"

# ── 5. Run (foreground; Ctrl-C to stop) ──────────────────────────────────────
say "Starting gateway — device Pis dial this host on :$GW_BIND_PORT"
cd "$GW_DIR"
# Prefix every log line with a timestamp for easy tracking. `stdbuf -oL` keeps
# output line-buffered through the pipe (libc fully-buffers a non-TTY stdout).
# Emit CR+LF, not just LF: after a sudo password prompt / interactive run the TTY
# can be left without ONLCR, which makes plain "\n" output stair-step. An explicit
# "\r" returns to column 0 and is harmless when ONLCR is on. (We don't use `ts`
# here — it emits LF only, so it would stair-step the same way.)
_stamp() {
  while IFS= read -r _l || [ -n "$_l" ]; do
    printf '[%s] %s\r\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$_l"
  done
}
trap 'stty sane 2>/dev/null || true' EXIT   # restore the terminal on exit
# `stdbuf` (GNU coreutils) forces line-buffering so timestamps stay live through
# the pipe. It is NOT present on macOS/BSD; fall back to Homebrew's `gstdbuf`, or
# to no wrapper at all (output may batch until the binary flushes, but it runs).
if command -v stdbuf >/dev/null 2>&1; then STDBUF="stdbuf -oL -eL"
elif command -v gstdbuf >/dev/null 2>&1; then STDBUF="gstdbuf -oL -eL"
else STDBUF=""; fi
env \
  MQTT_BROKER="$MQTT_BROKER" MQTT_PORT="$MQTT_PORT" \
  MQTT_USER="$MQTT_USER"     MQTT_PASS="$MQTT_PASS" \
  BE_URL="$BE_URL"           GW_BIND_PORT="$GW_BIND_PORT" \
  $STDBUF ./test_gw 2>&1 | _stamp
