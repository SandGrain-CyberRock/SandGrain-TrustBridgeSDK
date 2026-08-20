#!/usr/bin/env bash
# =============================================================================
# pi_device_ble_setup.sh
#
# Bring-up + build script for the SandGrain DEVICE in BLE-peripheral mode on a
# Raspberry Pi — the Pi replaces the nRF54L15 board and advertises the Nordic
# UART Service as 'SandGrain-Dev'. The gateway (BLE central) and cloud are
# unchanged.
#
# Automates BLE_DEVICE.md steps 1-3:
#   1. install build deps (GLib/GIO, libmosquitto, BlueZ)
#   2. apply the Pi/BlueZ system quirks that BLE-peripheral mode needs
#      (rfkill, LE-only controller mode, disable PipeWire's BLE-MIDI service)
#   3. build the standalone echo peripheral (tools/ble_peripheral) and the
#      SDK device with  make DEV_BLE=1
#
# It does NOT start the device. Run ON THE PI, from the pi-ble-device branch:
#     chmod +x scripts/pi_device_ble_setup.sh
#     ./scripts/pi_device_ble_setup.sh
#
# Re-runnable (idempotent). Flags:
#     --spi               crypto chip is wired to the Pi's SPI header instead
#                         of a USB dongle: enables the SPI interface, and
#                         builds with DEV_SPI=1 (port_spi_dev.c / spidev)
#     --deps-only         install deps + system prep, skip the build
#     --build-only        skip apt/system prep, just build
#     --keep-audio        do NOT mask PipeWire (WARNING: its encrypted BLE-MIDI
#                         GATT service breaks the gateway's service discovery;
#                         only use this if you disabled MIDI some other way)
#     -h | --help         show this help
# =============================================================================
set -euo pipefail

DO_DEPS=1
DO_BUILD=1
MASK_PIPEWIRE=1
USE_SPI=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --spi)        USE_SPI=1; shift ;;
        --deps-only)  DO_BUILD=0; shift ;;
        --build-only) DO_DEPS=0; shift ;;
        --keep-audio) MASK_PIPEWIRE=0; shift ;;
        -h|--help)    grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "Unknown arg: $1 (try --help)" >&2; exit 2 ;;
    esac
done

c_grn=$'\033[32m'; c_yel=$'\033[33m'; c_red=$'\033[31m'; c_rst=$'\033[0m'
say()  { echo "${c_grn}==>${c_rst} $*"; }
warn() { echo "${c_yel}[!]${c_rst} $*" >&2; }
die()  { echo "${c_red}[FATAL]${c_rst} $*" >&2; exit 1; }

# ---- locate the device app dir (this script lives in <device>/scripts/) ------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"          # poc_sdk_device/
APP_DIR="$DEV_DIR/app"
TOOL_DIR="$DEV_DIR/tools/ble_peripheral"
[[ -f "$APP_DIR/Makefile" ]] || die "Can't find device Makefile at $APP_DIR. Run from the repo (pi-ble-device branch)."
say "Device app dir: $APP_DIR"

if grep -qiE "microsoft|wsl" /proc/version 2>/dev/null; then
    die "This looks like WSL — WSL has no Bluetooth access. Run on the Raspberry Pi."
fi

