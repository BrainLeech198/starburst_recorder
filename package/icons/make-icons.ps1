# 生成「星芒记录者」应用图标 —— Windows / Android 共用一套画法
#
# 设计（2026-10-20 定稿）：星尘轨道 + 黑洞镂空 + 中心四角星芒
#   - 只画图形，不画方底：输出带 alpha 的透明图（方案 A，跟《氢风》一样）
#   - 轨道的「后边」画在洞之下、「前边」画在洞之上 —— 一边在前、一边在后
#   - 每档尺寸单独渲染，不靠缩放；小档自动降级细节
#       16 / 32            只画「环 + 核点」，保轮廓辨识
#       40 ~ 95            环 + 四角星 + 轨道线（星尘点会糊，先不加）
#       96 及以上          全套：轨道 + 星尘点 + 洞的暗填充 + 星芒
#
# 产出：
#   package/windows/icon.ico     16/32/48/64/128/256 六档（PNG 压缩帧，带 alpha）
#   package/windows/icon.png     512 预览（透明）
#   android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png       48/72/96/144/192
#   android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher_round.png  同上（同一张图）
#   -PreviewDir 指定时，额外产出对照图（棋盘格 / 浅底 / 深底 / 各档实际尺寸 / 镂空对比）
#
# 用法：
#   powershell -File package/icons/make-icons.ps1
#   powershell -File package/icons/make-icons.ps1 -HoleAlpha 0 -PreviewDir .venv/icon-preview

param(
  [string]$RepoRoot = '',
  [double]$HoleAlpha = 0.55,
  [string]$PreviewDir = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

# 品牌色：青芒 + 极暗的洞
$Cyan = [System.Drawing.Color]::FromArgb(255, 110, 231, 255)
$HoleInk = [System.Drawing.Color]::FromArgb(4, 6, 12)

# 四角星：四个尖，尖与尖之间用控制点落在中心的贝塞尔收腰（星芒而不是几何星）
function New-StarPath([single]$cx, [single]$cy, [single]$r) {
  $tips = @(
    [System.Drawing.PointF]::new($cx, $cy - $r),
    [System.Drawing.PointF]::new($cx + $r, $cy),
    [System.Drawing.PointF]::new($cx, $cy + $r),
    [System.Drawing.PointF]::new($cx - $r, $cy)
  )
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.StartFigure()
  for ($i = 0; $i -lt 4; $i++) {
    $from = $tips[$i]
    $to = $tips[($i + 1) % 4]
    $c1 = [System.Drawing.PointF]::new(
      [single]($from.X + 2 / 3 * ($cx - $from.X)),
      [single]($from.Y + 2 / 3 * ($cy - $from.Y))
    )
    $c2 = [System.Drawing.PointF]::new(
      [single]($to.X + 2 / 3 * ($cx - $to.X)),
      [single]($to.Y + 2 / 3 * ($cy - $to.Y))
    )
    $path.AddBezier($from, $c1, $c2, $to)
  }
  $path.CloseFigure()
  return $path
}

# 倾斜的轨道弧：先按椭圆自己的坐标取一段弧，再把路径整体旋转（描边粗细不会被拉歪）
# startAngle 0 + sweep 180 = 椭圆下半弧（屏幕上的"前边"）；180 + 180 = 上半弧（"后边"）
function New-OrbitArcPath([single]$cx, [single]$cy, [single]$rx, [single]$ry, [single]$degrees, [single]$startAngle, [single]$sweepAngle) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.StartFigure()
  $rect = New-Object System.Drawing.RectangleF(($cx - $rx), ($cy - $ry), ($rx * 2), ($ry * 2))
  $path.AddArc($rect, $startAngle, $sweepAngle)
  $matrix = New-Object System.Drawing.Drawing2D.Matrix
  $matrix.RotateAt($degrees, [System.Drawing.PointF]::new($cx, $cy))
  $path.Transform($matrix)
  $matrix.Dispose()
  return $path
}

