@echo off
title Al-Marketer - Update Claude and show the models
cd /d "%~dp0"
if not exist "%~dp0setup\update-claude.js" (
  echo.
  echo  This was opened from inside the zip file. Extract the folder first, then run it there.
  echo.
  pause
  exit /b 1
)
if not exist "%~dp0ai\models.js" (
  echo.
  echo  This file has to sit in the Al-Marketer folder ^(the one with SETUP.cmd in it^), usually C:\Al-Marketer.
  echo  Extract the zip to  C:\  again and say yes to any "replace" question, then double-click it there.
  echo.
  pause
  exit /b 1
)
rem A private Node.js put in the project folder by SETUP.cmd comes first.
if exist "%~dp0runtime\node\node.exe" set "PATH=%~dp0runtime\node;%PATH%"
where node >nul 2>nul || (echo Node.js is not set up on this computer yet. Double-click SETUP.cmd in this folder first. & pause & exit /b 1)
node setup\update-claude.js
echo   If the Control Center was open, close and reopen it.
echo.
pause
