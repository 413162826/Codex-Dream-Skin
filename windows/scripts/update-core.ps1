[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function ConvertTo-DreamSkinReleaseVersion {
  param([Parameter(Mandatory = $true)][string]$Value)
  $trimmed = $Value.Trim()
  if ($trimmed -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') {
    throw "Dream Skin release version must use x.y.z: $Value"
  }
  return [version]$trimmed
}

function Read-DreamSkinVersionManifest {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Dream Skin version manifest not found: $Path"
  }
  $manifest = Read-DreamSkinUtf8File -Path $Path | ConvertFrom-Json -ErrorAction Stop
  if ($null -eq $manifest -or -not $manifest.version -or -not $manifest.repository -or
    "$($manifest.channel)" -cne 'stable') {
    throw 'Dream Skin version manifest is incomplete or not on the stable channel.'
  }
  $version = ConvertTo-DreamSkinReleaseVersion -Value "$($manifest.version)"
  if ("$($manifest.repository)" -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') {
    throw 'Dream Skin version manifest contains an invalid repository.'
  }
  return [pscustomobject]@{
    Version = $version
    VersionText = $version.ToString(3)
    Channel = 'stable'
    Repository = "$($manifest.repository)"
  }
}

function Get-DreamSkinLatestRelease {
  param([Parameter(Mandatory = $true)][string]$Repository)
  if ($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') {
    throw 'Dream Skin update repository is invalid.'
  }
  $headers = @{
    Accept = 'application/json'
    'User-Agent' = 'Codex-Dream-Skin-Updater'
  }
  return Invoke-RestMethod -Uri "https://github.com/$Repository/releases/latest/download/windows-update.json" `
    -Headers $headers -Method Get -TimeoutSec 20 -UseBasicParsing -ErrorAction Stop
}

function New-DreamSkinUpdateManifest {
  param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$Repository,
    [Parameter(Mandatory = $true)][string]$AssetName,
    [Parameter(Mandatory = $true)][string]$Sha256,
    [Parameter(Mandatory = $true)][int64]$Size
  )
  $releaseVersion = ConvertTo-DreamSkinReleaseVersion -Value $Version
  if ($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') {
    throw 'Dream Skin update repository is invalid.'
  }
  $versionText = $releaseVersion.ToString(3)
  $tag = "windows-v$versionText"
  $expectedAsset = "Codex-Dream-Skin-Windows-v$versionText-Setup.exe"
  if ($AssetName -cne $expectedAsset) { throw 'Dream Skin update asset name is invalid.' }
  if ($Sha256 -notmatch '^[0-9a-fA-F]{64}$') { throw 'Dream Skin update SHA-256 is invalid.' }
  if ($Size -lt 1 -or $Size -gt 128MB) { throw 'Dream Skin update size is outside the accepted range.' }
  return [ordered]@{
    schemaVersion = 1
    channel = 'stable'
    version = $versionText
    tag = $tag
    releaseUrl = "https://github.com/$Repository/releases/tag/$tag"
    assetName = $expectedAsset
    downloadUrl = "https://github.com/$Repository/releases/download/$tag/$expectedAsset"
    sha256 = $Sha256.ToLowerInvariant()
    size = $Size
  }
}

function Resolve-DreamSkinReleaseUpdate {
  param(
    [Parameter(Mandatory = $true)][object]$Release,
    [Parameter(Mandatory = $true)][version]$CurrentVersion,
    [Parameter(Mandatory = $true)][string]$Repository
  )
  if ($null -eq $Release -or [int]$Release.schemaVersion -ne 1 -or
    "$($Release.channel)" -cne 'stable') {
    throw 'Latest Dream Skin update manifest is missing, invalid, or not stable.'
  }
  if ($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') {
    throw 'Dream Skin update repository is invalid.'
  }
  $latestVersion = ConvertTo-DreamSkinReleaseVersion -Value "$($Release.version)"
  $versionText = $latestVersion.ToString(3)
  $tag = "windows-v$versionText"
  if ("$($Release.tag)" -cne $tag) {
    throw "Latest Dream Skin update tag is invalid: $($Release.tag)"
  }
  $releaseUrl = "https://github.com/$Repository/releases/tag/$tag"
  if ("$($Release.releaseUrl)" -cne $releaseUrl) {
    throw 'Latest Dream Skin release URL does not match the trusted repository and tag.'
  }
  $assetName = "Codex-Dream-Skin-Windows-v$versionText-Setup.exe"
  if ("$($Release.assetName)" -cne $assetName) {
    throw 'Latest Dream Skin installer name is invalid.'
  }
  $expectedUrl = "https://github.com/$Repository/releases/download/$tag/$assetName"
  if ("$($Release.downloadUrl)" -cne $expectedUrl) {
    throw 'Latest Dream Skin installer download URL does not match the trusted repository and tag.'
  }
  if ("$($Release.sha256)" -notmatch '^[0-9a-fA-F]{64}$') {
    throw 'Latest Dream Skin installer does not expose a valid SHA-256 digest.'
  }
  $sha256 = "$($Release.sha256)".ToLowerInvariant()
  if ([int64]$Release.size -lt 1 -or [int64]$Release.size -gt 128MB) {
    throw 'Latest Dream Skin installer size is outside the accepted range.'
  }
  if ($latestVersion -le $CurrentVersion) {
    return [pscustomobject]@{
      Available = $false
      CurrentVersion = $CurrentVersion.ToString(3)
      LatestVersion = $versionText
      ReleaseUrl = $releaseUrl
    }
  }
  return [pscustomobject]@{
    Available = $true
    CurrentVersion = $CurrentVersion.ToString(3)
    LatestVersion = $versionText
    Tag = $tag
    ReleaseUrl = $releaseUrl
    AssetName = $assetName
    DownloadUrl = $expectedUrl
    Sha256 = $sha256
    Size = [int64]$Release.size
  }
}

function Test-DreamSkinInstallerDigest {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$ExpectedSha256
  )
  if ($ExpectedSha256 -notmatch '^[0-9a-fA-F]{64}$') {
    throw 'Expected installer SHA-256 is invalid.'
  }
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256 -ErrorAction Stop).Hash
  return $actual.Equals($ExpectedSha256, [System.StringComparison]::OrdinalIgnoreCase)
}
