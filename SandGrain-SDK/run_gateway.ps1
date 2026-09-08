# run_gateway.ps1 - Windows launcher for the SandGrain GATEWAY (test_gw).
#
# This is a thin wrapper: all the real work (prompts, .env.gateway, build, and
# running the gateway) happens inside WSL via run_gateway.sh, because the
# firmware is a Linux build.
#
# Unlike run_device.ps1, this does NOT forward a USB device into WSL: the
# gateway has no crypto chip of its own (GW_CRYPTO_ENABLED=0) - it only relays
# the device's auth to TrustBridge over MQTT.
#
#     device --TCP :GW_BIND_PORT--> gateway (WSL) --MQTT--> TrustBridge broker
#
# Usage (from a PowerShell prompt, so you can see/answer the prompts):
#     .\run_gateway.ps1                 # build + run the gateway
#     .\run_gateway.ps1 --no-build      # skip `make`, use the existing binary
#     .\run_gateway.ps1 --debug         # traceability DEBUG (masked request_data)
#
# Any args are forwarded as-is into WSL (run_gateway.sh) via @args.
#
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Running SandGrain GATEWAY launcher in WSL (dir: $scriptDir)" -ForegroundColor Cyan

# Use WSL's --cd to set the working directory. This handles the spaces in the
# path itself, so the command we pass is just the plain, space-free script
# name -- no embedded quotes for PowerShell 5.1 to mangle. Any extra args
# (--no-build, --debug) are forwarded as-is via splatting.
& wsl.exe --cd "$scriptDir" -e bash run_gateway.sh @args

if ($LASTEXITCODE -ne 0) {
    Write-Error "run_gateway.sh exited with code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "Gateway launcher finished." -ForegroundColor Green
