// Everything that makes the farm feel alive besides the dwarfs:
// the growing village on the meadow, furnished chambers, roots and
// stalactites, and little critters (worms, beetles, bats, butterflies…).
// Installed as extra methods on the Renderer.
import { W, SLAB, ISO, VILLAGE, FEAST_X, STASH_X, ENTRANCE_X, mat, band } from './config.js';
import { F_LADDER } from './world.js';
import { hash2, clamp } from './rng.js';

const INK = '#3b2414';
const HALF = SLAB / 2;
const WOOD = { front: '#9b6a3c', top: '#c99559', side: '#6e4626' };
const STONE = { front: '#8d96a1', top: '#b3bcc6', side: '#6d7580' };
const ease = (t) => (t >= 1 ? 1 : 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.12);

export const sceneryMethods = {
  // ---------- village ----------
  // grow factor for a building that just got built (pops up from the ground)
  grow(id) {
    const g = this.game;
    const t0 = g.village[id];
    if (t0 === undefined) return 0;
    return clamp(ease((g.time - t0) / 1.4), 0, 1.15);
  },

  villageItems(add) {
    const g = this.game;
    for (const b of VILLAGE) {
      const k = this.grow(b.id);
      if (k <= 0) continue;
      if (b.kind === 'house') add((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, () => this.drawHouse(b, k));
      else if (b.kind === 'forge') add((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, () => this.drawForge(b, k));
      else if (b.kind === 'museum') add((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, () => this.drawMuseum(b, k));
      else if (b.kind === 'tavern') add(FEAST_X + 4.6, 0.2, () => this.drawTavern(k));
    }
    add(STASH_X + 1.25, 0.25, () => this.drawGoldHeap());
    void g;
  },

  drawHouse(b, k) {
    const ctx = this.ctx, T = this.T;
    const { x0, x1, z0, z1 } = b;
    const top = -1.25 * k, ridge = -2.25 * k, zm = (z0 + z1) / 2;
    this.texFace('front', x0, x1, top, 0, z1, 'ruins');
    this.texFace('side', z0, z1, top, 0, x1, 'ruins');
    this.poly([[x1, top, z1], [x1, top, z0], [x1, ridge + 0.1 * k, zm]], '#b07a45');
    // door
    const dx = b.door + 0.5;
    this.setBack(1, z1);
    ctx.beginPath();
    ctx.moveTo(dx - 0.24, 0); ctx.lineTo(dx - 0.24, -0.55 * k);
    ctx.quadraticCurveTo(dx - 0.24, -0.86 * k, dx, -0.86 * k);
    ctx.quadraticCurveTo(dx + 0.24, -0.86 * k, dx + 0.24, -0.55 * k);
    ctx.lineTo(dx + 0.24, 0); ctx.closePath();
    ctx.fillStyle = '#8a5226'; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 0.04; ctx.stroke();
    ctx.fillStyle = '#f6c445';
    ctx.beginPath(); ctx.arc(dx + 0.14, -0.42 * k, 0.035, 0, Math.PI * 2); ctx.fill();
    // window, warm at night
    this.setSide(x1, 1);
    const glow = this.night > 0.3;
    ctx.fillStyle = glow ? '#ffd77a' : '#8fc9ef';
    ctx.fillRect(zm - 0.24, -0.92 * k, 0.48, 0.42 * k);
    ctx.strokeStyle = INK; ctx.lineWidth = 0.04;
    ctx.strokeRect(zm - 0.24, -0.92 * k, 0.48, 0.42 * k);
    ctx.beginPath(); ctx.moveTo(zm, -0.92 * k); ctx.lineTo(zm, -0.5 * k); ctx.moveTo(zm - 0.24, -0.71 * k); ctx.lineTo(zm + 0.24, -0.71 * k); ctx.stroke();
    this.identity();
    // chimney behind the ridge
    const cx = x0 + (x1 - x0) * 0.72;
    this.box(cx - 0.16, cx + 0.16, -2.7 * k, -1.6 * k, zm - 0.55, zm - 0.23, STONE, ['front', 'side', 'top']);
    // roof
    const e = 0.18;
    const roof = [[x0 - e, top + 0.05, z1 + 0.22], [x1 + e, top + 0.05, z1 + 0.22], [x1 + e, ridge, zm], [x0 - e, ridge, zm]];
    this.poly(roof, b.roof);
    ctx.strokeStyle = 'rgba(59,36,20,0.35)';
    ctx.lineWidth = Math.max(1, T * 0.02);
    ctx.beginPath();
    if (b.id === 'cottage') {
      // thatch: strokes running down the slope
      for (let t = 0.06; t < 1; t += 0.085) {
        const X = x0 - e + (x1 - x0 + 2 * e) * t;
        const [ax, ay] = this.proj(X, top + 0.03, z1 + 0.2), [bx, by] = this.proj(X, ridge + 0.04, zm);
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      }
    } else {
      // shingles: rows along the roof
      for (let t = 0.2; t < 1; t += 0.2) {
        const D = top + 0.05 + (ridge - top - 0.05) * t, Z = z1 + 0.22 + (zm - z1 - 0.22) * t;
        const [ax, ay] = this.proj(x0 - e, D, Z), [bx, by] = this.proj(x1 + e, D, Z);
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      }
    }
    ctx.stroke();
    this.poly([[x1 + e, top + 0.05, z1 + 0.22], [x1 + e, top + 0.05, z0 - 0.22], [x1 + e, ridge, zm]], shade(b.roof, 0.85));
    const [r0x, r0y] = this.proj(x0 - e, ridge, zm), [r1x, r1y] = this.proj(x1 + e, ridge, zm);
    ctx.strokeStyle = shade(b.roof, 0.7); ctx.lineWidth = Math.max(2, T * 0.07); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(r0x, r0y); ctx.lineTo(r1x, r1y); ctx.stroke();
    this.smoke(b.id, cx, -2.75 * k, zm - 0.39, 0.6);
    if (glow) this.lights.push([x1, -0.7, zm, 2.4, this.night, '#ffc070']);
  },

  // a little puff of smoke now and then from a chimney
  smoke(id, X, D, Z, every) {
    this.smokeTs = this.smokeTs || {};
    const t = (this.smokeTs[id] ?? Math.random() * every) - this.dt;
    if (t <= 0) {
      const [ix, iy] = this.isoOf(X, D, Z);
      this.particles.push({ k: 'smoke', x: ix, y: iy, vx: 0.05, vy: -0.35, life: 3.2, t: 0, s: 0.1, c: '#ffffff' });
      this.smokeTs[id] = every + Math.random() * every;
    } else this.smokeTs[id] = t;
  },

  drawForge(b, k) {
    const ctx = this.ctx, T = this.T;
    const { x0, x1, z0, z1 } = b;
    // stone back and side wall, open towards the meadow
    this.texFace('front', x0, x1, -1.2 * k, 0, z0 + 0.2, 'ruins');
    this.box(x1 - 0.2, x1, -1.2 * k, 0, z0 + 0.2, z1, STONE, ['front', 'side', 'top']);
    // anvil
    const ax = x0 + 0.7, az = (z0 + z1) / 2 + 0.2;
    const iron = { front: '#4a4f5a', top: '#6d7480', side: '#33373f' };
    this.box(ax - 0.12, ax + 0.12, -0.3 * k, 0, az - 0.1, az + 0.1, iron, ['front', 'side']);
    this.box(ax - 0.3, ax + 0.32, -0.45 * k, -0.3 * k, az - 0.14, az + 0.14, iron, ['front', 'side', 'top']);
    // furnace with a glowing mouth
    const fx0 = x1 - 0.85, fx1 = x1 - 0.2, fz0 = z0 + 0.2, fz1 = z0 + 0.9;
    this.box(fx0, fx1, -0.9 * k, 0, fz0, fz1, STONE, ['front', 'side', 'top']);
    const flick = 0.75 + Math.sin(this.time * 9) * 0.1 + Math.sin(this.time * 23) * 0.08;
    this.setBack(1, fz1);
    ctx.fillStyle = `rgba(255,${(140 + flick * 60) | 0},40,1)`;
    ctx.beginPath();
    ctx.moveTo(fx0 + 0.14, 0); ctx.lineTo(fx0 + 0.14, -0.35 * k);
    ctx.quadraticCurveTo((fx0 + fx1) / 2, -0.6 * k, fx1 - 0.14, -0.35 * k);
    ctx.lineTo(fx1 - 0.14, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 0.035; ctx.stroke();
    this.identity();
    this.lights.push([(fx0 + fx1) / 2, -0.3, fz1, 2.4 * flick, 0.9, '#ff9a3a']);
    this.box(fx1 - 0.3, fx1 - 0.05, -2.2 * k, -0.9 * k, fz0 + 0.1, fz0 + 0.35, STONE, ['front', 'side', 'top']);
    this.smoke('forge', fx1 - 0.18, -2.25 * k, fz0 + 0.22, 0.45);
    // lean-to roof on two posts
    this.box(x0 + 0.05, x0 + 0.17, -1.35 * k, 0, z1 - 0.12, z1, WOOD, ['front', 'side']);
    this.box(x1 - 0.17, x1 - 0.05, -1.35 * k, 0, z1 - 0.12, z1, WOOD, ['front', 'side']);
    this.poly([[x0 - 0.15, -1.35 * k, z1 + 0.15], [x1 + 0.15, -1.35 * k, z1 + 0.15], [x1 + 0.15, -1.75 * k, z0 + 0.05], [x0 - 0.15, -1.75 * k, z0 + 0.05]], '#8e3d2c');
    if (Math.random() < this.dt * 1.5) this.sparkle(ax, -0.5 * k, '#ffcf5a', 3, az);
    void T;
  },

  drawMuseum(b, k) {
    const ctx = this.ctx;
    const { x0, x1, z0, z1 } = b;
    const marble = { front: '#efe6d2', top: '#fffaf0', side: '#cfc3a8' };
    this.box(x0 - 0.1, x1 + 0.1, -0.15 * k, 0, z0 - 0.1, z1 + 0.25, marble, ['front', 'side', 'top']);
    this.texFace('front', x0, x1, -1.5 * k, -0.15 * k, z0 + 0.4, 'ruins');
    this.box(x1 - 0.1, x1, -1.5 * k, -0.15 * k, z0 + 0.4, z1 - 0.2, marble, ['side']);
    for (let i = 0; i < 4; i++) {
      const cx = x0 + 0.2 + i * ((x1 - x0 - 0.4) / 3);
      this.box(cx - 0.11, cx + 0.11, -1.5 * k, -0.15 * k, z1 - 0.12, z1 + 0.1, marble, ['front', 'side']);
    }
    this.box(x0 - 0.15, x1 + 0.15, -1.68 * k, -1.5 * k, z0 + 0.3, z1 + 0.15, marble, ['front', 'side', 'top']);
    // front-facing gable with a bone emblem
    this.poly([[x0 - 0.15, -1.68 * k, z1 + 0.15], [x1 + 0.15, -1.68 * k, z1 + 0.15], [(x0 + x1) / 2, -2.4 * k, z1 + 0.15]], '#f6eedc');
    this.poly([[x1 + 0.15, -1.68 * k, z1 + 0.15], [x1 + 0.15, -1.68 * k, z0 + 0.3], [(x0 + x1) / 2, -2.4 * k, z0 + 0.3], [(x0 + x1) / 2, -2.4 * k, z1 + 0.15]], '#c06b4f');
    const [ex, ey] = this.proj((x0 + x1) / 2, -1.92 * k, z1 + 0.15);
    this.icon('bone', ex, ey, this.T * 0.36);
    void ctx;
  },

  drawTavern(k) {
    const x0 = FEAST_X - 0.05, x1 = FEAST_X + 4.05, z0 = -0.15, z1 = 0.45;
    for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
      this.box(px - 0.05, px + 0.05, -1.45 * k, 0, pz - 0.05, pz + 0.05, WOOD, ['front', 'side']);
    }
    // striped awning
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = x0 - 0.1 + ((x1 - x0 + 0.2) * i) / n, b = x0 - 0.1 + ((x1 - x0 + 0.2) * (i + 1)) / n;
      this.poly([[a, -1.45 * k, z1 + 0.12], [b, -1.45 * k, z1 + 0.12], [b, -1.85 * k, z0 - 0.1], [a, -1.85 * k, z0 - 0.1]], i % 2 ? '#fff4dc' : '#d9483e', 0.02);
    }
    // scalloped front edge
    const ctx = this.ctx, T = this.T;
    for (let i = 0; i < n; i++) {
      const a = x0 - 0.1 + ((x1 - x0 + 0.2) * (i + 0.5)) / n;
      const [sx, sy] = this.proj(a, -1.45 * k, z1 + 0.12);
      ctx.fillStyle = i % 2 ? '#fff4dc' : '#d9483e';
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, T * 0.02);
      ctx.beginPath(); ctx.arc(sx, sy, T * 0.11, 0, Math.PI); ctx.fill(); ctx.stroke();
    }
    // barrels
    for (const [bx, bz] of [[x1 + 0.45, 0.05], [x1 + 0.85, -0.25]]) this.barrel(bx, bz, 0.22, 0.55 * k);
  },

  barrel(X, Z, r, h) {
    const ctx = this.ctx, T = this.T;
    const [bx, by] = this.proj(X, 0, Z);
    const R = r * T, Hh = h * T;
    ctx.fillStyle = '#a8692f'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, T * 0.03);
    ctx.beginPath();
    ctx.moveTo(bx - R, by - Hh); ctx.lineTo(bx - R, by);
    ctx.ellipse(bx, by, R, R * 0.5, 0, Math.PI, 0, true);
    ctx.lineTo(bx + R, by - Hh); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#4a4f5a'; ctx.lineWidth = Math.max(1, T * 0.025);
    for (const f of [0.25, 0.75]) {
      ctx.beginPath(); ctx.ellipse(bx, by - Hh * f, R, R * 0.5, 0, 0, Math.PI); ctx.stroke();
    }
    ctx.fillStyle = '#c27c3a'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, T * 0.03);
    ctx.beginPath(); ctx.ellipse(bx, by - Hh, R, R * 0.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  },

  // the treasure delivered so far piles up next to the cart
  drawGoldHeap() {
    const g = this.game, ctx = this.ctx, T = this.T;
    const total = g.totalGold;
    if (total < 20) return;
    const n = Math.min(26, Math.floor(Math.log10(total) * 6));
    const [cx, cy] = this.proj(STASH_X + 1.25, 0, 0.25);
    for (let i = 0; i < n; i++) {
      const row = Math.floor(Math.sqrt(i));
      const a = hash2(i, 3, 5) * Math.PI * 2;
      const rr = (1 - row / 6) * T * 0.32 * hash2(i, 4, 5);
      const x = cx + Math.cos(a) * rr, y = cy - row * T * 0.07 + Math.sin(a) * rr * 0.4;
      ctx.fillStyle = '#c58a1c'; ctx.beginPath(); ctx.ellipse(x, y + T * 0.015, T * 0.075, T * 0.04, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f6c445'; ctx.beginPath(); ctx.ellipse(x, y, T * 0.075, T * 0.04, 0, 0, Math.PI * 2); ctx.fill();
    }
    if ((this.time * 0.9) % 1 < 0.12) this.star(cx + T * 0.1, cy - T * 0.25, T * 0.09, '#fff7c2');
  },

  // a pennant on the head frame in the colour of the deepest layer reached
  drawBanner() {
    const g = this.game, ctx = this.ctx, T = this.T;
    const X = ENTRANCE_X + 0.5;
    const [px, py] = this.proj(X, -2.05, 0.1);
    const [tx, ty] = this.proj(X, -2.75, 0.1);
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, T * 0.035);
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tx, ty); ctx.stroke();
    const col = band(g.deepestBand).crumb;
    const wave = Math.sin(this.time * 4) * T * 0.04;
    ctx.fillStyle = col; ctx.lineWidth = Math.max(1, T * 0.025);
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + T * 0.25, ty + T * 0.05 + wave, tx + T * 0.5, ty + T * 0.14 + wave);
    ctx.quadraticCurveTo(tx + T * 0.25, ty + T * 0.2 - wave, tx, ty + T * 0.26);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  },

  // ---------- underground ----------
  drawRooms() {
    const w = this.game.world;
    for (const r of w.rooms) {
      if (r.y < this.y0 - 2 || r.y > this.y1 + 1) continue;
      const D = r.y + 1;
      if (r.type === 'bed') {
        this.box(r.x - 0.95, r.x + 0.25, D - 0.22, D, 0.06, 0.42, WOOD, ['front', 'side', 'top']);
        this.box(r.x - 0.9, r.x + 0.15, D - 0.3, D - 0.22, 0.08, 0.4, { front: '#6a7cc8', top: '#8fa0e6', side: '#4f5fa6' }, ['front', 'side', 'top']);
        this.box(r.x - 0.92, r.x - 0.6, D - 0.38, D - 0.28, 0.12, 0.36, { front: '#efe6d2', top: '#fffaf0', side: '#cfc3a8' }, ['front', 'side', 'top']);
        this.box(r.x - 1.0, r.x - 0.9, D - 0.55, D, 0.06, 0.16, WOOD, ['front', 'side', 'top']);
      } else if (r.type === 'store') {
        this.box(r.x - 0.95, r.x - 0.45, D - 0.45, D, 0.05, 0.4, WOOD, ['front', 'side', 'top']);
        this.box(r.x - 0.85, r.x - 0.5, D - 0.75, D - 0.45, 0.1, 0.35, WOOD, ['front', 'side', 'top']);
        this.barrel(r.x + 0.45, 0.2, 0.2, 0.45);
        this.barrel(r.x + 0.9, 0.22, 0.17, 0.38);
      } else {
        this.box(r.x - 0.25, r.x + 0.25, D - 0.3, D, 0.05, 0.4, STONE, ['front', 'side', 'top']);
        const [sx, sy] = this.proj(r.x, D - 0.62, 0.22);
        const pulse = 1 + Math.sin(this.time * 2 + r.x) * 0.06;
        this.icon('amethyst', sx, sy, this.T * 0.6 * pulse);
        this.lights.push([r.x, D - 0.6, 0.22, 2.6, 1, '#c27bff']);
      }
    }
  },

  // roots in the top soil, stalactites deeper down, little crystals in the deep bands
  drawDecor() {
    const w = this.game.world, ctx = this.ctx, T = this.T;
    ctx.lineCap = 'round';
    for (let y = Math.max(0, this.y0); y <= this.y1; y++) {
      for (let x = this.x0; x <= this.x1; x++) {
        if (!w.empty(x, y) || w.flag(x, y, F_LADDER)) continue;
        const h = hash2(x, y, 41);
        if (w.solid(x, y - 1) && y > 0) {
          if (y <= 9 && h < 0.6) {
            ctx.strokeStyle = '#6b4226';
            ctx.lineWidth = Math.max(1, T * 0.025);
            for (let k = 0; k < 2; k++) {
              const X = x + 0.25 + hash2(x, y + k, 42) * 0.5, len = 0.18 + hash2(x, y + k, 43) * 0.3;
              const sway = Math.sin(this.time * 0.8 + X * 3) * 0.03;
              const [ax, ay] = this.proj(X, y, 0.12), [bx, by] = this.proj(X + 0.06 + sway, y + len, 0.12);
              const [mx, my] = this.proj(X - 0.08, y + len * 0.5, 0.12);
              ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke();
            }
          } else if (y > 34 && h < 0.45) {
            const col = mat(w.bgAt(x, y)).crumb;
            ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, T * 0.02);
            for (let k = 0; k < 3; k++) {
              const X = x + 0.2 + k * 0.3 + hash2(x, y + k, 44) * 0.1, len = 0.12 + hash2(x, y + k, 45) * 0.18;
              const [ax, ay] = this.proj(X - 0.06, y, 0.15), [bx, by] = this.proj(X + 0.06, y, 0.15), [cx, cy] = this.proj(X, y + len, 0.15);
              ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill(); ctx.stroke();
            }
          }
        }
        if (w.solid(x, y + 1) && w.bgAt(x, y) >= 6 && h > 0.72) {
          const [sx, sy] = this.proj(x + 0.3 + hash2(x, y, 46) * 0.4, y + 1, 0.12);
          this.icon('amethyst', sx, sy - T * 0.12, T * 0.26);
        }
      }
    }
  },
};

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

