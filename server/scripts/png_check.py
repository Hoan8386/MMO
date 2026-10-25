"""Quality check for cutout PNGs (called by src/video/auto-images.js).

For each PNG path given as an argument prints one JSON line:
  {"file", "coverage", "solid", "uniform"} or {"file", "error"}
coverage = opaque share of the box around the subject (1 = no transparency: background not removed);
solid    = share of the subject that is fully opaque (low = faint, smeared cutout);
uniform  = share of neighbouring subject pixels with exactly the same colour. Photos have noise and
           gradients (under ~0.5); vector art, silhouettes and line drawings have flat fills (over ~0.7).
"""
import json
import sys

from PIL import Image

for path in sys.argv[1:]:
    try:
        img = Image.open(path).convert("RGBA")
        img.thumbnail((400, 400))
        box = img.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox()
        if not box:
            raise ValueError("ảnh trống")
        img = img.crop(box)
        w, h = img.size
        px = list(getattr(img, "get_flattened_data", img.getdata)())
        seen = sum(1 for p in px if p[3] > 24)
        pairs = same = 0
        for y in range(h):
            row = px[y * w : (y + 1) * w]
            for a, b in zip(row, row[1:]):
                if a[3] > 200 and b[3] > 200:
                    pairs += 1
                    same += a[:3] == b[:3]
        print(json.dumps({
            "file": path,
            "coverage": round(seen / (w * h), 3),
            "solid": round(sum(1 for p in px if p[3] > 200) / seen, 3),
            "uniform": round(same / max(pairs, 1), 3),
        }), flush=True)
    except Exception as err:  # one bad image must not stop the batch
        print(json.dumps({"file": path, "error": str(err)}), flush=True)
