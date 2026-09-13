@echo off
title Al-Marketer Control Center
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Please install Node.js 24 from https://nodejs.org & pause & exit /b 1)
if not exist node_modules (
  echo First start: installing the free components. This takes a few minutes...
  call npm install --no-fund --no-audit
  call node node_modules\playwright\cli.js install chromium
)
echo Starting the Control Center. Keep this window open while you work. Close it to stop.
node app\server.js
pause
