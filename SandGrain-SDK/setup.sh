#!/usr/bin/env bash
#
# setup.sh — one-time environment setup for the SandGrain PoC_SDK_v3 stack.
#
# Installs the system packages, creates the Python venv, and installs the
# Python dependencies (incl. the local SandGrain SDK as an editable install).
# Re-runnable. Targets Debian / Ubuntu / Raspberry Pi OS (apt).
#
# Run once:  bash setup.sh        (or setup.ps1 on Windows, which calls this via WSL)
# Then use:  bash run_all.sh
#
# Options:
#   --no-apt     skip the system-package install (just (re)create venv + pip deps)
#   -h | --help  show this help
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$SCRIPT_DIR"
CLOUD_DIR="$REPO_ROOT/PoC_SDK_v3/sdk_cloud"
VENV_DIR="$CLOUD_DIR/venv"
SDK_PKG_DIR="$CLOUD_DIR/sandgrain_cloud_sdk"   # local SDK (editable install)

DO_APT=1
for arg in "$@"; do
  case "$arg" in
    --no-apt) DO_APT=0 ;;
    -h|--help)
      cat <<'USAGE'
Usage: bash setup.sh [--no-apt]
  --no-apt     Skip system packages; only (re)create the venv and pip deps
  -h, --help   Show this help

Installs (via apt): build-essential, libmosquitto-dev, mosquitto,
                    mosquitto-clients, python3-venv, python3-pip, tmux
Then creates the venv at PoC_SDK_v3/sdk_cloud/venv and pip-installs:
                    python-dotenv paho-mqtt aiohttp cryptography
                    + the local SandGrain SDK (editable)
USAGE
      exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

say() { printf '\n==> %s\n' "$*"; }
die() { printf '[error] %s\n' "$*" >&2; exit 1; }

[[ -f "$SDK_PKG_DIR/pyproject.toml" ]] || die "SandGrain SDK package not found: $SDK_PKG_DIR (expected pyproject.toml)"

# --------------------------------------------------------------------------
# 1) System packages (apt: Debian / Ubuntu / Raspberry Pi OS)
# --------------------------------------------------------------------------
if [[ "$DO_APT" == 1 ]]; then
  command -v apt-get >/dev/null 2>&1 || die "apt-get not found. On non-apt distros install the equivalents of: build-essential libmosquitto-dev mosquitto mosquitto-clients python3-venv python3-pip tmux, then re-run with --no-apt."
  SUDO=""
  if [[ "$(id -u)" -ne 0 ]]; then
    command -v sudo >/dev/null 2>&1 && SUDO="sudo" || die "Need root or sudo to install system packages (or re-run with --no-apt)."
  fi
  say "Installing system packages via apt (may prompt for your sudo password)"
  $SUDO apt-get update
  $SUDO apt-get install -y \
    build-essential \
    libmosquitto-dev mosquitto mosquitto-clients \
    python3 python3-venv python3-pip \
    tmux
else
  say "Skipping system packages (--no-apt)"
fi

# --------------------------------------------------------------------------
# 2) Python venv
# --------------------------------------------------------------------------
# The SDK package requires Python >= 3.10. macOS ships an older system python3
# (e.g. 3.9), so prefer a newer interpreter if one is on PATH.
PYBIN=""
for c in python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$c" >/dev/null 2>&1; then
    ver="$("$c" -c 'import sys;print("%d.%d"%sys.version_info[:2])' 2>/dev/null)"
    major="${ver%%.*}"; minor="${ver##*.}"
    if [[ "$major" == 3 && "$minor" -ge 10 ]]; then PYBIN="$c"; break; fi
  fi
done
[[ -n "$PYBIN" ]] || die "No Python >= 3.10 found (the SDK needs it). Install one (macOS: brew install python@3.12; Debian: apt install python3.12 python3.12-venv) and retry."

if [[ ! -d "$VENV_DIR" ]]; then
  say "Creating venv at $VENV_DIR (using $PYBIN -> $("$PYBIN" --version 2>&1))"
  "$PYBIN" -m venv "$VENV_DIR"
else
  say "venv already exists at $VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

# --------------------------------------------------------------------------
# 3) Python dependencies (third-party + local SDK as editable)
# --------------------------------------------------------------------------
say "Installing Python dependencies into the venv"
python -m pip install --upgrade pip
python -m pip install python-dotenv paho-mqtt aiohttp cryptography
python -m pip install -e "$SDK_PKG_DIR"
deactivate

# --------------------------------------------------------------------------
# 4) WSL only: keep Windows-interop (wt.exe) working under systemd
# --------------------------------------------------------------------------
# Enabling systemd in WSL (/etc/wsl.conf [boot] systemd=true) makes
# systemd-binfmt skip registration, which drops the WSLInterop handler. Windows
# .exe launches then fail with "MZ: command not found", so run_all.sh can't open
# Windows Terminal windows. Install a tiny oneshot unit that re-registers the
# handler on every boot. Idempotent; never fatal (a build/test box without
# systemd or sudo just skips it and run_all.sh falls back to tmux).
if grep -qiE "microsoft|wsl" /proc/version 2>/dev/null; then
  say "WSL detected — ensuring Windows-interop (WSLInterop) persists under systemd"
  ISUDO=""
  [[ "$(id -u)" -ne 0 ]] && { command -v sudo >/dev/null 2>&1 && ISUDO="sudo" || ISUDO=""; }
  if [[ "$(id -u)" -ne 0 && -z "$ISUDO" ]]; then
    say "  Skipped: need root/sudo to install the interop unit. If wt.exe fails, re-run: sudo bash setup.sh"
  elif ! command -v systemctl >/dev/null 2>&1; then
    say "  Skipped: systemd not present (run_all.sh will fall back to tmux)."
  else
    if $ISUDO tee /etc/systemd/system/wsl-interop.service >/dev/null <<'UNIT'
[Unit]
Description=Register WSL Windows interop binfmt (systemd-binfmt is skipped on WSL)
After=systemd-binfmt.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh -c 'test -e /proc/sys/fs/binfmt_misc/WSLInterop || echo ":WSLInterop:M::MZ::/init:PF" > /proc/sys/fs/binfmt_misc/register'

[Install]
WantedBy=multi-user.target
UNIT
    then
      $ISUDO systemctl daemon-reload 2>/dev/null || true
      $ISUDO systemctl enable --now wsl-interop.service 2>/dev/null || true
      if [[ -e /proc/sys/fs/binfmt_misc/WSLInterop ]]; then
        say "  Windows-interop active — wt.exe works and run_all.sh can open Terminal windows."
      else
        say "  Installed wsl-interop.service; it registers interop after 'wsl --shutdown' + reopen."
      fi
    else
      say "  Could not write the interop unit (permission?) — skipping; run_all.sh will fall back to tmux."
    fi
  fi
fi

say "Setup complete."
echo "    Next:  bash run_all.sh        (Linux / WSL)"
echo "       or  .\\run_all.ps1         (Windows PowerShell)"
