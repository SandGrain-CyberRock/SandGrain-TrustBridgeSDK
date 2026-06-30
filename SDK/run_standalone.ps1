# run_standalone.ps1 - Windows launcher for the SandGrain stack, STANDALONE
# (no TrustBridge BE dependency).
#
# This is a thin wrapper: all the real work (prompts, .env, venv, build, static
# whitelist, and opening the three terminals) happens inside WSL via
# run_standalone.sh, because the Python venv and the firmware are Linux builds.
#
# Unlike run_all.ps1, this never sets BE_URL, so:
#   * the cloud uses device_credentials.json (JsonFileCredentialsStore), and
#   * the gateway uses the static trustbridge_whitelist.txt (no BE sync).
#
# Usage (from a PowerShell prompt, so you can see/answer the prompts):
#     .\run_standalone.ps1                 # build + run everything
#     .\run_standalone.ps1 --no-build      # skip `make`, use existing binaries
#     .\run_standalone.ps1 --no-detect-tid # skip TID auto-detect / whitelist auto-add
#
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Running SandGrain STANDALONE launcher in WSL (dir: $scriptDir)" -ForegroundColor Cyan

# Forward the crypto-chip USB device into WSL (Windows-only). The device firmware
# runs in WSL and needs /dev/ttyACM0, which WSL2 only sees after a usbipd attach.
. (Join-Path $scriptDir 'usb-attach.ps1')
Invoke-AttachCryptoChip

# Use WSL's --cd to set the working directory. This handles the spaces in the
# path itself, so the command we pass is just the plain, space-free script
# name -- no embedded quotes for PowerShell 5.1 to mangle. Any extra args
# (--no-build, --no-detect-tid) are forwarded as-is via splatting.
& wsl.exe --cd "$scriptDir" -e bash run_standalone.sh @args

if ($LASTEXITCODE -ne 0) {
    Write-Error "run_standalone.sh exited with code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "Launcher finished - the three components are running in their own windows." -ForegroundColor Green
