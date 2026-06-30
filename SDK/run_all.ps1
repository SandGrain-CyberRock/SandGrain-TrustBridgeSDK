# run_all.ps1 - Windows launcher for the SandGrain stack.
#
# This is a thin wrapper: all the real work (prompts, .env, venv, build, and
# opening the three terminals) happens inside WSL via run_all.sh, because the
# Python venv and the firmware are Linux builds.
#
# Usage (from a PowerShell prompt, so you can see/answer the prompts):
#     .\run_all.ps1                 # build + run everything (local cloud = STANDALONE)
#     .\run_all.ps1 --no-cloud      # don't start a local cloud; gateway/device use
#                                   #   the TrustBridge cloud (BE-backed credentials)
#     .\run_all.ps1 --no-build      # skip `make`, use existing binaries
#     .\run_all.ps1 --reinstall     # force reinstall of Python deps
#
# Any args are forwarded as-is into WSL (run_all.sh) via @args.
#
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Running SandGrain launcher in WSL (dir: $scriptDir)" -ForegroundColor Cyan

# Forward the crypto-chip USB device into WSL (Windows-only; no-op elsewhere).
# The device firmware runs in WSL and needs /dev/ttyACM0, which WSL2 only sees
# after a usbipd attach. Prompts for the BUSID (saved as default) and attaches.
. (Join-Path $scriptDir 'usb-attach.ps1')
Invoke-AttachCryptoChip

# Use WSL's --cd to set the working directory. This handles the spaces in the
# path itself, so the command we pass is just the plain, space-free script
# name -- no embedded quotes for PowerShell 5.1 to mangle. Any extra args
# (--no-build, --reinstall) are forwarded as-is via splatting.
& wsl.exe --cd "$scriptDir" -e bash run_all.sh @args

if ($LASTEXITCODE -ne 0) {
    Write-Error "run_all.sh exited with code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "Launcher finished - the three components are running in their own windows." -ForegroundColor Green
