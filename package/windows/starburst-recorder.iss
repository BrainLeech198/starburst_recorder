; 星芒记录者 —— Windows 安装脚本（Inno Setup 6）
;
; 由 package/windows/build.ps1 调起，不要直接双击运行。
; 前置：electron-builder 已经把应用打成 release/win-unpacked。
;
; 版本号、应用名、可执行文件名都由构建脚本从 package.json 传进来，
; 这里只留兜底默认值，避免两处各写一份导致对不上。

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif
#ifndef MyAppName
  #define MyAppName "星芒记录者"
#endif
#ifndef MyAppExeName
  #define MyAppExeName "starburst-recorder.exe"
#endif

[Setup]
AppId={{A7C3E8B1-5D42-4F6E-9B0A-2C7D1E4F6A93}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=starburst
; 安装目录用英文；升级时 Inno 会沿用旧安装路径，AppId 不变所以不会变成两份安装
DefaultDirName={autopf}\StarburstRecorder
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=starburst-recorder-{#MyAppVersion}-setup
; ultra64 用 64 MB 字典换更高压缩率，安装时内存占用高一点，安装包能再小几 MB
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
SetupIconFile=icon.ico
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; 装到当前用户目录，不需要管理员权限
PrivilegesRequired=lowest

[Languages]
; 简体中文语言包是社区维护的，官方安装包里没有，这里放进了 languages 目录
Name: "chinese"; MessagesFile: "languages\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "快捷方式："

[Files]
Source: "..\..\release\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; 旧版本用的是中文可执行文件名，升级时把残留的那个删掉
[InstallDelete]
Type: files; Name: "{app}\星芒记录者.exe"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "立即启动 {#MyAppName}"; Flags: nowait postinstall skipifsilent
