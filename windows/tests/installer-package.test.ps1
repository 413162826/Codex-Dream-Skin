[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$InstallerPath,
  [string]$TestBaseDirectory = ([System.IO.Path]::GetTempPath())
)

$ErrorActionPreference = 'Stop'
$installer = [System.IO.Path]::GetFullPath($InstallerPath)
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
  throw "Installer not found: $installer"
}
$versionInfo = (Get-Item -LiteralPath $installer).VersionInfo
if ($versionInfo.ProductVersion.Trim() -ne '1.4.2') {
  throw "Installer product version is unexpected: $($versionInfo.ProductVersion)"
}

$testBase = [System.IO.Path]::GetFullPath($TestBaseDirectory).TrimEnd('\')
if (-not (Test-Path -LiteralPath $testBase -PathType Container)) {
  throw "Package-test base directory not found: $testBase"
}
$testRoot = Join-Path $testBase "codex-dream-skin-package-test-$PID-$([guid]::NewGuid().ToString('N'))"
$installRoot = Join-Path $testRoot 'app'
$installLog = Join-Path $testRoot 'install.log'
$uninstallLog = Join-Path $testRoot 'uninstall.log'
New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
  $setup = Start-Process -FilePath $installer -ArgumentList @(
    '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/DREAMSKINPACKAGETEST=1',
    "/DIR=$installRoot", "/LOG=$installLog"
  ) -WindowStyle Hidden -Wait -PassThru
  if ($setup.ExitCode -ne 0) { throw "Installer package test failed: exit $($setup.ExitCode)" }
  foreach ($required in @(
    'package-test.marker',
    'package-run.marker',
    'payload\assets\version.json',
    'payload\scripts\install-dream-skin.ps1',
    'payload\scripts\update-dream-skin.ps1',
    'payload\scripts\uninstall-dream-skin.ps1',
    'unins000.exe'
  )) {
    if (-not (Test-Path -LiteralPath (Join-Path $installRoot $required) -PathType Leaf)) {
      throw "Installed package is missing: $required"
    }
  }

  $uninstaller = Join-Path $installRoot 'unins000.exe'
  $uninstall = Start-Process -FilePath $uninstaller -ArgumentList @(
    '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/LOG=$uninstallLog"
  ) -WindowStyle Hidden -Wait -PassThru
  if ($uninstall.ExitCode -ne 0) { throw "Uninstaller package test failed: exit $($uninstall.ExitCode)" }
  $deadline = [datetime]::UtcNow.AddSeconds(5)
  while ((Test-Path -LiteralPath $installRoot) -and [datetime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 200
  }
  if (Test-Path -LiteralPath $installRoot) {
    $remaining = @(Get-ChildItem -LiteralPath $installRoot -Recurse -Force -ErrorAction SilentlyContinue |
      ForEach-Object { $_.FullName.Substring($installRoot.Length).TrimStart('\') })
    throw "Uninstaller package test left the application directory behind: $($remaining -join ', ')"
  }
  Write-Host 'PASS: Windows Setup.exe installed and uninstalled its isolated package payload.'
} finally {
  if (Test-Path -LiteralPath $testRoot) {
    $resolved = [System.IO.Path]::GetFullPath($testRoot)
    $testPrefix = $testBase + '\'
    if (-not $resolved.StartsWith($testPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove unexpected package-test path: $resolved"
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue
  }
}
