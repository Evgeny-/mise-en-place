"""Contact sheets for reviewing generations side by side.

  .venv-art/bin/python scripts/art/sheets.py <name> <thumb width> <pattern> [<pattern> ...]

Every pattern is a glob inside .cache/art/gen (without .png), or several joined with '|', and becomes one
row of labelled thumbnails; the sheet goes to .cache/art/sheets/<name>.png. Example:
  sheets.py kitchens-1 300 'kitchen-trattoria-*' 'kitchen-diner-*'
"""
import glob
import os
import sys

from PIL import Image, ImageDraw, ImageFont

GEN, OUT = '.cache/art/gen', '.cache/art/sheets'


def sheet(name, thumb_w, patterns):
    rows = []
    for p in patterns:  # 'a|b' puts several globs in one row, in that order
        files = [f for q in p.split('|') for f in sorted(glob.glob(os.path.join(GEN, q + '.png')))
                 if os.path.getsize(f) > 0]
        if files:
            rows.append(files)
    if not rows:
        print('nothing matches', patterns)
        return None
    font = ImageFont.load_default(size=15)
    pad, label = 8, 22
    cols = max(len(r) for r in rows)
    # Row height follows the tallest picture of the row, scaled to the thumbnail width.
    sizes = [[Image.open(f).size for f in r] for r in rows]
    heights = [max(round(thumb_w * h / w) for w, h in s) for s in sizes]
    W = pad + cols * (thumb_w + pad)
    H = pad + sum(h + label + pad for h in heights)
    im = Image.new('RGB', (W, H), (236, 232, 226))
    d = ImageDraw.Draw(im)
    y = pad
    for r, h in zip(rows, heights):
        for c, f in enumerate(r):
            src = Image.open(f).convert('RGB')
            th = src.resize((thumb_w, round(thumb_w * src.height / src.width)), Image.LANCZOS)
            x = pad + c * (thumb_w + pad)
            im.paste(th, (x, y))
            d.text((x + 2, y + th.height + 3), os.path.basename(f)[:-4], fill=(40, 40, 40), font=font)
        y += h + label + pad
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + '.png')
    im.save(path)
    print(path, im.size)
    return path


if __name__ == '__main__':
    sheet(sys.argv[1], int(sys.argv[2]), sys.argv[3:])
