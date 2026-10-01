#!/usr/bin/env python3
"""Turn the raw OpenArt generations into game-ready assets.

Usage: python3 tools/process_assets.py <raw_dir>

<raw_dir> must contain the original downloads:
  dwarfs.png (4x4 sheet on magenta)   props.png (3x2 sheet on magenta)
  dinos.png  (2x2 sheet on magenta)   splash.png, icon.png
  tex_{dirt,clay,stone,deep,grass,magma,crystal,obsidian,ruins}.png
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "assets")


def key_cell(rgb, tol=70.0, feather=40.0, key="magenta"):
    """Flood-fill the background from the cell border and return RGBA."""
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((rgb.astype(np.float32) - bg) ** 2).sum(axis=2))
    cand = dist < tol
    lab, _ = ndimage.label(cand)
    border_labels = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    border_labels = border_labels[border_labels > 0]
    mask = np.isin(lab, border_labels)
    # Also drop enclosed background pockets (e.g. between arm and body)
    # that are almost exactly the key colour.
    mask |= dist < tol * 0.55

    alpha = np.where(mask, 0.0, 1.0)
    # soft edge: pixels next to the background get alpha from colour distance
    edge = np.zeros_like(mask)
    edge[1:] |= mask[:-1]
    edge[:-1] |= mask[1:]
    edge[:, 1:] |= mask[:, :-1]
    edge[:, :-1] |= mask[:, 1:]
    edge &= ~mask
    soft = np.clip((dist - tol * 0.6) / feather, 0, 1)
    alpha = np.where(edge, np.minimum(alpha, soft + 0.15), alpha)
    alpha = np.clip(alpha, 0, 1)

    out = rgb.astype(np.float32).copy()
    # despill on the fringe only
    fringe = edge.copy()
    for _ in range(2):
        f2 = fringe.copy()
        f2[1:] |= fringe[:-1]
        f2[:-1] |= fringe[1:]
        f2[:, 1:] |= fringe[:, :-1]
        f2[:, :-1] |= fringe[:, 1:]
        fringe = f2 & ~mask
    r, g, b = out[..., 0], out[..., 1], out[..., 2]
    if key == "magenta":
        m = np.minimum(r, b)
        spill = np.clip(m - g, 0, None) * fringe
        out[..., 0] = r - spill * 0.8
        out[..., 2] = b - spill * 0.8
    else:
        mx = np.maximum(r, b)
        spill = np.clip(g - mx, 0, None) * fringe
        out[..., 1] = g - spill * 0.9
    rgba = np.dstack([np.clip(out, 0, 255), alpha * 255]).astype(np.uint8)
    return rgba


def bbox(alpha, thr=20):
    ys, xs = np.where(alpha > thr)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def split(img, cols, rows):
    a = np.asarray(img.convert("RGB"))
    h, w, _ = a.shape
    cw, ch = w / cols, h / rows
    for r in range(rows):
        for c in range(cols):
            yield r, c, a[int(r * ch):int((r + 1) * ch), int(c * cw):int((c + 1) * cw)]


def remove_specks(rgba, min_frac=0.002):
    """Remove tiny disconnected opaque islands (noise) around the sprite."""
    lab, n = ndimage.label(rgba[..., 3] > 40)
    if n <= 1:
        return rgba
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    small = list(np.where(sizes < sizes.max() * min_frac)[0] + 1)
    edge_labels = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    for l in edge_labels:
        if l > 0 and sizes[l - 1] < sizes.max() * 0.08:
            small.append(l)
    rgba[np.isin(lab, small), 3] = 0
    return rgba


def despill_all(rgba, key):
    """Global spill suppression for sheets whose objects never use the key colour."""
    a = rgba.astype(np.float32)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    if key == "green":
        spill = np.clip(g - np.maximum(r, b), 0, None)
        a[..., 1] = g - spill
        a[..., 3] = al * (1 - np.clip((spill - 25) / 110, 0, 1))
    else:
        spill = np.clip(np.minimum(r, b) - g, 0, None)
        a[..., 0] = r - spill
        a[..., 2] = b - spill
    return np.clip(a, 0, 255).astype(np.uint8)


def process_dwarfs(raw):
    img = Image.open(os.path.join(raw, "dwarfs.png"))
    cells = {}
    for r, c, cell in split(img, 4, 4):
        rgba = key_cell(cell, tol=80, key="magenta")
        rgba = remove_specks(rgba)
        cells[(r, c)] = rgba
    # common scale: tallest sprite fits in 236px of a 256px cell
    heights = []
    anchors = {}
    for k, rgba in cells.items():
        x0, y0, x1, y1 = bbox(rgba[..., 3])
        heights.append(y1 - y0)
        # anchor x = centre of the opaque pixels in the lowest 12% (feet)
        band = rgba[int(y1 - (y1 - y0) * 0.12):y1, :, 3] > 60
        xs = np.where(band.any(axis=0))[0]
        ax = (xs.min() + xs.max()) / 2
        anchors[k] = (ax, y1, x0, y0, x1)
    S = 256
    scale = 228.0 / max(heights)
    sheet = Image.new("RGBA", (S * 4, S * 4), (0, 0, 0, 0))
    for (r, c), rgba in cells.items():
        ax, ay, x0, y0, x1 = anchors[(r, c)]
        im = Image.fromarray(rgba).crop((x0, y0, x1, ay))
        nw, nh = max(1, round(im.width * scale)), max(1, round(im.height * scale))
        im = im.resize((nw, nh), Image.LANCZOS)
        # feet anchor at (128, 248) inside the cell
        px = round(S / 2 - (ax - x0) * scale)
        py = 248 - nh
        cellimg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        cellimg.paste(im, (px, py))
        sheet.alpha_composite(cellimg, (c * S, r * S))
    sheet.save(os.path.join(OUT, "dwarfs.png"), optimize=True)
    print("dwarfs.png", sheet.size)


def process_props(raw):
    img = Image.open(os.path.join(raw, "props.png"))
    names = ["mine", "cottage", "pine", "oak", "rocks", "sign"]
    meta = {}
    os.makedirs(os.path.join(OUT, "props"), exist_ok=True)
    for r, c, cell in split(img, 3, 2):
        name = names[r * 3 + c]
        rgba = key_cell(cell, tol=80, key="magenta")
        rgba = despill_all(rgba, "magenta")
        if name != "cottage":  # keep the little smoke puff on the cottage
            rgba = remove_specks(rgba)
        x0, y0, x1, y1 = bbox(rgba[..., 3])
        im = Image.fromarray(rgba).crop((x0, y0, x1, y1))
        f = 420.0 / max(im.width, im.height)
        im = im.resize((round(im.width * f), round(im.height * f)), Image.LANCZOS)
        im.save(os.path.join(OUT, "props", name + ".png"), optimize=True)
        meta[name] = [im.width, im.height]
        print(name, im.size)
    with open(os.path.join(OUT, "props", "props.json"), "w") as fh:
        json.dump(meta, fh)


def process_dinos(raw):
    img = Image.open(os.path.join(raw, "dinos.png"))
    os.makedirs(os.path.join(OUT, "dinos"), exist_ok=True)
    meta = []
    for r, c, cell in split(img, 2, 2):
        rgba = key_cell(cell, tol=80, key="magenta")
        rgba = despill_all(rgba, "magenta")
        rgba = remove_specks(rgba, 0.001)
        x0, y0, x1, y1 = bbox(rgba[..., 3])
        im = Image.fromarray(rgba).crop((x0, y0, x1, y1))
        f = 640.0 / max(im.width, im.height)
        im = im.resize((round(im.width * f), round(im.height * f)), Image.LANCZOS)
        n = r * 2 + c
        im.save(os.path.join(OUT, "dinos", f"{n}.png"), optimize=True)
        meta.append(round(im.width / im.height, 3))
        print("dino", n, im.size)
    with open(os.path.join(OUT, "dinos", "dinos.json"), "w") as fh:
        json.dump(meta, fh)


def process_textures(raw):
    os.makedirs(os.path.join(OUT, "tex"), exist_ok=True)
    for n in ["dirt", "clay", "stone", "deep", "grass", "magma", "crystal", "obsidian", "ruins"]:
        im = Image.open(os.path.join(raw, "tex_" + n + ".png")).convert("RGB")
        a = np.asarray(im).astype(np.float32)
        N = a.shape[0]
        # cross-fade with a half-shifted copy to hide the (small) seams
        sh = np.roll(np.roll(a, N // 2, 0), N // 2, 1)
        t = np.linspace(0, 1, N)
        e = np.minimum(t, 1 - t) * 2  # 0 at edges, 1 in centre
        wx = np.clip(e / 0.25, 0, 1)
        w = np.minimum(wx[None, :], wx[:, None])[..., None]
        out = a * w + sh * (1 - w)
        Image.fromarray(out.astype(np.uint8)).resize((256, 256), Image.LANCZOS).save(
            os.path.join(OUT, "tex", n + ".jpg"), quality=86)
    print("textures done")


def process_misc(raw):
    sp = Image.open(os.path.join(raw, "splash.png")).convert("RGB")
    sp = sp.resize((1080, round(sp.height * 1080 / sp.width)), Image.LANCZOS)
    sp.save(os.path.join(OUT, "splash.jpg"), quality=82, optimize=True, progressive=True)
    ic = Image.open(os.path.join(raw, "icon.png")).convert("RGB")
    for s, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png"), (64, "favicon.png")]:
        ic.resize((s, s), Image.LANCZOS).save(os.path.join(OUT, name), optimize=True)
    print("splash + icons done")


if __name__ == "__main__":
    raw = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    process_dwarfs(raw)
    process_props(raw)
    process_dinos(raw)
    process_textures(raw)
    process_misc(raw)
