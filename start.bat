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

for /f %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp | Select-Object -First 1).IPAddress"') do set LOCAL_IP=%%i
if "%LOCAL_IP%"=="" set LOCAL_IP=localhost

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

:: Start Django/Daphne in a new window
start "INASALAN Backend" cmd /k "cd /d "%~dp0backend" && venv\Scripts\daphne.exe -b 0.0.0.0 -p 8000 inasalan_pos.asgi:application"

:: Small delay so backend starts first
timeout /t 2 /nobreak >nul

:: Start Next.js in a new window
start "INASALAN Frontend" cmd /k "cd /d "%~dp0frontend" && npm run start"

echo  Both servers are starting in separate windows.
echo  Press any key to close this launcher (servers keep running).
pause >nul
