# 把一张方图转成 Windows 用的多尺寸 .ico
#
# 输入：同目录下的 icon.jpg（或 icon.png）
# 输出：同目录下的 icon.ico（含 16/32/48/64/128/256 六档尺寸）
#
# 用法：powershell -File package/windows/make-icon.ps1
# 说明：ICO 里每一档都用 PNG 压缩（Vista 以后支持，Inno Setup 6 也认）

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$here = $PSScriptRoot
$source = @("$here\icon.png", "$here\icon.jpg") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $source) { throw '没找到 icon.png 或 icon.jpg' }

$target = Join-Path $here 'icon.ico'
$sizes = @(16, 32, 48, 64, 128, 256)

$image = [System.Drawing.Image]::FromFile($source)

# 原图留白偏多，按中间 62% 裁一刀，星星在小尺寸下才认得出来
$side = [Math]::Min($image.Width, $image.Height)
$cropSide = [int]($side * 0.62)
$cropX = [int](($image.Width - $cropSide) / 2)
$cropY = [int](($image.Height - $cropSide) / 2)

$frames = @()
foreach ($size in $sizes) {
    $canvas = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage(
        $image,
        (New-Object System.Drawing.Rectangle(0, 0, $size, $size)),
        (New-Object System.Drawing.Rectangle($cropX, $cropY, $cropSide, $cropSide)),
        [System.Drawing.GraphicsUnit]::Pixel
    )
    $graphics.Dispose()

    $stream = New-Object System.IO.MemoryStream
    $canvas.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $canvas.Dispose()
    $frames += , $stream.ToArray()
}
$image.Dispose()

# 按 ICO 格式拼容器：6 字节文件头 + 每张 16 字节目录项 + 各帧数据
$out = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($out)
$writer.Write([uint16]0)              # reserved
$writer.Write([uint16]1)              # type: icon
$writer.Write([uint16]$sizes.Count)   # 帧数

$offset = 6 + 16 * $sizes.Count
for ($index = 0; $index -lt $sizes.Count; $index++) {
    $size = $sizes[$index]
    $frame = $frames[$index]
    $dimension = if ($size -ge 256) { 0 } else { $size }   # 256 要写成 0
    $writer.Write([byte]$dimension)   # 宽
    $writer.Write([byte]$dimension)   # 高
    $writer.Write([byte]0)            # 调色板数
    $writer.Write([byte]0)            # 保留
    $writer.Write([uint16]1)          # 色彩平面
    $writer.Write([uint16]32)         # 位深
    $writer.Write([uint32]$frame.Length)
    $writer.Write([uint32]$offset)
    $offset += $frame.Length
}
foreach ($frame in $frames) { $writer.Write($frame) }
$writer.Flush()

[System.IO.File]::WriteAllBytes($target, $out.ToArray())
$writer.Dispose()

$kb = [math]::Round((Get-Item $target).Length / 1KB, 1)
Write-Host "已生成 $target（$kb KB，含 $($sizes -join '/') 六档）" -ForegroundColor Green