// ---------- critters ----------
export class Critters {
  constructor(renderer) {
    this.r = renderer;
    this.worms = [];
    this.beetles = [];
    this.bats = [];
    this.butterflies = [];
    this.fireflies = [];
    this.birds = [];
    this.birdT = 8;
  }

  get world() { return this.r.game.world; }

  update(dt) {
    const w = this.world, r = this.r;
    // worms wriggle through the top soil, pressed against the glass
    while (this.worms.length < 9) {
      const X = Math.random() * W, D = 0.6 + Math.random() * 13;
      if (w.solid(Math.floor(X), Math.floor(D))) {
        const a = Math.random() * 6.28;
        const trail = Array.from({ length: 16 }, (_, i) => [X - Math.cos(a) * i * 0.04, D - Math.sin(a) * i * 0.04]);
        this.worms.push({ X, D, a, trail, t: Math.random() * 10 });
      }
      else break;
    }
    for (const m of this.worms) {
      m.t += dt;
      m.a += Math.sin(m.t * 0.7) * dt * 0.8;
      const nx = m.X + Math.cos(m.a) * dt * 0.12, nd = m.D + Math.sin(m.a) * dt * 0.12;
      if (nd < 0.35 || nd > 15 || nx < 0.2 || nx > W - 0.2 || !w.solid(Math.floor(nx), Math.floor(nd))) m.a += Math.PI * (0.6 + Math.random() * 0.8);
      else { m.X = nx; m.D = nd; }
      // the body follows the head: remember a point every few hundredths of a tile
      const tr = m.trail;
      if (tr.length < 2 || Math.hypot(tr[1][0] - m.X, tr[1][1] - m.D) > 0.04) {
        tr.unshift([m.X, m.D]);
        if (tr.length > 16) tr.length = 16;
      } else { tr[0][0] = m.X; tr[0][1] = m.D; }
    }
    this.worms = this.worms.filter((m) => w.solid(Math.floor(m.X), Math.floor(m.D)));

    // beetles trundle along tunnel floors near the camera
    if (this.beetles.length < 7 && Math.random() < dt * 0.5) {
      const x = r.x0 + Math.floor(Math.random() * (r.x1 - r.x0 + 1));
      const y = Math.max(0, r.y0) + Math.floor(Math.random() * Math.max(1, r.y1 - Math.max(0, r.y0)));
      if (w.empty(x, y) && w.solid(x, y + 1)) this.beetles.push({ X: x + 0.5, y, dir: Math.random() < 0.5 ? -1 : 1, t: 0, pause: 0, hue: Math.random() });
    }
    for (const b of this.beetles) {
      b.t += dt;
      if (b.pause > 0) { b.pause -= dt; continue; }
      if (Math.random() < dt * 0.15) b.pause = 1 + Math.random() * 2;
      const nx = b.X + b.dir * dt * 0.22;
      const cx = Math.floor(nx + b.dir * 0.15);
      if (!w.empty(cx, b.y) || !w.solid(cx, b.y + 1)) b.dir = -b.dir; else b.X = nx;
    }
    this.beetles = this.beetles.filter((b) => b.y >= r.y0 - 6 && b.y <= r.y1 + 6 && w.empty(Math.floor(b.X), b.y));

    // bats roost under deep ceilings and flutter about at night
    if (this.bats.length < 5 && Math.random() < dt * 0.3) {
      const x = r.x0 + Math.floor(Math.random() * (r.x1 - r.x0 + 1));
      const y = Math.max(26, r.y0) + Math.floor(Math.random() * Math.max(1, r.y1 - Math.max(26, r.y0)));
      if (y > 25 && w.empty(x, y) && w.solid(x, y - 1) && !w.flag(x, y, F_LADDER)) this.bats.push({ x, y, t: Math.random() * 10, fly: 0 });
    }
    for (const b of this.bats) {
      b.t += dt;
      if (b.fly > 0) b.fly -= dt;
      else if (Math.random() < dt * (r.night > 0.5 ? 0.12 : 0.02)) b.fly = 4 + Math.random() * 4;
    }
    this.bats = this.bats.filter((b) => b.y >= r.y0 - 8 && b.y <= r.y1 + 8 && w.empty(b.x, b.y) && w.solid(b.x, b.y - 1));

    // butterflies by day, fireflies by night on the meadow
    const day = 1 - r.night;
    while (this.butterflies.length < 6) {
      this.butterflies.push({ X: Math.random() * W, Z: -0.3 - Math.random() * 4, D: -0.5, t: Math.random() * 10, c: ['#ffd34d', '#ff9fb2', '#9bd3ff', '#fff6e0'][Math.floor(Math.random() * 4)] });
    }
    for (const f of this.butterflies) {
      f.t += dt;
      f.X = clamp(f.X + Math.sin(f.t * 0.6 + f.c.length) * dt * 0.5, 0.2, W - 0.2);
      f.Z = clamp(f.Z + Math.cos(f.t * 0.45) * dt * 0.3, -4.4, -0.1);
      f.D = -0.6 - Math.abs(Math.sin(f.t * 0.9)) * 0.7;
      f.alpha = day;
    }
    while (this.fireflies.length < 12) this.fireflies.push({ X: Math.random() * W, Z: -0.2 - Math.random() * 4.2, D: -0.3 - Math.random() * 1.2, t: Math.random() * 10 });
    for (const f of this.fireflies) {
      f.t += dt;
      f.X = clamp(f.X + Math.sin(f.t * 0.5 + f.Z) * dt * 0.25, 0, W);
      f.D = clamp(f.D + Math.cos(f.t * 0.7) * dt * 0.15, -1.8, -0.2);
    }

    // now and then a few birds cross the sky
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = 25 + Math.random() * 30;
      const D = -5 - Math.random() * 3, Z = -6;
      for (let i = 0; i < 3; i++) this.birds.push({ X: -4 - i * 0.8, D: D + (i % 2) * 0.35, Z, t: Math.random() });
    }
    for (const b of this.birds) { b.X += dt * 1.6; b.t += dt; }
    this.birds = this.birds.filter((b) => b.X < W + 8);
  }

  // drawn against the front glass, after the earth
  drawFront() {
    const r = this.r, ctx = r.ctx, T = r.T;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const m of this.worms) {
      if (m.D < r.y0 - 1 || m.D > r.y1 + 1) continue;
      if (m.trail.length < 4) continue;
      const pts = m.trail.map(([X, D], i) => {
        const [x, y] = r.proj(X, D, SLAB);
        return [x, y + Math.sin(m.t * 6 - i * 0.9) * T * 0.012]; // a little wriggle
      });
      const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
      path(); ctx.strokeStyle = INK; ctx.lineWidth = T * 0.15; ctx.stroke();
      path(); ctx.strokeStyle = '#e98aa0'; ctx.lineWidth = T * 0.1; ctx.stroke();
      // rings
      ctx.strokeStyle = 'rgba(160,60,85,0.55)'; ctx.lineWidth = Math.max(1, T * 0.012);
      for (let i = 2; i < pts.length - 1; i += 2) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i + 1], [cx, cy] = pts[i];
        const l = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / l * T * 0.045, ny = (bx - ax) / l * T * 0.045;
        ctx.beginPath(); ctx.moveTo(cx - nx, cy - ny); ctx.lineTo(cx + nx, cy + ny); ctx.stroke();
      }
      // a shine and two tiny eyes
      path(); ctx.strokeStyle = 'rgba(255,220,228,0.55)'; ctx.lineWidth = T * 0.025; ctx.stroke();
      const [hx, hy] = pts[0], [qx, qy] = pts[1];
      const l = Math.hypot(hx - qx, hy - qy) || 1, ux = (hx - qx) / l, uy = (hy - qy) / l;
      ctx.fillStyle = INK;
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(hx - ux * T * 0.01 - uy * sgn * T * 0.025, hy - uy * T * 0.01 + ux * sgn * T * 0.025, T * 0.012, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // drawn inside the tunnels, with the dwarfs
  drawInside() {
    const r = this.r, ctx = r.ctx, T = r.T;
    for (const b of this.beetles) {
      const [sx, sy] = r.proj(b.X, b.y + 1, 0.32);
      const step = b.pause > 0 ? 0 : Math.sin(b.t * 18) * T * 0.01;
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, T * 0.015);
      ctx.beginPath();
      for (const k of [-1, 0, 1]) { ctx.moveTo(sx + k * T * 0.04, sy - T * 0.03); ctx.lineTo(sx + k * T * 0.05 + step, sy); }
      ctx.stroke();
      ctx.fillStyle = `hsl(${160 + b.hue * 80},55%,35%)`;
      ctx.beginPath(); ctx.ellipse(sx, sy - T * 0.05, T * 0.07, T * 0.045, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(sx + b.dir * T * 0.07, sy - T * 0.05, T * 0.025, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.ellipse(sx - b.dir * T * 0.02, sy - T * 0.07, T * 0.02, T * 0.01, 0, 0, Math.PI * 2); ctx.fill();
    }
    for (const b of this.bats) {
      let X = b.x + 0.5, D = b.y + 0.12, flap = 0;
      if (b.fly > 0) {
        X += Math.sin(b.t * 1.7) * 0.35;
        D += 0.35 + Math.sin(b.t * 2.3) * 0.2;
        flap = Math.sin(b.t * 20);
      }
      const [sx, sy] = r.proj(X, D, 0.2);
      ctx.fillStyle = '#4a3a6a'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, T * 0.02);
      const ww = T * 0.16, wh = T * (b.fly > 0 ? 0.08 * flap : 0.02);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx - ww * 0.6, sy - wh - T * 0.04, sx - ww, sy - wh);
      ctx.quadraticCurveTo(sx - ww * 0.5, sy + T * 0.02, sx, sy + T * 0.04);
      ctx.quadraticCurveTo(sx + ww * 0.5, sy + T * 0.02, sx + ww, sy - wh);
      ctx.quadraticCurveTo(sx + ww * 0.6, sy - wh - T * 0.04, sx, sy);
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(sx, sy + T * 0.02, T * 0.04, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  // drawn on the meadow and in the sky
  drawSurface() {
    const r = this.r, ctx = r.ctx, T = r.T;
    if (r.y0 > 3) return;
    for (const f of this.butterflies) {
      if (f.alpha < 0.05) continue;
      const [sx, sy] = r.proj(f.X, f.D, f.Z);
      const flap = Math.abs(Math.sin(f.t * 14));
      ctx.globalAlpha = f.alpha;
      ctx.fillStyle = f.c; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, T * 0.012);
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(sx + s * T * 0.045 * flap, sy - T * 0.02, T * 0.045 * flap + 1, T * 0.035, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (r.night > 0.2) {
      for (const f of this.fireflies) {
        const [sx, sy] = r.proj(f.X, f.D, f.Z);
        const a = r.night * (0.4 + 0.6 * Math.abs(Math.sin(f.t * 2 + f.X)));
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, T * 0.15);
        g.addColorStop(0, `rgba(230,255,140,${a})`);
        g.addColorStop(1, 'rgba(230,255,140,0)');
        ctx.fillStyle = g;
        ctx.fillRect(sx - T * 0.15, sy - T * 0.15, T * 0.3, T * 0.3);
      }
    }
    ctx.strokeStyle = 'rgba(59,36,20,0.75)'; ctx.lineWidth = Math.max(1.2, T * 0.025);
    for (const b of this.birds) {
      const [sx, sy] = r.proj(b.X, b.D, b.Z);
      const f = Math.sin(b.t * 8) * T * 0.06;
      ctx.beginPath();
      ctx.moveTo(sx - T * 0.14, sy - f); ctx.quadraticCurveTo(sx - T * 0.05, sy - T * 0.05, sx, sy);
      ctx.quadraticCurveTo(sx + T * 0.05, sy - T * 0.05, sx + T * 0.14, sy - f);
      ctx.stroke();
    }
    void ISO;
  }
}
