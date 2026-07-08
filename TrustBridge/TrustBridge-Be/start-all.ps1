# =============================================================================
# start-all.ps1 - Bring up the full TrustBridge Docker stack on Windows.
#
# Windows / PowerShell port of TrustBridge-Docker/start-all.sh.
# Brings up: BE (+ MySQL + Mosquitto), FE, Cloud SDK - each via its own
# docker-compose.yml inside its respective repo, joined by a shared external
# Docker network `trustbridge-net`.
#
# The device-side SDK + Gateway run natively via:
#     cd .\sandgrain-sdk ; .\start-device.ps1
#
# Layout assumed: this script lives INSIDE one of the repos (e.g. TrustBridge-BE\
# or TrustBridge-Docker\), and the three repos are siblings of that folder:
#     ..\TrustBridge-BE
#     ..\TrustBridge-FE
#     ..\sandgrain-sdk           (its PoC_SDK_v3\sdk_cloud subdir holds the
#                                 cloud-sdk compose; formerly trustbridge-sdk-v3,
#                                 and the cloud formerly lived in Cloud\)
#
# Override with:
#   $env:BE_REPO  = 'C:\path\to\TrustBridge-BE'
#   $env:FE_REPO  = 'C:\path\to\TrustBridge-FE'
#   $env:SDK_REPO = 'C:\path\to\sandgrain-sdk'
#
# Usage:
#   .\start-all.ps1             # incremental build + start all  (default)
#   .\start-all.ps1 down        # stop all (keeps volumes)
#   .\start-all.ps1 wipe        # stop all + DELETE volumes (re-seed on next up)
#   .\start-all.ps1 rebuild     # FORCE --no-cache rebuild + start all (use when
#                               # an image is stuck on old source - e.g. cloud-sdk
#                               # has the paho `_on_disconnect` bug because Docker
#                               # is reusing a cached layer from before the fix)
#   .\start-all.ps1 logs <svc>  # tail logs (svc = be|fe|cloud-sdk|mysql|mosquitto)
#   .\start-all.ps1 status      # docker compose ps for each stack
# =============================================================================

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('up', 'down', 'wipe', 'rebuild', 'logs', 'status', 'ps')]
    [string]$Command = 'up',

    [Parameter(Position = 1)]
    [string]$Service
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent $ScriptDir
$BeRepo    = if ($env:BE_REPO)  { $env:BE_REPO }  else { Join-Path $RootDir 'TrustBridge-BE' }
$FeRepo    = if ($env:FE_REPO)  { $env:FE_REPO }  else { Join-Path $RootDir 'TrustBridge-FE' }
$SdkRepo   = if ($env:SDK_REPO) {
    $env:SDK_REPO
} else {
    # Locate the SDK repo across layouts, newest first:
    #   <root>\..\SDK            SDK-Versioning migration: SDK is a top-level repo,
    #                            sibling of TrustBridge\ (which holds BE/FE).
    #   <root>\sandgrain-sdk     flat clone, repo renamed trustbridge-sdk-v3 -> sandgrain-sdk.
    #   <root>\trustbridge-sdk-v3  legacy name, kept so existing clones still work.
    $versioned = Join-Path (Split-Path -Parent $RootDir) 'SDK'
    $sandgrain = Join-Path $RootDir 'sandgrain-sdk'
    $legacy    = Join-Path $RootDir 'trustbridge-sdk-v3'
    if     (Test-Path $versioned) { $versioned }
    elseif (Test-Path $sandgrain) { $sandgrain }
    else                          { $legacy }
}
$CloudDir  = Join-Path (Join-Path $SdkRepo 'PoC_SDK_v3') 'sdk_cloud'

$NetworkName = 'trustbridge-net'

# The integrated Docker stack ALWAYS runs the cloud in TrustBridge mode: device,
# tenant and CF credentials are resolved live from the BE database. These are
# read by sdk_cloud\docker-compose.yml via ${CREDENTIALS_SOURCE}/${BE_URL} and
# override whatever is in the cloud .env - so a fresh clone (whose .env is seeded
# from .env.example = standalone) still runs TrustBridge mode here. Standalone
# runs the cloud NATIVELY (run_standalone.*), not via this script.
$env:CREDENTIALS_SOURCE = 'trustbridge'
$env:BE_URL = 'http://be:3000/api'

