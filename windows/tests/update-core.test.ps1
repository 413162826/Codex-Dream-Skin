[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root 'scripts\config-utf8.ps1')
. (Join-Path $root 'scripts\update-core.ps1')

$manifest = Read-DreamSkinVersionManifest -Path (Join-Path $root 'assets\version.json')
if ($manifest.VersionText -cne '1.4.1' -or $manifest.Repository -cne '413162826/Codex-Dream-Skin') {
  throw 'Windows version manifest did not load the expected stable release identity.'
}

$assetName = 'Codex-Dream-Skin-Windows-v1.5.0-Setup.exe'
$validRelease = [pscustomobject](New-DreamSkinUpdateManifest -Version '1.5.0' `
  -Repository $manifest.Repository -AssetName $assetName -Sha256 ('a' * 64) -Size 1024)
$update = Resolve-DreamSkinReleaseUpdate -Release $validRelease -CurrentVersion $manifest.Version `
  -Repository $manifest.Repository
if (-not $update.Available -or $update.LatestVersion -cne '1.5.0' -or $update.Sha256 -cne ('a' * 64)) {
  throw 'Valid Windows installer release was not accepted.'
}

$sameAsset = 'Codex-Dream-Skin-Windows-v1.4.1-Setup.exe'
$sameRelease = [pscustomobject](New-DreamSkinUpdateManifest -Version '1.4.1' `
  -Repository $manifest.Repository -AssetName $sameAsset -Sha256 ('b' * 64) -Size 1024)
$same = Resolve-DreamSkinReleaseUpdate -Release $sameRelease -CurrentVersion $manifest.Version `
  -Repository $manifest.Repository
if ($same.Available -or $same.LatestVersion -cne '1.4.1') {
  throw 'Current Windows release was incorrectly treated as an update.'
}

foreach ($mutation in @('digest', 'url', 'asset', 'channel', 'tag', 'releaseUrl', 'schema', 'size')) {
  $copy = $validRelease | ConvertTo-Json -Depth 6 | ConvertFrom-Json
  switch ($mutation) {
    'digest' { $copy.sha256 = '' }
    'url' { $copy.downloadUrl = 'https://example.invalid/setup.exe' }
    'asset' { $copy.assetName = 'unexpected.exe' }
    'channel' { $copy.channel = 'preview' }
    'tag' { $copy.tag = 'windows-v9.9.9' }
    'releaseUrl' { $copy.releaseUrl = 'https://example.invalid/release' }
    'schema' { $copy.schemaVersion = 2 }
    'size' { $copy.size = 0 }
  }
  $rejected = $false
  try {
    $null = Resolve-DreamSkinReleaseUpdate -Release $copy -CurrentVersion $manifest.Version `
      -Repository $manifest.Repository
  } catch { $rejected = $true }
  if (-not $rejected) { throw "Unsafe Windows update mutation was accepted: $mutation" }
}

$temporary = Join-Path ([System.IO.Path]::GetTempPath()) "dream-skin-update-digest-$PID-$([guid]::NewGuid().ToString('N'))"
try {
  [System.IO.File]::WriteAllText($temporary, 'verified update payload')
  $digest = (Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash
  if (-not (Test-DreamSkinInstallerDigest -Path $temporary -ExpectedSha256 $digest)) {
    throw 'Matching Windows installer digest was rejected.'
  }
  if (Test-DreamSkinInstallerDigest -Path $temporary -ExpectedSha256 ('0' * 64)) {
    throw 'Mismatched Windows installer digest was accepted.'
  }
} finally {
  Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
}

Write-Host 'PASS: Windows update manifest identity, version ordering, asset URL, and SHA-256 validation.'