# 画一张指定尺寸的图标（透明底）
function New-IconBitmap([int]$size, [double]$holeAlpha) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bmp)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $cx = [single]($size / 2)
  $cy = [single]($size / 2)
  $s = [single]$size

  $level = 0
  if ($size -ge 96) { $level = 2 } elseif ($size -ge 40) { $level = 1 }

  $cyanPen = New-Object System.Drawing.Pen($Cyan)
  $cyanBrush = New-Object System.Drawing.SolidBrush($Cyan)

  $orbitRx = [single](0.383 * $s)
  $orbitRy = [single](0.117 * $s)
  $orbitWidth = [single][math]::Max(1.0, 0.017 * $s)

  # 星尘分两组：跟「后边」的先画（会被洞挡住），跟「前边」的最后画（压在洞上）
  $backDust = @(
    @{ X = 0.142; Y = 0.633; R = 0.029 }
  )
  $frontDust = @(
    @{ X = 0.858; Y = 0.367; R = 0.033 },
    @{ X = 0.714; Y = 0.529; R = 0.026 }
  )

  if ($level -ge 1) {
    # 1) 轨道「后边」（上半弧）：立体感的来源——它从洞的背后绕过去
    $backPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(170, 110, 231, 255))
    $backPen.Width = $orbitWidth
    $backArc = New-OrbitArcPath $cx $cy $orbitRx $orbitRy -20 180 180
    $graphics.DrawPath($backPen, $backArc)
    $backArc.Dispose(); $backPen.Dispose()

    if ($level -ge 2) {
      foreach ($d in $backDust) {
        $r = [single][math]::Max(1.0, $d.R * $s)
        $x = [single]($d.X * $s)
        $y = [single]($d.Y * $s)
        $graphics.FillEllipse($cyanBrush, $x - $r, $y - $r, $r * 2, $r * 2)
      }
    }

    # 2) 洞的暗填充：浅色壁纸上也能看出"洞里是暗的"；HoleAlpha=0 即完全镂空
    if ($holeAlpha -gt 0) {
      $holeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb([int](255 * $holeAlpha), $HoleInk.R, $HoleInk.G, $HoleInk.B))
      $holeR = [single](0.167 * $s)
      $graphics.FillEllipse($holeBrush, $cx - $holeR, $cy - $holeR, $holeR * 2, $holeR * 2)
      $holeBrush.Dispose()
    }
  }

  # 3) 事件视界环 + 4) 中心星芒
  if ($level -eq 0) {
    # 小档降级：厚环 + 核点，只有这两笔能活到 16px
    $ringR = [single](0.32 * $s)
    $ringPen = New-Object System.Drawing.Pen($Cyan)
    $ringPen.Width = [single][math]::Max(1.2, 0.10 * $s)
    $graphics.DrawEllipse($ringPen, $cx - $ringR, $cy - $ringR, $ringR * 2, $ringR * 2)
    $ringPen.Dispose()
    $dotR = [single](0.11 * $s)
    $graphics.FillEllipse($cyanBrush, $cx - $dotR, $cy - $dotR, $dotR * 2, $dotR * 2)
  } else {
    $ringR = [single](0.167 * $s)
    $ringPen = New-Object System.Drawing.Pen($Cyan)
    $ringPen.Width = [single][math]::Max(1.0, 0.021 * $s)
    $graphics.DrawEllipse($ringPen, $cx - $ringR, $cy - $ringR, $ringR * 2, $ringR * 2)
    $ringPen.Dispose()

    $star = New-StarPath $cx $cy ([single](0.10 * $s))
    $graphics.FillPath($cyanBrush, $star)
    $star.Dispose()
  }

  # 5) 轨道「前边」（下半弧）+ 前边星尘：画在洞之上，才有一边在前、一边在后的立体感
  if ($level -ge 1) {
    $frontPen = New-Object System.Drawing.Pen($Cyan)
    $frontPen.Width = $orbitWidth
    $frontArc = New-OrbitArcPath $cx $cy $orbitRx $orbitRy -20 0 180
    $graphics.DrawPath($frontPen, $frontArc)
    $frontArc.Dispose(); $frontPen.Dispose()

    if ($level -ge 2) {
      foreach ($d in $frontDust) {
        $r = [single][math]::Max(1.0, $d.R * $s)
        $x = [single]($d.X * $s)
        $y = [single]($d.Y * $s)
        $graphics.FillEllipse($cyanBrush, $x - $r, $y - $r, $r * 2, $r * 2)
      }
    }
  }

  $cyanPen.Dispose()
  $cyanBrush.Dispose()
  $graphics.Dispose()
  return $bmp
}

# ICO 容器：6 字节文件头 + 每帧 16 字节目录项 + 各帧 PNG 数据
function Write-IcoFile([string]$path, [int[]]$sizes, [double]$holeAlpha) {
  $frames = @()
  foreach ($size in $sizes) {
    $bitmap = New-IconBitmap $size $holeAlpha
    $stream = New-Object System.IO.MemoryStream
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $frames += , $stream.ToArray()
    $bitmap.Dispose()
  }

  $out = New-Object System.IO.MemoryStream
  $writer = New-Object System.IO.BinaryWriter($out)
  $writer.Write([uint16]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]$sizes.Count)

  $offset = 6 + 16 * $sizes.Count
  for ($i = 0; $i -lt $sizes.Count; $i++) {
    $frame = $frames[$i]
    $dimension = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }
    $writer.Write([byte]$dimension)
    $writer.Write([byte]$dimension)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$frame.Length)
    $writer.Write([uint32]$offset)
    $offset += $frame.Length
  }
  foreach ($frame in $frames) { $writer.Write($frame) }
  $writer.Flush()
  [System.IO.File]::WriteAllBytes($path, $out.ToArray())
  $writer.Dispose()
  $out.Dispose()
}

