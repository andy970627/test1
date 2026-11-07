# Read-only check: is this machine ready to drive the Odyssey blind-cave game?
# Usage: powershell -ExecutionPolicy Bypass -File .claude/skills/verify-odyssey/scripts/doctor.ps1 [-SkipCompile]
# Exit 0 = ready. Any other exit = read the FAIL lines.
param([switch]$SkipCompile)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$version = ((Get-Content (Join-Path $root 'ProjectSettings\ProjectVersion.txt') | Select-String '^m_EditorVersion:').Line -split ':\s*')[1].Trim()
$unity = "C:\Program Files\Unity\Hub\Editor\$version\Editor\Unity.exe"
$bad = 0
function Report($ok, $what) {
    if ($ok) { Write-Host "OK   $what" } else { Write-Host "FAIL $what"; $script:bad++ }
}

Report (Test-Path $unity) "Unity $version installed at $unity"
Report (Test-Path (Join-Path $root 'Assets\Odyssey\Editor\OdysseyVerify.cs')) 'runner Assets/Odyssey/Editor/OdysseyVerify.cs present'

# The same project can only be open in one Unity at a time.
$open = Get-CimInstance Win32_Process -Filter "Name='Unity.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.ToLower().Contains($root.ToLower()) }
Report (-not $open) 'project is not open in another Unity window (close it first if FAIL)'
$lock = Join-Path $root 'Temp\UnityLockfile'
$free = $true
if (Test-Path $lock) {
    try { $s = [IO.File]::Open($lock, 'Open', 'ReadWrite', 'None'); $s.Close() } catch { $free = $false }
}
Report $free 'Temp/UnityLockfile not held'

if (-not $SkipCompile) {
    $null = & powershell -ExecutionPolicy Bypass -File (Join-Path $root 'tools\compile-check.ps1')
    Report ($LASTEXITCODE -eq 0) 'scripts compile (tools/compile-check.ps1); a compile error would stop Unity at a Safe Mode dialog'
}

if ($bad -eq 0) { Write-Host 'READY' } else { Write-Host "NOT READY ($bad problem(s))" }
exit $bad
