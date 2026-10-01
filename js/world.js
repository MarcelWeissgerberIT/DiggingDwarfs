// The ant-farm slab: W columns, endlessly deep. Rows are generated in chunks
// as the dwarfs dig deeper.
import { W, START_ROWS, CHUNK, MAT, mat, band, ORES, ORE_HEART, ORE_TABLE, DINOS, ENTRANCE_X } from './config.js';
import { mulberry32, fbm1 } from './rng.js';

export const F_REV = 1;     // revealed (ore visible)
export const F_CAVE = 2;    // hidden hollow, opens when discovered
export const F_LAMP = 4;    // lantern hangs here
export const F_MUSH = 8;    // glowing mushroom on the floor
export const F_LADDER = 16; // a ladder stands here (needed to climb)
export const F_BRIDGE = 32; // a plank to walk over a hole
export const F_FOSSIL = 64; // part of a dinosaur skeleton: the dwarfs dig around it

const b64enc = (u8) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const b64dec = (str, len) => {
  const s = atob(str);
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = s.charCodeAt(i);
  return u8;
};

// top row of band b in column x (b >= 1)
function bandTop(b, x, seed) {
  return band(b).depth + Math.round((fbm1(x * 0.8, seed + 17 * b) - 0.5) * 9);
}

export class World {
  constructor() {
    this.W = W;
    this.H = 0;
    this.mat = new Uint8Array(0);
    this.bg = new Uint8Array(0); // original earth (band + 1) – back walls keep its look
    this.ore = new Uint8Array(0);
    this.flags = new Uint8Array(0);
    this.dinos = [];
    this.version = 0;
  }

  idx(x, y) { return y * W + x; }
  inside(x, y) { return x >= 0 && x < W && y >= 0 && y < this.H; }

  get(x, y) {
    if (x < 0 || x >= W || y >= this.H) return MAT.BORDER;
    if (y < 0) return MAT.AIR;
    return this.mat[y * W + x];
  }
  empty(x, y) { return this.get(x, y) === MAT.AIR; }
  solid(x, y) { return this.get(x, y) !== MAT.AIR; }
  oreAt(x, y) { return this.inside(x, y) ? this.ore[y * W + x] : 0; }
  bgAt(x, y) { return this.inside(x, y) ? this.bg[y * W + x] : 1; }
  flag(x, y, f) { return this.inside(x, y) && (this.flags[y * W + x] & f) !== 0; }

  // band index a cell belongs (or belonged) to – back walls keep the earth's look
  bandAt(x, y) {
    let b = 0;
    while (y >= bandTop(b + 1, x, this.seed)) b++;
    return b;
  }

  canDig(x, y, pick) {
    if (!this.inside(x, y)) return false;
    const i = y * W + x;
    const m = this.mat[i];
    return m !== MAT.AIR && !(this.flags[i] & F_FOSSIL) && mat(m).hard <= pick;
  }

  // Climbing between two cells needs a ladder in both. The surface row has no
  // storage of its own: its ladder is the top of the shaft ladder below.
  ladder(x, y) {
    if (y < 0) return this.inside(x, 0) && (this.flags[x] & F_LADDER) !== 0;
    return this.inside(x, y) && (this.flags[y * W + x] & F_LADDER) !== 0;
  }

  // Can a dwarf stand / walk in this (empty) cell without falling?
  supported(x, y) {
    if (y < 0) return this.solid(x, 0) || this.ladder(x, 0);
    return this.solid(x, y + 1) || this.flag(x, y, F_BRIDGE);
  }

  setLadder(x, y) {
    if (y < 0) y = 0;
    if (this.inside(x, y) && this.mat[y * W + x] === MAT.AIR) { this.flags[y * W + x] |= F_LADDER; this.version++; }
  }

  setBridge(x, y) {
    if (this.inside(x, y) && this.mat[y * W + x] === MAT.AIR) { this.flags[y * W + x] |= F_BRIDGE; this.version++; }
  }

  // Dig a cell. Returns { ore, mat, caves, dino }.
  dig(x, y) {
    const i = this.idx(x, y);
    const m = this.mat[i];
    const ore = this.ore[i];
    this.mat[i] = MAT.AIR;
    this.ore[i] = 0;
    this.flags[i] |= F_REV;
    const caves = this.reveal(x, y, 2);
    const dino = this.touchDino(x, y);
    this.ensureRows(y + 40);
    this.version++;
    return { ore, mat: m, caves, dino };
  }

  // a dino counts as found once a tunnel comes close to its slab
  touchDino(x, y) {
    for (const d of this.dinos) {
      if (d.found) continue;
      if (x >= d.x - 1 && x <= d.x + d.w && y >= d.y - 1 && y <= d.y + d.h) { d.found = true; return d; }
    }
    return null;
  }

