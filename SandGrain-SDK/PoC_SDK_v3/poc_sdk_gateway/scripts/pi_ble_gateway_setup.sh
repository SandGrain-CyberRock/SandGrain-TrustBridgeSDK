#!/usr/bin/env bash
# =============================================================================
# pi_ble_gateway_setup.sh
#
# Bring-up + build script for the SandGrain gateway in BLE-central mode on a
# Raspberry Pi (or any Linux box with a real Bluetooth adapter).
#
# Automates BLE_GATEWAY.md steps 1-3:
#   1. install BlueZ + build deps + gattlib (apt or from source)
#   2. verify the Bluetooth adapter is up, apply the BlueZ quirk this Pi needs
#      (mask PipeWire's BLE-MIDI GATT service), and optionally check that the
#      MQTT broker is reachable from this Pi
#   3. build the gateway with  make GW_BLE=1  and grant it BLE capabilities
#
# It does NOT start the gateway (you choose when / with which broker). It writes
# an env template (.env.ble.gateway) and a run helper (run_ble_gateway.sh) next
# to the gateway app for you.
#
# Run ON THE PI, after cloning/copying the repo and checking out
# trustbridge-0.4-BLE:
#     chmod +x scripts/pi_ble_gateway_setup.sh
#     ./scripts/pi_ble_gateway_setup.sh --broker 192.168.1.50
#
# Re-runnable (idempotent). Flags:
#     --broker <host>     MQTT broker IP/host reachable from the Pi (LAN, not
#                         localhost/WSL). Stored in the env template + probed.
#                         Also sets BE_URL, since in this setup one machine
#                         runs the broker and the TrustBridge backend.
#     --mqtt-port <n>     MQTT port (default 1883)
#     --be-url <url>      TrustBridge backend URL, when it is NOT on the broker
#                         host (default http://<broker>:<be-port>/api)
#     --be-port <n>       TrustBridge backend port (default 3000)
#     --deps-only         install dependencies, skip the build
#     --build-only        skip apt/gattlib install, just build
#     --gattlib-source    force building gattlib from source (skip apt/.deb)
#     --keep-audio        do NOT mask PipeWire (WARNING: its encrypted BLE-MIDI
#                         GATT service makes the device link drop every ~35s)
#     -h | --help         show this help
# =============================================================================
set -euo pipefail

# ---- defaults ---------------------------------------------------------------
BROKER=""
MQTT_PORT="1883"
BE_URL=""
BE_PORT="3000"
DO_DEPS=1
DO_BUILD=1
MASK_PIPEWIRE=1         # PipeWire's BLE-MIDI GATT service breaks the device link
GATTLIB_FROM_SOURCE=1   # gattlib isn't in apt with the API we target; build from source

# Pin gattlib to a known-good commit/tag so every device builds the IDENTICAL
# API (port_comm_device_ble.c targets the DBus API with gattlib_mainloop +
# async gattlib_connect). Override with --gattlib-ref <sha|tag> or GATTLIB_REF.
GATTLIB_REF="${GATTLIB_REF:-1580056bce260f0d8ad7ccc8b105c34057cd1fbd}"   # pinned: labapart/gattlib master tip that this code is verified against
GATTLIB_SRC="${GATTLIB_SRC:-$HOME/.local/src/gattlib}"   # kept on disk for reproducible rebuilds

# ---- arg parsing ------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --broker)        BROKER="${2:?--broker needs a value}"; shift 2 ;;
        --mqtt-port)     MQTT_PORT="${2:?--mqtt-port needs a value}"; shift 2 ;;
        --be-url)        BE_URL="${2:?--be-url needs a value}"; shift 2 ;;
        --be-port)       BE_PORT="${2:?--be-port needs a value}"; shift 2 ;;
        --deps-only)     DO_BUILD=0; shift ;;
        --build-only)    DO_DEPS=0; shift ;;
        --gattlib-source) GATTLIB_FROM_SOURCE=1; shift ;;
        --keep-audio)    MASK_PIPEWIRE=0; shift ;;
        --gattlib-ref)   GATTLIB_REF="${2:?--gattlib-ref needs a value}"; shift 2 ;;
        -h|--help)       grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "Unknown arg: $1 (try --help)" >&2; exit 2 ;;
    esac
done

