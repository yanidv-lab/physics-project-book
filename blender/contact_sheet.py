"""Combine blender/.previews/*.png into one labelled contact sheet.

    python3 blender/contact_sheet.py [out.png] [names...]
"""
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
PREV = os.path.join(HERE, ".previews")
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(PREV, "_sheet.png")
names = sys.argv[2:] or sorted(f[:-4] for f in os.listdir(PREV) if f.endswith(".png") and not f.startswith("_"))
T, cols = 240, 5
rows = (len(names) + cols - 1) // cols
sheet = Image.new("RGB", (cols * T, rows * (T + 18)), (10, 14, 24))
d = ImageDraw.Draw(sheet)
for i, n in enumerate(names):
    im = Image.open(os.path.join(PREV, f"{n}.png")).convert("RGB").resize((T, T))
    x, y = (i % cols) * T, (i // cols) * (T + 18)
    sheet.paste(im, (x, y))
    d.text((x + 4, y + T + 3), n, fill=(200, 220, 240))
sheet.save(out)
print(out)
