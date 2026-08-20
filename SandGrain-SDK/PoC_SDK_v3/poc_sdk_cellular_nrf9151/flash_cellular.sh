#!/usr/bin/env bash
# ============================================================================
# flash_cellular.sh - portable build + flash for the SandGrain cellular
# nRF9151 combined device+gateway app (Linux / macOS twin of
# flash_cellular.ps1)
#
# Runs on any machine with the nRF Connect SDK installed via the VS Code
# extension or Toolchain Manager - no hardcoded toolchain hash or serial
# port. It:
#   1. Finds the NCS root (env NCS_ROOT, --ncs-root, or common locations).
#   2. Reads <root>/toolchains/toolchains.json to resolve the toolchain that
#      matches the requested NCS version.
#   3. Sets up the Zephyr/west environment from that toolchain.
#   4. west build (pristine) for nrf9151dk/nrf9151/ns.
#   5. Flashes with nrfutil (PATH or ~/.nordic/bin) and resets.
#   6. Optionally opens a serial monitor on the auto-detected J-Link port.
#
# If the board sits on a DIFFERENT machine than the toolchain: --zip packages
# out/poc_sdk_cellular_nrf9151.zip (sources + merged.hex + both scripts); on
# the board machine, extract it and run:
#     ./flash_cellular.sh --prebuilt-hex ./merged.hex
# which skips the toolchain and the build entirely and only needs nrfutil.
#
# Usage:
#   ./flash_cellular.sh                        # build + flash with defaults
#   ./flash_cellular.sh --monitor              # same, then a serial monitor
#   ./flash_cellular.sh --no-flash --zip       # build + package for elsewhere
#   ./flash_cellular.sh --prebuilt-hex ./merged.hex   # flash only, no toolchain
#   ./flash_cellular.sh --snr 1057700000       # pick one of several boards
#
# Options:
#   --ncs-root <dir>       NCS root (default: $NCS_ROOT, ~/ncs, /opt/nordic/ncs)
#   --ncs-version <v>      NCS version (default: $NCS_VERSION or v3.3.0)
#   --board <target>       build target (default: nrf9151dk/nrf9151/ns)
#   --app-dir <dir>        app to build (default: this script's folder)
#   --build-dir <dir>      build output (default: <app-dir>/build)
#   --prebuilt-hex <file>  flash this image, skip the build (no toolchain)
#   --port <dev>           serial device for --monitor (auto if omitted)
#   --snr <serial>         J-Link serial number (if >1 board attached)
#   --baud <n>             monitor baud rate (default 115200)
#   --no-flash             build only
#   --zip                  package out/poc_sdk_cellular_nrf9151.zip
#   --monitor              open a serial monitor after flashing
#
# Linux one-time prerequisites (not needed on macOS):
#   - SEGGER J-Link package (deb/rpm from segger.com/downloads/jlink)
#   - nrf-udev rules (github.com/NordicSemiconductor/nrf-udev) for USB access
#   - your user in the dialout group for the serial port
#
# The board needs an activated SIM and the LTE antenna fitted, or it will
# stop at "[LTE] Attaching to the network". See RUN_LTE_CELLULAR_DEMO.md.
# ============================================================================

set -u

info() { printf '\033[36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m!!  %s\033[0m\n' "$*"; }
die()  { printf '\033[31mERR %s\033[0m\n' "$*" >&2; exit 1; }

NCS_ROOT="${NCS_ROOT:-}"
NCS_VERSION="${NCS_VERSION:-v3.3.0}"
BOARD='nrf9151dk/nrf9151/ns'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR"
BUILD_DIR=''
PREBUILT_HEX=''
PORT=''
SNR=''
BAUD=115200
WORKSPACE=''
NO_FLASH=0
ZIP=0
MONITOR=0
TOOLCHAIN=''

