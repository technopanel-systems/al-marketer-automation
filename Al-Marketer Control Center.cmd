@echo off
title Al-Marketer Control Center
cd /d "%~dp0"
rem A private Node.js put in the project folder by SETUP.cmd comes first.
if exist "%~dp0runtime\node\node.exe" set "PATH=%~dp0runtime\node;%PATH%"
where node >nul 2>nul || (echo Node.js is not set up on this computer yet. Double-click SETUP.cmd in this folder first. & pause & exit /b 1)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)" || (echo This Node.js is too old. Double-click SETUP.cmd: it puts Node.js 24 in this folder. & pause & exit /b 1)
if not exist node_modules (
  echo First start: installing the free components. This takes a few minutes...
  call npm install --no-fund --no-audit
  call node node_modules\playwright\cli.js install chromium
)
if not exist tools\yt-dlp.exe (
  echo Downloading the free TikTok/YouTube reader ^(yt-dlp^)...
  if not exist tools mkdir tools
  powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -Uri https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe -OutFile tools\yt-dlp.exe } catch { Write-Host 'Could not download yt-dlp now - TikTok and YouTube can still be typed in by hand.' }"
) else (
  forfiles /p tools /m yt-dlp.exe /d -7 >nul 2>nul && (echo Updating the TikTok/YouTube reader... & tools\yt-dlp.exe -U >nul 2>nul)
)
rem A quick check: shows only what is missing (for example Claude Code not signed in).
node setup\doctor.js --quick
echo Starting the Control Center. Keep this window open while you work. Close it to stop.
node app\server.js
pause
