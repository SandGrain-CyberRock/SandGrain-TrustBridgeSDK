#!/usr/bin/env bash
# ============================================================================
# flash_device.sh - portable build + flash for the SandGrain nRF device SDK
# (Linux / macOS twin of flash_device.ps1)
#
# Runs on any machine with the nRF Connect SDK installed via the VS Code
# extension or Toolchain Manager - no hardcoded toolchain hash or serial
# port. It:
#   1. Finds the NCS root (env NCS_ROOT, --ncs-root, or common locations).
#   2. Reads <root>/toolchains/toolchains.json to resolve the toolchain that
#      matches the requested NCS version.
#   3. Sets up the Zephyr/west environment from that toolchain.
#   4. west build (pristine) for the given board.
#   5. Flashes with nrfutil (PATH or ~/.nordic/bin) and resets.
#   6. Optionally opens a serial monitor on the auto-detected J-Link port.
#
# Usage:
#   ./flash_device.sh                 # build + flash with all defaults
#   ./flash_device.sh --monitor       # same, then open a serial monitor
#   ./flash_device.sh --no-flash      # build only
#   ./flash_device.sh --snr 1057700000  # pick a board if more than one attached
#
# Options:
#   --ncs-root <dir>     NCS root (default: $NCS_ROOT, ~/ncs, /opt/nordic/ncs)
#   --ncs-version <v>    NCS version (default: $NCS_VERSION or v3.3.0)
#   --board <target>     build target (default: nrf54l15dk/nrf54l15/cpuapp)
#   --app-dir <dir>      app to build (default: this script's folder)
#   --build-dir <dir>    build output (default: <app-dir>/build)
#   --port <dev>         serial device for --monitor (auto if omitted)
#   --snr <serial>       J-Link serial number (if >1 board attached)
#   --baud <n>           monitor baud rate (default 115200)
#   --no-flash           build only
#   --monitor            open a serial monitor after flashing
#
# Linux one-time prerequisites (not needed on macOS):
#   - SEGGER J-Link package (deb/rpm from segger.com/downloads/jlink)
#   - nrf-udev rules (github.com/NordicSemiconductor/nrf-udev) for USB access
#   - your user in the dialout group for the serial port
# ============================================================================

set -u

info() { printf '\033[36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m!!  %s\033[0m\n' "$*"; }
die()  { printf '\033[31mERR %s\033[0m\n' "$*" >&2; exit 1; }

NCS_ROOT="${NCS_ROOT:-}"
NCS_VERSION="${NCS_VERSION:-v3.3.0}"
BOARD='nrf54l15dk/nrf54l15/cpuapp'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR"
BUILD_DIR=''
PORT=''
SNR=''
BAUD=115200
NO_FLASH=0
MONITOR=0

while [ $# -gt 0 ]; do
    case "$1" in
        --ncs-root)    NCS_ROOT="$2";    shift 2 ;;
        --ncs-version) NCS_VERSION="$2"; shift 2 ;;
        --board)       BOARD="$2";       shift 2 ;;
        --app-dir)     APP_DIR="$2";     shift 2 ;;
        --build-dir)   BUILD_DIR="$2";   shift 2 ;;
        --port)        PORT="$2";        shift 2 ;;
        --snr)         SNR="$2";         shift 2 ;;
        --baud)        BAUD="$2";        shift 2 ;;
        --no-flash)    NO_FLASH=1;       shift ;;
        --monitor)     MONITOR=1;        shift ;;
        -h|--help)     sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) die "Unknown option: $1 (see --help)" ;;
    esac
done

# ---------------------------------------------------------------------------
# 1. Locate the NCS root (contains toolchains/toolchains.json and <version>/)
# ---------------------------------------------------------------------------
if [ -z "$NCS_ROOT" ]; then
    for c in "$HOME/ncs" /opt/nordic/ncs "$HOME/Nordic/ncs"; do
        if [ -f "$c/toolchains/toolchains.json" ]; then NCS_ROOT="$c"; break; fi
    done
fi
[ -n "$NCS_ROOT" ] && [ -f "$NCS_ROOT/toolchains/toolchains.json" ] ||
    die "Could not find the NCS root. Set NCS_ROOT or pass --ncs-root <path> (the folder containing 'toolchains' and '$NCS_VERSION')."
info "NCS root:    $NCS_ROOT"

WORKSPACE="$NCS_ROOT/$NCS_VERSION"
[ -d "$WORKSPACE/.west" ] ||
    die "No west workspace at '$WORKSPACE' (.west missing). Is NCS $NCS_VERSION installed? Try --ncs-version."