# ---- pretty logging ---------------------------------------------------------
c_grn=$'\033[32m'; c_yel=$'\033[33m'; c_red=$'\033[31m'; c_rst=$'\033[0m'
say()  { echo "${c_grn}==>${c_rst} $*"; }
warn() { echo "${c_yel}[!]${c_rst} $*" >&2; }
die()  { echo "${c_red}[FATAL]${c_rst} $*" >&2; exit 1; }

# ---- locate the gateway app dir (this script lives in <gw>/scripts/) ---------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GW_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"          # poc_sdk_gateway/
APP_DIR="$GW_DIR/app"                            # where the Makefile lives
[[ -f "$APP_DIR/Makefile" ]] || die "Can't find gateway Makefile at $APP_DIR. Run this from the repo (trustbridge-0.4-BLE branch)."
say "Gateway app dir: $APP_DIR"

# ---- sanity: not WSL (the whole point of going to the Pi) --------------------
if grep -qiE "microsoft|wsl" /proc/version 2>/dev/null; then
    die "This looks like WSL - WSL has no Bluetooth access. Run on the Raspberry Pi."
fi

# =============================================================================
# STEP 1 - dependencies
# =============================================================================
if [[ $DO_DEPS -eq 1 ]]; then
    say "STEP 1: installing build deps + BlueZ + libmosquitto ..."
    sudo apt-get update
    sudo apt-get install -y \
        build-essential pkg-config git cmake \
        libbluetooth-dev libglib2.0-dev libdbus-1-dev \
        bluez libmosquitto-dev mosquitto-clients

    # ---- gattlib (not in apt; build a PINNED commit from source) -------------
    export PKG_CONFIG_PATH="/usr/local/lib/pkgconfig:${PKG_CONFIG_PATH:-}"
    say "Building gattlib from source (labapart/gattlib @ $GATTLIB_REF) ..."
    if [[ ! -d "$GATTLIB_SRC/.git" ]]; then
        mkdir -p "$(dirname "$GATTLIB_SRC")"
        git clone https://github.com/labapart/gattlib "$GATTLIB_SRC"   # full clone so any SHA/tag checks out
    fi
    git -C "$GATTLIB_SRC" fetch --tags --force origin
    git -C "$GATTLIB_SRC" checkout -q "$GATTLIB_REF"
    GATTLIB_SHA="$(git -C "$GATTLIB_SRC" rev-parse HEAD)"
    rm -rf "$GATTLIB_SRC/build"
    mkdir -p "$GATTLIB_SRC/build"
    ( cd "$GATTLIB_SRC/build" \
        && cmake -DGATTLIB_BUILD_EXAMPLES=OFF -DGATTLIB_BUILD_DOCS=OFF .. \
        && make -j"$(nproc)" \
        && sudo make install )
    sudo ldconfig
    echo "$GATTLIB_SHA" > "$GW_DIR/.gattlib.pinned" 2>/dev/null || true
    say "gattlib built + installed from commit $GATTLIB_SHA"
    if [[ "$GATTLIB_REF" == "master" ]]; then
        warn "You built 'master'. For reproducible builds on other devices, re-run pinned:"
        warn "    GATTLIB_REF=$GATTLIB_SHA ./scripts/pi_ble_gateway_setup.sh ..."
        warn "(or set GATTLIB_REF default to that SHA in this script - recorded in $GW_DIR/.gattlib.pinned)"
    fi

    if ! pkg-config --exists gattlib; then
        warn "pkg-config still can't see gattlib. If it installed under /usr/local, run:"
        warn '    export PKG_CONFIG_PATH=/usr/local/lib/pkgconfig:$PKG_CONFIG_PATH'
        die  "gattlib not discoverable by pkg-config."
    fi
    say "gattlib OK: $(pkg-config --modversion gattlib)"
fi

# =============================================================================
# STEP 2 - verify Bluetooth, apply the BLE-MIDI quirk, probe the broker
# =============================================================================
say "STEP 2: checking Bluetooth adapter ..."
sudo systemctl enable --now bluetooth >/dev/null 2>&1 || true
sudo rfkill unblock bluetooth 2>/dev/null || true
sudo hciconfig hci0 up 2>/dev/null || true

if command -v hciconfig >/dev/null 2>&1 && hciconfig hci0 >/dev/null 2>&1; then
    say "Adapter hci0 is present:"
    hciconfig hci0 | sed 's/^/    /'
