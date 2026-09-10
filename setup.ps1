# TikTok Media Downloader - PowerShell Setup & Runner
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   TikTok Media Downloader - Setup & Launcher" -ForegroundColor White
Write-Host "========================================================" -ForegroundColor Cyan

# Check if Python is installed
$pythonPath = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonPath) {
    Write-Host "[!] Python is not installed or not in PATH." -ForegroundColor Yellow
    Write-Host "[*] Installing Python 3.12 via Winget..." -ForegroundColor Cyan
    winget install --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements --silent
    Write-Host "[+] Python installed. Please re-open PowerShell and run this script again." -ForegroundColor Green
    return
}

# Create virtual environment if not exists
if (-not (Test-Path "venv")) {
    Write-Host "[*] Creating Python virtual environment (venv)..." -ForegroundColor Cyan
    python -m venv venv
}

# Activate virtual environment
Write-Host "[*] Activating virtual environment..." -ForegroundColor Green
& ".\venv\Scripts\Activate.ps1"

# Install requirements
Write-Host "[*] Installing required packages..." -ForegroundColor Cyan
pip install -r requirements.txt

# Run server
Write-Host ""
Write-Host "[+] Server launching on http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "[i] Press Ctrl+C in this window to stop the server." -ForegroundColor Yellow
Start-Process "http://127.0.0.1:8000"

python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
