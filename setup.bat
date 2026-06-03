@echo off
setlocal enabledelayedexpansion
title INASALAN POS - Setup

echo ============================================================
echo  INASALAN POS - Setup
echo ============================================================
echo.

:: ── Check / Install Python ────────────────────────────────────
echo [1/5] Checking Python...
python --version >nul 2>&1
if not errorlevel 1 goto python_ok

echo  Python not found. Attempting install via winget...
winget --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  winget is not available on this machine.
    echo  Please install Python manually from https://www.python.org/downloads/
    echo  Make sure to check "Add Python to PATH" during install, then rerun setup.bat.
    pause
    exit /b 1
)

winget install --id Python.Python.3 --silent --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
    echo  winget install failed.
    echo  Please install Python manually from https://www.python.org/downloads/
    pause
    exit /b 1
)

echo  Refreshing PATH...
call :refresh_path
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  Python was installed but this terminal does not see it yet.
    echo  Please close this window and run setup.bat again.
    pause
    exit /b 1
)

:python_ok
for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo  Found Python %PYVER%

:: ── Check / Install Node.js ───────────────────────────────────
echo.
echo [2/5] Checking Node.js...
node --version >nul 2>&1
if not errorlevel 1 goto node_ok

echo  Node.js not found. Attempting install via winget...
winget --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  winget is not available on this machine.
    echo  Please install Node.js manually from https://nodejs.org/ (LTS version).
    echo  Then rerun setup.bat.
    pause
    exit /b 1
)

winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
    echo  winget install failed.
    echo  Please install Node.js manually from https://nodejs.org/ (LTS version).
    pause
    exit /b 1
)

echo  Refreshing PATH...
call :refresh_path
node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  Node.js was installed but this terminal does not see it yet.
    echo  Please close this window and run setup.bat again.
    pause
    exit /b 1
)

:node_ok
for /f %%v in ('node --version 2^>^&1') do set NODEVER=%%v
echo  Found Node.js %NODEVER%

:: ── Backend venv + dependencies ───────────────────────────────
echo.
echo [3/5] Setting up Python backend...
cd backend

if not exist venv (
    echo  Creating virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo  ERROR: Failed to create virtual environment.
        pause
        exit /b 1
    )
) else (
    echo  Virtual environment already exists, skipping creation.
)

echo  Installing Python dependencies...
call venv\Scripts\pip.exe install -r requirements.txt --quiet
if errorlevel 1 (
    echo  ERROR: Failed to install Python dependencies.
    pause
    exit /b 1
)

echo  Running database migrations...
call venv\Scripts\python.exe manage.py migrate --run-syncdb
if errorlevel 1 (
    echo  ERROR: Database migration failed.
    pause
    exit /b 1
)

echo  Collecting static files...
call venv\Scripts\python.exe manage.py collectstatic --noinput --verbosity 0
if errorlevel 1 (
    echo  ERROR: collectstatic failed.
    pause
    exit /b 1
)

cd ..

:: ── Frontend npm dependencies ──────────────────────────────────
echo.
echo [4/5] Installing frontend dependencies...
cd frontend

echo  Detecting local network IP...
for /f %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp | Select-Object -First 1).IPAddress"') do set LOCAL_IP=%%i
if "%LOCAL_IP%"=="" set LOCAL_IP=localhost
echo  Using IP: %LOCAL_IP%

echo  Writing .env.local for network access...
(
    echo NEXT_PUBLIC_API_URL=http://%LOCAL_IP%:8000
    echo NEXT_PUBLIC_WS_URL=ws://%LOCAL_IP%:8000
    echo NEXT_PUBLIC_VOID_PIN=0000
) > .env.local

call npm install --silent
if errorlevel 1 (
    echo  ERROR: npm install failed.
    pause
    exit /b 1
)

echo  Building frontend...
call npm run build
if errorlevel 1 (
    echo  ERROR: Frontend build failed.
    pause
    exit /b 1
)

cd ..

:: ── Create superuser ──────────────────────────────────────────
echo.
echo [5/5] Creating Django admin user...
echo  You will be prompted to set a username and password.
echo  (Used to log in to http://localhost:8000/admin/)
echo.
cd backend
call venv\Scripts\python.exe manage.py createsuperuser
cd ..

echo.
echo ============================================================
echo  Setup complete!  Run start.bat to launch the POS system.
echo ============================================================
echo.
pause
goto :eof

:: ── Helper: refresh PATH from registry after winget install ───
:refresh_path
for /f "delims=" %%A in ('powershell -NoProfile -Command ^
  "[Environment]::GetEnvironmentVariable('PATH','Machine')+';'+[Environment]::GetEnvironmentVariable('PATH','User')"') do set "PATH=%%A"
goto :eof
