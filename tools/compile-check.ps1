# 不開 Unity，用 dotnet 對專案參考的 Unity DLL 編譯 Assembly-CSharp 與 Assembly-CSharp-Editor。
# Odyssey.Core（asmdef）的原始碼直接併入 Assembly-CSharp 一起編譯，模擬 asmdef 的自動引用。
# 用法：powershell -File tools/compile-check.ps1   通過時最後輸出「建置成功」/ Build succeeded。
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $env:TEMP 'odyssey-compilecheck'
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force $out | Out-Null

$all = Get-ChildItem -Recurse -Filter *.cs -Path (Join-Path $root 'Assets') |
    Where-Object { $_.FullName -notmatch '\\TextMesh Pro\\' -and $_.FullName -notmatch '\\Tests\\' }
$runtime = $all | Where-Object { $_.FullName -notmatch '\\Editor\\' }
$editor = $all | Where-Object { $_.FullName -match '\\Editor\\' }

function Make($name, $files) {
    $text = Get-Content -Raw -Encoding UTF8 (Join-Path $root "$name.csproj")
    $text = [regex]::Replace($text, '\s*<Compile Include="[^"]*" />', '')
    $text = [regex]::Replace($text, '\s*<ProjectReference Include="Odyssey[^"]*"\s*/>', '')
    $text = [regex]::Replace($text, '(?s)\s*<ProjectReference Include="Odyssey[^"]*">.*?</ProjectReference>', '')
    $text = $text.Replace('<HintPath>Library', "<HintPath>$root\Library").Replace('<HintPath>Assets', "<HintPath>$root\Assets")
    $text = $text.Replace('<ProjectReference Include="Assembly-CSharp.csproj"', "<ProjectReference Include=`"$out\Assembly-CSharp.csproj`"")
    $items = ($files | ForEach-Object { "<Compile Include=`"$($_.FullName)`" />" }) -join ''
    $text = $text.Replace('</Project>', "<ItemGroup>$items</ItemGroup></Project>")
    Set-Content -Encoding UTF8 (Join-Path $out "$name.csproj") $text
}
Make 'Assembly-CSharp' $runtime
Make 'Assembly-CSharp-Editor' $editor

Push-Location $out
try { dotnet build Assembly-CSharp-Editor.csproj -nologo -v q -p:OutputPath="$out\bin" }
finally { Pop-Location }
exit $LASTEXITCODE
