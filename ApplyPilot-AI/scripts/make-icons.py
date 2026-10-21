"""Generates the extension icons (gradient rounded square + paper-plane glyph). Run: python scripts/make-icons.py (needs Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "apps/extension/public/icons"
OUT.mkdir(parents=True, exist_ok=True)
S = 512  # draw large, then downsample for smooth edges


def render() -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    grad = Image.new("RGBA", (S, S))
    px = grad.load()
    a, b = (0x22, 0xD3, 0xEE), (0x8B, 0x5C, 0xF6)
    for y in range(S):
        for x in range(S):
            t = (x + y) / (2 * S)
            px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.22), fill=255)
    img.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(img)
    ink = (0x0B, 0x0E, 0x14, 255)
    # paper plane
    d.polygon([(S * .20, S * .50), (S * .80, S * .22), (S * .60, S * .78), (S * .48, S * .56)], fill=ink)
    d.polygon([(S * .48, S * .56), (S * .80, S * .22), (S * .40, S * .52)], fill=(0x0B, 0x0E, 0x14, 150))
    return img


big = render()
for size in (16, 32, 48, 128):
    big.resize((size, size), Image.LANCZOS).save(OUT / f"icon-{size}.png")
print("icons written to", OUT)
