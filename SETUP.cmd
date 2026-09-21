@echo off
title Al-Marketer - Setup
cd /d "%~dp0"
if not exist "%~dp0setup\setup.ps1" (
  echo.
  echo  This was opened from inside the zip file, so the setup cannot run.
  echo  1. Close this window.
  echo  2. Right-click the zip file and choose "Extract All...", folder C:\ , then Extract.
  echo  3. Open the folder C:\Al-Marketer and double-click SETUP.cmd there.
  echo.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\setup.ps1" %*
if errorlevel 1 exit /b 1
