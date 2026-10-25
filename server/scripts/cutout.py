"""Background removal for cutouts (called by src/video/auto-images.js).

Reads a JSON list of [input, output] pairs from the file named as the first argument (or stdin), writes each subject as a transparent PNG
trimmed to its outline (plus a small margin) and at most MAX px on its long side, and prints one
JSON line per image: {"out", "width", "height", "coverage"} or {"out", "error"}.
coverage = share of the trimmed image that is opaque; very low or very high values usually mean
the model missed the subject or kept the background.

Model: rembg with isnet-general-use (MIT licence), downloaded to ~/.u2net on first use.
"""
import json
import sys

from PIL import Image
from rembg import new_session, remove

MAX = 900
MARGIN = 0.03

session = new_session("isnet-general-use")

pairs = json.load(open(sys.argv[1], encoding="utf-8")) if len(sys.argv) > 1 else json.load(sys.stdin)

for src, out in pairs:
    try:
        img = remove(Image.open(src).convert("RGB"), session=session).convert("RGBA")
        alpha = img.getchannel("A").point(lambda a: 255 if a > 24 else 0)
        box = alpha.getbbox()
        if not box:
            raise ValueError("không tìm thấy vật thể")
        x0, y0, x1, y1 = box
        pad = round(max(x1 - x0, y1 - y0) * MARGIN)
        img = img.crop((max(0, x0 - pad), max(0, y0 - pad), min(img.width, x1 + pad), min(img.height, y1 + pad)))
        img.thumbnail((MAX, MAX), Image.LANCZOS)
        opaque = sum(1 for a in img.getchannel("A").getdata() if a > 24)
        img.save(out, optimize=True)
        print(json.dumps({"out": out, "width": img.width, "height": img.height, "coverage": round(opaque / (img.width * img.height), 3)}), flush=True)
    except Exception as err:  # one bad image must not stop the batch
        print(json.dumps({"out": out, "error": str(err)}), flush=True)
