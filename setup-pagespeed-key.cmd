@echo off
setlocal
cd /d "%~dp0"
echo.
echo Al-Marketer Proposal System - save Google PageSpeed API key (optional)
echo The key is stored only in .env.local on this PC. It is never uploaded to GitHub.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = Read-Host 'Paste your Google PageSpeed Insights API key, then press Enter' -AsSecureString;" ^
  "$t = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)).Trim();" ^
  "if (-not $t) { Write-Host 'No key entered. Nothing was changed.'; exit 1 }" ^
  "$lines = @(); if (Test-Path '.env.local') { $lines = @(Get-Content '.env.local' | Where-Object { $_ -notmatch '^PAGESPEED_API_KEY=' }) }" ^
  "$lines += ('PAGESPEED_API_KEY=' + $t);" ^
  "Set-Content -Path '.env.local' -Value $lines -Encoding ascii;" ^
  "Write-Host 'Saved.'"
echo.
pause
