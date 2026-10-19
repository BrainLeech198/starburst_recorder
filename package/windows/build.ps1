# 星芒记录者 —— Windows 安装包流水线
#
#   1) 构建前端            npm run build
#   2) 打出免安装目录      electron-builder --win --dir  ->  release/win-unpacked
#   3) 压成安装程序        Inno Setup ISCC               ->  package/windows/dist
#
# 用法：npm run desktop:installer
# 需要：Inno Setup 6（ISCC.exe），版本号取自 package.json

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$issFile = Join-Path $PSScriptRoot 'starburst-recorder.iss'

function Get-IsccPath {
  $fromPath = Get-Command iscc -ErrorAction SilentlyContinue
  if ($fromPath) { return $fromPath.Source }

  $candidates = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $candidate }
  }
  throw '没找到 ISCC.exe，请先安装 Inno Setup 6（https://jrsoftware.org/isdl.php）'
}

$iscc = Get-IsccPath
$manifest = Get-Content (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $manifest.version
$appName = $manifest.build.productName
$exeName = "$appName.exe"

Write-Host '== 1/3 构建前端 ==' -ForegroundColor Cyan
Push-Location $root
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw '前端构建失败' }

  Write-Host '== 2/3 打出免安装目录 ==' -ForegroundColor Cyan
  npx electron-builder --win --dir
  if ($LASTEXITCODE -ne 0) { throw 'electron-builder 打包失败' }
} finally {
  Pop-Location
}

$unpacked = Join-Path $root 'release\win-unpacked'
if (-not (Test-Path $unpacked)) { throw "没找到免安装目录：$unpacked" }

Write-Host '== 3/3 Inno Setup 生成安装程序 ==' -ForegroundColor Cyan
& $iscc "/DMyAppVersion=$version" "/DMyAppName=$appName" "/DMyAppExeName=$exeName" $issFile
if ($LASTEXITCODE -ne 0) { throw 'Inno Setup 编译失败' }

$output = Join-Path $PSScriptRoot "dist\starburst-recorder-$version-setup.exe"
if (-not (Test-Path $output)) { throw "安装程序没有生成：$output" }

$size = [math]::Round((Get-Item $output).Length / 1MB, 1)
Write-Host "完成：$output（$size MB）" -ForegroundColor Green
