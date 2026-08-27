Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'build'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

# electron-builder wants a Windows .ico file with at least 16x16, 24x24,
# 32x32, 48x48, 64x64 and 128x128. The 256x256 frame causes the
# "index out of range" panic in the icon-converter.
$sizes = @(16, 24, 32, 48, 64, 128)
$bitmaps = @()
foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($s, $s)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'ClearTypeGridFit'

    $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 10, 12, 18))
    $g.FillRectangle($bg, 0, 0, $s, $s)

    $red = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 230, 57, 70))
    $gold = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 240, 198, 74))
    $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 255, 255))

    # Checkered left band
    $bandW = [int]($s * 0.18)
    $cell = [Math]::Max(1, [int]($bandW / 4))
    for ($y = 0; $y -lt 6; $y++) {
        for ($x = 0; $x -lt 4; $x++) {
            $isGold = (($x + $y) % 2 -eq 0)
            if ($isGold) {
                $g.FillRectangle($gold, $x * $cell, $y * $cell, $cell, $cell)
            } else {
                $g.FillRectangle($bg, $x * $cell, $y * $cell, $cell, $cell)
            }
        }
    }

    # Red PD shield
    $sx = [int]($s * 0.36)
    $sy = [int]($s * 0.22)
    $sw = [int]($s * 0.46)
    $sh = [int]($s * 0.56)
    $g.FillRectangle($red, $sx, $sy, $sw, $sh)
    $g.FillEllipse($red, $sx, $sy + $sh - [int]($s * 0.18), $sw, [int]($s * 0.36))

    # PD text
    $fontSize = [int]($s * 0.40)
    if ($fontSize -lt 6) { $fontSize = 6 }
    $font = New-Object System.Drawing.Font('Arial Black', $fontSize, [System.Drawing.FontStyle]::Bold)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = 'Center'
    $sf.LineAlignment = 'Center'
    $rect = New-Object System.Drawing.RectangleF ([float]$sx, [float]($sy + [int]($s * 0.02)), [float]$sw, [float]($sh - [int]($s * 0.04)))
    $g.DrawString('PD', $font, $white, $rect, $sf)

    # Gold underline
    $g.FillRectangle($gold, $sx, [int]($s * 0.80), $sw, [Math]::Max(2, [int]($s * 0.025)))

    $g.Dispose()
    $bitmaps += $bmp
}

# Build ICO with multiple PNG-encoded frames
$pngs = @()
foreach ($bmp in $bitmaps) {
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngs += $ms.ToArray()
    $bmp.Dispose()
}

$outPath = Join-Path $outDir 'icon.ico'
$fs = [System.IO.File]::Create($outPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]$pngs.Count)
$offset = 6 + $pngs.Count * 16
for ($i = 0; $i -lt $pngs.Count; $i++) {
    $w = $sizes[$i]
    if ($w -ge 256) { $w = 0 }
    $bw.Write([byte]$w)
    $bw.Write([byte]$w)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]32)
    $bw.Write([uint32]$pngs[$i].Length)
    $bw.Write([uint32]$offset)
    $offset += $pngs[$i].Length
}
foreach ($p in $pngs) { $bw.Write($p) }
$bw.Close()
$fs.Close()

# Also export 256x256 PNG for documentation
$png256 = New-Object System.Drawing.Bitmap(256, 256)
$g2 = [System.Drawing.Graphics]::FromImage($png256)
$src = $bitmaps[$bitmaps.Count - 1]
$srcX = [System.Drawing.Rectangle]::new(0, 0, $src.Width, $src.Height)
$g2.DrawImage($src, 0, 0, 256, 256)
$g2.Dispose()
$png256.Save((Join-Path $outDir 'icon-256.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$png256.Dispose()
$src.Dispose()

Write-Host "[icon] wrote $outPath with $($pngs.Count) frames (no 256x256)"
