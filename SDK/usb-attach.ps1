# usb-attach.ps1 - forward the SandGrain crypto-chip USB serial device into WSL
# via usbipd-win, so the device firmware (running inside WSL) can open
# /dev/ttyACM0. Dot-sourced by run_all.ps1 / run_standalone.ps1.
#
# Behaviour:
#   - Prompts for the chip's usbipd BUSID; the value is SAVED as the default
#     (in %USERPROFILE%\.sgr_chip_busid) and reused until you change it.
#   - Binds it once (auto; raises a single UAC admin prompt) and attaches it to
#     WSL each run.
#   - Best-effort: on any problem it warns and continues, so the launch is never
#     blocked (you can always attach manually).
#
# WSL2 does not expose USB devices by default, which is why this is needed on
# Windows; macOS/Linux see the chip natively and skip all of this.

function Invoke-AttachCryptoChip {
    if (-not (Get-Command usbipd -ErrorAction SilentlyContinue)) {
        Write-Host "[usb] usbipd-win is not installed. Install it once with:" -ForegroundColor Yellow
        Write-Host "[usb]   winget install --exact dorssel.usbipd-win" -ForegroundColor Yellow
        Write-Host "[usb] Skipping USB attach - the device may not find the chip in WSL." -ForegroundColor Yellow
        return
    }

    $cfg = Join-Path $env:USERPROFILE '.sgr_chip_busid'
    $saved = ''
    if (Test-Path $cfg) { $saved = (Get-Content $cfg -Raw -ErrorAction SilentlyContinue).Trim() }

    Write-Host ""
    Write-Host "[usb] Connected USB devices (find your SandGrain crypto chip and note its BUSID):" -ForegroundColor Cyan
    & usbipd list

    $hint = if ($saved) { " [$saved]" } else { " (e.g. COM7 or 1-5)" }
    $sel = Read-Host "[usb] Crypto-chip COM port or BUSID$hint"
    if (-not $sel) { $sel = $saved }
    if (-not $sel) {
        Write-Host "[usb] Nothing entered - skipping attach (you can set it next run)." -ForegroundColor Yellow
        return
    }
    Set-Content -Path $cfg -Value $sel    # save what you typed (COM port or BUSID) as default

    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'

    # Accept a COM port (e.g. COM7) and resolve it to its usbipd BUSID; a BUSID
    # (e.g. 1-5) is used as-is. usbipd needs the BUSID, but COM port is what shows
    # up in Windows / Device Manager, so we let you enter either.
    $busid = $sel
    if ($sel -match '^COM[0-9]+$') {
        $row = (& usbipd list | Select-String -SimpleMatch "($sel)" | Select-Object -First 1)
        if ($row) {
            $busid = (($row.ToString().Trim()) -split '\s+')[0]
            Write-Host "[usb] $sel -> BUSID $busid" -ForegroundColor DarkGray
        } else {
            Write-Host "[usb] Could not find '$sel' in 'usbipd list' (is the chip plugged in?)." -ForegroundColor Yellow
            $ErrorActionPreference = $prev
            return
        }
    }

    # Bind (requires admin) only if the device is not already shared/attached.
    $row = (& usbipd list | Select-String -SimpleMatch $busid | Select-Object -First 1)
    if (-not $row -or ($row -match 'Not shared')) {
        Write-Host "[usb] Binding $busid (one-time; a UAC admin prompt will appear)..." -ForegroundColor Cyan
        try {
            Start-Process usbipd -ArgumentList "bind --busid $busid" -Verb RunAs -Wait
        } catch {
            Write-Host "[usb] Bind was cancelled/failed. Run once in an admin shell:  usbipd bind --busid $busid" -ForegroundColor Yellow
        }
    }

    Write-Host "[usb] Attaching $busid to WSL..." -ForegroundColor Cyan
    $out = (& usbipd attach --wsl --busid $busid 2>&1 | Out-String)
    # 'already attached' means a previous attach is still active -> the chip IS in
    # WSL, so treat it as success (not a failure).
    if ($LASTEXITCODE -eq 0 -or $out -match 'already attached') {
        Write-Host "[usb] $busid is attached to WSL. The chip is /dev/ttyACM0." -ForegroundColor Green
        Write-Host "[usb] (Re-run after any unplug/replug or WSL restart. If it shows as ttyACM1, set USB_TTY_PORT=1.)" -ForegroundColor DarkGray
    } else {
        if ($out) { Write-Host $out.Trim() -ForegroundColor DarkGray }
        Write-Host "[usb] Attach failed. Try manually:   usbipd attach --wsl --busid $busid" -ForegroundColor Yellow
        Write-Host "[usb] (older usbipd-win uses:        usbipd wsl attach --busid $busid )" -ForegroundColor Yellow
    }

    $ErrorActionPreference = $prev
}
