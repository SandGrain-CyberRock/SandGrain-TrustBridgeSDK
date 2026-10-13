# run_device.ps1 - Windows launcher for the SandGrain DEVICE (test_device).
#
# This is a thin wrapper: all the real work (prompts, .env.device, build, and
# running the device) happens inside WSL via run_device.sh, because the firmware
# is a Linux build.
#
# The device has the SandGrain USB crypto chip and dials the GATEWAY over TCP.
# WSL2 only sees the chip after a usbipd attach, so - like run_all.ps1 /
# run_standalone.ps1 - this forwards it in first.
#
#     this device (WSL) --TCP :GW_PORT--> gateway
#
# Usage (from a PowerShell prompt, so you can see/answer the prompts):
#     .\run_device.ps1                  # build + run (BE-driven --listen + menu)
#     .\run_device.ps1 --menu           # interactive menu only (no BE listener)
#     .\run_device.ps1 --no-build       # skip `make`, use the existing binary
#     .\run_device.ps1 --usb 0          # serial suffix (/dev/ttyACM0); skips auto-detect
#     .\run_device.ps1 --spi            # crypto chip on SPI (/dev/spidev0.0); Raspberry Pi only
#
# Any args are forwarded as-is into WSL (run_device.sh) via @args. NOTE: --spi
# needs a real SPI header (a Raspberry Pi); it won't work from Windows/WSL, which
# has no /dev/spidev — use run_device.sh --spi on the Pi itself.
#
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Running SandGrain DEVICE launcher in WSL (dir: $scriptDir)" -ForegroundColor Cyan

# Forward the crypto-chip USB device into WSL (Windows-only; no-op elsewhere).
# The device firmware runs in WSL and needs /dev/ttyACM0, which WSL2 only sees
# after a usbipd attach. Prompts for the BUSID (saved as default) and attaches.
. (Join-Path $scriptDir 'usb-attach.ps1')
Invoke-AttachCryptoChip

# Use WSL's --cd to set the working directory. This handles the spaces in the
# path itself, so the command we pass is just the plain, space-free script
# name -- no embedded quotes for PowerShell 5.1 to mangle. Any extra args
# (--menu, --no-build, --usb N) are forwarded as-is via splatting.
& wsl.exe --cd "$scriptDir" -e bash run_device.sh @args

if ($LASTEXITCODE -ne 0) {
    Write-Error "run_device.sh exited with code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "Device launcher finished - the device is running in this window." -ForegroundColor Green