# ---------------------------------------------------------------------------
# 2. Resolve the version-matched toolchain hash from toolchains.json
# ---------------------------------------------------------------------------
PY="$(command -v python3 || command -v python || true)"
[ -n "$PY" ] || die "python3 is required to read toolchains.json."

BUNDLE_ID="$("$PY" - "$NCS_ROOT/toolchains/toolchains.json" "$NCS_VERSION" <<'EOF'
import json, sys
tj = json.load(open(sys.argv[1]))
want = sys.argv[2]
# Known schemas: {"toolchains": [...]}, a bare list of toolchain entries,
# or a list of objects each wrapping a "toolchains" list (what the
# Toolchain Manager and the VS Code extension actually write).
entries = []
for item in (tj if isinstance(tj, list) else [tj]):
    if isinstance(item, dict) and isinstance(item.get('toolchains'), list):
        entries += item['toolchains']
    else:
        entries.append(item)
seen = []
for tc in entries:
    if not isinstance(tc, dict):
        continue
    vers = tc.get('ncs_versions') or [v for v in [tc.get('ncs_version')] if v]
    ident = tc.get('identifier')
    bid = (ident.get('bundle_id') if isinstance(ident, dict) else ident) \
        or tc.get('bundle_id') or tc.get('name')
    seen += vers
    if want in vers and bid:
        print(bid)
        break
else:
    print('registered versions: ' + (', '.join(sorted(set(seen))) or 'none'),
          file=sys.stderr)
EOF
)"
[ -n "$BUNDLE_ID" ] ||
    die "No toolchain in toolchains.json is registered for '$NCS_VERSION' (see the versions listed above; pass --ncs-version <v>)."
TOOLCHAIN="$NCS_ROOT/toolchains/$BUNDLE_ID"
[ -d "$TOOLCHAIN" ] || die "Toolchain '$BUNDLE_ID' listed but missing at $TOOLCHAIN"
info "Toolchain:   $BUNDLE_ID  ($NCS_VERSION)"

# ---------------------------------------------------------------------------
# 3. Set up the Zephyr / west environment from the toolchain
# ---------------------------------------------------------------------------
# Newer bundles ship an env script; use it when present, else build the
# environment by hand from the known bundle layout.
if [ -f "$TOOLCHAIN/env.sh" ]; then
    # shellcheck disable=SC1091
    . "$TOOLCHAIN/env.sh"
else
    for d in "$TOOLCHAIN/bin" "$TOOLCHAIN/usr/bin" "$TOOLCHAIN/usr/local/bin" \
             "$TOOLCHAIN/opt/bin" "$TOOLCHAIN/opt/nanopb/generator-bin" \
             "$TOOLCHAIN/opt/zephyr-sdk/arm-zephyr-eabi/bin"; do
        [ -d "$d" ] && PATH="$d:$PATH"
    done
fi
# the bundle ships nrfutil in its own dir (same as <tc>\nrfutil\bin on Windows)
[ -d "$TOOLCHAIN/nrfutil/bin" ] && PATH="$TOOLCHAIN/nrfutil/bin:$PATH"
export PATH
export ZEPHYR_TOOLCHAIN_VARIANT='zephyr'
[ -d "$TOOLCHAIN/opt/zephyr-sdk" ] && export ZEPHYR_SDK_INSTALL_DIR="$TOOLCHAIN/opt/zephyr-sdk"

command -v west >/dev/null 2>&1 || die "west not found in the toolchain environment ($TOOLCHAIN)."
WEST_PY="$(command -v python3)"

# ---------------------------------------------------------------------------
# 4. Build
# ---------------------------------------------------------------------------
APP_DIR="$(cd "$APP_DIR" && pwd)"
[ -n "$BUILD_DIR" ] || BUILD_DIR="$APP_DIR/build"
# Zephyr's Kconfig/CMake cannot handle spaces in the app or build path.
case "$APP_DIR$BUILD_DIR" in *' '*)
    die "The app/build path contains a SPACE ('$APP_DIR') - Zephyr can't build from it. Move the repo to a space-free path and re-run." ;;
esac
info "App:         $APP_DIR"
info "Board:       $BOARD"
info "Build dir:   $BUILD_DIR"

# We build pristine anyway (-p always), so wipe any existing build dir first.
# A stale CMake cache (e.g. after the repo was moved) makes sysbuild fail.
if [ -d "$BUILD_DIR" ]; then
    info "Removing stale build dir"
    rm -rf "$BUILD_DIR"
fi

