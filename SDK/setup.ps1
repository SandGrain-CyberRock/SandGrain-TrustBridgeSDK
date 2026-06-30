# setup.ps1 - Windows launcher for setup.sh (runs the one-time setup in WSL).
#
# Usage (from a PowerShell prompt, so you can answer the sudo password prompt):
#     .\setup.ps1            # full setup (system packages + venv + pip deps)
#     .\setup.ps1 --no-apt   # skip system packages; just (re)create venv + pip deps
#
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Running SandGrain setup in WSL (dir: $scriptDir)" -ForegroundColor Cyan

# WSL's --cd handles the spaces in the path; the script name is space-free, so
# there are no embedded quotes for PowerShell 5.1 to mangle. Args are forwarded.
& wsl.exe --cd "$scriptDir" -e bash setup.sh @args

if ($LASTEXITCODE -ne 0) {
    Write-Error "setup.sh exited with code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "Setup complete. Next: .\run_all.ps1" -ForegroundColor Green
