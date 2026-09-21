@echo off
title Al-Marketer - Setup
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\setup.ps1" %*
if errorlevel 1 exit /b 1