elif command -v bluetoothctl >/dev/null 2>&1 && bluetoothctl list 2>/dev/null | grep -q Controller; then
    say "Controller present (via bluetoothctl):"
    bluetoothctl list | sed 's/^/    /'
else
    warn "No Bluetooth adapter detected. On a Pi: check 'dmesg | grep -i blue',"
    warn "ensure bluetoothd is running, and that BT isn't disabled in config.txt."
fi

# ---- BLE-MIDI quirk ---------------------------------------------------------
# PipeWire/WirePlumber register an ENCRYPTED BLE-MIDI GATT service
# (03b80e5a-ede8-4b33-a751-6ce34ec4c700) on the adapter. It bites in BOTH
# directions, so this Pi needs the same treatment as the device Pi:
#
#   - device -> gateway: the device's BlueZ discovers services on THIS Pi,
#     reads the BLE-MIDI characteristic (7772e5db-3868-4112-a1a9-f2669d106bf3),
#     gets Insufficient Encryption, and sends an SMP Security Request. Both
#     sides declare DisplayYesNo + MITM, so pairing lands on numeric
#     comparison and waits for a human to confirm. Nobody does, SMP times out
#     at 30s, and bluetoothd hangs up: "Disconnect ... Authentication
#     Failure". Observed on hardware as the link dying every ~35s forever,
#     with the auth itself passing whenever it fit inside the window. The
#     Disconnect Complete reports "LL Response Timeout (0x22)", which is the
#     controller describing a link it was TOLD to drop - the real reason is
#     in the outgoing HCI Disconnect command.
#   - gateway -> device: the mirror case, handled in pi_device_ble_setup.sh.
#
# The wireplumber "bluez5.enable-midi = false" drop-in did NOT work on Pi OS
# (units are enabled in global scope and resurrect on reboot), so mask the
# stack. To diagnose a recurrence: sudo btmon, look for "User Confirmation
# Request" and for an outgoing "HCI Command: Disconnect".
if [[ $MASK_PIPEWIRE -eq 1 ]]; then
    systemctl --user mask --now \
        wireplumber pipewire pipewire-pulse \
        pipewire.socket pipewire-pulse.socket 2>/dev/null || true
    say "Masked PipeWire/WirePlumber (kills the BLE-MIDI GATT service)."
    warn "Audio on this Pi is disabled. Undo with: systemctl --user unmask wireplumber pipewire pipewire-pulse pipewire.socket pipewire-pulse.socket"
    sudo systemctl restart bluetooth
    say "bluetoothd restarted."
else
    warn "--keep-audio: PipeWire left running. If the device link drops every"
    warn "~35s while the auth itself passes, its BLE-MIDI service is why."
fi

# optional broker reachability probe
if [[ -n "$BROKER" ]]; then
    say "Probing MQTT broker $BROKER:$MQTT_PORT from this Pi ..."
    if command -v mosquitto_pub >/dev/null 2>&1; then
        if timeout 5 mosquitto_pub -h "$BROKER" -p "$MQTT_PORT" -t sandgrain/ping -m up 2>/dev/null; then
            say "Broker reachable (anonymous publish OK)."
        else
            warn "Could not publish anonymously to $BROKER:$MQTT_PORT - may need creds"
            warn "(MQTT_USER/MQTT_PASS) or auth; that's fine, the gateway will use them."
        fi
    fi
    # raw TCP reachability
    if timeout 5 bash -c "exec 3<>/dev/tcp/$BROKER/$MQTT_PORT" 2>/dev/null; then
        say "TCP $BROKER:$MQTT_PORT is open."
    else
        warn "TCP $BROKER:$MQTT_PORT not reachable. Check the broker host/firewall;"
        warn "remember the Pi must reach the broker over the LAN (not 127.0.0.1/WSL)."
    fi
fi

