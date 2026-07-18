# Codex Dream Skin for Windows

<p align="center">
  <a href="./README.md">中文</a> · <strong>English</strong>
</p>

Codex Dream Skin loads an external theme into the official Codex Windows desktop app through loopback CDP. The native sidebar, project picker, task content, and composer remain interactive. The tool does not modify WindowsApps, `app.asar`, or the app signature.

## Requirements

- The official `OpenAI.Codex` app installed from Microsoft Store and registered for the current user.
- Node.js 22 or newer, with `node.exe` available on `PATH`.
- Windows PowerShell 5.1 or newer.

Installation and normal use do not require administrator access or ownership changes under WindowsApps.

## Install

Download `Codex-Dream-Skin-Windows-*-Setup.exe` from [Releases](https://github.com/413162826/Codex-Dream-Skin/releases/latest) and run it. Program files can be installed in any directory selected by the user; themes and runtime state remain in the current user's local application-data directory. Setup closes the Dream Skin tray and Codex, validates the official Codex Store package and Node.js, deploys the managed runtime, and registers launch, update, and uninstall entries in the Start menu.

Source installation is intended only for development and troubleshooting. Open PowerShell in the repository's `windows` directory and run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-dream-skin.ps1
```

The source installer saves a recoverable appearance baseline and initializes the local theme store. By default it also creates these shortcuts:

- `Codex Dream Skin`: launch or reapply the skin.
- `Codex Dream Skin - Tray`: open the system tray theme controls.
- `Codex Dream Skin - Restore`: restore the stock appearance and close the saved CDP session.

`Bypass` in the install command applies only to that user-initiated installer process. The installer verifies the runtime copy with SHA-256, then clears download-zone markers only from managed PowerShell copies under `%LOCALAPPDATA%\CodexDreamSkin\engine`. Daily shortcuts use `RemoteSigned` and do not override system or enterprise Group Policy.

Pass `-Port` during installation to use a fixed custom port. Valid ports range from `1024` through `65535`.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-dream-skin.ps1 -Port 9444
```

## Update

The EXE installation checks for the latest stable release at most once per day when the tray starts. You can also choose **Check for Updates** from the tray or Start menu. The updater reads a fixed manifest asset from the latest GitHub Release instead of consuming the anonymous REST API quota. An update downloads only after user confirmation and starts only when its version, repository, URL, and manifest SHA-256 all match. Updating atomically replaces the managed runtime without deleting the active theme, saved themes, or imported images.

Users who installed the `windows-v1.3.3` or `windows-v1.4.0` ZIP must download and run the new `Setup.exe` once. Future releases can then use the built-in updater.

Source installations can still exit the tray and Codex, run `git pull`, and rerun the install command.

## Launch and verify

The `Codex Dream Skin` shortcut is the recommended launcher. It asks for confirmation before restarting an open Codex window.

Command-line launch:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-dream-skin.ps1 -PromptRestart
```

Run verification after launch:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-dream-skin.ps1 `
  -ScreenshotPath "$env:TEMP\codex-dream-skin.png"
```

The verification script confirms:

- The CDP endpoint is bound to loopback and belongs to the current official Codex package.
- The current renderer has loaded the expected skin version.
- The native sidebar and composer remain present.
- The decorative skin layer does not intercept pointer events.
- When the current route is home, the themed home structure has loaded.

Next, use the generated screenshot to check horizontal overflow and text contrast. On both the home and normal task routes, manually check the project menu and composer interaction. See [`references/qa-inventory.md`](./references/qa-inventory.md) for the complete visual checklist.

## Change and save themes

Open `Codex Dream Skin - Tray` to:

- Import a PNG, JPEG, WebP, GIF, or AVIF background.
- Save the active theme and switch through saved themes.
- Pause or resume the skin.
- Reapply the theme or fully restore Codex.

Import a UI-free wallpaper rather than a preview containing a window, sidebar, composer, text, or buttons. Images may be at most 16 MB, 16384 pixels on either side, and 50 million total pixels.

The compact **Appearance** button in the lower-right corner of Codex provides live, in-app controls for:

- Surface transparency, wallpaper brightness, and wallpaper sharpness.
- Ambient motion and long-form reading enhancement.
- Unified wallpaper management with four bundled presets—Gothic Void, Fortune Workshop, Red Horizon, and Sage Conservatory—plus custom PNG, JPEG, WebP, GIF, or AVIF uploads.

Appearance values persist in the current Codex profile. The selected preset or custom wallpaper is stored locally under the active theme ID and survives renderer reloads. **Restore current theme** removes that override and returns to the wallpaper selected by the tray or theme store.

## Restore and uninstall

EXE installations can be removed from Windows **Installed apps** or the Start menu. The uninstaller restores the stock Codex appearance, stops the Dream Skin runtime, and removes program files. It asks whether to preserve personal theme data or also delete the active theme, saved themes, and imported images.

Source installations can use the restore command below.

Restore the stock appearance. If Codex is running, confirm its closure and relaunch:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\restore-dream-skin.ps1 `
  -RestoreBaseTheme -PromptRestart
```

Add `-Uninstall` to also remove the shortcuts created by Dream Skin:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\restore-dream-skin.ps1 `
  -RestoreBaseTheme -PromptRestart -Uninstall
```

`-RecoverConfigBackup` restores the complete pre-install `config.toml` backup and saves the current configuration first. Reserve it for a damaged configuration that normal `-RestoreBaseTheme` recovery cannot resolve.

## Files and logs

| Purpose | Path |
|---------|------|
| Dream Skin state root | `%LOCALAPPDATA%\CodexDreamSkin` |
| Active theme | `%LOCALAPPDATA%\CodexDreamSkin\active-theme` |
| Saved themes | `%LOCALAPPDATA%\CodexDreamSkin\themes` |
| Imported image archive | `%LOCALAPPDATA%\CodexDreamSkin\images` |
| Update download cache | `%LOCALAPPDATA%\CodexDreamSkin\updates` |
| EXE installation files | `%LOCALAPPDATA%\Programs\CodexDreamSkin` |
| Session state | `%LOCALAPPDATA%\CodexDreamSkin\state.json` |
| Injector log | `%LOCALAPPDATA%\CodexDreamSkin\injector.log` |
| Injector error log | `%LOCALAPPDATA%\CodexDreamSkin\injector-error.log` |
| Verification log | `%LOCALAPPDATA%\CodexDreamSkin\verify.log` |
| Codex configuration | `%USERPROFILE%\.codex\config.toml` |

See [`../docs/platforms.md`](../docs/platforms.md) for the complete platform path reference.

## Troubleshooting

### Node.js is missing

Run `node --version`, confirm that it reports version 22 or newer, and reopen PowerShell so an updated `PATH` takes effect.

### The official Codex package is missing

Run:

```powershell
Get-AppxPackage -Name OpenAI.Codex
```

The scripts accept only a registered official Store package. They do not launch Codex from an arbitrary executable path.

### The installer asks you to close Codex

Close every Codex window and run the installer again. Installation requires stable app and configuration state.

### Antivirus reports the old tray shortcut

Older tray shortcuts combined hidden PowerShell with `ExecutionPolicy Bypass`, which can trigger behavior-based LNK detections. Do not whitelist the detection blindly. Update the source and rerun the installer so the shortcuts use `RemoteSigned`. If the updated shortcut is still detected, leave it quarantined and report the antivirus product, version, detection name, and shortcut properties without sharing secrets or private data.

### The port is occupied

When `-Port` is omitted, the launcher searches for a free port beginning at `9335`. If another process owns an explicitly requested port, choose a different port rather than stopping an unknown listener.

### Verification cannot find a CDP endpoint

Launch Codex through the `Codex Dream Skin` shortcut, then run verification. A normal Codex launch does not open the debug session used by Dream Skin.

### The skin stops working after a Codex update

Run the installer and launch shortcut again. The scripts rediscover the currently registered Store package instead of trusting an executable path from an older app version.

Open the repository's [new issue page](https://github.com/Fei-Away/Codex-Dream-Skin/issues/new/choose) and choose the bug form when reporting a problem. Include the Windows version, Codex source, reproduction steps, and relevant log lines. Remove secrets, `auth.json`, relay tokens, and private conversation content.

## Security boundaries

- CDP binds only to `127.0.0.1`. Avoid untrusted local software while the skin is active.
- The tool does not modify the official Codex installation, WindowsApps, `app.asar`, or signatures.
- It does not write API keys, Base URLs, or model provider settings.
- Restore controls only Codex processes that pass package identity, executable path, and recorded session checks.

Maintainer and agent constraints live in [`SKILL.md`](./SKILL.md). See [`references/runtime-notes.md`](./references/runtime-notes.md) for deeper runtime troubleshooting.
