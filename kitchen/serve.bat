@echo off
cd /d "%~dp0"
echo Starting Kitchen Display on http://localhost:3076
echo.
python -m http.server 3076
