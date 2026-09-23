# Stop the local server, rebuild, start it again, wait until it serves.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/audit/71-rebuild.ps1
#
# Written in PowerShell rather than bash because the process lookup needs
# Win32_Process, and nesting that inside a bash heredoc mangled the quoting
# badly enough that the kill silently did nothing and the build then failed.
#
# `npx next build` rather than `npm run build`: the npm script runs
# `prisma generate` first, which fails with EPERM whenever anything still holds
# node_modules/.prisma (the gotcha in CLAUDE.md). The Prisma schema is not being
# touched in this work, so the already-generated client stays valid.

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')

Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*AFFHAN*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 3

if (-not $env:SKIP_BUILD) {
  Write-Output 'building...'
  $build = & npx next build 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Output 'BUILD FAILED'
    $build | Select-Object -Last 25
    exit 1
  }
}

# npx is a .cmd shim and Start-Process cannot exec it directly
# ("%1 is not a valid Win32 application") - go through the command processor.
Start-Process -FilePath $env:ComSpec -ArgumentList '/c', 'npx next start -p 3000' `
  -NoNewWindow -RedirectStandardOutput 'C:\Windows\Temp\next3000.out' `
  -RedirectStandardError 'C:\Windows\Temp\next3000.err'

for ($i = 0; $i -lt 60; $i++) {
  try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3000/' -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -eq 200) { Write-Output 'serving (200)'; exit 0 }
  } catch { }
  Start-Sleep -Seconds 2
}
Write-Output 'SERVER DID NOT COME UP'
Get-Content 'C:\Windows\Temp\next3000.err' -Tail 20
exit 1
