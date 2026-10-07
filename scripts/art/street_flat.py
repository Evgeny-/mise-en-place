"""Storefront paintings for the food-street map, kept whole on their cream backdrop.

  .venv-art/bin/python scripts/art/street_flat.py

The map lays the storefront's side of the street in the same flat cream, so instead of cutting the
building out (which never cut cleanly) each painting keeps its backdrop: it is evened out to one
exact cream and its edges fade to transparent, so picture and ground melt together.
Reads .cache/art/street/street-<id>-s11.png, writes public/art/street/<id>.webp; a stage without
its own painting reuses the nearest one below it.
"""
import os

import numpy as np
from PIL import Image

SRC = '.cache/art/street'
OUT = 'public/art/street'
SIZE = 420
# the backdrop every painting is evened out to; the map's flat side uses the same colour
CREAM = np.array([245, 230, 206], dtype=np.float32)
KITCHENS = {'trattoria': 4, 'diner': 4, 'taqueria': 4}


def flatten(img):
    rgb = np.asarray(img.convert('RGB').resize((SIZE, SIZE), Image.LANCZOS), dtype=np.float32)
    h, w, _ = rgb.shape
    y, x = np.mgrid[0:h, 0:w]
    u, v = x / (w - 1) - 0.5, y / (h - 1) - 0.5
    # the backdrop has a soft vignette: fit it from the border and shift it to the one cream
    border = np.zeros((h, w), bool)
    border[:10], border[-10:], border[:, :10], border[:, -10:] = True, True, True, True
    terms = lambda a, b: np.stack([np.ones_like(a), a, b, a * a, a * b, b * b], axis=-1)
    coef, *_ = np.linalg.lstsq(terms(u[border], v[border]), rgb[border], rcond=None)
    rgb = np.clip(rgb + (CREAM - terms(u, v) @ coef), 0, 255)
    # fade out towards the edges (a rounded square), fully transparent at the border
    d = np.maximum(np.abs(u), np.abs(v)) * 0.6 + np.hypot(u, v) * 0.4
    alpha = np.clip((0.5 - d) / 0.12, 0, 1)
    alpha = alpha * alpha * (3 - 2 * alpha)
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def main():
    os.makedirs(OUT, exist_ok=True)
    for kitchen, stages in KITCHENS.items():
        last = None
        for stage in range(1, stages + 1):
            src = os.path.join(SRC, f'street-{kitchen}-{stage}-s11.png')
            if os.path.exists(src):
                last = src
            if not last:
                continue
            flatten(Image.open(last)).save(os.path.join(OUT, f'{kitchen}-{stage}.webp'), quality=88)
            print(f'{kitchen}-{stage} <- {os.path.basename(last)}')


if __name__ == '__main__':
    main()
