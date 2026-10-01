// One hand-drawn vector icon set, used both in the canvas (Path2D) and in the DOM (inline SVG).
// Every icon lives in a 24x24 box: chunky flat shapes with a dark-brown outline.

const INK = '#3b2414';
const CREAM = '#fff4dc';

// [pathData, fill, stroke = INK, strokeWidth = 1.5]
const I = {
  coin: [
    ['M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0z', '#f6c445'],
    ['M6.8 12a5.2 5.2 0 1 0 10.4 0a5.2 5.2 0 1 0-10.4 0z', 'none', '#c58a1c', 1.2],
    ['M9 8.6a4.4 4.4 0 0 1 3-1.3', 'none', '#fff3b0', 1.4],
  ],
  gold: [
    ['M3.5 17.5c0-2.8 1.9-4.6 4.3-4.6s3.9 1.8 3.9 4.2-1.6 3.4-4.3 3.4-3.9-.6-3.9-3z', '#f2b632'],
    ['M10.5 15.8c0-3.4 2.3-5.8 5-5.8s4.6 2.4 4.6 5.4-2 4.6-5 4.6-4.6-1-4.6-4.2z', '#f6c445'],
    ['M7.6 10.4c0-2 1.5-3.6 3.3-3.6s3.1 1.4 3.1 3.3-1.4 2.9-3.3 2.9-3.1-.6-3.1-2.6z', '#ffd866'],
    ['M13.4 12.6c.8-.8 2-1 2.9-.6M5.6 15.6c.5-.5 1.3-.7 1.9-.5M9.6 8.8c.4-.4 1-.6 1.5-.5', 'none', '#fff5c0', 1.2],
  ],
  diamond: [
    ['M7 4.5h10l4 5.3-9 10.7L3 9.8z', '#c9f3ff'],
    ['M3 9.8h18M7 4.5l2.6 5.3L12 20.5M17 4.5l-2.6 5.3L12 20.5M9.6 9.8L12 4.5l2.4 5.3', 'none', '#6fb3cb', 1],
    ['M7.6 6.4l1.2 2', 'none', '#ffffff', 1.4],
  ],
  amethyst: [
    ['M4.6 20l.9-7.6 2.4-2.9 2.4 2.9-.4 7.6z', '#b98af2'],
    ['M14.6 20l.4-6.8 2.5-3 2.4 3-.9 6.8z', '#c7a1f6'],
    ['M9.2 20l.6-11 2.5-5.2 2.6 5.2.5 11z', '#9b5de5'],
    ['M12.3 3.8V20M7.9 9.5V20M17.5 10.2V20', 'none', '#6c3bb5', 1],
    ['M3.5 20h17', 'none', INK, 1.5],
  ],
  ruby: [
    ['M12 3l7.2 4.5v9L12 21l-7.2-4.5v-9z', '#ef4b5c'],
    ['M12 7.2l3.5 2.2v5.2L12 16.8l-3.5-2.2V9.4z', '#ff8e99', '#b52637', 1],
    ['M12 3v4.2M19.2 7.5l-3.7 1.9M19.2 16.5l-3.7-1.9M12 21v-4.2M4.8 16.5l3.7-1.9M4.8 7.5l3.7 1.9', 'none', '#b52637', 1],
  ],
  sapphire: [
    ['M12 3c4 0 7 4 7 9s-3 9-7 9-7-4-7-9 3-9 7-9z', '#3d6ee8'],
    ['M12 7.2c2 0 3.4 2.2 3.4 4.8s-1.4 4.8-3.4 4.8-3.4-2.2-3.4-4.8 1.4-4.8 3.4-4.8z', '#7ea5ff', '#2448a8', 1],
    ['M9.4 6.4c.8-.8 1.7-1.2 2.6-1.2', 'none', '#d6e4ff', 1.4],
  ],
  mithril: [
    ['M3.8 15.5l2-7.2 6-3.3 7 3 1.4 7.3-4.9 4.2H8z', '#7f8896'],
    ['M6.4 9.6l4.2 3 2.2-2.3 4.4 4.3', 'none', '#eaf6ff', 2.2],
    ['M17.6 6.2v2.6M16.3 7.5h2.6', 'none', '#ffffff', 1.2],
  ],
  coal: [
    ['M3.8 15.2c0-4 3-7.2 7-7.2 1.9 0 3.1.9 4 1.9 3 0 5.4 2.2 5.4 5.3 0 3.1-3.2 5-8.2 5s-8.2-1.2-8.2-5z', '#3b3d48'],
    ['M8 12c.8-1 1.9-1.6 3-1.6M15 12.2c.9.2 1.6.8 2 1.6', 'none', '#7a7f92', 1.2],
  ],
  chest: [
    ['M4 11.2h16v8H4z', '#a8692f'],
    ['M4 11.2c0-3.1 1.9-5.2 4-5.2h8c2.1 0 4 2.1 4 5.2z', '#c27c3a'],
    ['M8.2 6.2v13M15.8 6.2v13', 'none', '#f2b632', 1.6],
    ['M10.4 10h3.2v3.8h-3.2z', '#f6c445'],
  ],
  fossil: [
    ['M4.5 12a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0-15 0z', '#e8d3a4'],
    ['M12.6 12.4a1.1 1.1 0 1 0-1.4-1.1c0 1.9 1.5 3.3 3.3 3.3a3.5 3.5 0 0 0 3.5-3.5c0-2.9-2.3-5.2-5.2-5.2a6 6 0 0 0-6 6', 'none', '#9b7b45', 1.3],
  ],
  rune: [
    ['M6 20.5V8.4C6 5.6 8.6 3.5 12 3.5s6 2.1 6 4.9v12.1z', '#9aa3ad'],
    ['M10 7.8v9.4M10 7.8l4.2 3-4.2 3', 'none', '#46d0ff', 1.9],
  ],
  mushroom: [
    ['M9.6 11.6h4.8l.8 8h-6.4z', '#eaf7f1'],
    ['M3.8 12c0-4.6 3.7-7.6 8.2-7.6s8.2 3 8.2 7.6z', '#4fd8e8'],
    ['M8 8.6a1.1 1.1 0 1 0 .01 0zM14.6 7.4a1.3 1.3 0 1 0 .01 0zM16.8 10.2a.9.9 0 1 0 .01 0z', '#e9fdff', 'none'],
  ],
  lantern: [
    ['M10 5c0-2.2 4-2.2 4 0', 'none', INK, 1.4],
    ['M8.6 5h6.8v2H8.6z', '#8a5a32'],
    ['M8.2 7h7.6l-.6 9.6H8.8z', '#ffd77a'],
    ['M12 9.2c1.2 1.2 1.4 2.6.2 4.2-1.6-.6-1.8-2.6-.2-4.2z', '#ff9a2e', 'none'],
    ['M7.6 16.6h8.8v2.2H7.6z', '#8a5a32'],
  ],
  pick: [
    ['M14.6 9l2 2-9.8 9.8-2-2z', '#b07a45'],
    ['M3.2 9.6C6.4 4.4 13.2 1.8 20.4 4.8l.8 1.6-2.4.8c-4.6-1.8-9-1-12.6 2.8z', '#c8d0da'],
    ['M7.4 7.2c3-1.8 6.6-2.4 10.2-1.6', 'none', '#eef2f6', 1.2],
  ],
  hammer: [
    ['M12.6 10.2l1.8 1.8-8.2 8.2-1.8-1.8z', '#b07a45'],
    ['M9.8 7.4l4.4-4.4 6.8 6.8-4.4 4.4z', '#9aa3ad'],
    ['M14.2 3l2.2 2.2', 'none', '#d9e0e8', 1.2],
  ],
  beer: [
    ['M15 9.8h2.6a2 2 0 0 1 2 2v3.2a2 2 0 0 1-2 2H15', 'none', INK, 2.2],
    ['M5 8.4h10v10.8a1.6 1.6 0 0 1-1.6 1.6H6.6A1.6 1.6 0 0 1 5 19.2z', '#e9a93b'],
    ['M8.4 11v7M11.6 11v7', 'none', '#c27f22', 1.2],
    ['M4.4 8.6c0-2 1.4-3.2 3-3.1.5-1.5 2.1-2.1 3.2-1.5 1.1-1 3.1-.9 3.8.5 1.5 0 2.3 1.6 1.8 4.1z', '#fffaf0'],
  ],
  flag: [
    ['M5.2 3h1.7v18H5.2z', '#8a5a32'],
    ['M6.9 4h11.4l-3.2 4 3.2 4H6.9z', '#e8473e'],
  ],
  cart: [
    ['M5.2 9.6c.8-3 2.8-4 4.8-3 1-2 4-2 5 0 2-1 4 0 4.6 3z', '#f6c445'],
    ['M3 9.6h18l-2.2 8H5.2z', '#9b6a3c'],
    ['M3.6 12.4h16.8', 'none', '#6e4626', 1.2],
    ['M5.4 19.4a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0zM14.8 19.4a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0z', '#5a5f6a'],
  ],
  bone: [
    ['M7.2 14.4l5.6-5.6 2.4 2.4-5.6 5.6z', '#efe2c4'],
    ['M4.6 15.4a2.1 2.1 0 1 1 2.6-2.6 2.1 2.1 0 1 1 2.8 3.4l-.6.6a2.1 2.1 0 1 1-3.4 2.8 2.1 2.1 0 1 1-2.6-2.6z', '#efe2c4'],
    ['M19.4 8.6a2.1 2.1 0 1 1-2.6 2.6 2.1 2.1 0 1 1-2.8-3.4l.6-.6a2.1 2.1 0 1 1 3.4-2.8 2.1 2.1 0 1 1 2.6 2.6z', '#efe2c4'],
  ],
  // ---- UI ----
  sun: [
    ['M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4L7 7M17 17l1.6 1.6M5.4 18.6L7 17M17 7l1.6-1.6', 'none', '#f3a12a', 1.9],
    ['M7.4 12a4.6 4.6 0 1 0 9.2 0a4.6 4.6 0 1 0-9.2 0z', '#ffd34d'],
  ],
  moon: [
    ['M15.4 3.4a8.6 8.6 0 1 0 5.2 13.6 7 7 0 0 1-5.2-13.6z', '#f3efc8'],
    ['M9 10.5a1 1 0 1 0 .01 0zM12.4 15.2a1.3 1.3 0 1 0 .01 0z', '#d6cf9c', 'none'],
  ],
  dwarf: [
    ['M6.4 11.2c.9-4.8 2.9-7.8 5.8-8.4 1.6 2 3.8 5.8 5.4 8.4z', '#e2463c'],
    ['M7 11h10v3.2H7z', '#f7c9a2'],
    ['M6.4 12.8c0 4.4 2.5 8 5.6 8s5.6-3.6 5.6-8c-1 1-2.1 1-3 .5-.8.8-1.8 1.1-2.6 1.1s-1.8-.3-2.6-1.1c-.9.5-2 .5-3-.5z', '#9b6a3c'],
    ['M10.9 13.4a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0z', '#f08a7a', 'none'],
  ],
  menu: [['M5 7h14M5 12h14M5 17h14', 'none', CREAM, 2.6]],
  horn: [
    ['M4.2 18.6c4.4-.2 7-2.4 8.6-5.6 1.4-2.8 3.4-4.8 6.4-5.6', 'none', INK, 6.2],
    ['M4.2 18.6c4.4-.2 7-2.4 8.6-5.6 1.4-2.8 3.4-4.8 6.4-5.6', 'none', '#e9a93b', 3.6],
    ['M15.6 4.6c2.6-1 5.2.4 5.8 3.2.4 2-.8 3.8-2.6 4.4z', '#ffd77a'],
    ['M8.6 16.4l1.4 1.6M12 13l1.6 1.2', 'none', '#b5741f', 1.4],
    ['M2.6 17.4l2 2.6', 'none', INK, 2.6],
  ],
  eye: [
    ['M2.6 12c2.5-4 5.9-6 9.4-6s6.9 2 9.4 6c-2.5 4-5.9 6-9.4 6s-6.9-2-9.4-6z', '#fffaf0'],
    ['M8.8 12a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0z', '#4a8fd6'],
    ['M10.9 12a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0z', INK, 'none'],
  ],
  close: [['M7 7l10 10M17 7L7 17', 'none', INK, 2.8]],
  sound: [
    ['M4 9.4h3.6l5-4v13.2l-5-4H4z', CREAM],
    ['M15.6 9a4 4 0 0 1 0 6M18.2 6.4a7.6 7.6 0 0 1 0 11.2', 'none', CREAM, 1.9],
  ],
  mute: [
    ['M4 9.4h3.6l5-4v13.2l-5-4H4z', CREAM],
    ['M15.8 9.2l5 5.6M20.8 9.2l-5 5.6', 'none', CREAM, 1.9],
  ],
  play: [['M8.4 5.6l10.4 6.4-10.4 6.4z', CREAM]],
  fast: [['M3.6 6l8 6-8 6zM12.2 6l8 6-8 6z', CREAM]],
  faster: [['M2.4 7l5.6 5-5.6 5zM8.6 7l5.6 5-5.6 5zM14.8 7l5.6 5-5.6 5z', CREAM]],
  note: [
    ['M8 7.4l10-2.6v9.6', 'none', INK, 1.8],
    ['M5 17.2a2.6 2.2 0 1 0 5.2 0a2.6 2.2 0 1 0-5.2 0zM15 14.6a2.6 2.2 0 1 0 5.2 0a2.6 2.2 0 1 0-5.2 0z', INK],
    ['M8 7.4v9.8', 'none', INK, 1.8],
  ],
  heart: [['M12 20.2s-7.4-4.6-7.4-10.2a4.1 4.1 0 0 1 7.4-2.6 4.1 4.1 0 0 1 7.4 2.6c0 5.6-7.4 10.2-7.4 10.2z', '#ff6b81']],
  zzz: [['M5 6.5h6l-6 7h6M13.6 12.5h5l-5 5.5h5', 'none', '#6a7cc8', 2]],
  plus: [['M12 5v14M5 12h14', 'none', INK, 3]],
  star: [['M12 2.8l2.6 6.3 6.6.5-5 4.4 1.6 6.6L12 17l-5.8 3.6 1.6-6.6-5-4.4 6.6-.5z', '#ffd34d']],
  question: [['M8.8 8.6a3.4 3.4 0 1 1 4.4 3.2c-.8.4-1.2 1-1.2 1.9v.9M12 18.4v.4', 'none', INK, 2.4]],
  bang: [['M12 4.6v9.4M12 18.4v.4', 'none', '#e8473e', 2.8]],
  seed: [
    ['M12 20.5v-7', 'none', '#4a8a2a', 2],
    ['M12 14c-4.2.2-6.8-2.4-7-6.6 4.2-.2 6.8 2.4 7 6.6zM12 12.4c.4-4 3-6.4 7-6.4 0 4-2.6 6.4-7 6.4z', '#7cc957'],
  ],
  layers: [
    ['M3.5 7.2l8.5-3.7 8.5 3.7-8.5 3.7z', '#7cc957'],
    ['M3.5 11.6l8.5 3.7 8.5-3.7', 'none', '#b07a45', 2],
    ['M3.5 15.8l8.5 3.7 8.5-3.7', 'none', '#9aa3ad', 2],
  ],
};

