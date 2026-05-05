@echo off
setlocal enabledelayedexpansion
title INASALAN POS - Setup

echo ============================================================
echo  INASALAN POS - Setup
echo ============================================================
echo.

:: ── Check Python ─────────────────────────────────────────────
echo [1/5] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Python is not installed or not in PATH.
    echo  Download from https://www.python.org/downloads/
    echo  Make sure to check "Add Python to PATH" during install.
    pause
    exit /b 1
)
for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo  Found Python %PYVER%

:: ── Check Node.js ────────────────────────────────────────────
echo.
echo [2/5] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js is not installed or not in PATH.
    echo  Download from https://nodejs.org/  (LTS version recommended)
    pause
    exit /b 1
)
for /f %%v in ('node --version 2^>^&1') do set NODEVER=%%v
echo  Found Node.js %NODEVER%

:: ── Backend venv + dependencies ──────────────────────────────
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
call venv\Scripts\python.exe manage.py collectstatic --noinput --quiet
if errorlevel 1 (
    echo  ERROR: collectstatic failed.
    pause
    exit /b 1
)

cd ..

:: ── Frontend npm dependencies ─────────────────────────────────
echo.
echo [4/5] Installing frontend dependencies...
cd frontend

if not exist .env.local (
    echo  Creating .env.local with defaults...
    (
        echo NEXT_PUBLIC_API_URL=http://localhost:8000
        echo NEXT_PUBLIC_WS_URL=ws://localhost:8000
        echo NEXT_PUBLIC_VOID_PIN=0000
    ) > .env.local
)

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

:: ── Done ─────────────────────────────────────────────────────
echo.
echo [5/5] Creating Django superuser...
echo  You will be prompted to set an admin username and password.
echo  (Used to log in to http://localhost:8000/admin/)
echo.
cd backend
call venv\Scripts\python.exe manage.py createsuperuser
cd ..

echo.
echo ============================================================
echo  Setup complete!
echo  Run start.bat to launch the POS system.
echo ============================================================
echo.
pause
