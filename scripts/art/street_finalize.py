"""Cuts the chosen storefront and prop paintings out of their cream backdrop for the food-street map.

  .venv-art/bin/python scripts/art/street_finalize.py

Props only now (storefronts are kept whole by street_flat.py). Reads scripts/art/street_selection.json
({"prop-trattoria": {"src": "prop-trattoria-s11", "note": "..."}, ...}),
takes .cache/art/street/<src>.png and writes public/art/street/<id>.webp with transparency:
the backdrop is the cream region connected to the picture's border (so cream parts of a building stay solid),
its soft floor shadow becomes a translucent brown shadow, and the result is cropped to the object.
"""
import json
import os

import numpy as np
from PIL import Image

SRC = '.cache/art/street'
SELECTION = 'scripts/art/street_selection.json'
OUT = 'public/art/street'
MAX_SIDE = {'prop': 200, '': 420}
SHADOW = np.array([70, 46, 30], dtype=np.float32)


def backdrop(rgb, mask=None):
    """The cream backdrop as a smooth quadratic surface (it has a soft vignette), fitted to `mask`
    (default: the picture's border)."""
    h, w, _ = rgb.shape
    y, x = np.mgrid[0:h, 0:w]
    x, y = x / w - 0.5, y / h - 0.5
    if mask is None:
        mask = np.zeros((h, w), bool)
        mask[:8], mask[-8:], mask[:, :8], mask[:, -8:] = True, True, True, True
    terms = lambda xx, yy: np.stack([np.ones_like(xx), xx, yy, xx * xx, xx * yy, yy * yy], axis=-1)
    coef, *_ = np.linalg.lstsq(terms(x[mask], y[mask]), rgb[mask], rcond=None)
    return terms(x, y) @ coef


def connected_to_border(mask):
    """Pixels of `mask` reachable from the picture's border through `mask` (4-neighbour flood fill)."""
    seed = np.zeros_like(mask)
    seed[0, :], seed[-1, :], seed[:, 0], seed[:, -1] = mask[0, :], mask[-1, :], mask[:, 0], mask[:, -1]
    while True:
        grown = seed.copy()
        grown[1:, :] |= seed[:-1, :]
        grown[:-1, :] |= seed[1:, :]
        grown[:, 1:] |= seed[:, :-1]
        grown[:, :-1] |= seed[:, 1:]
        grown &= mask
        if np.array_equal(grown, seed):
            return seed
        seed = grown


def box_blur(a, r):
    """Mean over a (2r+1) square, edges clamped."""
    p = np.pad(a, r, mode='edge')
    c = p.cumsum(0).cumsum(1)
    c = np.pad(c, ((1, 0), (1, 0)))
    k = 2 * r + 1
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)


def cut_out(img):
    rgb = np.asarray(img.convert('RGB'), dtype=np.float32)
    lum = rgb.mean(axis=2)
    # edges are walls: the backdrop flood can't leak into a building through its outline
    gy, gx = np.gradient(box_blur(lum, 1))
    wall = np.hypot(gx, gy) > 5

    def backdrop_like(bg):
        # near the backdrop colour and not brighter than it (white paint and highlights are the object)
        return (np.linalg.norm(rgb - bg, axis=2) < 34) & (lum - bg.mean(axis=2) < 9) & ~wall

    bg = backdrop(rgb)
    for _ in range(3):  # refit the backdrop to everything that is backdrop, not just the border
        bg = backdrop(rgb, connected_to_border(backdrop_like(bg)))
    outside = connected_to_border(backdrop_like(bg))
    # the floor around the base also catches a pale pool of light: let the backdrop take it too
    floor = np.zeros_like(outside)
    floor[int(rgb.shape[0] * 0.5):] = True
    pool = floor & (np.linalg.norm(rgb - bg, axis=2) < 40) & (lum - bg.mean(axis=2) < 30) & ~wall
    outside = connected_to_border(outside | pool)
    # close pinholes in the object, then feather its edge by a pixel or two
    inside = box_blur((~outside).astype(np.float32), 1) > 0.5
    alpha = np.clip(box_blur(inside.astype(np.float32), 1) * 1.6 - 0.3, 0, 1)
    # the darker backdrop around it is the floor shadow: keep it as a soft brown shadow
    shadow = np.clip((bg.mean(axis=2) - lum - 5) / 46, 0, 0.55) * (1 - alpha)
    a = np.clip(alpha + shadow, 0, 1)
    colour = np.where(alpha[..., None] > 0.02, rgb, SHADOW)
    out = np.dstack([colour, a * 255]).clip(0, 255).astype(np.uint8)
    res = Image.fromarray(out, 'RGBA')
    box = res.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox()
    if box:
        l, t, r, b = box
        res = res.crop((max(0, l - 6), max(0, t - 6), min(res.width, r + 6), min(res.height, b + 6)))
    return res


def main():
    os.makedirs(OUT, exist_ok=True)
    picks = json.load(open(SELECTION))
    for out_id, pick in picks.items():
        img = cut_out(Image.open(os.path.join(SRC, pick['src'] + '.png')))
        side = MAX_SIDE['prop' if out_id.startswith('prop') else '']
        img.thumbnail((side, side), Image.LANCZOS)
        path = os.path.join(OUT, out_id + '.webp')
        img.save(path, 'WEBP', quality=80, method=6)
        print(f'{path} {img.width}x{img.height} {os.path.getsize(path) // 1024} KB')


if __name__ == '__main__':
    main()
