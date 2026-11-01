#!/usr/bin/env python3
"""Generate the app icon for macOS (build/icon.png) and Android (mipmaps + splash).

Usage:  python3 scripts/generate_icons.py      (requires Pillow: pip install pillow)
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android" / "app" / "src" / "main" / "res"
S = 1024  # master size


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def artwork(size: int = S, background: bool = True) -> Image.Image:
    """Three rails converging to the horizon with a gold coin on top."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = size / 1024

    if background:
        top, bottom = (24, 40, 92), (255, 160, 60)
        for y in range(size):
            d.line([(0, y), (size, y)], fill=lerp(top, bottom, y / size) + (255,))

    horizon_y = 430 * u
    vx = size / 2
    # Gravel bed
    d.polygon([(vx - 40 * u, horizon_y), (vx + 40 * u, horizon_y), (size, size), (0, size)], fill=(70, 62, 58, 255))
    # Sleepers
    for i in range(1, 12):
        t = (i / 11) ** 2.2
        y = horizon_y + (size - horizon_y) * t
        half = 40 * u + (size / 2 - 40 * u) * t
        h = max(2, 26 * u * t)
        d.rectangle([vx - half * 0.92, y, vx + half * 0.92, y + h], fill=(150, 120, 90, 255))
    # Rails (three tracks -> six rails)
    for lane in (-1, 0, 1):
        for side in (-0.28, 0.28):
            x_far = vx + (lane + side) * 26 * u
            x_near = vx + (lane + side) * 340 * u
            d.line([(x_far, horizon_y), (x_near, size)], fill=(215, 220, 230, 255), width=max(2, int(14 * u)))

    # Coin with soft shadow
    cx, cy, r = vx, 330 * u, 210 * u
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse([cx - r, cy - r + 30 * u, cx + r, cy + r + 30 * u], fill=(0, 0, 0, 120))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(20 * u)))
    d = ImageDraw.Draw(img)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(196, 132, 18, 255))
    d.ellipse([cx - r * 0.86, cy - r * 0.86, cx + r * 0.86, cy + r * 0.86], fill=(255, 205, 50, 255))
    d.ellipse([cx - r * 0.70, cy - r * 0.70, cx + r * 0.70, cy + r * 0.70], outline=(214, 150, 20, 255), width=int(12 * u))
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", int(230 * u))
    except OSError:
        font = ImageFont.load_default()
    d.text((cx, cy + 6 * u), "S", font=font, fill=(196, 120, 10, 255), anchor="mm")
    return img


def rounded(img: Image.Image, radius_ratio: float = 0.225) -> Image.Image:
    size = img.width
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def circle(img: Image.Image) -> Image.Image:
    size = img.width
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def main() -> None:
    master = artwork()

    # macOS: electron-builder turns build/icon.png (1024x1024) into an .icns.
    # Apple icons have transparent margins around a rounded square.
    mac = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    inner = rounded(master.resize((824, 824), Image.LANCZOS))
    mac.alpha_composite(inner, (100, 100))
    (ROOT / "build").mkdir(exist_ok=True)
    mac.save(ROOT / "build" / "icon.png")

    # Android adaptive icon: shrink the artwork into the safe zone, fill the rest with sky
    adaptive = artwork(background=True)
    shrunk = int(S * 0.70)
    adaptive.alpha_composite(master.resize((shrunk, shrunk), Image.LANCZOS), ((S - shrunk) // 2, (S - shrunk) // 2))

    # Android launcher icons
    densities = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
    for name, scale in densities.items():
        folder = RES / f"mipmap-{name}"
        legacy = int(48 * scale)
        rounded(master.resize((legacy, legacy), Image.LANCZOS), 0.18).save(folder / "ic_launcher.png")
        circle(master.resize((legacy, legacy), Image.LANCZOS)).save(folder / "ic_launcher_round.png")
        # Adaptive icon foreground: launchers only show the central 72dp of the 108dp layer
        fg = int(108 * scale)
        adaptive.resize((fg, fg), Image.LANCZOS).save(folder / "ic_launcher_foreground.png")

    # Splash screens (shown while the WebView starts): black with the icon centered
    for folder in RES.glob("drawable*"):
        splash = folder / "splash.png"
        if not splash.exists():
            continue
        w, h = Image.open(splash).size
        canvas = Image.new("RGB", (w, h), (0, 0, 0))
        icon_size = int(min(w, h) * 0.35)
        icon = rounded(master.resize((icon_size, icon_size), Image.LANCZOS))
        canvas.paste(icon, ((w - icon_size) // 2, (h - icon_size) // 2), icon)
        canvas.save(splash)

    print("Icons written to build/icon.png and", RES)


if __name__ == "__main__":
    main()
