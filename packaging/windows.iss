; Inno-Setup-Skript für den Windows-Installer.  Aufruf: iscc /DAppVersion=0.1.0 packaging\windows.iss
#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif

[Setup]
AppId={{6B1B6C0E-6C5C-4E0B-9B5E-5E7A52D0A1F4}
AppName=SetTracker
AppVersion={#AppVersion}
AppPublisher=SetTracker
DefaultDirName={autopf}\SetTracker
DefaultGroupName=SetTracker
DisableProgramGroupPage=yes
; Installation nur für den angemeldeten Benutzer – keine Administratorrechte nötig
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=SetTracker-Setup
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\SetTracker.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "german"; MessagesFile: "compiler:Languages\German.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\dist\SetTracker\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\SetTracker"; Filename: "{app}\SetTracker.exe"
Name: "{autodesktop}\SetTracker"; Filename: "{app}\SetTracker.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\SetTracker.exe"; Description: "SetTracker jetzt starten"; Flags: nowait postinstall skipifsilent
