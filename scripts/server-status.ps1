# Shows whether the HobyMine backend is up, what address the phone must use,
# and the usual reasons the phone still cannot connect.
#
#   powershell -ExecutionPolicy Bypass -File scripts\server-status.ps1

param(
  [int]$Port = 4000
)

$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
$taskName = 'HobyMine API'
$logFile = Join-Path $root 'logs\api.log'
$ruleName = "HobyMine API (TCP $Port)"

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

$lan = Get-LanAddress
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1
$serverPid = $null
if ($listener -and $listener.OwningProcess -gt 0) {
  $serverPid = $listener.OwningProcess
} else {
  $serverPid = (Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -like '*dist*index.js*' } |
    Select-Object -First 1).ProcessId
}

$health = $null
try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:${Port}/api/health" -TimeoutSec 3
} catch { }

Write-Host ''
Write-Host 'HobyMine backend status' -ForegroundColor Cyan
Write-Host '------------------------------------------------------------'

if ($serverPid) {
  Write-Host "  Server:      RUNNING (PID $serverPid, port $Port)" -ForegroundColor Green
} else {
  Write-Host '  Server:      NOT RUNNING' -ForegroundColor Red
}

if ($health -and $health.service -eq 'hobymine-api') {
  Write-Host "  Health:      ok ($($health.database) database)" -ForegroundColor Green
} else {
  Write-Host '  Health:      no answer on http://127.0.0.1:' -NoNewline
  Write-Host $Port -ForegroundColor Red
}

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$shortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'HobyMine API.lnk'
if ($task) {
  $info = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue
  Write-Host "  Autostart:   scheduled task ($($task.State))" -ForegroundColor Green
  if ($info) {
    Write-Host "  Last run:    $($info.LastRunTime)  result $($info.LastTaskResult)"
  }
} elseif (Test-Path $shortcut) {
  Write-Host '  Autostart:   startup shortcut (at sign-in)' -ForegroundColor Green
  Write-Host '               run the installer with -Elevate for start-at-boot'
} else {
  Write-Host '  Autostart:   not installed' -ForegroundColor Yellow
  Write-Host '               powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1'
}

$rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($rule -and $rule.Enabled -eq 'True') {
  Write-Host "  Firewall:    allowed (TCP $Port, local subnet)" -ForegroundColor Green
} else {
  Write-Host '  Firewall:    blocked or missing' -ForegroundColor Red
  Write-Host '               powershell -ExecutionPolicy Bypass -File scripts\allow-firewall.ps1'
}

Write-Host ''
if ($lan) {
  Write-Host "  Phone URL:   http://${lan}:${Port}" -ForegroundColor Cyan
} else {
  Write-Host '  Phone URL:   LAN address not detected (run ipconfig)' -ForegroundColor Yellow
}

$wifi = Get-NetConnectionProfile -ErrorAction SilentlyContinue |
  Where-Object { $_.InterfaceAlias -match 'Wi-?Fi|Wireless' } |
  Select-Object -First 1
if ($wifi) {
  Write-Host "  Wi-Fi:       $($wifi.Name) ($($wifi.NetworkCategory))"
  if ($wifi.NetworkCategory -eq 'Public') {
    Write-Host '               Public networks are fine: the firewall rule is scoped to the local subnet.'
  }
}

Write-Host ''
Write-Host 'If the phone still cannot connect:'
Write-Host '  1. Phone and PC must be on the same Wi-Fi (not a guest network).'
Write-Host '  2. In the app: Profile -> Server connection -> Auto-detect on Wi-Fi.'
Write-Host '  3. If the PC sleeps, the server is unreachable. Re-run the installer'
Write-Host '     with -PreventSleep to keep it awake while plugged in.'
Write-Host "  4. Log: $logFile"
Write-Host ''
