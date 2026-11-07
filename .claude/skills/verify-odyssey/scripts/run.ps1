# Launch Unity, play the blind-cave game with injected keyboard/mouse, save evidence, close Unity.
# Usage: powershell -ExecutionPolicy Bypass -File .claude/skills/verify-odyssey/scripts/run.ps1 [-Journeys all|menu-start,pause,...] [-TimeoutSec 600]
# Evidence: Logs/verify/<timestamp>/ (result.json, NN-*.png, editor.log). Exit 0 = all checks passed.
param([string]$Journeys = 'all', [int]$TimeoutSec = 600, [switch]$SkipDoctor)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path

if (-not $SkipDoctor) {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'doctor.ps1')
    if ($LASTEXITCODE -ne 0) { Write-Host 'doctor failed; not launching'; exit 3 }
}

$version = ((Get-Content (Join-Path $root 'ProjectSettings\ProjectVersion.txt') | Select-String '^m_EditorVersion:').Line -split ':\s*')[1].Trim()
$unity = "C:\Program Files\Unity\Hub\Editor\$version\Editor\Unity.exe"
$out = Join-Path $root ('Logs\verify\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force $out | Out-Null

$argv = @('-projectPath', "`"$root`"", '-executeMethod', 'OdysseyVerify.Run',
    '-verifyOut', "`"$out`"", '-verifyJourneys', $Journeys, '-logFile', "`"$out\editor.log`"")
Write-Host "launching Unity $version (a Unity window will open and close by itself)"
Write-Host "evidence -> $out"
$p = Start-Process -FilePath $unity -ArgumentList $argv -PassThru
if (-not $p.WaitForExit($TimeoutSec * 1000)) {
    Write-Host "timeout after $TimeoutSec s; stopping the Unity we started (pid $($p.Id))"
    Stop-Process -Id $p.Id -Force
    exit 4
}

$resultFile = Join-Path $out 'result.json'
if (-not (Test-Path $resultFile)) {
    Write-Host "no result.json (Unity exit $($p.ExitCode)); read $out\editor.log"
    exit 5
}
$r = Get-Content -Raw -Encoding UTF8 $resultFile | ConvertFrom-Json
foreach ($c in $r.setup) { Write-Host ("  [{0}] setup: {1} {2}" -f ($(if ($c.pass) {'PASS'} else {'FAIL'})), $c.what, $c.detail) }
foreach ($j in $r.journeys) {
    Write-Host ("{0} {1}" -f ($(if ($j.passed) {'PASS'} else {'FAIL'})), $j.name)
    foreach ($c in $j.checks) { Write-Host ("  [{0}] {1} {2}" -f ($(if ($c.pass) {'PASS'} else {'FAIL'})), $c.what, $c.detail) }
}
foreach ($n in $r.notes) { Write-Host "  note: $n" }
if ($r.error) { Write-Host "ERROR: $($r.error)" }
Write-Host "exit $($r.exitCode); screenshots: $($r.shots -join ', ')"
exit $r.exitCode