while [ $# -gt 0 ]; do
    case "$1" in
        --ncs-root)     NCS_ROOT="$2";     shift 2 ;;
        --ncs-version)  NCS_VERSION="$2";  shift 2 ;;
        --board)        BOARD="$2";        shift 2 ;;
        --app-dir)      APP_DIR="$2";      shift 2 ;;
        --build-dir)    BUILD_DIR="$2";    shift 2 ;;
        --prebuilt-hex) PREBUILT_HEX="$2"; shift 2 ;;
        --port)         PORT="$2";         shift 2 ;;
        --snr)          SNR="$2";          shift 2 ;;
        --baud)         BAUD="$2";         shift 2 ;;
        --no-flash)     NO_FLASH=1;        shift ;;
        --zip)          ZIP=1;             shift ;;
        --monitor)      MONITOR=1;         shift ;;
        -h|--help)      sed -n '2,52p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) die "Unknown option: $1 (see --help)" ;;
    esac
done

# ---------------------------------------------------------------------------
# Shared helpers (used by both the prebuilt-hex path and the full build)
# ---------------------------------------------------------------------------

# Locate an nrfutil that has the 'device' plugin. nrfutil is a launcher and
# 'device' is a separately installed plugin, so a fresh install may not carry
# it. Sets NRFUTIL (empty when unusable, so callers can fall back).
find_nrfutil() {
    NRFUTIL="$(command -v nrfutil || true)"
    for cand in "$HOME/.nordic/bin/nrfutil" "$TOOLCHAIN/nrfutil/bin/nrfutil"; do
        [ -n "$NRFUTIL" ] && break
        [ -x "$cand" ] && NRFUTIL="$cand"
    done
    if [ -n "$NRFUTIL" ] && ! "$NRFUTIL" device --version >/dev/null 2>&1; then
        info "nrfutil is missing its 'device' command - installing it (one-time, needs network)"
        "$NRFUTIL" install device || { warn "could not install nrfutil-device"; NRFUTIL=''; }
    fi
}

# Flash $1 and reset. Falls back to 'west flash' when nrfutil is unusable,
# which is only possible inside a toolchain environment.
flash_hex() {
    fw="$1"
    find_nrfutil
    info "Flashing:    $fw"
    if [ -n "$NRFUTIL" ]; then
        # plain string, not an array: macOS ships bash 3.2, where set -u
        # rejects the expansion of an empty array
        SNR_ARGS=''
        [ -n "$SNR" ] && SNR_ARGS="--serial-number $SNR"
        # shellcheck disable=SC2086
        "$NRFUTIL" device program --firmware "$fw" --options chip_erase_mode=ERASE_ALL $SNR_ARGS ||
            die "nrfutil program failed. Check: (1) board power switch ON, (2) USB in the DEBUG port nearest the power switch, (3) on Linux, the nrf-udev rules are installed. If >1 board is attached, pass --snr <serial>."
        # shellcheck disable=SC2086
        "$NRFUTIL" device reset $SNR_ARGS >/dev/null
    elif [ -n "$TOOLCHAIN" ]; then
        warn "nrfutil not found - flashing with 'west flash' (J-Link runner) instead."
        ( cd "$WORKSPACE" && west flash --skip-rebuild -d "$BUILD_DIR" --erase ${SNR:+--dev-id "$SNR"} ) ||
            die "west flash failed. Is the SEGGER J-Link software installed? If >1 board is attached, pass --snr <serial>."
    else
        die "nrfutil not found and no toolchain available to fall back on. Install nRF Util (nordicsemi.com/Products/Development-tools/nrf-util), then 'nrfutil install device'."
    fi
    info "Flashed + reset."
}

# Open a serial monitor on $PORT, auto-detecting it when not given.
open_monitor() {
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
    MON_PY="$(command -v python3 || command -v python || true)"
    info "Serial monitor on $PORT @ $BAUD (Ctrl-] to exit)"
    if [ -n "$MON_PY" ] && "$MON_PY" -c 'import serial' 2>/dev/null; then
        exec "$MON_PY" -m serial.tools.miniterm "$PORT" "$BAUD"
    elif command -v screen >/dev/null 2>&1; then
        warn "pyserial not available - falling back to screen (Ctrl-A k to exit)"
        exec screen "$PORT" "$BAUD"
    else
        die "Neither pyserial nor screen available. Install one: pip3 install pyserial"
    fi
}

# ---------------------------------------------------------------------------
# Prebuilt-hex mode: flash only, no toolchain needed (board-machine side)
# ---------------------------------------------------------------------------
if [ -n "$PREBUILT_HEX" ]; then
    [ -f "$PREBUILT_HEX" ] || die "Firmware not found: $PREBUILT_HEX"
    PREBUILT_HEX="$(cd "$(dirname "$PREBUILT_HEX")" && pwd)/$(basename "$PREBUILT_HEX")"
    flash_hex "$PREBUILT_HEX"
    if [ "$MONITOR" -eq 1 ]; then open_monitor; fi
    info "Open a serial monitor on the J-Link CDC port at $BAUD to interact."
    exit 0
