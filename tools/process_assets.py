#!/usr/bin/env python3
"""Turn the raw OpenArt generations into game-ready assets.

Usage: python3 tools/process_assets.py <raw_dir>

<raw_dir> must contain the original downloads:
  pose0..5.png (4x3 pose sheets)  walk0..5.png (3x2 walk sheets)  dinos.png (2x2)
  splash.png, icon.png
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


# Atlas layout (one row per dwarf, 16 frames each):
#  0 idle, 1-3 walk cycle, 4-5 climb (back view), 6 wind-up, 7 strike, 8-9 carry,
#  10 sleep, 11 cheer, 12 beer, 13 hammer, 14 wave, 15 dig down
# Sources: pose<v>.png (4x3 sheet: P0..P11) and walk<v>.png (3x2 sheet: W0..W5)
FRAMES = [("P", 0), ("W", 0), ("W", 1), ("W", 2), ("W", 3), ("W", 3), ("P", 4), ("P", 5),
          ("P", 6), ("W", 4), ("P", 7), ("P", 8), ("P", 9), ("P", 10), ("P", 11), ("W", 5)]
FRAME_FIX = {
    (1, 8): ("W", 4),  # the blue dwarf's sack pose came out as someone else
    (4, 1): ("P", 1), (4, 2): ("P", 0), (4, 3): ("P", 2),  # her generated walk cycle had motion blur
}
KEEP_LARGEST = {(3, 9)}  # stray smudge next to the helmet dwarf's sack


def cut_sheet(path, cols, rows):
    out = []
    for r, c, cell in split(Image.open(path), cols, rows):
        rgba = key_cell(cell, tol=85, key="magenta")
        rgba = despill_all(rgba, "magenta")
        rgba = remove_specks(rgba, 0.004)
        out.append(rgba)
    return out


def frame_anchor(rgba, lying=False):
    x0, y0, x1, y1 = bbox(rgba[..., 3])
    if lying:
        return (x0 + x1) / 2, y1, (x0, y0, x1, y1)
    band = rgba[int(y1 - (y1 - y0) * 0.12):y1, :, 3] > 60
    xs = np.where(band.any(axis=0))[0]
    return (xs.min() + xs.max()) / 2, y1, (x0, y0, x1, y1)


def process_dwarfs(raw):
    S = 256
    IDLE_H = 196
    sheet = Image.new("RGBA", (S * 16, S * 6), (0, 0, 0, 0))
    for v in range(6):
        P = cut_sheet(os.path.join(raw, f"pose{v}.png"), 4, 3)
        Wk = cut_sheet(os.path.join(raw, f"walk{v}.png"), 3, 2)
        hp = bbox(P[0][..., 3])
        hw = bbox(Wk[1][..., 3])
        scale_p = IDLE_H / (hp[3] - hp[1])
        scale_w = IDLE_H / (hw[3] - hw[1])
        for fi, src in enumerate(FRAMES):
            kind, idx = FRAME_FIX.get((v, fi), src)
            rgba = P[idx] if kind == "P" else Wk[idx]
            if (v, fi) in KEEP_LARGEST:
                rgba = rgba.copy()
                lab, n = ndimage.label(rgba[..., 3] > 40)
                if n > 1:
                    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
                    rgba[(lab != (np.argmax(sizes) + 1)) & (lab > 0), 3] = 0
            scale = scale_p if kind == "P" else scale_w
            ax, ay, (x0, y0, x1, y1) = frame_anchor(rgba, lying=(kind == "P" and idx == 7))
            im = Image.fromarray(rgba).crop((x0, y0, x1, ay))
            nw, nh = max(1, round(im.width * scale)), max(1, round(im.height * scale))
            im = im.resize((nw, nh), Image.LANCZOS)
            cell = Image.new("RGBA", (S, S), (0, 0, 0, 0))
            cell.paste(im, (round(S / 2 - (ax - x0) * scale), 248 - nh))
            sheet.alpha_composite(cell, (fi * S, v * S))
        print("dwarf", v, "done")
    sheet.save(os.path.join(OUT, "dwarfs.webp"), quality=90, method=6)
    print("dwarfs.webp", sheet.size, os.path.getsize(os.path.join(OUT, "dwarfs.webp")))


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
    if len(sys.argv) > 2 and sys.argv[2] == "dwarfs":
        process_dwarfs(raw)
        sys.exit(0)
    process_dwarfs(raw)
    process_dinos(raw)
    process_textures(raw)
    process_misc(raw)
