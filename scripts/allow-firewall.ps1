# Opens the Windows firewall for the HobyMine API so a phone on the same Wi-Fi
# can reach it.
#
# The app connects to http://<this-pc>:4000. Windows blocks that inbound port by
# default, which looks exactly like "the server is down" on the phone. This
# script adds an inbound rule for the TCP port, scoped to the local subnet so
# machines on other networks still cannot reach it.
#
# It elevates itself with a UAC prompt the first time. Later runs are no-ops:
# if the rule already exists and is enabled, nothing asks for permission.
#
# Usage (normally called by start-server.cmd):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\allow-firewall.ps1
#   powershell ... -File scripts\allow-firewall.ps1 -Port 4000

param(
  [int]$Port = 4000,
  [switch]$Elevated
)

$ErrorActionPreference = 'Stop'
$ruleName = "HobyMine API (TCP $Port)"

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-Rule {
  return Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
}

# Already allowed? Then there is nothing to elevate for.
$existing = Get-Rule
if ($existing -and $existing.Enabled -eq 'True' -and $existing.Action -eq 'Allow') {
  Write-Host "  Firewall: TCP $Port is already allowed (rule `"$ruleName`")." -ForegroundColor Green
  exit 0
}

if (-not (Test-Administrator)) {
  Write-Host "  Firewall: requesting permission to allow TCP $Port (UAC prompt)..." -ForegroundColor Yellow
  try {
    # -PassThru so a failure to start is visible; do not wait, the server can
    # start while the user answers the prompt.
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -PassThru -ArgumentList @(
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', "`"$PSCommandPath`"",
      '-Port', $Port,
      '-Elevated'
    ) | Out-Null
  } catch {
    Write-Host "  Firewall: could not elevate automatically." -ForegroundColor Red
    Write-Host "  Run this once as Administrator, then start the server again:" -ForegroundColor Yellow
    Write-Host "    powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -ForegroundColor Yellow
    exit 1
  }
  exit 0
}

# --- Elevated from here on ---------------------------------------------------

try {
  if (-not $existing) {
    New-NetFirewallRule `
      -DisplayName $ruleName `
      -Description 'HobyMine dev API: lets a phone on the same Wi-Fi reach the backend on TCP 4000.' `
      -Direction Inbound `
      -Protocol TCP `
      -LocalPort $Port `
      -Action Allow `
      -Profile Any `
      -RemoteAddress LocalSubnet `
      -Enabled True | Out-Null
    Write-Host "  Firewall: created rule `"$ruleName`" (TCP $Port, local subnet)." -ForegroundColor Green
  } else {
    Set-NetFirewallRule -DisplayName $ruleName -Enabled True -Action Allow -Profile Any
    Write-Host "  Firewall: enabled existing rule `"$ruleName`" (TCP $Port, local subnet)." -ForegroundColor Green
  }
  exit 0
} catch {
  Write-Host "  Firewall: could not update the rule: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "  The server can still run; the phone may not be able to connect." -ForegroundColor Yellow
  exit 1
}