fi

# ---------------------------------------------------------------------------
# 1. Locate the NCS root (contains toolchains/toolchains.json and <version>/)
# ---------------------------------------------------------------------------
if [ -z "$NCS_ROOT" ]; then
    for c in "$HOME/ncs" /opt/nordic/ncs "$HOME/Nordic/ncs"; do
        if [ -f "$c/toolchains/toolchains.json" ]; then NCS_ROOT="$c"; break; fi
    done
fi
[ -n "$NCS_ROOT" ] && [ -f "$NCS_ROOT/toolchains/toolchains.json" ] ||
    die "Could not find the NCS root. Set NCS_ROOT or pass --ncs-root <path> (the folder containing 'toolchains' and '$NCS_VERSION'). To flash a prebuilt image without a toolchain, use --prebuilt-hex."
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
# A stale CMake cache (e.g. after the repo was moved) makes sysbuild fail with
# 'APPLICATION_CONFIG_DIR ... doesn't exist' pointing at the old path.
if [ -d "$BUILD_DIR" ]; then
    info "Removing stale build dir"
    rm -rf "$BUILD_DIR"
fi

( cd "$WORKSPACE" && west build -p always -b "$BOARD" -d "$BUILD_DIR" "$APP_DIR" ) ||
    die "west build failed"
info "Build OK"

FW="$BUILD_DIR/merged.hex"
[ -f "$FW" ] || FW="$BUILD_DIR/zephyr/zephyr.hex"
[ -f "$FW" ] || die "No firmware image found in $BUILD_DIR (merged.hex / zephyr.hex) - sysbuild output layout changed?"

# ---------------------------------------------------------------------------
# 5. Optional: package a zip for a board on another machine (--zip)
# ---------------------------------------------------------------------------
if [ "$ZIP" -eq 1 ]; then
    ZIP_PATH="$APP_DIR/out/poc_sdk_cellular_nrf9151.zip"
    # zipfile from the stdlib rather than the 'zip' binary: python3 is already
    # a hard requirement above, 'zip' is not installed by default everywhere.
    "$PY" - "$APP_DIR" "$FW" "$ZIP_PATH" <<'EOF'
import os, sys, zipfile
app, fw, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(os.path.dirname(out), exist_ok=True)
if os.path.exists(out):
    os.remove(out)
top = 'poc_sdk_cellular_nrf9151'
items = ['CMakeLists.txt', 'prj.conf', 'boards', 'dts', 'src',
         'flash_cellular.ps1', 'flash_cellular.sh', 'README.md']
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for item in items:
        src = os.path.join(app, item)
        if not os.path.exists(src):
            continue
        if os.path.isdir(src):
            for root, _dirs, files in os.walk(src):
                for f in files:
                    full = os.path.join(root, f)
                    z.write(full, os.path.join(top, os.path.relpath(full, app)))
        else:
            z.write(src, os.path.join(top, item))
    # the build output itself, flat next to the sources
    z.write(fw, os.path.join(top, 'merged.hex'))
print('%.2f' % (os.path.getsize(out) / (1024.0 * 1024.0)))
EOF
    [ -f "$ZIP_PATH" ] || die "Packaging failed - no zip at $ZIP_PATH"
    info "Packaged:    $ZIP_PATH"
    info "On the board machine: extract, then ./flash_cellular.sh --prebuilt-hex ./merged.hex"
fi

# ---------------------------------------------------------------------------
# 6. Flash
# ---------------------------------------------------------------------------
if [ "$NO_FLASH" -eq 1 ]; then info "Build-only (--no-flash); skipping flash."; exit 0; fi
flash_hex "$FW"

# ---------------------------------------------------------------------------
# 7. Serial monitor (optional)
# ---------------------------------------------------------------------------
if [ "$MONITOR" -eq 0 ]; then
    info "Done. Open a serial monitor on the J-Link CDC port at $BAUD to interact."
    exit 0
fi
open_monitor
