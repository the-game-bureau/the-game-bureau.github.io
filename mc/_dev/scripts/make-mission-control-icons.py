"""Render the radio-tower mast — the same Lucide glyph the MISSION CONTROL nav
button and the /mc/ headline carry — as a favicon and a home-screen icon.

Drawn rather than traced: there is no SVG rasteriser on this machine (ImageMagick
is absent, and `convert` on Windows is the filesystem tool), so the seven Lucide
paths are reproduced here with primitives. The two outer waves and the two inner
waves are circular arcs about the antenna, which is why they can be: measured off
the path data they sit at r=10.04 and r=6.0 from (12, 9).

Supersampled 8x and downsampled with LANCZOS, because ImageDraw.arc and .line do
not anti-alias and a 2px stroke on a 24 grid is nothing but diagonal edges.

Backgrounds are OPAQUE. iOS composites an apple-touch-icon onto black before it
applies the squircle mask, so a transparent one arrives as a black tile.
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path('mc/assets/brand')
PAPER = (254, 254, 249, 255)   # --paper-base
BLUE = (45, 72, 128, 255)      # --bic-blue

SS = 8                          # supersample factor
BOX = 24.0                      # the SVG viewBox
CX, CY = 12.0, 9.0              # the antenna: every arc is measured from here


def render(px, stroke=2.15, pad=0.085, bg=PAPER):
    """One icon at px by px. `pad` is a fraction of the edge kept clear."""
    n = px * SS
    img = Image.new('RGBA', (n, n), bg)
    d = ImageDraw.Draw(img)

    # The glyph is ~20.1 units square centred on (12, 11.95) -- the waves reach
    # x 1.96..22.04, and the mast foot sits at y 22. Fit THAT, not the 24 box,
    # or the icon carries a lopsided margin at 16px where it matters most.
    gw = 20.1
    span = n * (1 - 2 * pad)
    s = span / gw
    ox = n / 2 - 12.0 * s
    oy = n / 2 - 11.95 * s

    def P(x, y):
        return (ox + x * s, oy + y * s)

    w = max(1, round(stroke * s))

    def arc(r, a0, a1):
        x0, y0 = P(CX - r, CY - r)
        x1, y1 = P(CX + r, CY + r)
        d.arc([x0, y0, x1, y1], a0, a1, fill=BLUE, width=w)

    # Lucide radio-tower, path for path.
    arc(10.04, 135, 225)   # M4.9 16.1 C1 12.2 1 5.8 4.9 1.9      outer left
    arc(6.00, 148, 226)    # M7.8 4.7 a6.14 6.14 0 0 0 -.8 7.5    inner left
    arc(6.00, 314, 32)     # M16.2 4.8 c2 2 2.26 5.11 .8 7.47     inner right
    arc(10.04, 315, 45)    # M19.1 1.9 a9.96 9.96 0 0 1 0 14.1    outer right

    # circle cx=12 cy=9 r=2 -- the antenna itself
    x0, y0 = P(CX - 2, CY - 2)
    x1, y1 = P(CX + 2, CY + 2)
    d.ellipse([x0, y0, x1, y1], outline=BLUE, width=w)

    # m8 22 4-11 4 11 -- the mast. Joined as one polyline so the apex meets.
    d.line([P(8, 22), P(12, 11), P(16, 22)], fill=BLUE, width=w, joint='curve')
    # Round the two feet; joint='curve' only rounds interior joins.
    for x, y in ((8, 22), (16, 22)):
        cx_, cy_ = P(x, y)
        d.ellipse([cx_ - w / 2, cy_ - w / 2, cx_ + w / 2, cy_ + w / 2], fill=BLUE)

    # M9.5 18 h5 -- the crossbar
    d.line([P(9.5, 18), P(14.5, 18)], fill=BLUE, width=w)

    return img.resize((px, px), Image.LANCZOS)


OUT.mkdir(parents=True, exist_ok=True)

# The favicon. Heavier stroke and a tighter margin at the small sizes: at 16px a
# 2.15 stroke lands under one device pixel and the waves grey out to nothing.
ico_sizes = [(16, 2.9, 0.03), (32, 2.5, 0.05), (48, 2.3, 0.06),
             (64, 2.2, 0.07), (128, 2.15, 0.085), (256, 2.15, 0.085)]
frames = [render(px, st, pd) for px, st, pd in ico_sizes]
frames[-1].save(OUT / 'mission-control.ico', format='ICO',
                sizes=[(f.width, f.height) for f in frames],
                append_images=frames[:-1])
print('  mission-control.ico  ' + ', '.join(str(f.width) for f in frames))

# Home screen and PWA. 180 is what iOS asks for; 192 and 512 are the manifest's.
for px, name in ((180, 'mission-control-180.png'),
                 (192, 'mission-control-192.png'),
                 (512, 'mission-control-512.png')):
    render(px).save(OUT / name, format='PNG')
    print('  %s  %dx%d' % (name, px, px))

# Maskable: Android crops to a circle, so the glyph has to sit inside the safe
# zone (the middle 80%) or the mast's feet are shaved off.
render(512, stroke=2.15, pad=0.20).save(OUT / 'mission-control-maskable-512.png', format='PNG')
print('  mission-control-maskable-512.png  512x512')
