[CmdletBinding()]
param(
  [switch]$Automatic,
  [switch]$CheckOnly,
  [string]$StateRoot
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')
. (Join-Path $PSScriptRoot 'update-core.ps1')

function Show-DreamSkinUpdateMessage {
  param(
    [Parameter(Mandatory = $true)][string]$Message,
    [System.Windows.Forms.MessageBoxIcon]$Icon = [System.Windows.Forms.MessageBoxIcon]::Information
  )
  [void][System.Windows.Forms.MessageBox]::Show(
    $Message,
    'Codex Dream Skin Update',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    $Icon
  )
}

function Confirm-DreamSkinUpdateInstall {
  param([Parameter(Mandatory = $true)][object]$Update)
  $message = "Codex Dream Skin $($Update.LatestVersion) is available.`r`n`r`n" +
    "The installer will be downloaded, verified with the release update manifest's SHA-256, and started. " +
    "Codex and the Dream Skin tray will close during the update.`r`n`r`nContinue?"
  $result = [System.Windows.Forms.MessageBox]::Show(
    $message,
    'Codex Dream Skin Update',
    [System.Windows.Forms.MessageBoxButtons]::YesNo,
    [System.Windows.Forms.MessageBoxIcon]::Information,
    [System.Windows.Forms.MessageBoxDefaultButton]::Button1
  )
  return $result -eq [System.Windows.Forms.DialogResult]::Yes
}

$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mutex = [System.Threading.Mutex]::new($false, "Local\CodexDreamSkin.$sid.Update")
$acquired = $false
$userAccepted = $false
try {
  try { $acquired = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
  if (-not $acquired) { exit 0 }

  $stateRoot = Get-DreamSkinStateRoot -StateRoot $StateRoot
  Ensure-DreamSkinManagedDirectory -Path $stateRoot -Root $stateRoot
  $updateStatePath = Join-Path $stateRoot 'update-state.json'
  if ($Automatic -and (Test-Path -LiteralPath $updateStatePath -PathType Leaf)) {
    try {
      $updateState = Read-DreamSkinUtf8File -Path $updateStatePath | ConvertFrom-Json -ErrorAction Stop
      $lastCheck = [datetimeoffset]::Parse("$($updateState.lastCheckUtc)")
      if ([datetimeoffset]::UtcNow - $lastCheck -lt [timespan]::FromHours(24)) { exit 0 }
    } catch {
      throw "Dream Skin update state is invalid: $($_.Exception.Message)"
    }
  }

  $manifestPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'assets\version.json'
  $manifest = Read-DreamSkinVersionManifest -Path $manifestPath
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $release = Get-DreamSkinLatestRelease -Repository $manifest.Repository
  $update = Resolve-DreamSkinReleaseUpdate -Release $release -CurrentVersion $manifest.Version `
    -Repository $manifest.Repository
  $stateJson = [ordered]@{
    schemaVersion = 1
    lastCheckUtc = [datetimeoffset]::UtcNow.ToString('o')
    currentVersion = $manifest.VersionText
    latestVersion = $update.LatestVersion
  } | ConvertTo-Json
  Write-DreamSkinUtf8FileAtomically -Path $updateStatePath -Content ($stateJson + "`r`n")

  if (-not $update.Available) {
    if (-not $Automatic) {
      Show-DreamSkinUpdateMessage -Message "Codex Dream Skin $($manifest.VersionText) is already the latest stable version."
    }
    exit 0
  }
  if ($CheckOnly) {
    Write-Output ($update | ConvertTo-Json -Depth 4)
    exit 0
  }
  if (-not (Confirm-DreamSkinUpdateInstall -Update $update)) { exit 0 }
  $userAccepted = $true

  $updatesRoot = Join-Path $stateRoot 'updates'
  Ensure-DreamSkinManagedDirectory -Path $updatesRoot -Root $stateRoot
  $versionRoot = Join-Path $updatesRoot $update.LatestVersion
  Ensure-DreamSkinManagedDirectory -Path $versionRoot -Root $stateRoot
  $installerPath = Join-Path $versionRoot $update.AssetName
  if (-not (Test-DreamSkinInstallerDigest -Path $installerPath -ExpectedSha256 $update.Sha256)) {
    $partialPath = "$installerPath.partial"
    Remove-Item -LiteralPath $partialPath -Force -ErrorAction SilentlyContinue
    try {
      Invoke-WebRequest -Uri $update.DownloadUrl -OutFile $partialPath -UseBasicParsing -TimeoutSec 120 `
        -Headers @{ 'User-Agent' = 'Codex-Dream-Skin-Updater' } -ErrorAction Stop
      if (-not (Test-DreamSkinInstallerDigest -Path $partialPath -ExpectedSha256 $update.Sha256)) {
        throw 'Downloaded Dream Skin installer SHA-256 does not match the release update manifest.'
      }
      Move-Item -LiteralPath $partialPath -Destination $installerPath -Force -ErrorAction Stop
    } finally {
      Remove-Item -LiteralPath $partialPath -Force -ErrorAction SilentlyContinue
    }
  }
  if (-not (Test-DreamSkinInstallerDigest -Path $installerPath -ExpectedSha256 $update.Sha256)) {
    throw 'Dream Skin installer verification failed after download.'
  }

  $setup = Start-Process -FilePath $installerPath -ArgumentList @(
    '/SILENT', '/NORESTART', '/CLOSEAPPLICATIONS'
  ) -Wait -PassThru
  if ($setup.ExitCode -ne 0) {
    throw "Dream Skin installer failed: exit $($setup.ExitCode)"
  }
  Show-DreamSkinUpdateMessage -Message "Codex Dream Skin $($update.LatestVersion) was installed successfully."
} catch {
  if (-not $Automatic -or $userAccepted) {
    Show-DreamSkinUpdateMessage -Message $_.Exception.Message -Icon ([System.Windows.Forms.MessageBoxIcon]::Error)
  }
  throw
} finally {
  if ($acquired) { try { $mutex.ReleaseMutex() } catch {} }
  $mutex.Dispose()
}