function Log { param($m) Write-Host "[start-all] $m" -ForegroundColor Cyan }
function Err { param($m) Write-Host "[start-all] $m" -ForegroundColor Red }

function Get-LanIp {
    # Return the laptop's primary LAN IPv4, skipping loopback / link-local /
    # virtual adapters (WSL, Docker, Hyper-V, Tailscale, etc.). Returns $null
    # if nothing usable is found.
    try {
        # @(...) forces array even when only one item matches.
        $candidates = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -notmatch '^127\.' -and
                $_.IPAddress -notmatch '^169\.254\.' -and
                $_.InterfaceAlias -notmatch 'Loopback|WSL|Docker|vEthernet|Tailscale|Bluetooth'
            } |
            Sort-Object -Property InterfaceMetric)
        if ($candidates.Count -gt 0) {
            return $candidates[0].IPAddress
        }
    } catch { }
    return $null
}

function Require-Dir {
    param([string]$Dir)
    if (-not (Test-Path (Join-Path $Dir 'docker-compose.yml'))) {
        Err "Missing docker-compose.yml in: $Dir"
        Err "Set the corresponding env var (BE_REPO / FE_REPO / SDK_REPO) and retry."
        exit 1
    }
}

function Require-Env {
    param([string]$Dir)
    $env_  = Join-Path $Dir '.env'
    $sample = Join-Path $Dir '.env.example'
    if (-not (Test-Path $env_)) {
        if (Test-Path $sample) {
            Log "No .env in $Dir - copying from .env.example"
            Copy-Item $sample $env_
        } else {
            Err "No .env or .env.example in $Dir"
            exit 1
        }
    }
}

function Require-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Err "docker CLI not found on PATH. Install Docker Desktop and re-run."
        exit 1
    }
    # Quick ping - will fail if Docker Desktop engine isn't running
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & docker info *>$null 2>$null } catch { }
    $ok = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = $prev
    if (-not $ok) {
        Err "Docker engine isn't responding. Start Docker Desktop and wait for it to finish initializing, then re-run."
        exit 1
    }
}

function Ensure-Network {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & docker network inspect $NetworkName *>$null 2>$null
    } catch { }
    $exists = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = $prev
    if (-not $exists) {
        Log "Creating Docker network: $NetworkName"
        & docker network create $NetworkName | Out-Null
    }
}

