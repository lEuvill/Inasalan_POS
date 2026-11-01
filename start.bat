@echo off
title INASALAN POS - Starting...

:: Check setup has been run
if not exist backend\venv (
    echo Setup has not been run yet. Please run setup.bat first.
    pause
    exit /b 1
)
if not exist frontend\node_modules (
    echo Frontend dependencies missing. Please run setup.bat first.
    pause
    exit /b 1
)

set "LOCAL_IP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$ip = Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred -ErrorAction SilentlyContinue ^| Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' } ^| Select-Object -First 1 -ExpandProperty IPAddress; if ([string]::IsNullOrWhiteSpace($ip)) { 'localhost' } else { $ip.Trim() }"`) do set "LOCAL_IP=%%i"
if not defined LOCAL_IP set "LOCAL_IP=localhost"

echo ============================================================
echo  INASALAN POS
echo ============================================================
echo.
echo  This PC  -^>  http://localhost:3000/admin
echo  Network  -^>  http://%LOCAL_IP%:3000/admin
echo.
echo  Close this window to stop all servers.
echo ============================================================
echo.

:: Start Django/Daphne only when port 8000 is not already in use.
netstat -ano | findstr /R /C:":8000 .*LISTENING" >nul
if errorlevel 1 (
    start "INASALAN Backend" cmd /k "cd /d "%~dp0backend" && venv\Scripts\python.exe -m daphne -b 0.0.0.0 -p 8000 inasalan_pos.asgi:application"
) else (
    echo  Backend is already running on port 8000; reusing it.
)

:: Small delay so backend starts first
timeout /t 2 /nobreak >nul

:: Start Next.js only when port 3000 is not already in use.
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul
if errorlevel 1 (
    start "INASALAN Frontend" cmd /k "cd /d "%~dp0frontend" && npm run start"
) else (
    echo  Frontend is already running on port 3000; reusing it.
)

:: Keep completed transactions synced to Google Sheets
start "INASALAN Google Sheets Sync" /min cmd /k "cd /d "%~dp0backend" && venv\Scripts\python.exe manage.py sync_google_sheets 1Dzy2F7CuKPaPfOzxL1YYDvAy2SzZWXcqOOa7b-h-Onw --watch --interval 60"

echo  Both servers and Google Sheets sync are starting.
echo  Press any key to close this launcher (servers keep running).
pause >nul