# =============================================================================
# STEP 3 - build (GW_BLE=1) + capabilities + helpers
# =============================================================================
if [[ $DO_BUILD -eq 1 ]]; then
    say "STEP 3: building gateway (GW_BLE=1) ..."
    export PKG_CONFIG_PATH="/usr/local/lib/pkgconfig:${PKG_CONFIG_PATH:-}"
    make -C "$APP_DIR" clean
    if ! make -C "$APP_DIR" GW_BLE=1; then
        die "Build failed. If it's a gattlib API mismatch, see BLE_GATEWAY.md
     'Known iterate-on-hardware points' (prv_setup_connection in
     port/port_comm_device_ble.c targets gattlib 0.3.x)."
    fi
    BIN="$APP_DIR/test_gw"
    [[ -x "$BIN" ]] || die "Build reported success but $BIN is missing."
    say "Built $BIN"

    # BLE scan/connect needs raw socket caps; grant once so 'sudo' isn't required.
    if command -v setcap >/dev/null 2>&1; then
        sudo setcap 'cap_net_raw,cap_net_admin+eip' "$BIN" \
            && say "Granted cap_net_raw,cap_net_admin to test_gw (no sudo needed to run)." \
            || warn "setcap failed; you can still run with: sudo -E ./test_gw"
    fi

    # ---- env template --------------------------------------------------------
    # BE_URL follows --broker: in this setup one machine (the laptop) runs the
    # MQTT broker AND the TrustBridge backend, so giving --broker is enough.
    # --be-url overrides it outright when they are on different hosts.
    if [[ -z "$BE_URL" ]]; then
        BE_URL="http://${BROKER:-CHANGE-ME}:${BE_PORT}/api"
    fi

    ENV_FILE="$APP_DIR/.env.ble.gateway"
    if [[ ! -f "$ENV_FILE" ]]; then
        cat > "$ENV_FILE" <<EOF
# Gateway runtime env (BLE-central mode). Edit, then: source .env.ble.gateway
# These map to config_poc.h / main_gw.c getenv() lookups.
export MQTT_BROKER=${BROKER:-127.0.0.1}   # broker reachable from THIS Pi (LAN IP)
export MQTT_PORT=${MQTT_PORT}
export MQTT_USER=sandgrain                 # match your broker's creds
export MQTT_PASS=admin
export BE_URL=${BE_URL}    # TrustBridge backend telemetry URL
# export GW_WHITELIST_PATH=/path/to/whitelist.json   # optional
EOF
        if [[ "$BE_URL" == *CHANGE-ME* ]]; then
            say "Wrote env template: $ENV_FILE  (edit MQTT_BROKER / BE_URL - no --broker was given)."
        else
            say "Wrote env template: $ENV_FILE  (MQTT_BROKER=$BROKER, BE_URL=$BE_URL)."
        fi
    else
        say "Env file already exists: $ENV_FILE (left untouched)."
        say "  If it still says CHANGE-ME, set BE_URL=$BE_URL by hand."
    fi

    # ---- run helper ----------------------------------------------------------
    RUN_FILE="$APP_DIR/run_ble_gateway.sh"
    cat > "$RUN_FILE" <<'EOF'
#!/usr/bin/env bash
# Convenience launcher for the BLE-central gateway.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
[[ -f .env.ble.gateway ]] && source .env.ble.gateway
echo "==> MQTT_BROKER=$MQTT_BROKER:$MQTT_PORT  BE_URL=${BE_URL:-unset}"
echo "==> scanning for BLE peripheral 'SandGrain-Dev' ..."
# caps were granted by setup; if not, fall back to sudo -E
if getcap ./test_gw 2>/dev/null | grep -q cap_net_raw; then
    exec ./test_gw
else
    exec sudo -E ./test_gw
fi
EOF
    chmod +x "$RUN_FILE"
    say "Wrote run helper: $RUN_FILE"
fi

# =============================================================================
# done
# =============================================================================
cat <<EOF

${c_grn}Setup complete.${c_rst}
Next:
  1. Check $APP_DIR/.env.ble.gateway (MQTT_BROKER and BE_URL are filled in from
     --broker; edit only if the backend is on a different host).
  2. Make sure the cloud/mosquitto is up and the board's TID is whitelisted.
  3. Power the nRF54L15 board so it advertises as 'SandGrain-Dev'.
  4. Start the gateway:   cd $APP_DIR && ./run_ble_gateway.sh
  5. Authenticate: press '1' on the board menu, or trigger the device flow from
     TrustBridge - the gateway relays that over BLE. Expect Phase 1 + Phase 2.

Troubleshooting: see $GW_DIR/BLE_GATEWAY.md (gattlib version, MTU, permissions).
EOF