function Stop-NativeBroker {
    # A native mosquitto (left over from a standalone run) squats host port 1883
    # and fights the Docker broker (tb-mosquitto). Stop it so Docker owns 1883
    # cleanly. (TrustBridge and standalone are mutually exclusive on 1883.) On
    # Windows the standalone broker can be either a native Windows mosquitto OR a
    # mosquitto inside WSL - clear both.
    $mq = Get-Process mosquitto -ErrorAction SilentlyContinue
    if ($mq) {
        Log "Stopping a native Windows mosquitto (standalone leftover) so Docker can use port 1883"
        $mq | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    # Best-effort: stop a mosquitto running inside WSL (the standalone broker on
    # Windows). Harmless/no-op if WSL is absent or nothing is running there.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & wsl.exe -e pkill -x mosquitto *>$null 2>$null
    $ErrorActionPreference = $prev
    if ($mq) { Start-Sleep -Seconds 1 }
}

function Ensure-CredsFile {
    # The cloud compose bind-mounts device_credentials.json. If it doesn't exist
    # when Docker starts, Docker creates it as an empty DIRECTORY, which breaks
    # the cloud and run_all's writes. Ensure it's a real file first.
    $f = Join-Path (Join-Path $CloudDir 'application_PoC_MQTT') 'device_credentials.json'
    if (Test-Path $f -PathType Container) {
        Log "device_credentials.json is a directory (Docker bind-mount artifact) - recreating as a file"
        Remove-Item -Recurse -Force $f
    }
    if (-not (Test-Path $f)) {
        $json = "{`r`n  ""devices"": {}`r`n}`r`n"
        [System.IO.File]::WriteAllText($f, $json)
        Log "Seeded an empty device_credentials.json (so Docker mounts a file, not a directory)"
    }
}

function Clear-ConflictingContainers {
    # The cloud/emqx container names are hardcoded in compose. A leftover with one
    # of those names (old Cloud path, a previous project, or a standalone-docker
    # run) blocks 'up' with a name conflict. Remove sandgrain-cloud-app only if it
    # is from a DIFFERENT compose project; always remove emqx-enterprise (the
    # integrated stack uses Docker mosquitto, not EMQX, and it would squat 1883).
    $want = (Split-Path -Leaf $CloudDir).ToLower()
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'

    & docker container inspect sandgrain-cloud-app *>$null 2>$null
    if ($LASTEXITCODE -eq 0) {
        $proj = (& docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' sandgrain-cloud-app 2>$null)
        if ("$proj".Trim() -ne $want) {
            Log "Removing conflicting cloud container 'sandgrain-cloud-app' (project='$proj', need '$want')"
            & docker rm -f sandgrain-cloud-app *>$null 2>$null
        }
    }

    & docker container inspect emqx-enterprise *>$null 2>$null
    if ($LASTEXITCODE -eq 0) {
        Log "Removing leftover 'emqx-enterprise' (integrated stack uses mosquitto, not EMQX)"
        & docker rm -f emqx-enterprise *>$null 2>$null
    }

    $ErrorActionPreference = $prev
}

function Compose {
    # $Dir = repo dir, $ComposeArgs = compose args (avoid reserved $Args)
    param([string]$Dir, [string[]]$ComposeArgs)
    Push-Location $Dir
    # docker compose writes progress to stderr; in PS 5.1 with EAP=Stop those
    # become NativeCommandError and terminate the script. Suppress locally.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & docker compose @ComposeArgs
    } finally {
        $ErrorActionPreference = $prev
        Pop-Location
    }
}

# =============================================================================
# Pre-flight
# =============================================================================
Require-Docker
Require-Dir $BeRepo
Require-Dir $FeRepo
Require-Dir $CloudDir

# =============================================================================
# Commands
# =============================================================================
switch ($Command) {

    'up' {
        Require-Env $BeRepo
        Require-Env $FeRepo
        Require-Env $CloudDir
        # docker-compose.yml in Cloud/ has `env_file: ./application_PoC_MQTT/.env`,
        # so the real cloud-agent .env lives one level deeper than $CloudDir.
        # Without this check the compose up fails with "env file ... not found:
        # The system cannot find the file specified." Matches what start-all.sh
        # does on Linux/macOS (`require_env "$CLOUD_DIR/application_PoC_MQTT"`).
        Require-Env (Join-Path $CloudDir 'application_PoC_MQTT')
        Stop-NativeBroker
        Ensure-CredsFile
        Clear-ConflictingContainers
        Ensure-Network

        Log "Starting BE stack (mysql + mosquitto + be) - $BeRepo"
        Compose $BeRepo @('up', '-d', '--build')

        Log "Starting FE - $FeRepo"
        Compose $FeRepo @('up', '-d', '--build')

        Log "Starting Cloud SDK - $CloudDir"
        Compose $CloudDir @('up', '-d', '--build')

        Write-Host ""
        Log "All services started."
        Log ""
        Log "Local (this laptop only):"
        Log "  FE      -> http://localhost:5173"
        Log "  BE      -> http://localhost:3000/docs"
        Log "  MySQL   -> localhost:3306"
        Log "  MQTT    -> localhost:1883"

        $lanIp = Get-LanIp
        $hostName = try { (hostname).Trim() } catch { $env:COMPUTERNAME }

        if ($lanIp) {
            Log ""
            Log "LAN (other devices on the same Wi-Fi/Ethernet, e.g. Raspberry Pis):"
            Log "  FE        -> http://${lanIp}:5173    or  http://${hostName}.local:5173"
            Log "  BE        -> http://${lanIp}:3000    or  http://${hostName}.local:3000"
            Log "  MQTT      -> ${lanIp}:1883          or  ${hostName}.local:1883"
            Log "  Discovery -> http://${lanIp}:3000/api/discover"
            Log ""
            Log "Raspberry Pi setup -- on each Pi run ./bootstrap-pi.sh and answer:"
            Log "  hostname mode (recommended): Laptop hostname [${hostName}.local]"
            Log "  IP mode:                     Laptop IP       [$lanIp]"
        } else {
            Log ""
            Log "(could not auto-detect LAN IP -- for Pi setup, run ipconfig to find the laptop Wi-Fi/Ethernet IPv4)"
            Log "(this laptop's hostname for hostname mode: ${hostName}.local)"
        }

        Log ""
        Log "Tail logs:  .\start-all.ps1 logs [be|fe|cloud-sdk|mysql|mosquitto]"
        Log "Run SDK locally: cd `"$SdkRepo`"; .\start-local.ps1   (single-machine mode)"
        Log "                  ...or use .\bootstrap-pi.sh on each Pi (distributed mode)"
    }

    'rebuild' {
        # Force a from-scratch rebuild of every image, then bring everything up.
        # The default `up` command runs `compose up -d --build` which is
        # INCREMENTAL: if Docker doesn't see source-file changes (or someone
        # ran it without pulling latest), the cached image layer is reused
        # and stale code keeps running. Symptom we've hit: cloud-sdk container
        # is "Up" but logs are days old + auth flow stalls at gateway step 2/6
        # because the image was built before the paho `_on_disconnect` fix.
        # `rebuild` forces --no-cache so the next `up` definitely picks up
        # whatever's on disk RIGHT NOW.
        Require-Env $BeRepo
        Require-Env $FeRepo
        Require-Env $CloudDir
        Require-Env (Join-Path $CloudDir 'application_PoC_MQTT')   # see comment in 'up' block
        Stop-NativeBroker
        Ensure-CredsFile
        Clear-ConflictingContainers
        Ensure-Network

        Log "Stopping all containers first (so rebuilt images get used)..."
        Compose $CloudDir @('down')
        Compose $FeRepo   @('down')
        Compose $BeRepo   @('down')

        Log "Forcing --no-cache rebuild of BE stack - $BeRepo"
        Compose $BeRepo   @('build', '--no-cache')
        Log "Forcing --no-cache rebuild of FE - $FeRepo"
        Compose $FeRepo   @('build', '--no-cache')
        Log "Forcing --no-cache rebuild of Cloud SDK - $CloudDir"
        Compose $CloudDir @('build', '--no-cache')

        Log "Starting BE stack"
        Compose $BeRepo   @('up', '-d')
        Log "Starting FE"
        Compose $FeRepo   @('up', '-d')
        Log "Starting Cloud SDK"
        Compose $CloudDir @('up', '-d')

        Write-Host ""
        Log "All services rebuilt + started."
        Log "Verify cloud-sdk picked up latest source:"
        Log "  docker logs --tail 5 tb-cloud-sdk     (timestamps should be NOW, not days/weeks ago)"
    }

    'down' {
        Log "Stopping Cloud SDK"; Compose $CloudDir @('down')
        Log "Stopping FE";        Compose $FeRepo   @('down')
        Log "Stopping BE stack";  Compose $BeRepo   @('down')
    }

    'wipe' {
        Log "Stopping + WIPING volumes (DB, MQTT, seed marker)"
        Compose $CloudDir @('down', '-v')
        Compose $FeRepo   @('down', '-v')
        Compose $BeRepo   @('down', '-v')
    }

    'logs' {
        if (-not $Service) {
            Err "Usage: .\start-all.ps1 logs <service>"
            Err "Services: be | fe | cloud-sdk | mysql | mosquitto"
            exit 1
        }
        switch ($Service) {
            { $_ -in 'be', 'mysql', 'mosquitto' } { Compose $BeRepo   @('logs', '-f', $Service) }
            'fe'                                  { Compose $FeRepo   @('logs', '-f', $Service) }
            'cloud-sdk'                           { Compose $CloudDir @('logs', '-f', $Service) }
            default { Err "Unknown service: $Service"; exit 1 }
        }
    }

    { $_ -in 'status', 'ps' } {
        Compose $BeRepo   @('ps')
        Compose $FeRepo   @('ps')
        Compose $CloudDir @('ps')
    }
}
