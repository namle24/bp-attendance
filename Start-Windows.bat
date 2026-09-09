@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Cai Node.js 24 tro len tu https://nodejs.org, sau do mo lai file nay.
  pause
  exit /b 1
)
node scripts/start.cjs
pause