  reveal(x, y, r) {
    let opened = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > r) continue;
        const cx = x + dx, cy = y + dy;
        if (!this.inside(cx, cy)) continue;
        const i = this.idx(cx, cy);
        this.flags[i] |= F_REV;
        if ((this.flags[i] & F_CAVE) && this.mat[i] !== MAT.AIR && Math.abs(dx) + Math.abs(dy) <= 1) {
          opened += this.openCave(cx, cy);
        }
      }
    }
    return opened;
  }

  openCave(x, y) {
    const stack = [[x, y]];
    const cells = [];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (!this.inside(cx, cy)) continue;
      const i = this.idx(cx, cy);
      if (!(this.flags[i] & F_CAVE) || this.mat[i] === MAT.AIR) continue;
      this.mat[i] = MAT.AIR;
      cells.push([cx, cy]);
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    for (const [cx, cy] of cells) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (this.inside(cx + dx, cy + dy)) this.flags[this.idx(cx + dx, cy + dy)] |= F_REV;
      }
    }
    this.version++;
    return cells.length;
  }

  // ---------- generation ----------
  generate(seed) {
    this.seed = seed;
    this.H = 0;
    this.mat = new Uint8Array(0);
    this.bg = new Uint8Array(0);
    this.ore = new Uint8Array(0);
    this.flags = new Uint8Array(0);
    this.dinos = [];
    this.extend(START_ROWS);

    // starting burrow: shaft under the mine entrance + a short gallery
    for (let y = 0; y <= 4; y++) this.setDug(ENTRANCE_X, y);
    for (let x = ENTRANCE_X; x <= ENTRANCE_X + 4; x++) this.setDug(x, 4);
    for (let y = 0; y <= 4; y++) this.flags[this.idx(ENTRANCE_X, y)] |= F_LADDER;
    this.flags[this.idx(ENTRANCE_X + 2, 4)] |= F_LAMP;
    // a little treat close by so the colony gets going
    this.ore[this.idx(ENTRANCE_X + 6, 4)] = 2;
    this.ore[this.idx(ENTRANCE_X + 6, 5)] = 2;
    this.ore[this.idx(ENTRANCE_X - 2, 6)] = 1;
    this.ore[this.idx(ENTRANCE_X - 1, 6)] = 1;
    for (let y = 0; y <= 4; y++) this.reveal(ENTRANCE_X, y, 2);
    for (let x = ENTRANCE_X; x <= ENTRANCE_X + 4; x++) this.reveal(x, 4, 2);
    this.version++;
  }

  // make sure rows down to `rows` exist
  ensureRows(rows) {
    while (this.H < rows) this.extend(this.H + CHUNK);
  }

  extend(newH) {
    const oldH = this.H;
    if (newH <= oldH) return;
    const grow = (a) => { const b = new Uint8Array(W * newH); b.set(a); return b; };
    this.mat = grow(this.mat);
    this.bg = grow(this.bg);
    this.ore = grow(this.ore);
    this.flags = grow(this.flags);
    this.H = newH;
    this.fill(oldH, newH);
    this.version++;
  }

  fill(y0, y1) {
    const seed = this.seed;
    const rnd = mulberry32((seed ^ Math.imul(y0 + 1, 2654435761)) >>> 0);
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    for (let x = 0; x < W; x++) {
      let b = this.bandAt(x, y0);
      for (let y = y0; y < y1; y++) {
        while (y >= bandTop(b + 1, x, seed)) b++;
        this.mat[y * W + x] = b + 1;
        this.bg[y * W + x] = b + 1;
      }
    }
    const inRange = (x, y) => x >= 0 && x < W && y >= Math.max(1, y0) && y < y1;
    const blob = (x0, yy0, size, fn) => {
      let x = x0, y = yy0;
      for (let k = 0; k < size * 3 && size > 0; k++) {
        if (inRange(x, y) && fn(x, y)) size--;
        const d = ri(0, 3);
        x += d === 0 ? 1 : d === 1 ? -1 : 0;
        y += d === 2 ? 1 : d === 3 ? -1 : 0;
      }
    };
    const scale = ((y1 - y0) / 26) * (W / 20);
    const count = (n) => { const e = n * scale; return Math.floor(e) + (rnd() < e % 1 ? 1 : 0); };
    const nearStart = (x, y) => x <= 9 && y <= 7;

    // stone boulders in the soft top layers – tunnels have to go around them
    for (let k = 0; k < count(5); k++) {
      const x = ri(0, W - 1), y = ri(y0, y1 - 1);
      if (y < 5 || y > 36 || nearStart(x, y)) continue;
      blob(x, y, ri(2, 5), (bx, by) => {
        const i = by * W + bx;
        if (nearStart(bx, by) || this.mat[i] > 2) return false;
        this.mat[i] = 3; this.bg[i] = 3; return true;
      });
    }
    // hidden caves with glowing mushrooms
    for (let k = 0; k < count(1.6); k++) {
      const x = ri(2, W - 3), y = ri(y0, y1 - 1);
      if (y < 20) continue;
      blob(x, y, ri(6, 13), (bx, by) => { this.flags[by * W + bx] |= F_CAVE; return true; });
    }
    for (let y = Math.max(y0, 1); y < y1 - 1; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if ((this.flags[i] & F_CAVE) && !(this.flags[i + W] & F_CAVE) && rnd() < 0.55) this.flags[i] |= F_MUSH;
      }
    }
    // ores: every band in this chunk gets its share of veins
    const bands = new Set();
    for (let i = y0 * W; i < y1 * W; i++) bands.add(this.mat[i] - 1);
    for (const b of bands) {
      const share = [...Array(y1 - y0).keys()].reduce((n, r) => {
        let c = 0;
        for (let x = 0; x < W; x++) if (this.mat[(y0 + r) * W + x] - 1 === b) c++;
        return n + c;
      }, 0) / ((y1 - y0) * W);
      for (const [ore, seeds, smin, smax] of ORE_TABLE[Math.min(b, ORE_TABLE.length - 1)]) {
        const n = count(seeds * share);
        for (let s = 0; s < n; s++) {
          for (let t = 0; t < 30; t++) {
            const x = ri(0, W - 1), y = ri(Math.max(1, y0), y1 - 1);
            const i = y * W + x;
            if (this.mat[i] - 1 !== b || this.ore[i] || (this.flags[i] & F_CAVE)) continue;
            blob(x, y, ri(smin, smax), (bx, by) => {
              const j = by * W + bx;
              if (this.mat[j] - 1 !== b || this.ore[j] || (this.flags[j] & F_CAVE)) return false;
              this.ore[j] = ore; return true;
            });
            break;
          }
        }
      }
    }
    // the heart of the mountain, deep in the glowing rock
    const hx = 12, hy = bandTop(5, hx, seed) - 5;
    if (hy >= Math.max(2, y0 + 1) && hy < y1 - 1) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const j = (hy + dy) * W + hx + dx;
        this.flags[j] &= ~(F_CAVE | F_MUSH);
        this.ore[j] = 0;
      }
      this.ore[hy * W + hx] = ORE_HEART;
    }
    // dinosaur skeletons pressed into the earth
    const first = y0 === 0;
    const n = first ? 2 : count(0.55);
    for (let k = 0; k < n; k++) {
      const kind = first ? k * 2 : ri(0, DINOS.length - 1);
      const h = DINOS[kind].rows;
      const w = Math.round(h * DINOS[kind].aspect);
      const x = first ? (k === 0 ? 8 : 2) : ri(1, W - w - 1);
      const y = first ? (k === 0 ? 8 : 22) : ri(y0 + 2, y1 - h - 2);
      if (y < Math.max(y0, 6) || y + h >= y1 || x < 0 || x + w > W) continue;
      if (this.dinos.some((d) => x < d.x + d.w + 2 && x + w + 2 > d.x && y < d.y + d.h + 2 && y + h + 2 > d.y)) continue;
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        const j = yy * W + xx;
        if (this.mat[j] === MAT.AIR) this.mat[j] = this.bandAt(xx, yy) + 1;
        this.ore[j] = 0;
        this.flags[j] = (this.flags[j] & ~(F_CAVE | F_MUSH)) | F_FOSSIL;
      }
      this.dinos.push({ kind, x, y, w, h, found: false });
    }
  }

  setDug(x, y) {
    const i = this.idx(x, y);
    this.mat[i] = MAT.AIR;
    this.ore[i] = 0;
    this.flags[i] &= ~(F_CAVE | F_MUSH | F_FOSSIL);
  }

  // ore value hidden around a cell (dwarf intuition)
  smell(x, y, r = 3) {
    let s = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > r) continue;
      const o = this.oreAt(x + dx, y + dy);
      if (o) s += ORES[o].value;
    }
    return s;
  }

  emptyAround(x, y, r = 2) {
    let n = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if ((dx || dy) && this.inside(x + dx, y + dy) && this.empty(x + dx, y + dy)) n++;
    }
    return n;
  }

  serialize() {
    return {
      seed: this.seed, H: this.H, dinos: this.dinos,
      mat: b64enc(this.mat), bg: b64enc(this.bg), ore: b64enc(this.ore), flags: b64enc(this.flags),
    };
  }

  static deserialize(o) {
    const w = new World();
    const n = W * o.H;
    w.seed = o.seed;
    w.H = o.H;
    w.dinos = o.dinos || [];
    w.mat = b64dec(o.mat, n);
    w.bg = b64dec(o.bg, n);
    w.ore = b64dec(o.ore, n);
    w.flags = b64dec(o.flags, n);
    return w;
  }
}