( cd "$WORKSPACE" && west build -p always -b "$BOARD" -d "$BUILD_DIR" "$APP_DIR" ) ||
    die "west build failed"
info "Build OK"

# ---------------------------------------------------------------------------
# 5. Flash
# ---------------------------------------------------------------------------
if [ "$NO_FLASH" -eq 1 ]; then info "Build-only (--no-flash); skipping flash."; exit 0; fi

NRFUTIL="$(command -v nrfutil || true)"
for cand in "$HOME/.nordic/bin/nrfutil" "$TOOLCHAIN/nrfutil/bin/nrfutil"; do
    [ -n "$NRFUTIL" ] && break
    [ -x "$cand" ] && NRFUTIL="$cand"
done

# nrfutil is a plugin launcher; 'device' is a plugin that fresh installs
# may not carry (the Windows toolchain bundle preinstalls it). Install it
# on the fly, or fall back to west flash below.
if [ -n "$NRFUTIL" ] && ! "$NRFUTIL" device --version >/dev/null 2>&1; then
    info "nrfutil is missing its 'device' command - installing it (one-time, needs network)"
    "$NRFUTIL" install device || { warn "could not install nrfutil-device"; NRFUTIL=''; }
fi

FW="$BUILD_DIR/merged.hex"
[ -f "$FW" ] || FW="$BUILD_DIR/zephyr/zephyr.hex"
[ -f "$FW" ] || die "No firmware image found in $BUILD_DIR (merged.hex / zephyr.hex)."
info "Flashing:    $FW"

if [ -n "$NRFUTIL" ]; then
    # plain string, not an array: macOS ships bash 3.2, where set -u
    # rejects the expansion of an empty array
    SNR_ARGS=''
    [ -n "$SNR" ] && SNR_ARGS="--serial-number $SNR"
    # shellcheck disable=SC2086
    "$NRFUTIL" device program --firmware "$FW" --options chip_erase_mode=ERASE_ALL $SNR_ARGS ||
        die "nrfutil program failed. If >1 board is attached, pass --snr <serial>. On Linux, check the nrf-udev rules are installed."
    # shellcheck disable=SC2086
    "$NRFUTIL" device reset $SNR_ARGS >/dev/null
else
    warn "nrfutil not found - flashing with 'west flash' (J-Link runner) instead."
    ( cd "$WORKSPACE" && west flash --skip-rebuild -d "$BUILD_DIR" --erase ${SNR:+--dev-id "$SNR"} ) ||
        die "west flash failed. Is the SEGGER J-Link software installed? If >1 board is attached, pass --snr <serial>."
fi
info "Flashed + reset."

# ---------------------------------------------------------------------------
# 6. Serial monitor (optional)
# ---------------------------------------------------------------------------
if [ "$MONITOR" -eq 0 ]; then
    info "Done. Open a serial monitor on the J-Link CDC port at $BAUD to interact."
    exit 0
fi

if [ -z "$PORT" ]; then
    # space-joined string, not an array (bash 3.2 + set -u, see above);
    # device paths never contain spaces
    PORTS=''
    if [ "$(uname -s)" = 'Darwin' ]; then
        for p in /dev/tty.usbmodem*; do [ -e "$p" ] && PORTS="$PORTS $p"; done
    else
        # prefer stable by-id names that identify the J-Link explicitly
        for p in /dev/serial/by-id/*SEGGER*; do [ -e "$p" ] && PORTS="$PORTS $p"; done
        if [ -z "$PORTS" ]; then
            for p in /dev/ttyACM*; do [ -e "$p" ] && PORTS="$PORTS $p"; done
        fi
    fi
    # shellcheck disable=SC2086
    set -- $PORTS
    if   [ $# -eq 0 ]; then die "No J-Link serial port found. Pass --port <device>."
    elif [ $# -eq 1 ]; then PORT="$1"
    else
        warn "Multiple serial ports: $*. Using $1; override with --port. (The DK exposes two ports; the menu is usually on the second.)"
        PORT="$1"
    fi
fi
info "Serial monitor on $PORT @ $BAUD (Ctrl-] to exit)"
if "$WEST_PY" -c 'import serial' 2>/dev/null; then
    exec "$WEST_PY" -m serial.tools.miniterm "$PORT" "$BAUD"
elif command -v screen >/dev/null 2>&1; then
    warn "pyserial not available - falling back to screen (Ctrl-A k to exit)"
    exec screen "$PORT" "$BAUD"
else
    die "Neither pyserial nor screen available. Install one: pip3 install pyserial"
fi
