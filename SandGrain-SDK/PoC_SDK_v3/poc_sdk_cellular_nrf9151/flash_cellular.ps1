<#
.SYNOPSIS
  Portable build + flash for the SandGrain cellular nRF9151 combined
  device+gateway app (nRF Connect SDK / west).

.DESCRIPTION
  Runs on any machine with NCS installed via the nRF Connect Toolchain
  Manager - no hardcoded toolchain hash, drive letters, or COM ports.
  Same workflow as poc_sdk_device_nrf/flash_device.ps1:
    1. Finds the NCS root (env NCS_ROOT, common install locations, or -NcsRoot).
    2. Reads <root>/toolchains/toolchains.json to resolve the toolchain that
       matches the requested NCS version (the "936afb6332"-style hash differs on
       every machine, so we look it up instead of hardcoding it).
    3. Sets up the Zephyr/west environment from that toolchain.
    4. west build (pristine) for nrf9151dk/nrf9151/ns.
    5. Flashes with nrfutil (auto-found on PATH or in ~/.nordic/bin) and resets.
    6. Optionally opens a serial monitor on the auto-detected J-Link CDC port.

  If the board sits on a DIFFERENT machine than the toolchain: -Zip packages
  out\poc_sdk_cellular_nrf9151.zip (sources + merged.hex + this script); on
  the board machine, extract it and run:
      .\flash_cellular.ps1 -PrebuiltHex .\merged.hex
  which skips the toolchain/build entirely and only needs nrfutil.

  Linux/macOS twin: flash_cellular.sh, same behaviour with dashed flags
  (--prebuilt-hex, --zip, --monitor, --snr, --build-dir).

.EXAMPLE
  .\flash_cellular.ps1
      Build + flash to a locally attached nRF9151-DK with all defaults.

.EXAMPLE
  .\flash_cellular.ps1 -Monitor
      Build + flash, then open a serial monitor on the detected COM port.

.EXAMPLE
  .\flash_cellular.ps1 -NoFlash -Zip
      Build only and package the zip for a board on another machine.

.EXAMPLE
  .\flash_cellular.ps1 -PrebuiltHex .\merged.hex
      Flash a prebuilt image (no toolchain needed - board machine side).
#>
[CmdletBinding()]
param(
    [string]$NcsRoot     = $env:NCS_ROOT,
    [string]$NcsVersion  = $(if ($env:NCS_VERSION) { $env:NCS_VERSION } else { 'v3.3.0' }),
    [string]$Board       = 'nrf9151dk/nrf9151/ns',
    [string]$AppDir      = $PSScriptRoot,
    [string]$BuildDir,                       # default: <AppDir>\build
    [string]$PrebuiltHex,                    # flash this hex, skip the build (no toolchain needed)
    [string]$Port,                           # serial port for -Monitor (auto if omitted)
    [string]$Snr,                            # J-Link serial number (if >1 board attached)
    [switch]$NoFlash,                        # build only
    [switch]$Zip,                            # package out\poc_sdk_cellular_nrf9151.zip after building
    [switch]$Monitor,                        # open serial monitor after flashing
    [int]$Baud           = 115200
)

$ErrorActionPreference = 'Stop'
function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "!!  $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "ERR $m" -ForegroundColor Red; exit 1 }

function Test-NrfutilDevice([string]$exe) {
    # True when this nrfutil has the 'device' command (it is a plugin, so a
    # given install - e.g. the toolchain-bundled one - may lack it).
    if (-not $exe) { return $false }
    try { & $exe device --version *> $null } catch { }
    return ($LASTEXITCODE -eq 0)
}

function Find-Nrfutil {
    # Every nrfutil on PATH (toolchain's first), plus the standalone location.
    $cands = @(Get-Command nrfutil.exe -All -ErrorAction SilentlyContinue |
               Select-Object -ExpandProperty Source)
    $cands += "$env:USERPROFILE\.nordic\bin\nrfutil.exe"
    $cands = $cands | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

    foreach ($c in $cands) {
        if (Test-NrfutilDevice $c) { return $c }
    }
    # None has the 'device' plugin - install it into the first one (one-time).
    foreach ($c in $cands) {
        Info "nrfutil found but without the 'device' command - installing it (one-time)..."
        & $c install device
        if (Test-NrfutilDevice $c) { return $c }
    }
    return $null
}

