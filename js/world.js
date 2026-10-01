// The ant-farm slab: a W x H grid of earth cells.
import { W, H, MAT, MATS, ORES, ORE_HEART, ENTRANCE_X } from './config.js';
import { mulberry32, fbm1, hash2 } from './rng.js';

export const F_REV = 1;   // revealed (ore visible)
export const F_CAVE = 2;  // hidden hollow, opens when discovered
export const F_LAMP = 4;  // lantern hangs here
export const F_MUSH = 8;  // glowing mushroom on the floor

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

export class World {
  constructor() {
    this.W = W;
    this.H = H;
    const n = W * H;
    this.mat = new Uint8Array(n);
    this.bg = new Uint8Array(n);
    this.ore = new Uint8Array(n);
    this.flags = new Uint8Array(n);
    this.version = 0; // bumps on every change (renderer caches)
  }

  idx(x, y) { return y * W + x; }
  inside(x, y) { return x >= 0 && x < W && y >= 0 && y < H; }

  get(x, y) {
    if (x < 0 || x >= W || y >= H) return MAT.BEDROCK;
    if (y < 0) return MAT.AIR;
    return this.mat[y * W + x];
  }
  empty(x, y) { return this.get(x, y) === MAT.AIR; }
  solid(x, y) { return this.get(x, y) !== MAT.AIR; }
  oreAt(x, y) { return this.inside(x, y) ? this.ore[y * W + x] : 0; }
  flag(x, y, f) { return this.inside(x, y) && (this.flags[y * W + x] & f) !== 0; }
  bgAt(x, y) { return this.inside(x, y) ? this.bg[y * W + x] : MAT.DIRT; }

  canDig(x, y, pick) {
    if (!this.inside(x, y)) return false;
    const m = this.mat[y * W + x];
    return m !== MAT.AIR && MATS[m].hard <= pick;
  }

  // Dig a cell. Returns { ore, mat, caves } where caves = number of cells opened.
  dig(x, y) {
    const i = this.idx(x, y);
    const m = this.mat[i];
    const ore = this.ore[i];
    this.mat[i] = MAT.AIR;
    this.ore[i] = 0;
    this.flags[i] |= F_REV;
    const caves = this.reveal(x, y, 2);
    this.version++;
    return { ore, mat: m, caves };
  }

  // Reveal ores around (x,y). Opens hidden caves that get touched.
  reveal(x, y, r) {
    let opened = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > r) continue;
        const cx = x + dx, cy = y + dy;
        if (!this.inside(cx, cy)) continue;
        const i = this.idx(cx, cy);
        this.flags[i] |= F_REV;
        // caves only open when directly adjacent to the dug cell
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

