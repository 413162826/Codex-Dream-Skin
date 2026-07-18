[CmdletBinding()]
param([switch]$PurgeUserData, [string]$StateRoot)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

$stateRoot = Get-DreamSkinStateRoot -StateRoot $StateRoot
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$restoreScript = Join-Path $PSScriptRoot 'restore-dream-skin.ps1'
& $powershell -NoProfile -ExecutionPolicy Bypass -File $restoreScript -Uninstall `
  -RestoreBaseTheme -ForceRestart -NoRelaunch -StateRoot $stateRoot
if ($LASTEXITCODE -ne 0) { throw "Dream Skin restore failed during uninstall: exit $LASTEXITCODE" }

$engine = Get-DreamSkinRuntimeEnginePaths -StateRoot $stateRoot
if (Test-Path -LiteralPath $engine.Root) {
  Remove-DreamSkinRuntimeTree -Path $engine.Root -StateRoot $stateRoot
}
if ($PurgeUserData) {
  Remove-DreamSkinStateTree -StateRoot $stateRoot
}
