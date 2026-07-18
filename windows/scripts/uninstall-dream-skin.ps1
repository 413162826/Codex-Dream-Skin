[CmdletBinding()]
param([switch]$PurgeUserData)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$restoreScript = Join-Path $PSScriptRoot 'restore-dream-skin.ps1'
& $powershell -NoProfile -ExecutionPolicy Bypass -File $restoreScript -Uninstall `
  -RestoreBaseTheme -ForceRestart -NoRelaunch
if ($LASTEXITCODE -ne 0) { throw "Dream Skin restore failed during uninstall: exit $LASTEXITCODE" }

$stateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$engine = Get-DreamSkinRuntimeEnginePaths -StateRoot $stateRoot
if (Test-Path -LiteralPath $engine.Root) {
  Remove-DreamSkinRuntimeTree -Path $engine.Root -StateRoot $stateRoot
}
if ($PurgeUserData) {
  Remove-DreamSkinStateTree -StateRoot $stateRoot
}
