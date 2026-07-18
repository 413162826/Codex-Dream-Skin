#ifndef MyAppVersion
  #error MyAppVersion is required
#endif
#ifndef MySourceRoot
  #error MySourceRoot is required
#endif
#ifndef MyOutputDir
  #error MyOutputDir is required
#endif
#ifndef MyOutputBaseFilename
  #error MyOutputBaseFilename is required
#endif
#define MyStateRoot "{localappdata}\CodexDreamSkin"

[Setup]
AppId={{A5C587EA-3172-4CF1-9C3B-96C408B9E462}
AppName=Codex Dream Skin
AppVersion={#MyAppVersion}
AppVerName=Codex Dream Skin {#MyAppVersion}
AppPublisher=Codex Dream Skin Contributors
AppPublisherURL=https://github.com/413162826/Codex-Dream-Skin
AppSupportURL=https://github.com/413162826/Codex-Dream-Skin/issues
AppUpdatesURL=https://github.com/413162826/Codex-Dream-Skin/releases/latest
DefaultDirName={localappdata}\Programs\CodexDreamSkin
DefaultGroupName=Codex Dream Skin
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible arm64
ArchitecturesInstallIn64BitMode=x64compatible arm64
OutputDir={#MyOutputDir}
OutputBaseFilename={#MyOutputBaseFilename}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
SetupLogging=yes
UninstallDisplayName=Codex Dream Skin
VersionInfoVersion={#MyAppVersion}.0
VersionInfoCompany=Codex Dream Skin Contributors
VersionInfoDescription=Codex Dream Skin Windows Installer
VersionInfoProductName=Codex Dream Skin
VersionInfoProductVersion={#MyAppVersion}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
Source: "{#MySourceRoot}\assets\*"; DestDir: "{app}\payload\assets"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#MySourceRoot}\scripts\*"; DestDir: "{app}\payload\scripts"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#MySourceRoot}\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#MySourceRoot}\README.en.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#MySourceRoot}\CHANGELOG.md"; DestDir: "{app}"; Flags: ignoreversion

[InstallDelete]
Type: files; Name: "{userdesktop}\Codex Dream Skin.lnk"
Type: files; Name: "{userdesktop}\Codex Dream Skin - Restore.lnk"
Type: files; Name: "{userdesktop}\Codex Dream Skin - Tray.lnk"
Type: files; Name: "{userprograms}\Codex Dream Skin.lnk"
Type: files; Name: "{userprograms}\Codex Dream Skin - Tray.lnk"

[Icons]
Name: "{group}\Codex Dream Skin"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy RemoteSigned -File ""{#MyStateRoot}\engine\scripts\start-dream-skin.ps1"" -PromptRestart"; WorkingDir: "{app}"; Check: not IsPackageTest
Name: "{group}\Codex Dream Skin Tray"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ""{#MyStateRoot}\engine\scripts\tray-dream-skin.ps1"""; WorkingDir: "{app}"; Check: not IsPackageTest
Name: "{group}\Check for Updates"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy RemoteSigned -File ""{#MyStateRoot}\engine\scripts\update-dream-skin.ps1"""; WorkingDir: "{app}"; Check: not IsPackageTest
Name: "{group}\Restore Codex"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy RemoteSigned -File ""{#MyStateRoot}\engine\scripts\restore-dream-skin.ps1"" -RestoreBaseTheme -PromptRestart"; WorkingDir: "{app}"; Check: not IsPackageTest
Name: "{group}\Uninstall Codex Dream Skin"; Filename: "{uninstallexe}"; Check: not IsPackageTest
Name: "{autodesktop}\Codex Dream Skin"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy RemoteSigned -File ""{#MyStateRoot}\engine\scripts\start-dream-skin.ps1"" -PromptRestart"; WorkingDir: "{app}"; Tasks: desktopicon; Check: not IsPackageTest

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ""{#MyStateRoot}\engine\scripts\tray-dream-skin.ps1"""; WorkingDir: "{app}"; Flags: nowait runhidden; Check: not IsPackageTest
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy RemoteSigned -File ""{#MyStateRoot}\engine\scripts\start-dream-skin.ps1"" -PromptRestart"; WorkingDir: "{app}"; Description: "Launch Codex Dream Skin"; Flags: nowait postinstall skipifsilent unchecked; Check: not IsPackageTest
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -Command ""[IO.File]::WriteAllText('{app}\package-run.marker','package-run')"""; WorkingDir: "{app}"; Flags: runhidden; Check: IsPackageTest

[UninstallDelete]
Type: files; Name: "{app}\package-test.marker"
Type: files; Name: "{app}\package-run.marker"

[Code]
var
  PurgeUserData: Boolean;

function PowerShellPath(): String;
begin
  Result := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
end;

function IsPackageTest(): Boolean;
begin
  Result := ExpandConstant('{param:DREAMSKINPACKAGETEST|0}') = '1';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  ScriptPath: String;
  Parameters: String;
begin
  if CurStep <> ssPostInstall then
    exit;
  if IsPackageTest() then
  begin
    SaveStringToFile(ExpandConstant('{app}\package-test.marker'), 'package-test', False);
    exit;
  end;

  ScriptPath := ExpandConstant('{app}\payload\scripts\install-dream-skin.ps1');
  Parameters := '-NoProfile -ExecutionPolicy Bypass -File "' + ScriptPath +
    '" -NoShortcuts -CloseRunning -StateRoot "' + ExpandConstant('{#MyStateRoot}') + '"';
  if (not Exec(PowerShellPath(), Parameters, ExpandConstant('{app}\payload'), SW_HIDE,
      ewWaitUntilTerminated, ResultCode)) or (ResultCode <> 0) then
    RaiseException('Codex Dream Skin runtime installation failed. Exit code: ' + IntToStr(ResultCode));
end;

function InitializeUninstall(): Boolean;
begin
  if FileExists(ExpandConstant('{app}\package-test.marker')) then
  begin
    PurgeUserData := False;
    Result := True;
    exit;
  end;
  PurgeUserData := MsgBox(
    'Remove saved themes and imported images too?' + #13#10 + #13#10 +
    'Choose No to keep personal theme data for a future reinstall.',
    mbConfirmation, MB_YESNO) = IDYES;
  Result := True;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
  ScriptPath: String;
  Parameters: String;
begin
  if CurUninstallStep <> usUninstall then
    exit;
  if FileExists(ExpandConstant('{app}\package-test.marker')) then
    exit;

  ScriptPath := ExpandConstant('{app}\payload\scripts\uninstall-dream-skin.ps1');
  Parameters := '-NoProfile -ExecutionPolicy Bypass -File "' + ScriptPath +
    '" -StateRoot "' + ExpandConstant('{#MyStateRoot}') + '"';
  if PurgeUserData then
    Parameters := Parameters + ' -PurgeUserData';
  if (not Exec(PowerShellPath(), Parameters, ExpandConstant('{app}\payload'), SW_HIDE,
      ewWaitUntilTerminated, ResultCode)) or (ResultCode <> 0) then
    RaiseException('Codex Dream Skin cleanup failed. Exit code: ' + IntToStr(ResultCode));
end;
