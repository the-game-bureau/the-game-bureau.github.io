$ErrorActionPreference = 'Stop'

$Root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$OutDir = Resolve-Path $PSScriptRoot
$Ffmpeg = Join-Path $Root '.tmp\video-tools\node_modules\ffmpeg-static\ffmpeg.exe'
$HeroPath = Join-Path $Root 'sound\soundtrack_hero.jpg'
$LogoPath = Join-Path $Root 'assets\brand\logo.png'

if (!(Test-Path $Ffmpeg)) { throw "ffmpeg-static was not found at $Ffmpeg" }
if (!(Test-Path $HeroPath)) { throw "Missing hero image: $HeroPath" }
if (!(Test-Path $LogoPath)) { throw "Missing logo image: $LogoPath" }

Add-Type -AssemblyName System.Drawing

function Color-Hex($hex, [int]$alpha = 255) {
  $h = $hex.TrimStart('#')
  return [System.Drawing.Color]::FromArgb(
    $alpha,
    [Convert]::ToInt32($h.Substring(0, 2), 16),
    [Convert]::ToInt32($h.Substring(2, 2), 16),
    [Convert]::ToInt32($h.Substring(4, 2), 16)
  )
}

function RectF($x, $y, $w, $h) {
  return [System.Drawing.RectangleF]::new([single]$x, [single]$y, [single]$w, [single]$h)
}

