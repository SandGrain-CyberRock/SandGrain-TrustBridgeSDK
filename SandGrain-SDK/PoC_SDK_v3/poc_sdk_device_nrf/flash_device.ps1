<#
.SYNOPSIS
  Portable build + flash for the SandGrain nRF device SDK (nRF Connect SDK / west).

.DESCRIPTION
  Runs on any machine with NCS installed via the nRF Connect Toolchain Manager -
  no hardcoded toolchain hash, drive letters, or COM ports. It:
    1. Finds the NCS root (env NCS_ROOT, common install locations, or -NcsRoot).
    2. Reads <root>/toolchains/toolchains.json to resolve the toolchain that
       matches the requested NCS version (the "936afb6332"-style hash differs on
       every machine, so we look it up instead of hardcoding it).
    3. Sets up the Zephyr/west environment from that toolchain.
    4. west build (pristine) for the given board.
    5. Flashes with nrfutil (auto-found on PATH or in ~/.nordic/bin) and resets.
    6. Optionally opens a serial monitor on the auto-detected J-Link CDC port.

.EXAMPLE
  .\flash_device.ps1
      Build + flash this app to nrf54l15dk with all defaults.

.EXAMPLE
  .\flash_device.ps1 -Monitor
      Build + flash, then open a serial monitor on the detected COM port.

.EXAMPLE
  $env:NCS_ROOT="C:\ncs"; .\flash_device.ps1 -NcsVersion v2.9.0 -NoFlash
      Build only, against a different NCS root/version.
#>
[CmdletBinding()]
param(
    [string]$NcsRoot    = $env:NCS_ROOT,
    [string]$NcsVersion = $(if ($env:NCS_VERSION) { $env:NCS_VERSION } else { 'v3.3.0' }),
    [string]$Board      = 'nrf54l15dk/nrf54l15/cpuapp',
    [string]$AppDir     = $PSScriptRoot,
    [string]$BuildDir,                       # default: <AppDir>\build
    [string]$Port,                           # serial port for -Monitor (auto if omitted)
    [string]$Snr,                            # J-Link serial number (if >1 board attached)
    [switch]$NoFlash,                        # build only
    [switch]$Monitor,                        # open serial monitor after flashing
    [int]$Baud          = 115200
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
    Die "Could not find the NCS root. Set `$env:NCS_ROOT or pass -NcsRoot <path> (the folder containing 'toolchains' and '$NcsVersion')."
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
    Die "The app/build path contains a SPACE ('$AppDir') - Zephyr can't build from it. Move the repo to a space-free path (e.g. C:\NordicBLE\...) and re-run."
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

# ---------------------------------------------------------------------------
# 5. Flash
# ---------------------------------------------------------------------------
if ($NoFlash) { Info "Build-only (-NoFlash); skipping flash."; exit 0 }

$nrfutil = Find-Nrfutil
if (-not $nrfutil) { Die "nrfutil with the 'device' command not found (PATH or ~\.nordic\bin\nrfutil.exe)." }

# Where the image lands depends on the NCS version. Pre-sysbuild builds put
# zephyr.hex at the top; sysbuild emits merged.hex there, but only when there
# is more than one image to merge - a single-image build instead leaves the app
# at <build>\<app-name>\zephyr\zephyr.hex. Check the known spots in order of
# preference (merged first: it is the one that includes any bootloader).
$appName = Split-Path $AppDir -Leaf
$fw = @(
    (Join-Path $BuildDir 'merged.hex'),
    (Join-Path $BuildDir "$appName\zephyr\merged.hex"),
    (Join-Path $BuildDir 'zephyr\zephyr.hex'),
    (Join-Path $BuildDir "$appName\zephyr\zephyr.hex")
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $fw) {
    # Unknown layout. Search, but say what was found and what was picked rather
    # than silently flashing a bootloader or a companion-core image.
    $found = @(Get-ChildItem -Path $BuildDir -Recurse -File -ErrorAction SilentlyContinue |
               Where-Object { $_.Name -in @('merged.hex', 'zephyr.hex') } |
               Sort-Object @{ E = { $_.Name -ne 'merged.hex' } },
                           @{ E = { ($_.FullName -split '\\').Count } })
    if ($found) {
        Warn "Image not in a known location for this NCS version."
        foreach ($f in $found) { Warn "  candidate: $($f.FullName)" }
        Warn "Using the first one. Override the build layout with -BuildDir if that is wrong."
        $fw = $found[0].FullName
    }
}
if (-not $fw) { Die "No firmware image found under $BuildDir (merged.hex / zephyr.hex)." }
Info "Flashing:    $fw"

$snrArgs = @()
if ($Snr) { $snrArgs = @('--serial-number', $Snr) }

& $nrfutil device program --firmware $fw --options chip_erase_mode=ERASE_ALL @snrArgs
if ($LASTEXITCODE -ne 0) { Die "nrfutil program failed ($LASTEXITCODE). If >1 board is attached, pass -Snr <serial>." }
& $nrfutil device reset @snrArgs | Out-Null
Info "Flashed + reset."

# ---------------------------------------------------------------------------
# 6. Serial monitor (optional)
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
