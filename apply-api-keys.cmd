@echo off
setlocal
cd /d "%~dp0"
echo.
echo Al-Marketer Proposal System - apply keys from API-KEYS.txt
echo Copies every filled-in KEY=value line into .env.local on this PC. Nothing is uploaded.
echo.
if not exist "API-KEYS.txt" goto missing
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$pairs = @(Get-Content 'API-KEYS.txt' -Encoding UTF8 | Where-Object { $_ -match '^\s*[A-Z][A-Z0-9_]*\s*=\s*\S' } | ForEach-Object { $k, $v = $_ -split '=', 2; [pscustomobject]@{ Key = $k.Trim(); Value = $v.Trim() } });" ^
  "if ($pairs.Count -eq 0) { Write-Host 'No filled-in keys found in API-KEYS.txt. Nothing was changed.'; exit 0 }" ^
  "$lines = @(); if (Test-Path '.env.local') { $lines = @(Get-Content '.env.local') };" ^
  "foreach ($p in $pairs) { $lines = @($lines | Where-Object { $_ -notmatch ('^' + [regex]::Escape($p.Key) + '=') }); $lines += ($p.Key + '=' + $p.Value) };" ^
  "Set-Content -Path '.env.local' -Value $lines -Encoding ascii;" ^
  "Write-Host ('Saved ' + $pairs.Count + ' key(s): ' + (($pairs | ForEach-Object { $_.Key }) -join ', '));" ^
  "Write-Host 'Close and reopen the Control Center to use them.'"
goto end
:missing
echo API-KEYS.txt was not found next to this file. Nothing was changed.
:end
echo.
pause
