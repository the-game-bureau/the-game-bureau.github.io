#!/usr/bin/env python
"""Swap in a new gift-shop banner.

Takes any source image (e.g. a ChatGPT/DALL-E export) and writes it to
shop/shop_banner.png at exactly 1672x941 — the size declared in the
og:image / twitter:image meta tags in shop/index.html. The new file reuses
the same path/name, so every reference (the two social meta tags, the
desktop + mobile hero CSS backgrounds, and the JS card image) picks it up
with no code changes.

It center-crops to the 16:9-ish target aspect (so nothing is squished),
then resizes with high-quality resampling. The previous banner is backed up
to shop/shop_banner.bak.png.

Usage:
    python _dev/scripts/swap-shop-banner.py "C:/Users/kevin/Downloads/new-banner.png"
"""

import sys
import shutil
from pathlib import Path

from PIL import Image

TARGET_W = 1672
TARGET_H = 941

# Repo root = two levels up from this file (_dev/scripts/ -> repo root).
REPO_ROOT = Path(__file__).resolve().parents[2]
TARGET = REPO_ROOT / "shop" / "shop_banner.png"
BACKUP = REPO_ROOT / "shop" / "shop_banner.bak.png"


def crop_to_aspect(img, target_w, target_h):
    """Center-crop img to the target aspect ratio (no distortion)."""
    target_ratio = target_w / target_h
    w, h = img.size
    ratio = w / h
    if ratio > target_ratio:
        # too wide -> trim the sides
        new_w = round(h * target_ratio)
        left = (w - new_w) // 2
        box = (left, 0, left + new_w, h)
    else:
        # too tall -> trim top/bottom
        new_h = round(w / target_ratio)
        top = (h - new_h) // 2
        box = (0, top, w, top + new_h)
    return img.crop(box)


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: python _dev/scripts/swap-shop-banner.py <source-image>")

    src = Path(sys.argv[1]).expanduser()
    if not src.is_file():
        sys.exit("source image not found: " + str(src))

    img = Image.open(src)
    print("source:", src.name, f"{img.width}x{img.height}", img.mode)

    img = img.convert("RGB")
    img = crop_to_aspect(img, TARGET_W, TARGET_H)
    img = img.resize((TARGET_W, TARGET_H), Image.LANCZOS)

    if TARGET.exists():
        shutil.copy2(TARGET, BACKUP)
        print("backed up old banner ->", BACKUP.relative_to(REPO_ROOT))

    img.save(TARGET, "PNG", optimize=True)
    out_kb = TARGET.stat().st_size / 1024
    print("wrote:", TARGET.relative_to(REPO_ROOT), f"{TARGET_W}x{TARGET_H}", f"{out_kb:.0f} KB")
    print("done — commit shop/shop_banner.png and the swap is live.")


if __name__ == "__main__":
    main()
