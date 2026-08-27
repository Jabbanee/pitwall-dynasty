Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'build'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

$sizes = @(16, 32, 48, 64, 128, 256)
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

    # Red PD shield (rectangle + half-ellipse bottom)
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
$png256Bytes = $null
foreach ($bmp in $bitmaps) {
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $ms.ToArray()
    if ($bmp.Width -eq 256 -and $bmp.Height -eq 256) { $png256Bytes = $bytes }
    $bmp.Dispose()
    $pngs += $bytes
}

if ($png256Bytes) {
    [System.IO.File]::WriteAllBytes((Join-Path $outDir 'icon.png'), $png256Bytes)
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

foreach ($b in $bitmaps) { try { $b.Dispose() } catch {} }
Write-Host "[icon] wrote $outPath with $($pngs.Count) frames"