# =============================================================================
# STEP 1 — dependencies
# =============================================================================
if [[ $DO_DEPS -eq 1 ]]; then
    say "STEP 1: installing build deps ..."
    sudo apt-get update
    sudo apt-get install -y \
        build-essential pkg-config \
        libglib2.0-dev libmosquitto-dev \
        bluez rfkill

    # =========================================================================
    # STEP 2 — system quirks (see BLE_DEVICE.md 'The quirk ladder')
    # =========================================================================
    say "STEP 2: applying Pi/BlueZ peripheral-mode quirks ..."

    # (1) rfkill soft-block: on some Pi OS images Bluetooth boots soft-blocked.
    sudo rfkill unblock bluetooth 2>/dev/null || true
    sudo systemctl enable --now bluetooth >/dev/null 2>&1 || true

    # (2) LE-only controller mode. Without it the adapter is dual-mode, the
    # advertisement lacks 'BR/EDR Not Supported', and the gateway's BlueZ
    # connects over CLASSIC BR/EDR (pairing fails) instead of LE.
    MAIN_CONF=/etc/bluetooth/main.conf
    if grep -qE '^ControllerMode *= *le' "$MAIN_CONF" 2>/dev/null; then
        say "ControllerMode = le already set."
    else
        if grep -qE '^#?ControllerMode' "$MAIN_CONF" 2>/dev/null; then
            sudo sed -i 's/^#\?ControllerMode *=.*/ControllerMode = le/' "$MAIN_CONF"
        else
            sudo sed -i '/^\[General\]/a ControllerMode = le' "$MAIN_CONF"
        fi
        say "Set ControllerMode = le in $MAIN_CONF"
    fi

    # (3) PipeWire/WirePlumber register an ENCRYPTED BLE-MIDI GATT service
    # (03b80e5a-...) on the adapter. The gateway's service discovery hits it,
    # gets Insufficient Encryption, tries to pair, fails, and disconnects
    # before ever reaching the NUS characteristics. The wireplumber
    # 'bluez5.enable-midi = false' drop-in did NOT work on Pi OS (units are
    # enabled in global scope and resurrect on reboot), so mask the stack.
    if [[ $MASK_PIPEWIRE -eq 1 ]]; then
        systemctl --user mask --now \
            wireplumber pipewire pipewire-pulse \
            pipewire.socket pipewire-pulse.socket 2>/dev/null || true
        say "Masked PipeWire/WirePlumber (kills the BLE-MIDI GATT service)."
        warn "Audio on this Pi is disabled. Undo with: systemctl --user unmask wireplumber pipewire pipewire-pulse pipewire.socket pipewire-pulse.socket"
    else
        warn "--keep-audio: PipeWire left running. If the gateway fails with"
        warn "'failed to subscribe to NUS TX', its BLE-MIDI service is why."
    fi

    sudo systemctl restart bluetooth
    say "bluetoothd restarted."

    # (4)+(5) kernel ext-adv rejection + connectable: handled INSIDE the
    # binaries (kernel mgmt-API advertising fallback after 3 D-Bus failures,
    # which also sets the adapter connectable). Nothing to configure here.

    # (6) --spi: the chip sits on the SPI header, not USB. Enable the SPI
    # interface (creates /dev/spidev0.0 after reboot on first enable).
    if [[ $USE_SPI -eq 1 ]]; then
        if [[ -e /dev/spidev0.0 ]]; then
            say "SPI interface already enabled (/dev/spidev0.0 present)."
        elif command -v raspi-config >/dev/null 2>&1; then
            sudo raspi-config nonint do_spi 0
            if [[ -e /dev/spidev0.0 ]]; then
                say "Enabled SPI interface (/dev/spidev0.0)."
            else
                warn "SPI enabled but /dev/spidev0.0 not present yet — reboot once before running."
            fi
        else
            warn "raspi-config not found. Enable SPI manually: add 'dtparam=spi=on'"
            warn "to /boot/firmware/config.txt and reboot (/dev/spidev0.0 must exist)."
        fi
        # spidev nodes are group 'spi' on Raspberry Pi OS.
        if getent group spi >/dev/null 2>&1 && ! id -nG | grep -qw spi; then
            sudo usermod -aG spi "$USER" \
                && warn "Added $USER to 'spi' for /dev/spidev0.0 — log out/in (or reboot) once."
        fi
    fi
fi

# =============================================================================
# STEP 3 — build
# =============================================================================
if [[ $DO_BUILD -eq 1 ]]; then
    say "STEP 3a: building standalone echo peripheral (tools/ble_peripheral) ..."
    make -C "$TOOL_DIR"
    say "Built $TOOL_DIR/nus_peripheral"

    if [[ $USE_SPI -eq 1 ]]; then
        say "STEP 3b: building SDK device with BLE transport + SPI chip (DEV_BLE=1 DEV_SPI=1) ..."
        make -C "$APP_DIR" clean
        make -C "$APP_DIR" DEV_BLE=1 DEV_SPI=1
    else
        say "STEP 3b: building SDK device with BLE transport (DEV_BLE=1) ..."
        make -C "$APP_DIR" clean
        make -C "$APP_DIR" DEV_BLE=1
    fi
    BIN="$APP_DIR/test_device"
    [[ -x "$BIN" ]] || die "Build reported success but $BIN is missing."
    say "Built $BIN"

    # The mgmt advertising fallback needs a raw HCI control socket.
    if command -v setcap >/dev/null 2>&1; then
        sudo setcap 'cap_net_raw,cap_net_admin+eip' "$BIN" \
            && sudo setcap 'cap_net_raw,cap_net_admin+eip' "$TOOL_DIR/nus_peripheral" \
            && say "Granted cap_net_raw,cap_net_admin (no sudo needed to run)." \
            || warn "setcap failed; run with sudo instead."
    fi

    # Crypto chip (SGT1001 USB dongle) shows up as /dev/ttyACM0 — needs dialout.
    # (Not needed in --spi mode, but harmless and keeps the USB path working.)
    if ! id -nG | grep -qw dialout; then
        sudo usermod -aG dialout "$USER" \
            && warn "Added $USER to 'dialout' for /dev/ttyACM0 — log out/in (or reboot) once."
    fi
fi

if [[ $USE_SPI -eq 1 ]]; then
    CHIP_STEP="Wire the SGT1001 to the SPI header (CE0: MOSI pin 19, MISO pin 21, SCLK pin 23, CS pin 24, 3V3 + GND)."
else
    CHIP_STEP="Plug in the SGT1001 USB dongle (crypto chip, /dev/ttyACM0)."
fi

cat <<EOF

${c_grn}Setup complete.${c_rst}
Next (see BLE_DEVICE.md for detail):
  1. $CHIP_STEP
  2. Smoke-test the link first:   cd $TOOL_DIR && ./nus_peripheral
     then start the gateway on the other Pi — both sides must print 'link ready'.
  3. Run the real device:         cd $APP_DIR && ./test_device
     (start the DEVICE first, the gateway second), then choose option 1.

If the gateway sticks at 'found SandGrain-Dev': restart bluetooth on BOTH Pis
(sudo systemctl restart bluetooth), 'bluetoothctl remove <device MAC>' on the
gateway, and restart both programs — device first. See BLE_DEVICE.md.
EOF