  generate(seed) {
    const rnd = mulberry32(seed);
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    this.seed = seed;
    const bounds = [];
    for (let x = 0; x < W; x++) {
      bounds.push([
        14 + Math.round(fbm1(x, seed + 1) * 6),
        34 + Math.round(fbm1(x, seed + 2) * 7),
        58 + Math.round(fbm1(x, seed + 3) * 7),
        82 + Math.round(fbm1(x, seed + 4) * 6),
      ]);
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const [b1, b2, b3, b4] = bounds[x];
        let m = y < b1 ? MAT.DIRT : y < b2 ? MAT.CLAY : y < b3 ? MAT.STONE : y < b4 ? MAT.DEEP : MAT.MAGMA;
        if (y >= H - 2 || (y === H - 3 && hash2(x, y, seed) > 0.55)) m = MAT.BEDROCK;
        const i = this.idx(x, y);
        this.mat[i] = m;
        this.bg[i] = m === MAT.BEDROCK ? MAT.MAGMA : m;
        this.ore[i] = 0;
        this.flags[i] = 0;
      }
    }
    const nearStart = (x, y) => x <= 9 && y <= 7;
    const blob = (x0, y0, size, fn) => {
      let x = x0, y = y0;
      for (let k = 0; k < size * 3 && size > 0; k++) {
        if (this.inside(x, y) && fn(x, y)) size--;
        const d = ri(0, 3);
        x += d === 0 ? 1 : d === 1 ? -1 : 0;
        y += d === 2 ? 1 : d === 3 ? -1 : 0;
      }
    };
    // stone boulders in the soft upper layers – tunnels have to go around them
    for (let k = 0; k < 16; k++) {
      const x = ri(0, W - 1), y = ri(5, 36);
      if (nearStart(x, y)) continue;
      blob(x, y, ri(2, 5), (bx, by) => {
        const i = this.idx(bx, by);
        if (nearStart(bx, by) || (this.mat[i] !== MAT.DIRT && this.mat[i] !== MAT.CLAY)) return false;
        this.mat[i] = MAT.STONE; this.bg[i] = MAT.STONE; return true;
      });
    }
    // hidden caves with glowing mushrooms
    for (let k = 0; k < 6; k++) {
      const x = ri(2, W - 3), y = ri(22, H - 14);
      blob(x, y, ri(6, 13), (bx, by) => {
        const i = this.idx(bx, by);
        if (this.mat[i] === MAT.BEDROCK || by < 18) return false;
        this.flags[i] |= F_CAVE; return true;
      });
    }
    for (let y = 0; y < H - 1; y++) {
      for (let x = 0; x < W; x++) {
        const i = this.idx(x, y);
        if ((this.flags[i] & F_CAVE) && !(this.flags[this.idx(x, y + 1)] & F_CAVE) && rnd() < 0.55) this.flags[i] |= F_MUSH;
      }
    }
    // ores
    const place = (ore, mats, seeds, smin, smax) => {
      for (let s = 0; s < seeds; s++) {
        let tries = 0;
        while (tries++ < 40) {
          const x = ri(0, W - 1), y = ri(1, H - 3);
          const i = this.idx(x, y);
          if (!mats.includes(this.mat[i]) || this.ore[i] || (this.flags[i] & F_CAVE)) continue;
          blob(x, y, ri(smin, smax), (bx, by) => {
            const j = this.idx(bx, by);
            if (!mats.includes(this.mat[j]) || this.ore[j] || (this.flags[j] & F_CAVE)) return false;
            this.ore[j] = ore; return true;
          });
          break;
        }
      }
    };
    const { DIRT, CLAY, STONE, DEEP, MAGMA } = MAT;
    place(1, [DIRT], 10, 2, 4);
    place(2, [DIRT], 5, 1, 3);
    place(8, [DIRT, CLAY], 4, 1, 1);
    place(1, [CLAY], 6, 2, 3);
    place(2, [CLAY], 9, 2, 4);
    place(3, [CLAY], 5, 1, 3);
    place(2, [STONE], 8, 2, 4);
    place(3, [STONE], 10, 2, 4);
    place(4, [STONE], 8, 1, 3);
    place(10, [STONE], 1, 1, 1);
    place(8, [STONE], 1, 1, 1);
    place(4, [DEEP], 5, 1, 2);
    place(5, [DEEP], 9, 1, 3);
    place(6, [DEEP], 8, 2, 4);
    place(7, [DEEP], 3, 1, 2);
    place(9, [DEEP], 2, 1, 1);
    place(10, [DEEP], 1, 1, 1);
    place(7, [MAGMA], 6, 1, 3);
    place(6, [MAGMA], 3, 1, 3);
    place(9, [MAGMA], 3, 1, 1);
    place(10, [MAGMA], 2, 1, 1);
    // the heart of the mountain, deep in the glowing rock
    const hx = ri(6, W - 7), hy = H - 5;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const i = this.idx(hx + dx, hy + dy);
      this.mat[i] = MAGMA; this.bg[i] = MAGMA; this.flags[i] &= ~(F_CAVE | F_MUSH); this.ore[i] = 0;
    }
    this.ore[this.idx(hx, hy)] = ORE_HEART;

    // starting burrow: shaft under the mine entrance + a short gallery
    for (let y = 0; y <= 4; y++) this.setDug(ENTRANCE_X, y);
    for (let x = ENTRANCE_X; x <= ENTRANCE_X + 4; x++) this.setDug(x, 4);
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

  setDug(x, y) {
    const i = this.idx(x, y);
    if (this.mat[i] !== MAT.BEDROCK) {
      this.mat[i] = MAT.AIR;
      this.ore[i] = 0;
      this.flags[i] &= ~(F_CAVE | F_MUSH);
    }
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

  deepestDug() {
    for (let y = H - 1; y >= 0; y--) for (let x = 0; x < W; x++) if (this.mat[y * W + x] === MAT.AIR) return y;
    return 0;
  }

  serialize() {
    return { seed: this.seed, mat: b64enc(this.mat), bg: b64enc(this.bg), ore: b64enc(this.ore), flags: b64enc(this.flags) };
  }

  static deserialize(o) {
    const w = new World();
    const n = W * H;
    w.seed = o.seed;
    w.mat = b64dec(o.mat, n);
    w.bg = b64dec(o.bg, n);
    w.ore = b64dec(o.ore, n);
    w.flags = b64dec(o.flags, n);
    return w;
  }
}
