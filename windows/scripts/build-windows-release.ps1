[CmdletBinding()]
param(
  [string]$OutputDirectory,
  [string]$InnoCompiler
)

$ErrorActionPreference = 'Stop'
$windowsRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'config-utf8.ps1')
. (Join-Path $PSScriptRoot 'update-core.ps1')

$manifest = Read-DreamSkinVersionManifest -Path (Join-Path $windowsRoot 'assets\version.json')
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $windowsRoot 'release' }
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

$candidates = @()
if ($InnoCompiler) { $candidates += $InnoCompiler }
$candidates += @(
  (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
  (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
)
$iscc = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (-not $iscc) { throw 'Inno Setup 6 compiler was not found. Install JRSoftware.InnoSetup first.' }

$outputBase = "Codex-Dream-Skin-Windows-v$($manifest.VersionText)-Setup"
$script = Join-Path $windowsRoot 'installer\CodexDreamSkin.iss'
$compilerOutput = @(& $iscc "/DMyAppVersion=$($manifest.VersionText)" "/DMySourceRoot=$windowsRoot" `
  "/DMyOutputDir=$outputRoot" "/DMyOutputBaseFilename=$outputBase" $script)
$compilerExitCode = $LASTEXITCODE
foreach ($line in $compilerOutput) { Write-Host $line }
if ($compilerExitCode -ne 0) { throw "Inno Setup build failed: exit $compilerExitCode" }

$installer = Join-Path $outputRoot "$outputBase.exe"
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
  throw "Inno Setup did not create the expected installer: $installer"
}
$hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
$checksum = Join-Path $outputRoot "$outputBase.exe.sha256"
$updateManifestPath = Join-Path $outputRoot 'windows-update.json'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($checksum, "$hash  $outputBase.exe`n", $utf8NoBom)
$updateManifest = New-DreamSkinUpdateManifest -Version $manifest.VersionText `
  -Repository $manifest.Repository -AssetName "$outputBase.exe" -Sha256 $hash `
  -Size (Get-Item -LiteralPath $installer).Length
[System.IO.File]::WriteAllText(
  $updateManifestPath,
  (($updateManifest | ConvertTo-Json -Depth 3) + "`n"),
  $utf8NoBom
)

Write-Output ([pscustomobject]@{
  Version = $manifest.VersionText
  Installer = $installer
  Checksum = $checksum
  UpdateManifest = $updateManifestPath
  Sha256 = $hash
  Signature = (Get-AuthenticodeSignature -LiteralPath $installer).Status.ToString()
} | ConvertTo-Json -Depth 3)
