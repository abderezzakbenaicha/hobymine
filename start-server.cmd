@echo off
setlocal EnableExtensions
title HobyMine API
cd /d "%~dp0"

if not defined PORT set "PORT=4000"

echo ============================================================
echo   HobyMine backend
echo ============================================================
echo.

rem --- Already running in the background? ----------------------
rem The backend is normally installed to start automatically, so this
rem window is only a convenience. Never start a second copy: two
rem servers on the same port is how the phone ends up unreachable.
powershell -NoProfile -Command "try { $h = Invoke-RestMethod -Uri 'http://127.0.0.1:%PORT%/api/health' -TimeoutSec 2; if ($h.service -eq 'hobymine-api') { exit 0 } } catch { }; exit 1" >nul 2>&1
if not errorlevel 1 goto :running

rem --- Not running: install autostart and start it once ---------
echo   The backend is not running. Starting it and enabling autostart...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-autostart.ps1" -Port %PORT%
if errorlevel 1 (
  echo.
  echo   Could not start the backend. See logs\api.log for details.
  pause >nul
  exit /b 1
)
echo.
echo   Closing this window is safe: the server keeps running in the
echo   background and starts again on the next sign-in.
pause >nul
exit /b 0

:running
echo   The backend is already running in the background.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\server-status.ps1" -Port %PORT%
pause >nul
exit /b 0