export const ICON_NAMES = Object.keys(I);

export function iconSVG(name, cls = '') {
  const parts = I[name] || I.star;
  let s = `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">`;
  for (const [d, fill, stroke = INK, w = 1.5] of parts) {
    s += `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${stroke === 'none' ? 0 : w}" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  return s + '</svg>';
}

// ---- canvas ----
const pathCache = new Map();
const bmpCache = new Map();

function paths(name) {
  let p = pathCache.get(name);
  if (!p) {
    p = (I[name] || I.star).map(([d, fill, stroke = INK, w = 1.5]) => ({ p: new Path2D(d), fill, stroke, w }));
    pathCache.set(name, p);
  }
  return p;
}

function paint(ctx, name) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const part of paths(name)) {
    if (part.fill !== 'none') { ctx.fillStyle = part.fill; ctx.fill(part.p); }
    if (part.stroke !== 'none') { ctx.strokeStyle = part.stroke; ctx.lineWidth = part.w; ctx.stroke(part.p); }
  }
}

// Draw an icon centred at (cx, cy). Small sizes are cached as bitmaps.
export function drawIcon(ctx, name, cx, cy, size, rot = 0) {
  if (size < 2) return;
  const bucket = Math.max(8, Math.round(size / 4) * 4);
  const key = name + ':' + bucket;
  let bmp = bmpCache.get(key);
  if (!bmp) {
    if (bmpCache.size > 400) bmpCache.clear();
    bmp = document.createElement('canvas');
    const pad = Math.ceil(bucket * 0.08);
    bmp.width = bmp.height = bucket + pad * 2;
    const g = bmp.getContext('2d');
    g.translate(pad, pad);
    g.scale(bucket / 24, bucket / 24);
    paint(g, name);
    bmp.pad = pad;
    bmpCache.set(key, bmp);
  }
  const s = size / bucket;
  const full = bmp.width * s;
  if (rot) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.drawImage(bmp, -full / 2, -full / 2, full, full);
    ctx.restore();
  } else {
    ctx.drawImage(bmp, cx - full / 2, cy - full / 2, full, full);
  }
}
