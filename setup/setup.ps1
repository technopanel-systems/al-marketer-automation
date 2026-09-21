# Al-Marketer Control Center - first-time setup for a new Windows computer (started by SETUP.cmd).
# Safe to run again at any time: every step checks first and only does what is missing.
#   1. Checks the computer (Windows, disk space, internet) and that the zip was extracted.
#   2. Node.js 24: uses the one on the computer if it is new enough, otherwise puts a private copy in runtime\node
#      (downloaded from nodejs.org, checksum verified; no admin rights, nothing installed system-wide).
#   3. The app components (npm), the browser for website checks and slides (Playwright Chromium), yt-dlp.
#   4. Claude Code: the official installer from claude.ai when it is missing.
#   5. Signing in to Claude (a browser window opens once).
#   6. A full check, including one tiny Claude answer, saved in setup-report.txt.
#   7. A Desktop shortcut, then the Control Center starts.
param(
  [switch]$NoShortcut,
  [switch]$NoStart,
  [switch]$NonInteractive,
  [switch]$ForcePortableNode,
  [string]$DesktopDir = ''
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root
# Variables of a Claude Code session this may have been started from would change how the Claude CLI behaves.
Get-ChildItem Env: | Where-Object { $_.Name -match '^CLAUDE_?CODE|^CLAUDECODE$|^CLAUDE_PID$' } | ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" }

function Step([int]$n, [string]$text) { Write-Host ''; Write-Host "[$n/7] $text" -ForegroundColor Cyan }
function Ok([string]$t) { Write-Host "   OK   $t" -ForegroundColor Green }
function Info([string]$t) { Write-Host "        $t" }
function Warn([string]$t) { Write-Host "   !    $t" -ForegroundColor Yellow }
function Bad([string]$t) { Write-Host "   X    $t" -ForegroundColor Red }
function Finish([int]$code) {
  if (-not $NonInteractive) { Write-Host ''; Read-Host 'Press Enter to close this window' | Out-Null }
  exit $code
}
function Find-Claude {
  $dirs = @($env:PATH -split ';' | Where-Object { $_ })
  foreach ($d in $dirs) { $f = Join-Path $d 'claude.exe'; if (Test-Path -LiteralPath $f) { return $f } }
  foreach ($f in @((Join-Path $env:USERPROFILE '.local\bin\claude.exe'), (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\claude.exe'))) { if (Test-Path -LiteralPath $f) { return $f } }
  return $null
}

Write-Host '================================================================' -ForegroundColor DarkGray
Write-Host ' Al-Marketer Control Center - setup' -ForegroundColor White
Write-Host ' Takes about 5-10 minutes the first time. Keep this window open.' -ForegroundColor White
Write-Host '================================================================' -ForegroundColor DarkGray

# ---------- 1. The computer ----------
Step 1 'Checking this computer'
if ($Root -match '\.zip\\' -or ($Root -match '\\Temp\\' -and $Root -match 'zip')) {
  Bad 'This folder is still inside the zip file.'
  Info 'Close this window. Right-click the zip file > "Extract All..." > Extract.'
  Info 'Then open the extracted folder and double-click SETUP.cmd there.'
  Finish 1
}
if ($Root -match '\\OneDrive[^\\]*\\') { Warn "The folder is inside OneDrive ($Root). It works, but is slow. Better: move the folder to C:\Al-Marketer and run SETUP.cmd there." }
$build = [Environment]::OSVersion.Version.Build
if ($build -lt 17763) { Bad "Windows is too old (build $build). Windows 10 version 1809 or newer is needed."; Finish 1 }
Ok "Windows build $build, folder: $Root"
# Files that came from the internet are marked; clearing the mark avoids a warning for every script.
Get-ChildItem -LiteralPath $Root -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue
$drive = Get-PSDrive -Name ($Root.Substring(0, 1)) -ErrorAction SilentlyContinue
if ($drive -and $drive.Free -lt 1.5GB) { Bad ('Not enough free disk space ({0:N1} GB). About 1.5 GB is needed.' -f ($drive.Free / 1GB)); Finish 1 }
try {
  Invoke-WebRequest -UseBasicParsing -Uri 'https://www.google.com/generate_204' -TimeoutSec 15 | Out-Null
  Ok 'Internet works'
} catch { Bad 'No internet connection. Connect to the internet and run SETUP.cmd again.'; Finish 1 }

# ---------- 2. Node.js ----------
Step 2 'Node.js (the engine that runs the app)'
$node = $null
$portable = Join-Path $Root 'runtime\node\node.exe'
if (Test-Path -LiteralPath $portable) { $node = $portable; Ok 'Node.js is already inside the project folder' }
elseif (-not $ForcePortableNode) {
  $sys = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($sys) {
    $major = [int](& $sys.Source -p "process.versions.node.split('.')[0]")
    if ($major -ge 24) { $node = $sys.Source; Ok "Using Node.js $(& $node -v) from this computer" }
    else { Info "Node.js $(& $sys.Source -v) on this computer is too old; a private copy of Node.js 24 is put in the project folder instead." }
  }
}
if (-not $node) {
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
  Info "Downloading Node.js 24 ($arch) from nodejs.org..."
  $base = 'https://nodejs.org/dist/latest-v24.x'
  $sums = (Invoke-WebRequest -UseBasicParsing -Uri "$base/SHASUMS256.txt").Content
  $line = ($sums -split "`n") | Where-Object { $_ -match "node-v[\d.]+-win-$arch\.zip\s*$" } | Select-Object -First 1
  if (-not $line) { Bad 'Could not find the Node.js download. Try again later.'; Finish 1 }
  $hash, $file = ($line.Trim() -split '\s+')
  $zip = Join-Path $env:TEMP $file
  Invoke-WebRequest -UseBasicParsing -Uri "$base/$file" -OutFile $zip
  if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLower() -ne $hash.ToLower()) { Remove-Item -LiteralPath $zip -Force; Bad 'The Node.js download was damaged (checksum). Run SETUP.cmd again.'; Finish 1 }
  $tmp = Join-Path $Root 'runtime\_unpack'
  if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
  New-Item -ItemType Directory -Path $tmp -Force | Out-Null
  $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
  if (Test-Path -LiteralPath $tar) { & $tar -xf $zip -C $tmp } else { Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force }
  $inner = Get-ChildItem -LiteralPath $tmp -Directory | Select-Object -First 1
  $target = Join-Path $Root 'runtime\node'
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
  Move-Item -LiteralPath $inner.FullName -Destination $target
  Remove-Item -LiteralPath $tmp -Recurse -Force
  Remove-Item -LiteralPath $zip -Force
  $node = $portable
  Ok "Node.js $(& $node -v) is ready inside the project folder (runtime\node)"
}
$nodeDir = Split-Path -Parent $node
$env:PATH = "$nodeDir;$env:PATH"
$npm = Join-Path $nodeDir 'npm.cmd'
if (-not (Test-Path -LiteralPath $npm)) { $npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source }
if (-not $npm) { Bad 'npm was not found next to Node.js. Delete the runtime folder and run SETUP.cmd again.'; Finish 1 }

# ---------- 3. App components ----------
Step 3 'App components, the browser for website checks and slides, and the TikTok/YouTube reader'
if (-not (Test-Path -LiteralPath (Join-Path $Root 'node_modules\playwright'))) {
  Info 'Installing the app components (a few minutes)...'
  & $npm ci --no-fund --no-audit --loglevel=error
  if ($LASTEXITCODE -ne 0) { & $npm install --no-fund --no-audit --loglevel=error }
  if ($LASTEXITCODE -ne 0) { Bad 'The components could not be installed. Check the internet and run SETUP.cmd again.'; Finish 1 }
}
Ok 'App components installed'
Info 'Checking the browser used for website checks and slides (downloads about 150 MB the first time)...'
& $node (Join-Path $Root 'node_modules\playwright\cli.js') install chromium
if ($LASTEXITCODE -ne 0) { Bad 'The browser could not be downloaded. Run SETUP.cmd again.'; Finish 1 }
Ok 'Browser ready'
$ytdlp = Join-Path $Root 'tools\yt-dlp.exe'
if (-not (Test-Path -LiteralPath $ytdlp)) {
  try {
    New-Item -ItemType Directory -Path (Join-Path $Root 'tools') -Force | Out-Null
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile $ytdlp
    Ok 'TikTok/YouTube reader downloaded'
  } catch { Warn 'The TikTok/YouTube reader could not be downloaded now; it is tried again when the app starts.' }
} else { Ok 'TikTok/YouTube reader present' }

# ---------- 4. Claude Code ----------
Step 4 'Claude Code (the AI that researches and writes; runs with your own Claude account)'
$claude = Find-Claude
if (-not $claude) {
  Info 'Installing Claude Code with the official installer from claude.ai...'
  & powershell -NoProfile -ExecutionPolicy Bypass -Command 'irm https://claude.ai/install.ps1 | iex'
  $claude = Find-Claude
  if (-not $claude) { Bad 'Claude Code could not be installed. Open PowerShell and type:  irm https://claude.ai/install.ps1 | iex   then run SETUP.cmd again.'; Finish 1 }
}
Ok "Claude Code $((& $claude --version) -replace ' \(Claude Code\)','')"

# ---------- 5. Signing in ----------
Step 5 'Signing in to Claude'
function Auth-Status { try { return (& $claude auth status --json | Out-String | ConvertFrom-Json) } catch { return $null } }
$st = Auth-Status
if (-not ($st -and $st.loggedIn)) {
  if ($NonInteractive) { Bad 'Not signed in to Claude (run SETUP.cmd normally to sign in).'; Finish 1 }
  Write-Host ''
  Write-Host '   A browser window opens now. Sign in with YOUR Claude account (Pro or Max plan),' -ForegroundColor White
  Write-Host '   click "Authorize", then come back to this window.' -ForegroundColor White
  Write-Host ''
  & $claude auth login --claudeai
  $st = Auth-Status
}
if (-not ($st -and $st.loggedIn)) { Bad 'Not signed in. Run SETUP.cmd again and finish the sign-in in the browser.'; Finish 1 }
if ($st.authMethod -ne 'claude.ai') { Warn "Signed in with $($st.authMethod): usage is billed per request. A Claude Pro or Max account is expected (claude auth logout, then SETUP.cmd again)." }
elseif (@('pro', 'max', 'team', 'enterprise') -notcontains ([string]$st.subscriptionType).ToLower()) { Bad "Your Claude plan ($($st.subscriptionType)) does not include Claude Code. A Pro or Max plan is needed: https://claude.ai/upgrade"; Finish 1 }
else { Ok "Signed in ($($st.subscriptionType) plan)" }

# ---------- 6. Full check ----------
Step 6 'Final check (asks Claude for one tiny answer)'
& $node (Join-Path $Root 'setup\doctor.js') --claude-test --report (Join-Path $Root 'setup-report.txt')
$failed = $LASTEXITCODE -ne 0
if ($failed) { Write-Host ''; Bad 'Something above is marked [FAIL]. Follow the arrow (->) under it, then run SETUP.cmd again.'; Info 'The result is saved in setup-report.txt: send that file if you need help.'; Finish 1 }

# ---------- 7. Shortcut and start ----------
Step 7 'Desktop shortcut'
$launcher = Join-Path $Root 'Al-Marketer Control Center.cmd'
if (-not $NoShortcut) {
  $desk = if ($DesktopDir) { $DesktopDir } else { [Environment]::GetFolderPath('Desktop') }
  $lnk = Join-Path $desk 'Al-Marketer Control Center.lnk'
  $shell = New-Object -ComObject WScript.Shell
  $s = $shell.CreateShortcut($lnk)
  $s.TargetPath = $launcher
  $s.WorkingDirectory = $Root
  $s.Description = 'Al-Marketer Control Center'
  $ico = Join-Path $Root 'setup\al-marketer.ico'
  if (Test-Path -LiteralPath $ico) { $s.IconLocation = "$ico,0" }
  $s.Save()
  Ok "Shortcut on the Desktop: $lnk"
}
Write-Host ''
Write-Host '================================================================' -ForegroundColor Green
Write-Host ' Setup finished. Everything is ready.' -ForegroundColor Green
Write-Host ' From now on: double-click "Al-Marketer Control Center" on the Desktop.' -ForegroundColor Green
Write-Host '================================================================' -ForegroundColor Green
if (-not $NoStart) {
  Info 'Starting the Control Center now (a new window opens; your browser opens the app)...'
  Start-Process -FilePath $launcher -WorkingDirectory $Root
}
Finish 0
