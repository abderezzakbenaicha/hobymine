# Keeps the HobyMine API running: starts it, restarts it if it crashes, and
# keeps a log so failures are diagnosable.
#
# This is the script the "HobyMine API" scheduled task runs (see
# install-autostart.ps1). It can also be started by hand:
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-api-service.ps1
#
# It is safe to run more than once: a second copy exits immediately because the
# lock file is held by the first one.

param(
  [int]$Port = 4000,
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $root 'apps\api'
$logDir = Join-Path $root 'logs'
$logFile = Join-Path $logDir 'api.log'
$lockFile = Join-Path $logDir 'api-service.lock'
$entry = Join-Path $apiDir 'dist\index.js'

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-Log {
  param([string]$Message)
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  if (-not $Quiet) { Write-Host $line }
  try {
    # While the API runs, cmd.exe holds api.log open for its own output, so a
    # write here can fail. Logging must never take the supervisor down.
    Add-Content -Path $logFile -Value $line -Encoding utf8 -ErrorAction Stop
  } catch { }
}

function Rotate-Log {
  try {
    if ((Test-Path $logFile) -and (Get-Item $logFile).Length -gt 5MB) {
      Move-Item -Path $logFile -Destination "$logFile.1" -Force
    }
  } catch {
    # A locked log is not a reason to stop serving the app.
  }
}

function Test-ApiHealthy {
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:${Port}/api/health" -TimeoutSec 3
    return ($health.service -eq 'hobymine-api')
  } catch {
    return $false
  }
}

# The supervisor serves dist/index.js. If the TypeScript sources are newer, the
# running code would silently be stale, so rebuild once before starting.
function Test-NeedsBuild {
  if (-not (Test-Path $entry)) { return $true }
  $distTime = (Get-Item $entry).LastWriteTimeUtc
  $newest = Get-ChildItem -Path (Join-Path $apiDir 'src') -Recurse -File -Include '*.ts', '*.sql' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
  if ($newest -and $newest.LastWriteTimeUtc -gt $distTime) { return $true }
  $packageJson = Join-Path $apiDir 'package.json'
  if ((Test-Path $packageJson) -and (Get-Item $packageJson).LastWriteTimeUtc -gt $distTime) { return $true }
  return $false
}

# --- one supervisor at a time ------------------------------------------------
# The handle is held for the lifetime of this process, so a second copy (for
# example the task and a manual run at the same time) cannot double-start node.
try {
  $lock = [System.IO.File]::Open(
    $lockFile,
    [System.IO.FileMode]::OpenOrCreate,
    [System.IO.FileAccess]::ReadWrite,
    [System.IO.FileShare]::None
  )
} catch {
  Write-Host '[hobymine] Another supervisor is already running; this copy exits.'
  exit 0
}

# --- node --------------------------------------------------------------------
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
}
if (-not $node) {
  Write-Log 'node was not found on PATH. Install Node.js 20+ and try again.'
  exit 1
}

# The compiled server is what the task runs. Rebuild when the sources moved on
# (fresh clone, or an update that was never built) instead of serving stale code
# or failing silently.
if (Test-NeedsBuild) {
  Write-Log 'API sources are newer than dist; rebuilding (one time).'
  Push-Location $root
  try {
    & npm.cmd run build --workspace @hobymine/api 2>&1 | ForEach-Object { Write-Log "build: $_" }
  } finally {
    Pop-Location
  }
  if (-not (Test-Path $entry)) {
    Write-Log 'The API build did not produce dist/index.js. Giving up.'
    exit 1
  }
  Write-Log 'Build finished.'
}

# --- environment -------------------------------------------------------------
# The embedded PGlite database lives in apps/api/data/pg, and NODE_ENV is left
# alone on purpose: production mode hides the demo verification code.
$env:PORT = "$Port"
$env:HOST = '0.0.0.0'

Write-Log "Supervisor starting (node $node, port $Port, host 0.0.0.0)."

$attempt = 0
$running = $true

try {
  while ($running) {
    Rotate-Log

    if (Test-ApiHealthy) {
      Write-Log "Port $Port already answers /api/health; not starting a second copy."
      break
    }

    $startedAt = Get-Date
    Write-Log "Starting API (attempt $($attempt + 1))."

    # cmd.exe appends the raw bytes; PowerShell's *>> would write UTF-16 and
    # make the log unreadable.
    $command = '/s /c ""{0}" dist/index.js >> "{1}" 2>&1"' -f $node, $logFile

    Push-Location $apiDir
    try {
      & $env:ComSpec $command
    } finally {
      Pop-Location
    }

    $exitCode = $LASTEXITCODE
    $uptime = (Get-Date) - $startedAt
    $seconds = [int]$uptime.TotalSeconds
    Write-Log "API exited with code $exitCode after $seconds s."

    # A clean exit right after start usually means the port was taken by
    # another instance. If that instance is healthy, leave it alone.
    if ($seconds -lt 10 -and (Test-ApiHealthy)) {
      Write-Log 'Another API instance owns the port; supervisor exits.'
      break
    }

    # Back off when the process keeps dying immediately (bad config, port
    # clash, corrupt database) so the machine is not stuck in a tight loop.
    if ($seconds -ge 60) {
      $attempt = 0
    } else {
      $attempt += 1
    }
    $delay = [int][Math]::Min(30, [Math]::Pow(2, [Math]::Min($attempt, 5)))
    Write-Log "Restarting in $delay s."
    Start-Sleep -Seconds $delay
  }
} finally {
  Write-Log 'Supervisor stopped.'
  if ($lock) { $lock.Dispose() }
}