function Path-RoundedRect([System.Drawing.RectangleF]$rect, [single]$radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $d = $radius * 2
  if ($radius -le 0) {
    $path.AddRectangle($rect)
    $path.CloseFigure()
    return $path
  }
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function Fill-RoundedRect($g, [System.Drawing.Brush]$brush, [System.Drawing.RectangleF]$rect, [single]$radius) {
  $path = Path-RoundedRect $rect $radius
  $g.FillPath($brush, $path)
  $path.Dispose()
}

function Stroke-RoundedRect($g, [System.Drawing.Pen]$pen, [System.Drawing.RectangleF]$rect, [single]$radius) {
  $path = Path-RoundedRect $rect $radius
  $g.DrawPath($pen, $path)
  $path.Dispose()
}

function Draw-CoverImage($g, [System.Drawing.Image]$img, [System.Drawing.RectangleF]$dest, [single]$opacity, [single]$xBias = 0.5, [single]$yBias = 0.5) {
  $scale = [Math]::Max($dest.Width / $img.Width, $dest.Height / $img.Height)
  $srcW = $dest.Width / $scale
  $srcH = $dest.Height / $scale
  $srcX = ($img.Width - $srcW) * $xBias
  $srcY = ($img.Height - $srcH) * $yBias

  $attrs = [System.Drawing.Imaging.ImageAttributes]::new()
  $matrix = [System.Drawing.Imaging.ColorMatrix]::new()
  $matrix.Matrix33 = $opacity
  $attrs.SetColorMatrix($matrix, [System.Drawing.Imaging.ColorMatrixFlag]::Default, [System.Drawing.Imaging.ColorAdjustType]::Bitmap)
  $g.DrawImage(
    $img,
    [System.Drawing.Rectangle]::Round($dest),
    [single]$srcX,
    [single]$srcY,
    [single]$srcW,
    [single]$srcH,
    [System.Drawing.GraphicsUnit]::Pixel,
    $attrs
  )
  $attrs.Dispose()
}

function Draw-Text($g, [string]$text, [System.Drawing.Font]$font, [System.Drawing.Brush]$brush, [System.Drawing.RectangleF]$rect, [string]$align = 'Near', [string]$lineAlign = 'Near') {
  $fmt = [System.Drawing.StringFormat]::new()
  $fmt.Alignment = [System.Drawing.StringAlignment]::$align
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::$lineAlign
  $fmt.Trimming = [System.Drawing.StringTrimming]::Word
  $g.DrawString($text, $font, $brush, $rect, $fmt)
  $fmt.Dispose()
}

function Draw-Brand($g, [int]$w, [int]$h, [bool]$vertical, [System.Drawing.Image]$logo) {
  $m = if ($vertical) { 72 } else { 92 }
  $mark = if ($vertical) { 64 } else { 56 }
  $box = RectF $m $m $mark $mark
  $white = [System.Drawing.SolidBrush]::new((Color-Hex '#fffdf7' 245))
  Fill-RoundedRect $g $white $box 6
  $white.Dispose()
  Draw-CoverImage $g $logo $box 1.0 0.5 0.38

  if ($vertical) { $monoSize = 27 } else { $monoSize = 23 }
  $mono = [System.Drawing.Font]::new('Consolas', $monoSize, [System.Drawing.FontStyle]::Bold)
  $brush = [System.Drawing.SolidBrush]::new((Color-Hex '#f7f0dc'))
  $accent = [System.Drawing.SolidBrush]::new((Color-Hex '#ff4a1f'))
  $x = $m + $mark + 20
  Draw-Text $g 'THE GAME BUREAU' $mono $brush (RectF $x ($m + 2) 520 32)
  Draw-Text $g 'SOUNDTRACKS' $mono $accent (RectF $x ($m + 34) 420 32)
  $mono.Dispose(); $brush.Dispose(); $accent.Dispose()
}

function Draw-Cassette($g, [single]$x, [single]$y, [single]$w, [single]$h, [string]$label, [string]$accentHex, [single]$angle = 0) {
  $state = $g.Save()
  $g.TranslateTransform($x + $w / 2, $y + $h / 2)
  $g.RotateTransform($angle)
  $g.TranslateTransform(-$w / 2, -$h / 2)

  $shell = [System.Drawing.Drawing2D.LinearGradientBrush]::new((RectF 0 0 $w $h), (Color-Hex '#252b38'), (Color-Hex '#070b12'), 90)
  $ink = [System.Drawing.Pen]::new((Color-Hex '#03050c'), 3)
  Fill-RoundedRect $g $shell (RectF 0 0 $w $h) 5
  Stroke-RoundedRect $g $ink (RectF 0 0 $w $h) 5
  $shell.Dispose(); $ink.Dispose()

  $labelRect = RectF ($w * 0.08) ($h * 0.19) ($w * 0.84) ($h * 0.62)
  $labelBg = [System.Drawing.SolidBrush]::new((Color-Hex '#fffdf7'))
  $accent = [System.Drawing.SolidBrush]::new((Color-Hex $accentHex))
  Fill-RoundedRect $g $labelBg $labelRect 2
  $g.FillRectangle($accent, $labelRect.X, $labelRect.Y, [single]($w * 0.025), $labelRect.Height)
  $g.FillRectangle($accent, $labelRect.Right - ($w * 0.025), $labelRect.Y, [single]($w * 0.025), $labelRect.Height)

  $pen = [System.Drawing.Pen]::new((Color-Hex '#111827'), 2)
  $g.DrawRectangle($pen, $labelRect.X, $labelRect.Y, $labelRect.Width, $labelRect.Height)

  $fontSize = [Math]::Max(16, $h * 0.27)
  $font = [System.Drawing.Font]::new('Segoe Print', $fontSize, [System.Drawing.FontStyle]::Bold)
  $textBrush = [System.Drawing.SolidBrush]::new((Color-Hex '#101827'))
  Draw-Text $g $label $font $textBrush (RectF ($labelRect.X + $w * 0.045) ($labelRect.Y + $h * 0.04) ($labelRect.Width - $w * 0.09) ($labelRect.Height - $h * 0.06)) 'Near' 'Center'

  $labelBg.Dispose(); $accent.Dispose(); $pen.Dispose(); $font.Dispose(); $textBrush.Dispose()
  $g.Restore($state)
}

function Draw-Pill($g, [single]$x, [single]$y, [single]$w, [single]$h, [string]$text, [string]$accentHex) {
  $bg = [System.Drawing.SolidBrush]::new((Color-Hex '#111827' 230))
  $border = [System.Drawing.Pen]::new((Color-Hex $accentHex 235), 3)
  Fill-RoundedRect $g $bg (RectF $x $y $w $h) 8
  Stroke-RoundedRect $g $border (RectF $x $y $w $h) 8
  $font = [System.Drawing.Font]::new('Consolas', [Math]::Max(21, $h * 0.25), [System.Drawing.FontStyle]::Bold)
  $brush = [System.Drawing.SolidBrush]::new((Color-Hex '#f7f0dc'))
  Draw-Text $g $text $font $brush (RectF ($x + 24) ($y + 4) ($w - 48) ($h - 8)) 'Center' 'Center'
  $bg.Dispose(); $border.Dispose(); $font.Dispose(); $brush.Dispose()
}

function Draw-HeadlineBlock($g, [hashtable]$layout, [string]$kicker, [string]$title, [string]$body) {
  $accent = [System.Drawing.SolidBrush]::new((Color-Hex '#ff4a1f'))
  $light = [System.Drawing.SolidBrush]::new((Color-Hex '#fff7df'))
  $muted = [System.Drawing.SolidBrush]::new((Color-Hex '#cbd5e1'))

  $kickerFont = [System.Drawing.Font]::new('Consolas', $layout.KickerSize, [System.Drawing.FontStyle]::Bold)
  $titleFont = [System.Drawing.Font]::new('Bahnschrift Condensed', $layout.TitleSize, [System.Drawing.FontStyle]::Bold)
  $bodyFont = [System.Drawing.Font]::new('Segoe UI', $layout.BodySize, [System.Drawing.FontStyle]::Regular)

  Draw-Text $g $kicker $kickerFont $accent (RectF $layout.X $layout.Y $layout.Width 54)
  Draw-Text $g $title $titleFont $light (RectF $layout.X ($layout.Y + $layout.TitleTop) $layout.Width $layout.TitleHeight)
  Draw-Text $g $body $bodyFont $muted (RectF $layout.X ($layout.Y + $layout.BodyTop) $layout.Width $layout.BodyHeight)

  $kickerFont.Dispose(); $titleFont.Dispose(); $bodyFont.Dispose()
  $accent.Dispose(); $light.Dispose(); $muted.Dispose()
}

function Render-Slide([string]$path, [int]$w, [int]$h, [int]$index, [System.Drawing.Image]$hero, [System.Drawing.Image]$logo) {
  $vertical = $h -gt $w
  $bmp = [System.Drawing.Bitmap]::new($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $bg = [System.Drawing.SolidBrush]::new((Color-Hex '#070b12'))
  $g.FillRectangle($bg, 0, 0, $w, $h)
  $bg.Dispose()

  $biases = @(0.18, 0.34, 0.50, 0.66, 0.82)
  Draw-CoverImage $g $hero (RectF 0 0 $w $h) 0.38 $biases[$index] 0.5

  if ($vertical) { $overlayAngle = 90 } else { $overlayAngle = 0 }
  $overlay = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    (RectF 0 0 $w $h),
    (Color-Hex '#070b12' 245),
    (Color-Hex '#101827' 178),
    $overlayAngle
  )
  $g.FillRectangle($overlay, 0, 0, $w, $h)
  $overlay.Dispose()

  if ($vertical) {
    $accentWidth = 8
    $accentY = 238
  } else {
    $accentWidth = 7
    $accentY = 176
  }
  $accentPen = [System.Drawing.Pen]::new((Color-Hex '#ff4a1f' 220), $accentWidth)
  $g.DrawLine($accentPen, 0, $accentY, $w, $accentY)
  $accentPen.Dispose()

  Draw-Brand $g $w $h $vertical $logo

  if ($vertical) {
    $layout = @{
      X = 76; Y = 330; Width = 930; KickerSize = 31; TitleSize = 88;
      BodySize = 36; TitleTop = 58; TitleHeight = 330; BodyTop = 360; BodyHeight = 260
    }
  } else {
    $layout = @{
      X = 114; Y = 245; Width = 940; KickerSize = 28; TitleSize = 86;
      BodySize = 35; TitleTop = 54; TitleHeight = 292; BodyTop = 342; BodyHeight = 210
    }
  }

  switch ($index) {
    0 {
      Draw-HeadlineBlock $g $layout 'CITY SOUNDTRACKS' 'Every city gets its own tape.' "The Game Bureau's mixtapes help players hear the place before they ever arrive."
      if ($vertical) {
        Draw-Cassette $g 92 1195 850 132 'New Orleans Soul Mix' '#ff9f43' -3
        Draw-Cassette $g 128 1360 850 132 'Chicago Street Sounds' '#5570d8' 2
        Draw-Cassette $g 74 1524 850 132 'Miami Local Mix' '#68f27d' -1
      } else {
        Draw-Cassette $g 1130 354 620 95 'New Orleans Soul Mix' '#ff9f43' -4
        Draw-Cassette $g 1190 494 620 95 'Chicago Street Sounds' '#5570d8' 2
        Draw-Cassette $g 1100 634 620 95 'Miami Local Mix' '#68f27d' -1
      }
    }
    1 {
      Draw-HeadlineBlock $g $layout 'WHAT IS ON A TAPE' '15 songs that belong to the city.' 'Local artists, songs that name the streets, records cut nearby, and the team anthems the crowd actually knows.'
      if ($vertical) {
        Draw-Pill $g 92 1210 395 92 'LOCAL ARTISTS' '#ff9f43'
        Draw-Pill $g 555 1210 395 92 'STREET NAMES' '#5570d8'
        Draw-Pill $g 92 1340 395 92 'GAME-DAY SONGS' '#c8503a'
        Draw-Pill $g 555 1340 395 92 'DEEP CUTS' '#68f27d'
      } else {
        Draw-Pill $g 1160 350 500 92 'LOCAL ARTISTS' '#ff9f43'
        Draw-Pill $g 1240 472 500 92 'STREET NAMES' '#5570d8'
        Draw-Pill $g 1160 594 500 92 'GAME-DAY SONGS' '#c8503a'
        Draw-Pill $g 1240 716 500 92 'DEEP CUTS' '#68f27d'
      }
    }
    2 {
      Draw-HeadlineBlock $g $layout 'HOW PLAYERS USE IT' 'Pick a city. Press play. Start wandering.' 'The cassette opens on /sound/ and plays through Spotify, with a roaming mini cassette if you keep browsing.'
      if ($vertical) {
        Draw-Cassette $g 110 1230 835 130 'Atlanta Jams' '#dec348' 0
        Draw-Cassette $g 190 1395 700 110 'Seattle Soundtrack' '#cda7ff' -2
        Draw-Pill $g 255 1570 570 98 'OPEN IN SPOTIFY' '#1db954'
      } else {
        Draw-Cassette $g 1125 390 650 100 'Atlanta Jams' '#dec348' 0
        Draw-Cassette $g 1215 530 540 84 'Seattle Soundtrack' '#cda7ff' -2
        Draw-Pill $g 1230 674 490 86 'OPEN IN SPOTIFY' '#1db954'
      }
    }
    3 {
      Draw-HeadlineBlock $g $layout 'HOW IT STAYS GOOD' 'Curated daily. Reviewed by humans.' 'An agent adds and audits songs. The Tape Room keeps Spotify IDs, city relevance, spelling, and facts honest.'
      if ($vertical) {
        Draw-Pill $g 106 1210 840 92 'DAILY ADDITIONS' '#ff9f43'
        Draw-Pill $g 106 1338 840 92 'SPOTIFY CHECKS' '#5570d8'
        Draw-Pill $g 106 1466 840 92 'HUMAN REVIEW' '#68f27d'
      } else {
        Draw-Pill $g 1160 378 560 88 'DAILY ADDITIONS' '#ff9f43'
        Draw-Pill $g 1160 506 560 88 'SPOTIFY CHECKS' '#5570d8'
        Draw-Pill $g 1160 634 560 88 'HUMAN REVIEW' '#68f27d'
      }
    }
    4 {
      Draw-HeadlineBlock $g $layout 'THE INVITATION' 'Hear the city before the first clue.' 'Start with the sound, then step into the game.'
      if ($vertical) { $urlFontSize = 46 } else { $urlFontSize = 34 }
      $urlFont = [System.Drawing.Font]::new('Consolas', $urlFontSize, [System.Drawing.FontStyle]::Bold)
      $urlBrush = [System.Drawing.SolidBrush]::new((Color-Hex '#fffdf7'))
      $urlBg = [System.Drawing.SolidBrush]::new((Color-Hex '#ff4a1f' 235))
      if ($vertical) {
        Fill-RoundedRect $g $urlBg (RectF 92 1270 890 112) 8
        Draw-Text $g 'thegamebureau.com/sound' $urlFont $urlBrush (RectF 108 1287 858 84) 'Center' 'Center'
        Draw-Cassette $g 128 1502 810 126 'Your City Soundtrack' '#68f27d' -1
      } else {
        Fill-RoundedRect $g $urlBg (RectF 1082 464 758 100) 8
        Draw-Text $g 'thegamebureau.com/sound' $urlFont $urlBrush (RectF 1100 476 722 76) 'Center' 'Center'
        Draw-Cassette $g 1135 644 625 96 'Your City Soundtrack' '#68f27d' -1
      }
      $urlFont.Dispose(); $urlBrush.Dispose(); $urlBg.Dispose()
    }
  }

  if ($vertical) {
    $footFontSize = 24
    $footX = 76
    $footY = $h - 118
  } else {
    $footFontSize = 20
    $footX = 114
    $footY = $h - 82
  }
  $footFont = [System.Drawing.Font]::new('Consolas', $footFontSize, [System.Drawing.FontStyle]::Regular)
  $footBrush = [System.Drawing.SolidBrush]::new((Color-Hex '#cbd5e1' 190))
  Draw-Text $g 'local music / team anthems / place-name songs' $footFont $footBrush (RectF $footX $footY ($w - 160) 44)
  $footFont.Dispose(); $footBrush.Dispose()

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

function Encode-Cut([string]$name, [int]$w, [int]$h) {
  $slides = @()
  $hero = [System.Drawing.Image]::FromFile($HeroPath)
  $logo = [System.Drawing.Image]::FromFile($LogoPath)
  try {
    for ($i = 0; $i -lt 5; $i++) {
      $slidePath = Join-Path $OutDir ("slide-{0}-{1:D2}.png" -f $name, ($i + 1))
      Render-Slide $slidePath $w $h $i $hero $logo
      $slides += $slidePath
    }
  } finally {
    $hero.Dispose()
    $logo.Dispose()
  }

  $slideDur = 5.0
  $fadeDur = 0.5
  $fps = 30
  $totalDur = ($slideDur * $slides.Count) - ($fadeDur * ($slides.Count - 1))
  $audio = "aevalsrc=0.018*sin(2*PI*146.83*t)+0.012*sin(2*PI*220*t)+0.008*sin(2*PI*293.66*t):s=48000"

  $args = @('-hide_banner', '-y')
  foreach ($slide in $slides) {
    $args += @('-loop', '1', '-t', $slideDur.ToString([Globalization.CultureInfo]::InvariantCulture), '-i', $slide)
  }
  $args += @('-f', 'lavfi', '-t', $totalDur.ToString([Globalization.CultureInfo]::InvariantCulture), '-i', $audio)

  $filters = New-Object System.Collections.Generic.List[string]
  for ($i = 0; $i -lt $slides.Count; $i++) {
    $filters.Add("[${i}:v]scale=${w}:${h},setsar=1,fps=${fps},format=yuv420p[v${i}]")
  }
  $last = '[v0]'
  for ($i = 1; $i -lt $slides.Count; $i++) {
    $offset = (($slideDur - $fadeDur) * $i).ToString([Globalization.CultureInfo]::InvariantCulture)
    $out = if ($i -eq ($slides.Count - 1)) { '[v]' } else { "[x${i}]" }
    $filters.Add("${last}[v${i}]xfade=transition=fade:duration=${fadeDur}:offset=${offset}${out}")
    $last = $out
  }
  $filter = [string]::Join(';', $filters)
  $output = Join-Path $OutDir ("soundtracks-explainer-{0}.mp4" -f $name)

  $args += @(
    '-filter_complex', $filter,
    '-map', '[v]',
    '-map', "$($slides.Count):a",
    '-af', "volume=0.65,afade=t=in:st=0:d=1.2,afade=t=out:st=$($totalDur - 1.2):d=1.2",
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-level', '4.1',
    '-preset', 'medium',
    '-crf', '19',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '96k',
    '-movflags', '+faststart',
    '-shortest',
    $output
  )

  & $Ffmpeg @args
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed for $name" }
  return $output
}

$landscape = Encode-Cut 'landscape' 1920 1080
$vertical = Encode-Cut 'vertical' 1080 1920

Write-Host "Wrote:"
Write-Host $landscape
Write-Host $vertical
