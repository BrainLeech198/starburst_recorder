# 生成安卓闪屏 splash.png：深空底 + 中央黑洞图标 + 「星芒记录者」文字。
# 覆盖 android/app/src/main/res/drawable*/splash.png，之后重新 assembleDebug 即生效。
# 用法：powershell -File package/icons/make-splash.ps1
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$resDir = Join-Path $projectRoot 'android\app\src\main\res'
$iconPath = Join-Path $resDir 'mipmap-xxxhdpi\ic_launcher.png'

# 深空底，跟 styles.xml 的 windowBackground 一致，闪屏→应用没有色差跳变
$bg = [System.Drawing.Color]::FromArgb(255, 10, 13, 18)
$fg = [System.Drawing.Color]::FromArgb(255, 232, 234, 240)

# 目录 → (宽, 高, 是否横屏)：尺寸就是各目录里原 splash.png 的尺寸
$targets = [ordered]@{
  'drawable'              = @(480, 320, $true)
  'drawable-land-mdpi'    = @(480, 320, $true)
  'drawable-land-hdpi'    = @(800, 480, $true)
  'drawable-land-xhdpi'   = @(1280, 720, $true)
  'drawable-land-xxhdpi'  = @(1600, 960, $true)
  'drawable-land-xxxhdpi' = @(1920, 1280, $true)
  'drawable-port-mdpi'    = @(320, 480, $false)
  'drawable-port-hdpi'    = @(480, 800, $false)
  'drawable-port-xhdpi'   = @(720, 1280, $false)
  'drawable-port-xxhdpi'  = @(960, 1600, $false)
  'drawable-port-xxxhdpi' = @(1280, 1920, $false)
}

$icon = [System.Drawing.Image]::FromFile($iconPath)
try {
  foreach ($dir in $targets.Keys) {
    $w, $h, $land = $targets[$dir]
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.SmoothingMode = 'HighQuality'
      $g.InterpolationMode = 'HighQualityBicubic'
      $g.Clear($bg)

      $unit = [Math]::Min($w, $h)
      $iconSize = [int]($unit * 0.28)
      $fontSize = [Math]::Max(12, [int]($unit * 0.055))
      $font = New-Object System.Drawing.Font 'Microsoft YaHei', $fontSize, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
      $text = '星芒记录者'
      $textSize = $g.MeasureString($text, $font)
      $gap = [int]($unit * 0.05)

      if ($land) {
        # 横屏：图标在左、文字在右，整体居中
        $totalW = $iconSize + $gap + $textSize.Width
        $x = ($w - $totalW) / 2
        $g.DrawImage($icon, [int]$x, [int](($h - $iconSize) / 2), $iconSize, $iconSize)
        $brush = New-Object System.Drawing.SolidBrush $fg
        $g.DrawString($text, $font, $brush, [float]($x + $iconSize + $gap), [float](($h - $textSize.Height) / 2))
        $brush.Dispose()
      } else {
        # 竖屏：图标在上、文字在下，整体居中
        $totalH = $iconSize + $gap + $textSize.Height
        $iconY = ($h - $totalH) / 2
        $g.DrawImage($icon, [int](($w - $iconSize) / 2), [int]$iconY, $iconSize, $iconSize)
        $brush = New-Object System.Drawing.SolidBrush $fg
        $g.DrawString($text, $font, $brush, [float](($w - $textSize.Width) / 2), [float]($iconY + $iconSize + $gap))
        $brush.Dispose()
      }
      $font.Dispose()

      $out = Join-Path $resDir "$dir\splash.png"
      $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
      Write-Output "$dir\splash.png  ${w}x${h}"
    } finally {
      $g.Dispose()
      $bmp.Dispose()
    }
  }
} finally {
  $icon.Dispose()
}
Write-Output 'done'