# ---------- 主体 ----------

$icoSizes = @(16, 32, 48, 64, 128, 256)
$windowsDir = Join-Path $RepoRoot 'package\windows'
Write-IcoFile (Join-Path $windowsDir 'icon.ico') $icoSizes $HoleAlpha
$preview = New-IconBitmap 512 $HoleAlpha
$preview.Save((Join-Path $windowsDir 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$preview.Dispose()
$icoKb = [math]::Round((Get-Item (Join-Path $windowsDir 'icon.ico')).Length / 1KB, 1)
Write-Host "Windows：icon.ico（$($icoSizes -join '/') 六档，$icoKb KB）+ icon.png（512 预览），均为透明底" -ForegroundColor Green

# Android：只写 legacy PNG（不带自适应图标 = 方案 A，现代启动器才可能显示透明）
$androidRes = Join-Path $RepoRoot 'android\app\src\main\res'
$densityMap = [ordered]@{
  'mipmap-mdpi'    = 48
  'mipmap-hdpi'    = 72
  'mipmap-xhdpi'   = 96
  'mipmap-xxhdpi'  = 144
  'mipmap-xxxhdpi' = 192
}
if (Test-Path $androidRes) {
  foreach ($density in $densityMap.Keys) {
    $dir = Join-Path $androidRes $density
    if (-not (Test-Path $dir)) { continue }
    $size = $densityMap[$density]
    foreach ($name in @('ic_launcher.png', 'ic_launcher_round.png')) {
      $bitmap = New-IconBitmap $size $HoleAlpha
      $bitmap.Save((Join-Path $dir $name), [System.Drawing.Imaging.ImageFormat]::Png)
      $bitmap.Dispose()
    }
    Write-Host "Android：$density\ic_launcher.png + ic_launcher_round.png（${size}px，透明底）" -ForegroundColor Green
  }
} else {
  Write-Host "没找到 Android 工程目录，跳过：$androidRes" -ForegroundColor Yellow
}

# ---------- 对照图（可选，仅用于人工验收，不进仓库） ----------
if (-not [string]::IsNullOrWhiteSpace($PreviewDir)) {
  if (-not [System.IO.Path]::IsPathRooted($PreviewDir)) {
    $PreviewDir = Join-Path $RepoRoot $PreviewDir
  }
  if (-not (Test-Path $PreviewDir)) { New-Item -ItemType Directory $PreviewDir -Force | Out-Null }

  $labelFont = New-Object System.Drawing.Font('Microsoft YaHei UI', 12)
  $inkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 60, 60, 60))
  $lightColor = [System.Drawing.Color]::FromArgb(255, 241, 242, 245)
  $darkColor = [System.Drawing.Color]::FromArgb(255, 16, 16, 20)

  function New-Canvas([int]$w, [int]$h) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::White)
    return @{ Bitmap = $bmp; Graphics = $g }
  }

  function Add-Bg($g, [string]$kind, [int]$x, [int]$y, [int]$w, [int]$h) {
    if ($kind -eq 'checker') {
      $a = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
      $b = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 206, 206, 206))
      $cell = 20
      for ($yy = $y; $yy -lt $y + $h; $yy += $cell) {
        for ($xx = $x; $xx -lt $x + $w; $xx += $cell) {
          $brush = if (((($xx - $x) / $cell) + (($yy - $y) / $cell)) % 2 -eq 0) { $a } else { $b }
          $g.FillRectangle($brush, $xx, $yy, [math]::Min($cell, $x + $w - $xx), [math]::Min($cell, $y + $h - $yy))
        }
      }
      $a.Dispose(); $b.Dispose()
    } else {
      $color = if ($kind -eq 'light') { $lightColor } else { $darkColor }
      $brush = New-Object System.Drawing.SolidBrush($color)
      $g.FillRectangle($brush, $x, $y, $w, $h)
      $brush.Dispose()
    }
  }

  # A) 256 全套 × 三种底
  $canvasA = New-Canvas 940 360
  $g = $canvasA.Graphics
  $i = 0
  foreach ($bg in @(
      @{ Kind = 'checker'; Label = '透明底（棋盘格）' },
      @{ Kind = 'light'; Label = '浅色壁纸 #F1F2F5' },
      @{ Kind = 'dark'; Label = '深色壁纸 #101014' }
    )) {
    $x = 30 + $i * 300
    Add-Bg $g $bg.Kind $x 60 276 276
    $art = New-IconBitmap 256 $HoleAlpha
    $g.DrawImage($art, [System.Drawing.Rectangle]::new($x + 10, 70, 256, 256))
    $art.Dispose()
    $g.DrawString($bg.Label, $labelFont, $inkBrush, [single]$x, [single]30)
    $i++
  }
  $pathA = Join-Path $PreviewDir 'preview-256-三种底.png'
  $canvasA.Bitmap.Save($pathA, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $canvasA.Bitmap.Dispose()

  # B) 各档实际尺寸（浅底 / 深底各一条）
  $canvasB = New-Canvas 980 720
  $g = $canvasB.Graphics
  $place = @(
    @{ Size = 16; X = 40 },
    @{ Size = 32; X = 110 },
    @{ Size = 48; X = 190 },
    @{ Size = 64; X = 280 },
    @{ Size = 128; X = 400 },
    @{ Size = 256; X = 570 }
  )
  $rowY = 50
  foreach ($kind in @('light', 'dark')) {
    $bgInk = if ($kind -eq 'light') { '浅底：各档实际尺寸' } else { '深底：各档实际尺寸' }
    $textBrush = if ($kind -eq 'light') { $inkBrush } else { New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 230, 230, 230)) }
    Add-Bg $g $kind 20 $rowY 940 320
    $g.DrawString($bgInk, $labelFont, $textBrush, [single]36, [single]($rowY + 12))
    foreach ($p in $place) {
      $art = New-IconBitmap $p.Size $HoleAlpha
      $y = $rowY + 300 - $p.Size
      $g.DrawImage($art, [System.Drawing.Rectangle]::new($p.X, $y, $p.Size, $p.Size))
      $art.Dispose()
      $g.DrawString("$($p.Size)px", $labelFont, $inkBrush, [single]$p.X, [single]($rowY + 324))
    }
    if ($kind -eq 'dark') { $textBrush.Dispose() }
    $rowY += 360
  }
  $pathB = Join-Path $PreviewDir 'preview-各档实际尺寸.png'
  $canvasB.Bitmap.Save($pathB, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $canvasB.Bitmap.Dispose()

  # C) 16 / 32 放大看像素（最近邻，不糊）
  $canvasC = New-Canvas 700 520
  $g = $canvasC.Graphics
  $rowY = 50
  foreach ($kind in @('light', 'dark')) {
    Add-Bg $g $kind 20 $rowY 660 200
    $textBrush = if ($kind -eq 'light') { $inkBrush } else { New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 230, 230, 230)) }
    $g.DrawString($(if ($kind -eq 'light') { '浅底：16px 放大 8 倍 / 32px 放大 6 倍' } else { '深底：16px 放大 8 倍 / 32px 放大 6 倍' }), $labelFont, $textBrush, [single]36, [single]($rowY + 8))
    if ($kind -eq 'dark') { $textBrush.Dispose() }
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $art16 = New-IconBitmap 16 $HoleAlpha
    $g.DrawImage($art16, [System.Drawing.Rectangle]::new(80, $rowY + 50, 128, 128))
    $art16.Dispose()
    $g.DrawString('16px ×8', $labelFont, $inkBrush, [single]80, [single]($rowY + 182))
    $art32 = New-IconBitmap 32 $HoleAlpha
    $g.DrawImage($art32, [System.Drawing.Rectangle]::new(300, $rowY + 40, 192, 192))
    $art32.Dispose()
    $g.DrawString('32px ×6', $labelFont, $inkBrush, [single]300, [single]($rowY + 182))
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $rowY += 240
  }
  $pathC = Join-Path $PreviewDir 'preview-16与32-放大.png'
  $canvasC.Bitmap.Save($pathC, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $canvasC.Bitmap.Dispose()

  # D) 洞的两种做法（暗填充 vs 完全镂空）
  $canvasD = New-Canvas 620 350
  $g = $canvasD.Graphics
  Add-Bg $g 'light' 20 60 580 280
  $art = New-IconBitmap 256 $HoleAlpha
  $g.DrawImage($art, [System.Drawing.Rectangle]::new(30, 72, 256, 256))
  $art.Dispose()
  $g.DrawString("洞留暗填充（HoleAlpha = $HoleAlpha）", $labelFont, $inkBrush, [single]30, [single]25)
  $art = New-IconBitmap 256 0
  $g.DrawImage($art, [System.Drawing.Rectangle]::new(330, 72, 256, 256))
  $art.Dispose()
  $g.DrawString('洞完全镂空（HoleAlpha = 0）', $labelFont, $inkBrush, [single]330, [single]25)
  $pathD = Join-Path $PreviewDir 'preview-洞的两种做法.png'
  $canvasD.Bitmap.Save($pathD, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $canvasD.Bitmap.Dispose()

  $labelFont.Dispose(); $inkBrush.Dispose()

  Write-Host '对照图（本机验收用，不入仓库）：' -ForegroundColor Green
  Write-Host "  $pathA"
  Write-Host "  $pathB"
  Write-Host "  $pathC"
  Write-Host "  $pathD"
}
