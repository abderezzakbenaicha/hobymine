# Installs (or removes) the always-on HobyMine backend.
#
# After this runs once, the API starts automatically at sign-in (or at boot when
# installed with administrator rights), restarts itself if it crashes, and keeps
# running in the background with no console window to leave open. The phone then
# always finds http://<this-pc>:4000 on the local Wi-Fi.
#
#   powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1 -Elevate
#   powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1 -Uninstall
#
# Options:
#   -Port 4000      Port to serve on (must match the APK's default).
#   -Elevate        Re-run as administrator, which also installs a scheduled
#                   task that starts at boot, before anyone signs in.
#   -PreventSleep   Stop this PC from sleeping while plugged in, so the backend
#                   stays reachable overnight.
#   -NoStart        Register autostart but do not start the server now.

param(
  [int]$Port = 4000,
  [switch]$Uninstall,
  [switch]$Elevate,
  [switch]$PreventSleep,
  [switch]$NoStart
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$taskName = 'HobyMine API'
$supervisor = Join-Path $PSScriptRoot 'start-api-service.ps1'
$firewall = Join-Path $PSScriptRoot 'allow-firewall.ps1'
$logFile = Join-Path $root 'logs\api.log'
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir 'HobyMine API.lnk'

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-LanAddress {
  $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
    Sort-Object RouteMetric |
    Select-Object -First 1
  if ($route) {
    $address = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.ifIndex -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike '169.254.*' } |
      Select-Object -First 1
    if ($address) { return $address.IPAddress }
  }
  $fallback = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -First 1
  if ($fallback) { return $fallback.IPAddress }
  return $null
}

function Wait-ApiHealthy {
  param([int]$Seconds = 45)
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:${Port}/api/health" -TimeoutSec 2
      if ($health.service -eq 'hobymine-api') { return $true }
    } catch {
      # Not up yet.
    }
    Start-Sleep -Milliseconds 700
  }
  return $false
}

function Install-StartupShortcut {
  New-Item -ItemType Directory -Force -Path $startupDir | Out-Null
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $shortcut.Arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$supervisor`" -Port $Port -Quiet"
  $shortcut.WorkingDirectory = $root
  $shortcut.WindowStyle = 7
  $shortcut.Description = 'Keeps the HobyMine local API running for the phone app.'
  $shortcut.Save()
}

function Remove-StartupShortcut {
  if (Test-Path $shortcutPath) {
    Remove-Item $shortcutPath -Force
    return $true
  }
  return $false
}

function Stop-RunningServer {
  Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and $_.CommandLine.Contains($supervisor)
  } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -like '*dist*index.js*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
}

# --- elevate -----------------------------------------------------------------
if ($Elevate -and -not (Test-Administrator)) {
  Write-Host 'Re-running as administrator (UAC prompt)...' -ForegroundColor Yellow
  $arguments = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Port', $Port
  )
  if ($PreventSleep) { $arguments += '-PreventSleep' }
  if ($NoStart) { $arguments += '-NoStart' }
  try {
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $arguments -Wait
  } catch {
    Write-Host 'Elevation was cancelled.' -ForegroundColor Red
  }
  exit 0
}

# --- uninstall ---------------------------------------------------------------
if ($Uninstall) {
  $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existing) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed the scheduled task `"$taskName`"." -ForegroundColor Green
  }
  if (Remove-StartupShortcut) {
    Write-Host 'Removed the startup shortcut.' -ForegroundColor Green
  }
  if (-not $existing -and -not (Test-Path $shortcutPath)) {
    Write-Host 'Nothing was installed.' -ForegroundColor Yellow
  }

  Stop-RunningServer

  if ($PreventSleep) {
    powercfg /change standby-timeout-ac 30 2>$null
    Write-Host 'Power: plugged-in sleep restored to 30 minutes.' -ForegroundColor Green
  }

  Write-Host 'The API will no longer start automatically. Run the installer again to re-enable it.'
  exit 0
}

# --- firewall ----------------------------------------------------------------
if (Test-Path $firewall) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $firewall -Port $Port
} else {
  Write-Host '  Firewall: scripts\allow-firewall.ps1 is missing; skipping.' -ForegroundColor Yellow
}

# --- autostart ---------------------------------------------------------------
# Preferred: a scheduled task (boot + sign-in, restarts on failure). It needs
# administrator rights to register, so fall back to the per-user Startup folder,
# which needs none.
$taskInstalled = $false
try {
  $action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$supervisor`" -Port $Port -Quiet" `
    -WorkingDirectory $root

  $triggers = @(
    (New-ScheduledTaskTrigger -AtStartup),
    (New-ScheduledTaskTrigger -AtLogOn)
  )
  foreach ($trigger in $triggers) {
    try { $trigger.Delay = 'PT20S' } catch { }
  }

  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1)
  $settings.DisallowStartIfOnBatteries = $false
  $settings.StopIfGoingOnBatteries = $false
  try { $settings.IdleSettings.StopOnIdleEnd = $false } catch { }

  $user = "$env:USERDOMAIN\$env:USERNAME"
  $principal = $null
  try {
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Limited
  } catch {
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  }

  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $triggers `
    -Principal $principal `
    -Settings $settings `
    -Description 'HobyMine backend: keeps the local API on port 4000 running for the phone app.' `
    -Force | Out-Null
  $taskInstalled = $true
  Remove-StartupShortcut | Out-Null
  Write-Host "Registered scheduled task `"$taskName`" (starts at boot and at sign-in)." -ForegroundColor Green
} catch {
  Install-StartupShortcut
  Write-Host 'Registered a Startup-folder shortcut (starts when you sign in).' -ForegroundColor Green
  Write-Host 'For start-at-boot (before sign-in), run once as administrator:' -ForegroundColor Yellow
  Write-Host "  powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Elevate" -ForegroundColor Yellow
}

# --- power -------------------------------------------------------------------
if ($PreventSleep) {
  # Only the AC profile is touched: the phone needs this PC awake while it is
  # plugged in. Battery behaviour is left alone.
  powercfg /change standby-timeout-ac 0 2>$null
  Write-Host 'Power: this PC will no longer sleep while plugged in.' -ForegroundColor Green
}

# --- start now ---------------------------------------------------------------
if (-not $NoStart) {
  Stop-RunningServer
  if ($taskInstalled) {
    Start-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  } else {
    Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @(
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', $supervisor, '-Port', $Port, '-Quiet'
    )
  }
  if (Wait-ApiHealthy) {
    Write-Host 'The API is up and answering /api/health.' -ForegroundColor Green
  } else {
    Write-Host 'The API did not answer within 45 s.' -ForegroundColor Yellow
    Write-Host "Check $logFile for the reason." -ForegroundColor Yellow
  }
}

# --- summary -----------------------------------------------------------------
$lan = Get-LanAddress
Write-Host ''
Write-Host 'HobyMine backend' -ForegroundColor Cyan
Write-Host "  This computer:  http://localhost:${Port}"
if ($lan) {
  Write-Host "  Phone / Wi-Fi:  http://${lan}:${Port}" -ForegroundColor Cyan
} else {
  Write-Host '  Phone / Wi-Fi:  LAN address not detected (run ipconfig).'
}
Write-Host ''
Write-Host "  Log:    $logFile"
Write-Host "  Status: powershell -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'server-status.ps1')`""
Write-Host "  Remove: powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Uninstall"