function Flash-Hex([string]$fw) {
    $nrfutil = Find-Nrfutil
    if (-not $nrfutil) { Die "nrfutil not found (PATH or ~\.nordic\bin\nrfutil.exe). Install nRF Util and 'nrfutil install device'." }

    try { $list = & $nrfutil device list 2>$null | Out-String } catch { $list = '' }
    if ($LASTEXITCODE -ne 0 -or $list -notmatch '\S') {
        Die "nrfutil sees no devices. Check: (1) board power switch ON, (2) USB cable in the DEBUG port (nearest the power switch), (3) J-Link visible in Device Manager, (4) close nRF Connect Programmer."
    }

    Info "Flashing:    $fw"
    $snrArgs = @()
    if ($Snr) { $snrArgs = @('--serial-number', $Snr) }
    & $nrfutil device program --firmware $fw --options chip_erase_mode=ERASE_ALL @snrArgs
    if ($LASTEXITCODE -ne 0) { Die "nrfutil program failed ($LASTEXITCODE). If >1 board is attached, pass -Snr <serial>." }
    & $nrfutil device reset @snrArgs | Out-Null
    Info "Flashed + reset."
}

# ---------------------------------------------------------------------------
# Prebuilt-hex mode: flash only, no toolchain needed (board-machine side)
# ---------------------------------------------------------------------------
if ($PrebuiltHex) {
    if (-not (Test-Path $PrebuiltHex)) { Die "Firmware not found: $PrebuiltHex" }
    Flash-Hex (Resolve-Path $PrebuiltHex).Path
    Info "Open a serial monitor (e.g. PuTTY) on the J-Link CDC COM port at $Baud."
    exit 0
}

# ---------------------------------------------------------------------------
# 1. Locate the NCS root (contains toolchains\toolchains.json and <version>\.west)
# ---------------------------------------------------------------------------
if (-not $NcsRoot) {
    $candidates = @(
        'D:\SDK\Nordic\Nordic\ncs',
        (Join-Path $env:USERPROFILE 'ncs'),
        'C:\ncs',
        (Join-Path ${env:ProgramFiles} 'Nordic Semiconductor\nRF Connect SDK\ncs')
    ) | Where-Object { $_ }
    foreach ($c in $candidates) {
        # String concat, NOT Join-Path: Join-Path THROWS on a nonexistent
        # drive letter (e.g. probing D:\... on a C:-only machine), while
        # Test-Path on a plain string just returns false.
        if (Test-Path "$c\toolchains\toolchains.json") { $NcsRoot = $c; break }
    }
}
if (-not $NcsRoot -or -not (Test-Path "$NcsRoot\toolchains\toolchains.json")) {
    Die "Could not find the NCS root. Set `$env:NCS_ROOT or pass -NcsRoot <path> (the folder containing 'toolchains' and '$NcsVersion'). To flash a prebuilt image without a toolchain, use -PrebuiltHex."
}
Info "NCS root:    $NcsRoot"

$workspace = Join-Path $NcsRoot $NcsVersion
if (-not (Test-Path (Join-Path $workspace '.west'))) {
    Die "No west workspace at '$workspace' (.west missing). Is NCS $NcsVersion installed? Try -NcsVersion."
}

# ---------------------------------------------------------------------------
# 2. Resolve the version-matched toolchain hash from toolchains.json
# ---------------------------------------------------------------------------
$tjPath = Join-Path $NcsRoot 'toolchains\toolchains.json'
$tj     = Get-Content $tjPath -Raw | ConvertFrom-Json
$match  = $tj.toolchains | Where-Object { $_.ncs_versions -contains $NcsVersion } | Select-Object -First 1
if (-not $match) {
    $have = ($tj.toolchains.ncs_versions | Sort-Object -Unique) -join ', '
    Die "No toolchain in toolchains.json is registered for '$NcsVersion'. Registered versions: $have"
}
$bundleId  = $match.identifier.bundle_id
$Toolchain = Join-Path $NcsRoot "toolchains\$bundleId"
if (-not (Test-Path $Toolchain)) { Die "Toolchain '$bundleId' listed but missing at $Toolchain" }
Info "Toolchain:   $bundleId  ($NcsVersion)"

# ---------------------------------------------------------------------------
# 3. Set up the Zephyr / west environment from the toolchain
# ---------------------------------------------------------------------------
$env:PATH = @(
    "$Toolchain\mingw64\bin",
    "$Toolchain\bin",
    "$Toolchain\opt\bin",
    "$Toolchain\opt\bin\Scripts",
    "$Toolchain\nrfutil\bin",
    "$Toolchain\opt\zephyr-sdk\arm-zephyr-eabi\bin",
    $env:PATH
) -join ';'
$env:ZEPHYR_TOOLCHAIN_VARIANT = 'zephyr'
$env:ZEPHYR_SDK_INSTALL_DIR   = "$Toolchain\opt\zephyr-sdk"
$env:WEST_PYTHON              = "$Toolchain\opt\bin\python.exe"
# Pin the toolchain's own Python environment. A machine-wide PYTHONPATH or
# PYTHONHOME from another Python install leaks into the bundled interpreter
# and crashes west at import time (ctypes: "class must define a '_type_'
# attribute"). Mirrors the toolchain's environment.json.
Remove-Item Env:PYTHONHOME -ErrorAction SilentlyContinue
$env:PYTHONPATH       = "$Toolchain\opt\bin;$Toolchain\opt\bin\Lib;$Toolchain\opt\bin\Lib\site-packages"
$env:PYTHONNOUSERSITE = '1'

