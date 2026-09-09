@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   FX9 Bot - Local Launcher (v5.0.0)
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not installed. Download from https://nodejs.org then retry.
  pause
  exit /b 1
)

if not exist ".env" (
  echo First run detected - creating .env from .env.example...
  if exist ".env.example" (
    copy /y ".env.example" ".env" >nul
    echo.
    echo [IMPORTANT] Open .env in Notepad and fill:
    echo   TOKEN   = your bot token
    echo   CLIENT_ID = application ID
    echo   GUILD_ID = server ID
    echo   MONGODB_URI = same as your Render database
    echo (Reuse the same values you already set on Render)
    echo.
    echo Then run this file again.
    pause
    exit /b 0
  ) else (
    echo [ERROR] .env.example missing.
    pause
    exit /b 1
  )
)

if not exist "node_modules" (
  echo Installing dependencies... (first run only)
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo Starting bot... (leave this window open)
call node src/index.js
pause