@echo off
title TikTok Media Downloader
color 0b
echo ========================================================
echo    TikTok Media Downloader (HD Video & MP3 Audio)
echo ========================================================
echo.

set PYTHONIOENCODING=utf-8
chcp 65001 >nul

if exist venv\Scripts\python.exe (
    echo [*] Virtual environment detected.
    echo [*] Starting server on http://localhost:8000 ...
    echo [*] Press Ctrl+C in this window anytime to stop the server.
    echo.
    start http://localhost:8000
    venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
    pause
    goto :eof
)

echo [*] Checking Python installation...
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Python was not found on your system.
    echo [*] Installing Python 3.12 via Winget...
    winget install --id Python.Python.3.12 --scope user --accept-source-agreements --accept-package-agreements
    echo.
    echo [*] Python installed. Please restart this script now.
    pause
    exit /b
)

echo [*] Creating virtual environment (venv)...
python -m venv venv
call venv\Scripts\activate.bat
echo [*] Installing requirements...
pip install -r requirements.txt
start http://localhost:8000
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
pause
