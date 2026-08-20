#!/usr/bin/env bash
#
# run_device.sh — build + run the SandGrain DEVICE (test_device) on a Raspberry Pi.
#
# Split deploy (two Pis): the laptop hosts the TrustBridge Docker stack
# (BE + FE + Mosquitto + cloud-agent); THIS Pi has the SandGrain USB chip and
# dials the GATEWAY Pi. The device is MQTT-free — the gateway is its only uplink.
#
#   this device Pi ──TCP :8080──► gateway Pi   (auth transport + HELLO/RUN_AUTH)
#
# Default run mode is --listen (BE-driven): the device sends "HELLO <tid> TRIGGER"
#   over the persistent link, and the GATEWAY relays TrustBridge's run_auth down
#   it as "RUN_AUTH <mode>" (the gateway subscribes cmd/run_auth on the device's
#   behalf and proxies its presence). The interactive menu (options 1/2/3) still
#   runs in parallel. Pass --menu to run the plain interactive menu only.
#
# One-time on this Pi:   bash setup.sh           (build deps)
#                        sudo usermod -aG dialout "$USER" && reboot   (serial access)
# Every run:             bash run_device.sh       (prompts; remembers in .env.device)
#
# Options:
#   --usb PORT      serial suffix, e.g. 0 for /dev/ttyACM0 (skips auto-detect)
#   --menu          interactive menu only (no BE listener)
#   --sudo          run the binary under sudo (if not in the 'dialout' group)
#   --no-build      use the existing test_device binary, don't rebuild
#   -h | --help     show this help
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
DEV_DIR="$SCRIPT_DIR/PoC_SDK_v3/poc_sdk_device/app"
ENV_FILE="$SCRIPT_DIR/.env.device"

USB_ARG=""; DO_BUILD=1; USE_SUDO=0
DEV_ARGS=" --listen"
while [ $# -gt 0 ]; do
  case "$1" in
    --usb)      USB_ARG="$2"; shift 2 ;;
    --menu)     DEV_ARGS=""; shift ;;
    --sudo)     USE_SUDO=1; shift ;;
    --no-build) DO_BUILD=0; shift ;;
    -h|--help)
      sed -n '2,38p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
done

say()  { printf '\n==> %s\n' "$*"; }
warn() { printf '[warn] %s\n' "$*" >&2; }
die()  { printf '[error] %s\n' "$*" >&2; exit 1; }

prev_env() {
  [ -f "$ENV_FILE" ] || { printf '%s' ""; return; }
  awk -F= -v k="$1" '$1==k { sub(/^[^=]+=/,""); sub(/\r$/,""); print; exit }' "$ENV_FILE"
}
valid_host() { [ -n "$1" ] && [[ "$1" =~ ^[A-Za-z0-9._-]+$ ]]; }

[ -d "$DEV_DIR" ] || die "device app dir not found: $DEV_DIR"
command -v make >/dev/null || die "make not found — run 'bash setup.sh' first."

# ── 1. Gateway host + port (this device dials it on :GW_PORT) ────────────────
# The gateway is the device's ONLY uplink: it proxies this device's presence and
# relays TrustBridge run_auth triggers down the TCP link, so the device no longer
# speaks MQTT and needs no broker/BE host here.
def="$(prev_env GW_HOST)"; case "$def" in 127.*|localhost) def="" ;; esac
if [ -n "$def" ]; then read -rp "Gateway Pi LAN IP / hostname [$def]: " GW_HOST; GW_HOST="${GW_HOST:-$def}"
else                  read -rp "Gateway Pi LAN IP / hostname (runs test_gw): " GW_HOST; fi
valid_host "$GW_HOST" || die "'$GW_HOST' is not a valid host/IP."

GW_PORT="$(prev_env GW_PORT)"; GW_PORT="${GW_PORT:-8080}"
read -rp  "Gateway port         [$GW_PORT]: " a; GW_PORT="${a:-$GW_PORT}"

