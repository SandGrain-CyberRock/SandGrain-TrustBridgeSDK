#!/bin/bash

# ==========================================
#  PoC_SGR - Debug Setup & Wrapper
# ==========================================

# If running with gdb arguments, act as a wrapper
if [[ "$1" == "--interpreter"* ]] || [[ "$1" == "--tty"* ]] || [[ $# -gt 0 && "$1" != "--setup" ]]; then
    # Wrapper mode: run gdb with sudo
    sudo /usr/bin/gdb "$@"
    exit $?
fi

# Setup mode (executed manually by the user)
echo "=========================================="
echo "  PoC_SGR - Debug Setup (Linux only)"
echo "=========================================="
echo ""

if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    echo "This script is only needed on Linux."
    echo "Windows users can debug directly with F5."
    exit 0
fi

CURRENT_USER=$(whoami)

echo "Configuring passwordless sudo for GDB..."
echo "This requires your password:"
echo ""

sudo bash -c "echo '$CURRENT_USER ALL=(ALL) NOPASSWD: /usr/bin/gdb' > /etc/sudoers.d/gdb-debug"
sudo chmod 0440 /etc/sudoers.d/gdb-debug

echo ""
echo "✓ Setup complete!"
echo "You can now debug with F5 in VSCode."
echo "=========================================="