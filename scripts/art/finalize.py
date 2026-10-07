"""Turns the chosen generations into the shipped art and its manifest.

  .venv-art/bin/python scripts/art/finalize.py

Reads scripts/art/selection.json ({"kitchens/trattoria": {"src": "kitchen-trattoria-s23", "crop": [l, t, r, b]?,
"note": "..."}, ...}; "crop" is optional, in source pixels), takes .cache/art/gen/<src>.png, crops/resizes it and
writes public/art/kitchens/<id>.webp, public/art/dishes/<id>.webp, public/art/title.webp and public/og.jpg, each
under its byte budget (the encoder quality is lowered until it fits), then src/data/art.json with every file's
path (relative to the public root, the game is served with base './'), size, bytes, average colour ("color") and
the colour of its plain border ("edge", to blend a backdrop into the page or a dish into its card).
Dishes without an explicit crop are re-centred automatically (same dish scale on every cookbook card).
"""
import io
import json
import os

import numpy as np
from PIL import Image

GEN = '.cache/art/gen'
SELECTION = 'scripts/art/selection.json'
MANIFEST = 'src/data/art.json'

# slot prefix -> (output path pattern, final size, format, byte budget)
SPECS = {
    'kitchens': ('public/art/kitchens/{id}.webp', (768, 1024), 'WEBP', 250_000),
    'dishes': ('public/art/dishes/{id}.webp', (640, 640), 'WEBP', 90_000),
    'title': ('public/art/title.webp', (768, 1152), 'WEBP', 300_000),
    'og': ('public/og.jpg', (1200, 630), 'JPEG', 200_000),
}
KITCHENS = ['trattoria', 'diner', 'taqueria', 'bakery', 'wok', 'spice', 'cafeteria', 'dimsum']
DISHES = ['pizza', 'spaghetti', 'minestrone', 'omelette', 'burger', 'taco', 'croissant', 'friedrice', 'dumplings', 'curry',
          'bruschetta', 'caprese', 'risotto', 'pesto_pasta', 'carbonara', 'gnocchi', 'calzone', 'tiramisu',
          'hotdog', 'pancakes', 'sandwich', 'sundae', 'quesadilla', 'tostada', 'enchiladas', 'burrito']


def fit(img, size, crop=None):
    """Crop (explicit box, else centred to the target aspect) and resize to size."""
    if crop:
        img = img.crop(tuple(crop))
    tw, th = size
    w, h = img.size
    if abs(w / h - tw / th) > 1e-3:
        if w / h > tw / th:  # too wide
            nw = round(h * tw / th)
            img = img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
        else:
            nh = round(w * th / tw)
            img = img.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    return img.resize(size, Image.LANCZOS) if img.size != size else img


def dish_box(img, fill=0.84, max_zoom=1.3):
    """Square crop box around the dish (everything that differs from the plain background), so every
    cookbook picture has its dish centred at about the same scale. Stays inside the source (no padding)
    and never zooms in more than max_zoom."""
    a = np.asarray(img).astype(np.float32)
    border = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3),
                             a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    mask = np.sqrt(((a - bg) ** 2).sum(-1)) > 28
    rows, cols = np.where(mask.sum(1) > 4)[0], np.where(mask.sum(0) > 4)[0]
    W, H = img.size
    if len(rows) == 0 or len(cols) == 0:
        return None
    t, b, l, r = rows[0], rows[-1] + 1, cols[0], cols[-1] + 1
    side = int(round(max(b - t, r - l) / fill))
    side = max(int(min(W, H) / max_zoom), min(side, W, H))
    x0 = int(round(min(max((l + r) / 2 - side / 2, 0), W - side)))
    y0 = int(round(min(max((t + b) / 2 - side / 2, 0), H - side)))
    return [x0, y0, x0 + side, y0 + side]


def encode(img, fmt, budget):
    """Highest quality (90 down to 50) whose file fits the budget."""
    data = b''
    for q in range(90, 49, -2):
        buf = io.BytesIO()
        if fmt == 'WEBP':
            img.save(buf, 'WEBP', quality=q, method=6)
        else:
            img.save(buf, 'JPEG', quality=q, optimize=True, progressive=True, subsampling='4:2:0')
        data = buf.getvalue()
        if len(data) <= budget:
            return data, q
    return data, q


def main():
    sel = json.load(open(SELECTION))
    slots = [f'kitchens/{k}' for k in KITCHENS] + [f'dishes/{d}' for d in DISHES] + ['title', 'og']
    manifest = {'kitchens': {}, 'dishes': {}}
    for slot in slots:
        if slot not in sel:
            print(f'{slot:22s} MISSING in selection.json')
            continue
        entry = sel[slot] if isinstance(sel[slot], dict) else {'src': sel[slot]}
        kind, _, sid = slot.partition('/')
        pattern, size, fmt, budget = SPECS[kind]
        img = Image.open(os.path.join(GEN, entry['src'] + '.png')).convert('RGB')
        crop = entry.get('crop')
        if crop is None and kind == 'dishes':
            crop = dish_box(img)
        img = fit(img, size, crop)
        data, q = encode(img, fmt, budget)
        out = pattern.format(id=sid)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, 'wb').write(data)
        avg = img.resize((1, 1), Image.BOX).getpixel((0, 0))
        a = np.asarray(img)
        edge = np.median(np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3),
                                         a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)]), axis=0)
        info = {'src': os.path.relpath(out, 'public'), 'w': size[0], 'h': size[1], 'bytes': len(data),
                'color': '#%02x%02x%02x' % avg, 'edge': '#%02x%02x%02x' % tuple(int(v) for v in edge)}
        if sid:
            manifest[kind][sid] = info
        else:
            manifest[kind] = info
        flag = '' if len(data) <= budget else '  OVER BUDGET'
        print(f'{slot:22s} <- {entry["src"]:28s} {out:38s} {len(data) / 1000:6.1f} KB q{q}{flag}')
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, 'w') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
    print('->', MANIFEST)


if __name__ == '__main__':
    main()