$west = "$Toolchain\opt\bin\Scripts\west.exe"
if (-not (Test-Path $west)) { Die "west not found at $west" }

# ---------------------------------------------------------------------------
# 4. Build
# ---------------------------------------------------------------------------
if (-not $AppDir)   { $AppDir = $PSScriptRoot }
$AppDir = (Resolve-Path $AppDir).Path
if (-not $BuildDir) { $BuildDir = Join-Path $AppDir 'build' }
# Zephyr's Kconfig/CMake cannot handle spaces in the app or build path - it
# fails with a cryptic 'File not found: C:/<first-word>' during configure.
if ($AppDir -match ' ' -or $BuildDir -match ' ') {
    Die "The app/build path contains a SPACE ('$AppDir') - Zephyr can't build from it. Move the repo to a space-free path and re-run."
}
Info "App:         $AppDir"
Info "Board:       $Board"
Info "Build dir:   $BuildDir"

# We build pristine anyway (-p always), so wipe any existing build dir first.
# A stale CMake cache (e.g. after the repo was moved) makes sysbuild fail with
# 'APPLICATION_CONFIG_DIR ... doesn't exist' pointing at the old path.
if (Test-Path $BuildDir) {
    Info "Removing stale build dir"
    Remove-Item -Recurse -Force $BuildDir
}

Push-Location $workspace       # west resolves the workspace from CWD (.west)
try {
    & $west build -p always -b $Board -d $BuildDir $AppDir
    if ($LASTEXITCODE -ne 0) { Die "west build failed ($LASTEXITCODE)" }
} finally {
    Pop-Location
}
Info "Build OK"

$fw = Join-Path $BuildDir 'merged.hex'
if (-not (Test-Path $fw)) { Die "No merged.hex in $BuildDir - sysbuild output layout changed?" }

# ---------------------------------------------------------------------------
# 5. Optional: package a zip for a board on another machine (-Zip)
# ---------------------------------------------------------------------------
if ($Zip) {
    $zipPath = Join-Path $AppDir 'out\poc_sdk_cellular_nrf9151.zip'
    $outDir  = Split-Path $zipPath -Parent
    $staging = Join-Path $outDir 'stage\poc_sdk_cellular_nrf9151'

    if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
    New-Item -ItemType Directory -Force $staging | Out-Null
    foreach ($item in @('CMakeLists.txt', 'prj.conf', 'boards', 'dts', 'src',
                        'flash_cellular.ps1', 'flash_cellular.sh', 'README.md')) {
        $src = Join-Path $AppDir $item
        if (Test-Path $src) { Copy-Item -Recurse $src (Join-Path $staging $item) }
    }
    Copy-Item $fw (Join-Path $staging 'merged.hex')

    if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
    Compress-Archive -Path $staging -DestinationPath $zipPath
    Remove-Item -Recurse -Force (Join-Path $outDir 'stage')
    $mb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
    Info "Packaged:    $zipPath ($mb MB)"
    Info "On the board machine: extract, then .\flash_cellular.ps1 -PrebuiltHex .\merged.hex"
}

# ---------------------------------------------------------------------------
# 6. Flash
# ---------------------------------------------------------------------------
if ($NoFlash) { Info "Build-only (-NoFlash); skipping flash."; exit 0 }
Flash-Hex $fw

# ---------------------------------------------------------------------------
# 7. Serial monitor (optional)
# ---------------------------------------------------------------------------
if (-not $Monitor) {
    Info "Done. Open a serial monitor on the J-Link CDC port at $Baud to interact."
    exit 0
}

if (-not $Port) {
    $ports = @(Get-CimInstance Win32_SerialPort |
               Where-Object { $_.Description -match 'JLink|J-Link' } |
               Select-Object -ExpandProperty DeviceID)
    if     ($ports.Count -eq 0) { Die "No J-Link CDC serial port found. Pass -Port COMx." }
    elseif ($ports.Count -eq 1) { $Port = $ports[0] }
    else {
        Warn "Multiple J-Link ports: $($ports -join ', '). Using $($ports[0]); override with -Port."
        $Port = $ports[0]
    }
}
Info "Serial monitor on $Port @ $Baud (Ctrl-] or Ctrl-C to exit)"
& $env:WEST_PYTHON -m serial.tools.miniterm $Port $Baud