# ── 3. USB serial port (auto-detect → suffix; OS-aware) ─────────────────────
# macOS nodes are named (/dev/cu.usbmodem* / /dev/cu.usbserial*), Linux nodes
# are numbered (/dev/ttyACM*). The device binary builds the path as
#   macOS : /dev/cu.<USB_TTY_PORT>      (suffix after /dev/cu.)
#   Linux : /dev/ttyACM<USB_TTY_PORT>   (trailing number)
# so the detected suffix differs per OS. Leaving USB_TTY_PORT empty lets the
# binary auto-scan /dev/cu.* itself (macOS) rather than forcing a bad /dev/cu.0.
USB_TTY_PORT="$USB_ARG"
if [ -z "$USB_TTY_PORT" ]; then
  USB_TTY_PORT="$(prev_env USB_TTY_PORT)"
  case "$(uname -s)" in
    Darwin)
      dev="$(ls /dev/cu.usbmodem* /dev/cu.usbserial* 2>/dev/null | head -1 || true)"
      if [ -n "$dev" ]; then
        USB_TTY_PORT="${dev#/dev/cu.}"   # suffix after /dev/cu.
        say "Detected SandGrain chip at $dev → USB_TTY_PORT=$USB_TTY_PORT"
      elif [ -n "$USB_TTY_PORT" ]; then
        warn "No /dev/cu.usbmodem*/usbserial* found; using saved USB_TTY_PORT=$USB_TTY_PORT"
      else
        warn "No /dev/cu.usbmodem*/usbserial* found. Plug in the chip, or pass --usb <suffix>."
        warn "Leaving USB_TTY_PORT empty so the binary auto-scans /dev/cu.*."
        USB_TTY_PORT=""
      fi
      ;;
    *)
      dev="$(ls /dev/ttyACM* 2>/dev/null | head -1 || true)"
      if [ -n "$dev" ]; then
        USB_TTY_PORT="${dev##*[A-Za-z]}"   # trailing number after the last letter
        say "Detected SandGrain chip at $dev → USB_TTY_PORT=$USB_TTY_PORT"
      elif [ -n "$USB_TTY_PORT" ]; then
        warn "No /dev/ttyACM* found; using saved USB_TTY_PORT=$USB_TTY_PORT"
      else
        warn "No /dev/ttyACM* found. Plug in the chip, or pass --usb N. Defaulting to 0."
        USB_TTY_PORT=0
      fi
      ;;
  esac
fi
# Warn early if the serial node isn't writable.
case "$(uname -s)" in
  Darwin) ttydev="/dev/cu.${USB_TTY_PORT}" ;;
  *)      ttydev="/dev/ttyACM${USB_TTY_PORT}" ;;
esac
if [ -n "$USB_TTY_PORT" ] && [ -e "$ttydev" ] && [ ! -w "$ttydev" ] && [ "$USE_SUDO" = 0 ]; then
  warn "$ttydev is not writable by $USER. Either: sudo usermod -aG dialout $USER && reboot,"
  warn "or re-run with --sudo. Continuing — the chip may report 'not responding'."
fi

# ── 4. Persist ───────────────────────────────────────────────────────────────
{
  echo "# run_device.sh — device Pi config. Re-run run_device.sh to refresh."
  echo "ROLE=device"
  echo "GW_HOST=$GW_HOST"
  echo "GW_PORT=$GW_PORT"
  echo "USB_TTY_PORT=$USB_TTY_PORT"
} > "$ENV_FILE"
say "Wrote $ENV_FILE  (gateway=$GW_HOST:$GW_PORT  usb=${ttydev:-auto-scan})"

# ── 5. Build ─────────────────────────────────────────────────────────────────
if [ "$DO_BUILD" = 1 ]; then
  say "Building test_device"; make -C "$DEV_DIR" clean; make -C "$DEV_DIR"
else
  say "Skipping build (--no-build)"
fi
[ -x "$DEV_DIR/test_device" ] || die "device binary missing: $DEV_DIR/test_device (run without --no-build)"

# ── 6. Run ───────────────────────────────────────────────────────────────────
# Pass the env THROUGH sudo via `env VAR=...` — a plain export before sudo is
# stripped (sudo resets the environment), which would silently drop the broker.
SUDO=""; [ "$USE_SUDO" = 1 ] && SUDO="sudo "
[ -n "$DEV_ARGS" ] && say "Run mode: --listen (BE-driven; menu also available)" \
                   || say "Run mode: interactive menu only"
cd "$DEV_DIR"
# Prefix every log line with a timestamp for easy tracking. stdin still reaches
# the binary (left side of the pipe inherits the terminal), so the interactive
# menu keeps working; only stdout/stderr are timestamped. `stdbuf -oL` keeps
# output live. We emit CR+LF, not just LF: after the sudo password prompt the TTY
# can be left without ONLCR, which makes plain "\n" output stair-step — an
# explicit "\r" returns to column 0 (harmless when ONLCR is on). `ts` emits LF
# only, so it's not used here. `stty sane` on exit restores the terminal.
_stamp() {
  while IFS= read -r _l || [ -n "$_l" ]; do
    printf '[%s] %s\r\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$_l"
  done
}
trap 'stty sane 2>/dev/null || true' EXIT
# `stdbuf` (GNU coreutils) forces line-buffering so timestamps stay live through
# the pipe. It is NOT present on macOS/BSD; fall back to Homebrew's `gstdbuf`, or
# to no wrapper at all (output may batch until the binary flushes, but it runs).
if command -v stdbuf >/dev/null 2>&1; then STDBUF="stdbuf -oL -eL"
elif command -v gstdbuf >/dev/null 2>&1; then STDBUF="gstdbuf -oL -eL"
else STDBUF=""; fi
${SUDO}env \
  GW_HOST="$GW_HOST"         GW_PORT="$GW_PORT" \
  USB_TTY_PORT="$USB_TTY_PORT" \
  $STDBUF ./test_device${DEV_ARGS} 2>&1 | _stamp
