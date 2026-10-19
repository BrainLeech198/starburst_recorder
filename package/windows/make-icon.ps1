# 生成「星芒记录者」的应用图标
#
# 不用外部图片，直接用 GDI+ 画：
#   圆角方形深空底 + 星芒背后的柔光 + 四角星芒（青色）
# 每一档尺寸单独渲染，不靠缩放，所以 16×16 也清晰。
#
# 输入：无
# 输出：icon.ico（16/32/48/64/128/256 六档，PNG 压缩帧）+ icon.png（512 预览）
#
# 用法：powershell -File package/windows/make-icon.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$here = $PSScriptRoot
$icoPath = Join-Path $here 'icon.ico'
$previewPath = Join-Path $here 'icon.png'
$sizes = @(16, 32, 48, 64, 128, 256)

# 注意：PowerShell 变量名不区分大小写，颜色和路径必须用完全不同的名字
$bgColor = [System.Drawing.Color]::FromArgb(255, 11, 16, 23)     # #0b1017，和窗口底色一致
$starColor = [System.Drawing.Color]::FromArgb(255, 110, 231, 255) # #6ee7ff，和默认主题色一致
$glowCenter = [System.Drawing.Color]::FromArgb(120, 110, 231, 255)
$glowEdge = [System.Drawing.Color]::FromArgb(0, 110, 231, 255)

function New-IconBitmap([int]$size) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # 1) 圆角方形底
    $radius = [float]($size * 0.22)
    $bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $radius * 2
    $bgPath.AddArc(0, 0, $diameter, $diameter, 180, 90)
    $bgPath.AddArc($size - $diameter, 0, $diameter, $diameter, 270, 90)
    $bgPath.AddArc($size - $diameter, $size - $diameter, $diameter, $diameter, 0, 90)
    $bgPath.AddArc(0, $size - $diameter, $diameter, $diameter, 90, 90)
    $bgPath.CloseFigure()
    $bgBrush = New-Object System.Drawing.SolidBrush($bgColor)
    $graphics.FillPath($bgBrush, $bgPath)
    $bgBrush.Dispose()

    $center = [float]($size / 2)
    $tipRadius = [float]($size * 0.30)

    # 2) 星芒背后的柔光：中心亮、边缘透明
    $glowRadius = [float]($tipRadius * 1.5)
    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowPath.AddEllipse(
        [float]($center - $glowRadius), [float]($center - $glowRadius),
        [float]($glowRadius * 2), [float]($glowRadius * 2)
    )
    $glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
    $glowBrush.CenterColor = $glowCenter
    $glowBrush.SurroundColors = @($glowEdge)
    $graphics.FillPath($glowBrush, $glowPath)
    $glowBrush.Dispose()

    # 3) 四角星芒：四个尖角之间，用控制点在中心的贝塞尔曲线往内收
    $starPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $tips = @(
        [System.Drawing.PointF]::new($center, $center - $tipRadius),
        [System.Drawing.PointF]::new($center + $tipRadius, $center),
        [System.Drawing.PointF]::new($center, $center + $tipRadius),
        [System.Drawing.PointF]::new($center - $tipRadius, $center)
    )
    $starPath.StartFigure()
    for ($index = 0; $index -lt 4; $index++) {
        $from = $tips[$index]
        $to = $tips[($index + 1) % 4]
        # 二次贝塞尔（控制点在中心）换算成三次贝塞尔
        $control1 = [System.Drawing.PointF]::new(
            [float]($from.X + 2 / 3 * ($center - $from.X)),
            [float]($from.Y + 2 / 3 * ($center - $from.Y))
        )
        $control2 = [System.Drawing.PointF]::new(
            [float]($to.X + 2 / 3 * ($center - $to.X)),
            [float]($to.Y + 2 / 3 * ($center - $to.Y))
        )
        $starPath.AddBezier($from, $control1, $control2, $to)
    }
    $starPath.CloseFigure()
    $starBrush = New-Object System.Drawing.SolidBrush($starColor)
    $graphics.FillPath($starBrush, $starPath)
    $starBrush.Dispose()

    $graphics.Dispose()
    return $bitmap
}

# ICO 里的每一帧
$frames = @()
foreach ($size in $sizes) {
    $bitmap = New-IconBitmap $size
    $stream = New-Object System.IO.MemoryStream
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $frames += , $stream.ToArray()
    $bitmap.Dispose()
}

# 按 ICO 格式拼容器：6 字节文件头 + 每帧 16 字节目录项 + 各帧数据
$out = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($out)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]$sizes.Count)

$offset = 6 + 16 * $sizes.Count
for ($index = 0; $index -lt $sizes.Count; $index++) {
    $size = $sizes[$index]
    $frame = $frames[$index]
    $dimension = if ($size -ge 256) { 0 } else { $size }
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
[System.IO.File]::WriteAllBytes($icoPath, $out.ToArray())
$writer.Dispose()

# 一张预览图，方便直接看效果
$preview = New-IconBitmap 512
$preview.Save($previewPath, [System.Drawing.Imaging.ImageFormat]::Png)
$preview.Dispose()

$icoKb = [math]::Round((Get-Item $icoPath).Length / 1KB, 1)
Write-Host "已生成：$icoPath（$icoKb KB，含 $($sizes -join '/') 六档）" -ForegroundColor Green
Write-Host "预览图：$previewPath" -ForegroundColor Green
