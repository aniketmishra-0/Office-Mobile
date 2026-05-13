"""
Office Mobile — icon generator.

Renders the app mark (dark rounded-square tile with a document-with-
folded-corner glyph) at 512px and downsamples to 192px and 32px so
every icon slot shares the same crisp artwork. Run with:

    python frontend/scripts/make_icons.py

Output overwrites:
    frontend/public/favicon.png           (32x32)
    frontend/public/icons/icon-192.png    (192x192)
    frontend/public/icons/icon-512.png    (512x512)
"""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw

# ── Palette (mirrors globals.css "Ink on Rice Paper") ────────────
INK = (26, 23, 20, 255)        # #1A1714 — tile background
CREAM = (243, 236, 226, 255)   # #F3ECE2 — primary glyph stroke
STONE = (156, 148, 136, 255)   # #9C9488 — secondary text lines
HAIRLINE = (53, 48, 43, 255)   # subtle outer hairline (dark theme)

# Render at 4× the target size and downsample with LANCZOS for the
# sharpest possible edges at every exported slot.
SCALE = 4
TARGET = 512
CANVAS = TARGET * SCALE


def rounded_square(draw: ImageDraw.ImageDraw, bounds, radius, fill=None, outline=None, width=0):
    x0, y0, x1, y1 = bounds
    draw.rounded_rectangle(bounds, radius=radius, fill=fill, outline=outline, width=width)


def render() -> Image.Image:
    img = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # ── Outer tile (full bleed, rounded) ─────────────────────────
    # A tight full-bleed tile means the icon fills any launcher
    # without the original reference's wasted dark margin.
    tile_radius = int(CANVAS * 0.22)
    d.rounded_rectangle((0, 0, CANVAS, CANVAS), radius=tile_radius, fill=INK)

    # Very faint inner hairline, the kind of editorial 1px rule we
    # use everywhere else in the UI.
    inset = int(CANVAS * 0.02)
    d.rounded_rectangle(
        (inset, inset, CANVAS - inset, CANVAS - inset),
        radius=tile_radius - inset,
        outline=HAIRLINE,
        width=max(1, int(CANVAS * 0.003)),
    )

    # ── Document glyph — centered ────────────────────────────────
    # Proportions match the reference: a roughly 3:4 sheet occupying
    # ~46% of the tile, with a folded top-right corner and two
    # horizontal text rules inside.
    glyph_w = int(CANVAS * 0.46)
    glyph_h = int(CANVAS * 0.54)
    cx, cy = CANVAS / 2, CANVAS / 2
    gx0 = int(cx - glyph_w / 2)
    gy0 = int(cy - glyph_h / 2)
    gx1 = gx0 + glyph_w
    gy1 = gy0 + glyph_h

    stroke = max(2, int(CANVAS * 0.012))
    corner_r = int(glyph_w * 0.14)

    # Fold corner size
    fold = int(glyph_w * 0.26)

    # Draw the page body as a rounded rectangle with the top-right
    # corner chopped off by the fold triangle. We render the page on
    # a transparent layer then mask the corner by painting the fold
    # triangle in the background tone on top.
    page_layer = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    pd = ImageDraw.Draw(page_layer)
    pd.rounded_rectangle(
        (gx0, gy0, gx1, gy1),
        radius=corner_r,
        outline=CREAM,
        width=stroke,
    )

    # Knock out the top-right corner by filling a triangle in the
    # tile colour so the rounded rectangle's corner becomes the fold.
    corner_tri = [
        (gx1 - fold, gy0 - stroke),
        (gx1 + stroke, gy0 - stroke),
        (gx1 + stroke, gy0 + fold),
    ]
    pd.polygon(corner_tri, fill=INK)

    # Draw the fold — two strokes forming the triangle flap.
    # Outer edge (diagonal) and the right+top sides of the little flap.
    fold_pts_outer = [
        (gx1 - fold, gy0),
        (gx1, gy0 + fold),
    ]
    pd.line(fold_pts_outer, fill=CREAM, width=stroke)

    # Fold triangle — small filled/stroked flap in the corner.
    flap = [
        (gx1 - fold, gy0),
        (gx1 - fold, gy0 + fold),
        (gx1, gy0 + fold),
    ]
    pd.polygon(flap, outline=CREAM, fill=INK)
    pd.line([flap[0], flap[1]], fill=CREAM, width=stroke)
    pd.line([flap[1], flap[2]], fill=CREAM, width=stroke)

    img.alpha_composite(page_layer)

    # ── Text rules inside the page ───────────────────────────────
    line_stroke = max(2, int(CANVAS * 0.018))
    inner_pad_x = int(glyph_w * 0.18)
    # Vertical placement — a little below center, like the reference.
    line1_y = int(gy0 + glyph_h * 0.56)
    line2_y = int(gy0 + glyph_h * 0.72)
    line1_x0 = gx0 + inner_pad_x
    line1_x1 = gx1 - inner_pad_x
    line2_x0 = gx0 + inner_pad_x
    line2_x1 = gx1 - int(inner_pad_x * 1.9)  # shorter second line

    d.line([(line1_x0, line1_y), (line1_x1, line1_y)], fill=STONE, width=line_stroke)
    d.line([(line2_x0, line2_y), (line2_x1, line2_y)], fill=STONE, width=line_stroke)

    # Downsample to target size.
    return img.resize((TARGET, TARGET), Image.LANCZOS)


def save_all(master: Image.Image, root: Path) -> None:
    sizes = {
        root / "public" / "icons" / "icon-512.png": 512,
        root / "public" / "icons" / "icon-192.png": 192,
        root / "public" / "favicon.png": 32,
    }
    for path, size in sizes.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        resized = master.resize((size, size), Image.LANCZOS)
        # favicon is saved as RGB (no alpha) for broadest browser support.
        if path.name == "favicon.png":
            bg = Image.new("RGB", resized.size, INK[:3])
            bg.paste(resized, mask=resized.split()[-1])
            bg.save(path, "PNG", optimize=True)
        else:
            resized.save(path, "PNG", optimize=True)
        print(f"  wrote {path.relative_to(root)} ({size}x{size})")


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    master = render()
    save_all(master, root)


if __name__ == "__main__":
    main()
