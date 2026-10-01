// Isometric ant-farm renderer.
//
// World axes: X runs along the slab, D is depth (down), Z is slab thickness
// (0 = back glass, SLAB = front glass). Projection (iso units):
//   ix = (X - Z) * ISO,   iy = (X + Z) / 2 + D
// Faces are painted back to front: back walls, tunnel floors & walls (bottom
// rows first), dwarfs, then the front faces of the remaining earth.
import {
  W, SLAB, ISO, MAT, mat, ORES, DINOS, ORE_HEART, ENTRANCE_X, STASH_X, COTTAGE_X, FEAST_X, NIGHT_START,
} from './config.js';
import { F_REV, F_LAMP, F_MUSH, F_CAVE, F_LADDER, F_BRIDGE } from './world.js';
import { drawIcon } from './icons.js';
import { hash2, clamp, lerp } from './rng.js';

const TX = 64;            // texels per cell (textures are 256px = 4 cells)
const SPRITE = 256;       // dwarf atlas cell size
const HALF = SLAB / 2;

const SKY = [
  // phase, top, bottom
  [0.0, [70, 60, 120], [250, 168, 130]],
  [0.07, [110, 180, 250], [214, 238, 255]],
  [0.5, [92, 168, 245], [196, 232, 255]],
  [0.61, [110, 140, 215], [255, 205, 150]],
  [0.68, [60, 48, 105], [255, 140, 100]],
  [0.76, [22, 26, 70], [58, 56, 118]],
  [0.97, [22, 26, 70], [58, 56, 118]],
  [1.0, [70, 60, 120], [250, 168, 130]],
];

function skyAt(p) {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [a, ta, ba] = SKY[i];
    const [b, tb, bb] = SKY[i + 1];
    if (p >= a && p <= b) {
      const t = (p - a) / (b - a);
      return [ta.map((v, k) => lerp(v, tb[k], t)), ba.map((v, k) => lerp(v, bb[k], t))];
    }
  }
  return [SKY[0][1], SKY[0][2]];
}
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => a.map((v, k) => lerp(v, b[k], t));

export function nightAmount(phase) {
  // 0 = full day, 1 = deep night (smooth around dusk & dawn)
  if (phase < 0.03) return 1 - phase / 0.03;
  if (phase < NIGHT_START - 0.06) return 0;
  if (phase < NIGHT_START + 0.06) return (phase - (NIGHT_START - 0.06)) / 0.12;
  return 1;
}

export class Renderer {
  constructor(canvas, assets, game) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.a = assets;
    this.game = game;
    this.cam = { x: 0, y: 0, T: 44 };
    this.follow = null;
    this.selected = null;
    this.particles = [];
    this.floaters = [];
    this.time = 0;
    this.pat = new Map();
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d');
    this.clouds = Array.from({ length: 9 }, (_, i) => ({
      x: i * 4.3 + Math.random() * 3, y: -4 - Math.random() * 7, s: 0.8 + Math.random() * 1.4, v: 0.05 + Math.random() * 0.08,
    }));
    this.stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), p: Math.random() * 6 }));
    this.motes = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random(), p: Math.random() * 6 }));
    this.smokeT = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.cssW = this.cv.clientWidth || window.innerWidth;
    this.cssH = this.cv.clientHeight || window.innerHeight;
    this.cv.width = Math.round(this.cssW * dpr);
    this.cv.height = Math.round(this.cssH * dpr);
    this.light.width = Math.ceil(this.cv.width / 4);
    this.light.height = Math.ceil(this.cv.height / 4);
  }

  // ---------- camera helpers ----------
  isoOf(X, D, Z = HALF) { return [(X - Z) * ISO, (X + Z) * 0.5 + D]; }
  proj(X, D, Z = HALF) {
    return [(X - Z) * ISO * this.T + this.ox, ((X + Z) * 0.5 + D) * this.T + this.oy];
  }
  isoToScreen(ix, iy) { return [ix * this.T + this.ox, iy * this.T + this.oy]; }

  centerOn(X, D, instant = false) {
    const [ix, iy] = this.isoOf(X, D);
    if (instant) { this.cam.x = ix; this.cam.y = iy; } else { this.camTarget = [ix, iy]; }
  }

  // keep the screen filled with earth: no peeking past the frame or below the dug rows
  clampCam() {
    const c = this.cam;
    c.T = clamp(c.T, Math.max(16, this.cssW / ((W + 0.4) * ISO)), 120);
    const hw = this.cssW / 2 / c.T, hh = this.cssH / 2 / c.T;
    const ixMin = -SLAB * ISO - 0.25, ixMax = (W - SLAB) * ISO + 0.25;
    c.x = ixMax - ixMin < hw * 2 ? (ixMin + ixMax) / 2 : clamp(c.x, ixMin + hw, ixMax - hw);
    const xLeft = (c.x - hw) / ISO + SLAB;
    const g = this.game;
    const maxD = Math.min(g.world.H - 2, g.deepest + 30);
    const yMin = -6 + xLeft * 0.5 + hh;
    const yMax = maxD + (xLeft + SLAB) * 0.5 - hh;
    c.y = yMax < yMin ? yMin : clamp(c.y, yMin, yMax);
  }

  cellAt(cssX, cssY) {
    const ix = (cssX - this.cssW / 2) / this.cam.T + this.cam.x;
    const iy = (cssY - this.cssH / 2) / this.cam.T + this.cam.y;
    const X = ix / ISO + SLAB;
    const D = iy - (X + SLAB) * 0.5;
    return { x: Math.floor(X), y: Math.floor(D) };
  }

  dwarfAt(cssX, cssY) {
    let best = null, bd = Infinity;
    const T = this.cam.T;
    for (const d of this.game.dwarfs) {
      if (d.alpha < 0.3) continue;
      const [ix, iy] = this.isoOf(d.x, d.y);
      const sx = (ix - this.cam.x) * T + this.cssW / 2;
      const sy = (iy - this.cam.y) * T + this.cssH / 2 - T * 0.42;
      const dist = Math.hypot(sx - cssX, sy - cssY);
      if (dist < Math.max(T * 0.55, 26) && dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  // ---------- effects ----------
  crumbs(x, y, m, n = 5) {
    const col = mat(m)?.crumb || '#776';
    const [ix, iy] = this.isoOf(x + 0.5, y + 0.5, SLAB * 0.8);
    for (let i = 0; i < n; i++) {
      this.particles.push({
        k: 'crumb', x: ix + (Math.random() - 0.5) * 0.5, y: iy + (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * 2.2, vy: -Math.random() * 2.2, life: 0.6 + Math.random() * 0.4, t: 0,
        s: 0.04 + Math.random() * 0.05, c: col,
      });
    }
  }

  sparkle(X, D, color = '#fff6c0', n = 10, Z = HALF) {
    const [ix, iy] = this.isoOf(X, D, Z);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 0.6 + Math.random() * 1.6;
      this.particles.push({
        k: 'spark', x: ix, y: iy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.8, life: 0.7 + Math.random() * 0.6, t: 0,
        s: 0.07 + Math.random() * 0.08, c: color,
      });
    }
  }

  confetti(X, D, n = 40) {
    const cols = ['#ff5d73', '#ffd34d', '#5fd7ff', '#8cff7a', '#c27bff', '#ffffff'];
    const [ix, iy] = this.isoOf(X, D);
    for (let i = 0; i < n; i++) {
      this.particles.push({
        k: 'conf', x: ix + (Math.random() - 0.5), y: iy - 0.5, vx: (Math.random() - 0.5) * 4, vy: -2 - Math.random() * 3,
        life: 1.6 + Math.random(), t: 0, s: 0.06 + Math.random() * 0.06, c: cols[i % cols.length], r: Math.random() * 6,
      });
    }
  }

  floater(X, D, text, color = '#ffe27a') {
    const [ix, iy] = this.isoOf(X, D);
    this.floaters.push({ x: ix, y: iy, text, color, t: 0, life: 1.6 });
  }

  updateFx(dt) {
    for (const p of this.particles) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.k === 'crumb') p.vy += 7 * dt;
      else if (p.k === 'conf') { p.vy += 4 * dt; p.vx *= 0.99; p.r += dt * 8; }
      else if (p.k === 'smoke') { p.vx += 0.05 * dt; p.s += dt * 0.12; }
      else { p.vx *= 0.94; p.vy *= 0.94; }
    }
    this.particles = this.particles.filter((p) => p.t < p.life);
    for (const f of this.floaters) { f.t += dt; f.y -= dt * 0.7; }
    this.floaters = this.floaters.filter((f) => f.t < f.life);
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
  }

  // ---------- textures ----------
  pattern(key, face) {
    const k = key + ':' + face;
    let p = this.pat.get(k);
    if (!p) {
      const src = this.a.tex[key][face];
      p = this.ctx.createPattern(src, 'repeat');
      this.pat.set(k, p);
    }
    return p;
  }
  matKey(m) { return mat(m).tex || 'stone'; }

  setFront(unit = TX) {
    const s = this.T / unit;
    this.ctx.setTransform(ISO * s, 0.5 * s, 0, s, this.ox - SLAB * ISO * this.T, this.oy + SLAB * 0.5 * this.T);
  }
  setBack(unit = TX, Z = 0) {
    const s = this.T / unit;
    this.ctx.setTransform(ISO * s, 0.5 * s, 0, s, this.ox - Z * ISO * this.T, this.oy + Z * 0.5 * this.T);
  }
  setFloor(Dp, unit = TX) {
    const s = this.T / unit;
    this.ctx.setTransform(ISO * s, 0.5 * s, -ISO * s, 0.5 * s, this.ox, this.oy + Dp * this.T);
  }
  setSide(Xp, unit = TX) {
    const s = this.T / unit;
    this.ctx.setTransform(-ISO * s, 0.5 * s, 0, s, this.ox + Xp * ISO * this.T, this.oy + Xp * 0.5 * this.T);
  }
  identity() { this.ctx.setTransform(1, 0, 0, 1, 0, 0); }

  // ---------- main ----------
  draw(dt) {
    this.time += dt;
    this.dt = dt;
    const g = this.game;
    // camera smoothing / follow
    if (this.follow) {
      const d = this.follow;
      const [ix, iy] = this.isoOf(d.x, d.y - 0.4);
      this.cam.x = lerp(this.cam.x, ix, Math.min(1, dt * 4));
      this.cam.y = lerp(this.cam.y, iy, Math.min(1, dt * 4));
    } else if (this.camTarget) {
      this.cam.x = lerp(this.cam.x, this.camTarget[0], Math.min(1, dt * 5));
      this.cam.y = lerp(this.cam.y, this.camTarget[1], Math.min(1, dt * 5));
      if (Math.hypot(this.cam.x - this.camTarget[0], this.cam.y - this.camTarget[1]) < 0.01) this.camTarget = null;
    }
    this.clampCam();
    this.T = this.cam.T * this.dpr;
    this.ox = this.cv.width / 2 - this.cam.x * this.T;
    this.oy = this.cv.height / 2 - this.cam.y * this.T;
    this.night = nightAmount(g.phase);
    this.updateFx(dt);
    this.lights = [];

    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    this.identity();
    this.computeRange();
    this.drawBackground();
    this.drawBackWalls();
    this.drawInterior();
    this.drawLadders();
    this.drawBridges();
    this.drawCaveDecor();
    this.drawEntities(false);
    this.drawFront();
    this.drawOres();
    this.drawDinos();
    this.drawParticles(['crumb']);
    this.drawGlass();
    this.drawFrame();
    this.drawSurface();
    this.drawParticles(['smoke']);
    this.drawLighting();
    this.drawParticles(['spark', 'conf']);
    this.drawOverlays();
  }

  computeRange() {
    const T = this.T;
    const ix0 = -this.ox / T, ix1 = (this.cv.width - this.ox) / T;
    const iy0 = -this.oy / T, iy1 = (this.cv.height - this.oy) / T;
    this.x0 = clamp(Math.floor(ix0 / ISO) - 1, 0, W - 1);
    this.x1 = clamp(Math.ceil(ix1 / ISO + SLAB) + 1, 0, W - 1);
    const H = this.game.world.H;
    this.y0 = clamp(Math.floor(iy0 - (this.x1 + 1 + SLAB) * 0.5) - 2, -1, H - 1);
    this.y1 = clamp(Math.ceil(iy1 - this.x0 * 0.5) + 2, -1, H - 1);
    this.iyView = [iy0, iy1];
    this.ixView = [ix0, ix1];
  }

  drawBackground() {
    const ctx = this.ctx;
    const cw = this.cv.width, ch = this.cv.height;
    const p = this.game.phase;
    const [top, bot] = skyAt(p);
    const n = this.night;
    // vertical world-anchored gradient: sky -> dreamy deep void
    const midX = W / 2;
    const yAt = (D) => ((midX + HALF) * 0.5 + D) * this.T + this.oy;
    const deepA = mix([58, 44, 78], [26, 22, 52], n);
    const deepB = [14, 10, 24];
    const grad = ctx.createLinearGradient(0, yAt(-18), 0, yAt(110));
    const span = 128;
    grad.addColorStop(0, rgb(top));
    grad.addColorStop(18 / span, rgb(bot));
    grad.addColorStop(30 / span, rgb(mix(bot, deepA, 0.75)));
    grad.addColorStop(60 / span, rgb(deepA));
    grad.addColorStop(1, rgb(deepB));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);

    const T = this.T;
    // stars (night) and floating motes (deep)
    if (n > 0.05) {
      ctx.fillStyle = '#fff';
      for (const s of this.stars) {
        const sx = ((s.x * 2.4 - 0.7) * W * ISO - this.cam.x * 0.25) * T + cw / 2;
        const sy = yAt(-16 + s.y * 14) + this.cam.y * T * 0.0;
        if (sy > yAt(-1) || sx < -5 || sx > cw + 5) continue;
        ctx.globalAlpha = n * (0.4 + 0.6 * Math.abs(Math.sin(this.time * 0.8 + s.p)));
        ctx.fillRect(sx, sy, T * 0.05, T * 0.05);
      }
      ctx.globalAlpha = 1;
    }
    // sun / moon
    const sunP = p < NIGHT_START ? p / NIGHT_START : (p - NIGHT_START) / (1 - NIGHT_START);
    const isNightBody = p >= NIGHT_START;
    const bx = (lerp(-3, W * ISO + 3, sunP) - this.cam.x) * T * 0.6 + cw / 2;
    const by = yAt(-6 - Math.sin(sunP * Math.PI) * 8);
    if (by < yAt(2)) {
      const r = T * (isNightBody ? 0.9 : 1.2);
      const halo = ctx.createRadialGradient(bx, by, r * 0.3, bx, by, r * 3.2);
      halo.addColorStop(0, isNightBody ? 'rgba(220,230,255,0.35)' : 'rgba(255,240,180,0.55)');
      halo.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(bx, by, r * 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = isNightBody ? '#eef2ff' : '#fff2b0';
      ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
      if (isNightBody) {
        ctx.fillStyle = rgb(top, 0.9);
        ctx.beginPath(); ctx.arc(bx + r * 0.45, by - r * 0.2, r * 0.85, 0, Math.PI * 2); ctx.fill();
      }
    }
    // clouds
    for (const c of this.clouds) {
      c.x += c.v * this.dt;
      if (c.x > W * 1.6) c.x = -6;
      const cx = ((c.x - 4) * ISO - this.cam.x * 0.4 + this.cam.x) * T + this.ox;
      const cy = yAt(c.y);
      const r = T * 0.55 * c.s;
      ctx.fillStyle = `rgba(255,255,255,${0.75 - n * 0.55})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.9, cy + r * 0.15, r * 0.75, 0, Math.PI * 2);
      ctx.arc(cx - r * 0.9, cy + r * 0.2, r * 0.65, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.2, cy - r * 0.45, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // deep motes
    ctx.fillStyle = '#b9a6ff';
    for (const m of this.motes) {
      const sx = m.x * cw;
      const sy = ((m.y * 1.3 + this.time * 0.01 + m.p) % 1.3) * ch;
      const depth = (sy - this.oy) / T - (midX) * 0.5;
      if (depth < 12) continue;
      ctx.globalAlpha = 0.25 * Math.abs(Math.sin(this.time * 0.6 + m.p));
      ctx.beginPath(); ctx.arc(sx, sy, T * 0.04, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawBackWalls() {
    const w = this.game.world, ctx = this.ctx;
    const groups = new Map();
    for (let y = Math.max(0, this.y0); y <= this.y1; y++) {
      for (let x = this.x0; x <= this.x1; x++) {
        if (!w.empty(x, y)) continue;
        const key = this.matKey(w.bgAt(x, y));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(x, y);
      }
    }
    this.setBack();
    for (const [key, cells] of groups) {
      ctx.beginPath();
      for (let i = 0; i < cells.length; i += 2) ctx.rect(cells[i] * TX, cells[i + 1] * TX, TX, TX);
      ctx.fillStyle = this.pattern(key, 'back');
      ctx.fill();
    }
    // soft shadow under each tunnel ceiling
    this.setBack(1);
    ctx.fillStyle = 'rgba(10,5,20,0.35)';
    ctx.beginPath();
    for (let y = Math.max(0, this.y0); y <= this.y1; y++) {
      for (let x = this.x0; x <= this.x1; x++) {
        if (w.empty(x, y) && w.solid(x, y - 1) && y > 0) ctx.rect(x, y, 1, 0.18);
      }
    }
    ctx.fill();
    this.identity();
  }

  drawInterior() {
    const w = this.game.world, ctx = this.ctx;
    for (let y = this.y1; y >= this.y0; y--) {
      // floors = top faces of the solid cells below empty cells
      if (y + 1 < w.H) {
        const groups = new Map();
        for (let x = this.x0; x <= this.x1; x++) {
          if (!w.empty(x, y) || !w.solid(x, y + 1)) continue;
          const key = y === -1 ? 'grass' : this.matKey(w.get(x, y + 1));
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(x);
        }
        if (groups.size) {
          this.setFloor(y + 1);
          for (const [key, xs] of groups) {
            ctx.beginPath();
            for (const x of xs) ctx.rect(x * TX, 0, TX, SLAB * TX);
            ctx.fillStyle = this.pattern(key, key === 'grass' ? 'front' : 'floor');
            ctx.fill();
          }
        }
      }
      if (y < 0) continue;
      // left walls = +X faces of solid cells left of empty cells
      for (let x = this.x0; x <= this.x1; x++) {
        if (!w.empty(x, y)) continue;
        if (x > 0 && !w.solid(x - 1, y)) continue;
        this.setSide(x);
        if (x === 0) {
          ctx.fillStyle = '#5a3a22';
        } else {
          ctx.fillStyle = this.pattern(this.matKey(w.get(x - 1, y)), 'side');
        }
        ctx.fillRect(0, y * TX, SLAB * TX, TX);
      }
    }
    this.identity();
  }

  // ladders the dwarfs have built (a dwarf only climbs where a ladder stands)
  drawLadders() {
    const w = this.game.world, ctx = this.ctx;
    const segs = [];
    for (let y = Math.max(0, this.y0); y <= this.y1; y++) {
      for (let x = this.x0; x <= this.x1; x++) {
        if (!w.flag(x, y, F_LADDER)) continue;
        const top = y === 0 ? -0.7 : w.flag(x, y - 1, F_LADDER) ? y : y + 0.08;
        const bot = w.flag(x, y + 1, F_LADDER) ? y + 1 : y + 1;
        segs.push(x, top, bot);
      }
    }
    if (!segs.length) return;
    this.setBack(1, 0.12);
    const draw = (lw, col) => {
      ctx.lineWidth = lw;
      ctx.strokeStyle = col;
      ctx.beginPath();
      for (let i = 0; i < segs.length; i += 3) {
        const x = segs[i], top = segs[i + 1], bot = segs[i + 2];
        ctx.moveTo(x + 0.3, top); ctx.lineTo(x + 0.3, bot);
        ctx.moveTo(x + 0.7, top); ctx.lineTo(x + 0.7, bot);
        for (let r = Math.ceil((top + 0.05) / 0.25) * 0.25; r < bot - 0.02; r += 0.25) {
          ctx.moveTo(x + 0.3, r); ctx.lineTo(x + 0.7, r);
        }
      }
      ctx.stroke();
    };
    ctx.lineCap = 'round';
    draw(0.09, '#2e1c10');
    draw(0.05, '#b98049');
    this.identity();
  }

  // plank bridges over shafts and holes
  drawBridges() {
    const w = this.game.world;
    const cols = { front: '#8a5a32', top: '#c99559', side: '#6e4626' };
    for (let y = Math.max(0, this.y0); y <= this.y1; y++) {
      for (let x = this.x0; x <= this.x1; x++) {
        if (!w.flag(x, y, F_BRIDGE)) continue;
        const z0 = w.flag(x, y, F_LADDER) ? SLAB * 0.45 : 0.04;
        this.box(x - 0.04, x + 1.04, y + 0.93, y + 1.03, z0, SLAB - 0.03, cols, ['top', 'front']);
      }
    }
  }

  drawCaveDecor() {
    const w = this.game.world, ctx = this.ctx, T = this.T;
    for (let y = Math.max(0, this.y0); y <= this.y1; y++) {
      for (let x = this.x0; x <= this.x1; x++) {
        const i = y * W + x;
        if (w.mat[i] !== MAT.AIR) continue;
        const f = w.flags[i];
        if (f & F_LAMP) {
          const [sx, sy] = this.proj(x + 0.5, y + 0.06, 0.06);
          ctx.strokeStyle = '#2a1a10';
          ctx.lineWidth = T * 0.025;
          ctx.beginPath(); ctx.moveTo(sx, sy - T * 0.06); ctx.lineTo(sx, sy + T * 0.05); ctx.stroke();
          const s = T * 0.36;
          const sw = 1 + Math.sin(this.time * 2 + x) * 0.04;
          this.icon('lantern', sx, sy + s * 0.5 + T * 0.04, s * sw);
          this.lights.push([x + 0.5, y + 0.4, 0.06, 2.8, 1, '#ffb050']);
        }
        if ((f & F_MUSH) && w.solid(x, y + 1)) {
          const [sx, sy] = this.proj(x + 0.5 + (hash2(x, y, 3) - 0.5) * 0.4, y + 1, SLAB * 0.35);
          const s = T * (0.36 + hash2(x, y, 5) * 0.14);
          this.icon('mushroom', sx, sy - s * 0.45, s);
          this.lights.push([x + 0.5, y + 0.7, SLAB * 0.35, 1.7, 0.8, '#5fe8ff']);
        }
      }
    }
  }

  icon(name, cx, cy, size, rot = 0) {
    drawIcon(this.ctx, name, cx, cy, size, rot);
  }

  drawDwarf(d) {
    const ctx = this.ctx, T = this.T;
    const Z = d.state === 'feast' ? 0.03 : HALF;
    const fx = d.state === 'feast' ? ((d.id * 0.37) % 0.6) - 0.3 : 0;
    let [sx, sy] = this.proj(d.x + fx, d.y, Z);
    if (d.alpha <= 0.01) return;
    const w = this.game.world;
    const onLadder = (d.state === 'walk' && d.move && d.move.y !== d.cy) ||
      (d.state !== 'walk' && w.flag(d.cx, d.cy, F_LADDER) && !w.solid(d.cx, d.cy + 1));
    const grounded = !onLadder && (w.solid(Math.floor(d.x), Math.round(d.y)) || w.flag(Math.floor(d.x), Math.round(d.y) - 1, F_BRIDGE));
    let frame = 0, rot = 0, bob = 0, sxs = 1, sys = 1;
    const t = d.anim;
    if (d.state === 'build') this.drawBuildGhost(d);
    if (d.state === 'dig' || d.state === 'craft' || d.state === 'build') {
      const ph = d.swingT / 0.55;
      frame = ph < 0.62 ? 2 : 0;
      rot = ph < 0.62 ? -0.05 * ph : 0.22 - (ph - 0.62) * 0.4;
      const dy = d.state === 'craft' ? 1 : d.state === 'build' ? 0 : d.digCell.y - d.cy;
      if (dy > 0) rot += 0.15; else if (dy < 0) rot -= 0.25;
      if (ph > 0.62 && ph < 0.75) { sys = 0.94; sxs = 1.05; }
    } else if (d.state === 'walk') {
      frame = d.sack.length ? 3 : 0;
      if (onLadder) {
        bob = Math.sin(t * 14) * 0.03 * T;
        rot = Math.sin(t * 7) * 0.05;
      } else {
        bob = -Math.abs(Math.sin(t * 9)) * 0.07 * T;
        rot = Math.sin(t * 9) * 0.09;
      }
    } else if (d.state === 'sleep') {
      frame = 0;
      rot = -1.45;
      sy -= T * 0.26;
      sx += T * 0.3 * d.facing;
    } else if (d.state === 'cheer') {
      frame = d.sack.length ? 3 : 0;
      bob = -Math.abs(Math.sin(t * 11)) * 0.22 * T;
      sys = 1 + Math.sin(t * 22) * 0.03;
    } else if (d.state === 'feast') {
      frame = 0;
      bob = -Math.abs(Math.sin(t * 3 + d.id)) * 0.05 * T;
      rot = Math.sin(t * 2 + d.id) * 0.06;
    } else {
      frame = d.sack.length ? 3 : 0;
      sys = 1 + Math.sin(t * 2.2) * 0.015;
    }
    if (grounded && d.state !== 'sleep' && d.state !== 'feast') {
      ctx.fillStyle = 'rgba(20,10,5,0.28)';
      ctx.beginPath();
      ctx.ellipse(sx, sy, T * 0.25, T * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const size = T * 1.0;
    ctx.save();
    ctx.globalAlpha = d.alpha;
    ctx.translate(sx, sy + bob);
    ctx.scale(d.facing * sxs, sys);
    ctx.rotate(rot);
    ctx.drawImage(this.a.img.dwarfs, frame * SPRITE, d.variant * SPRITE, SPRITE, SPRITE,
      -size / 2, -size * (248 / 256), size, size);
    ctx.restore();
    if (d.state === 'craft') {
      ctx.fillStyle = '#9aa0a8';
      ctx.strokeStyle = '#3b2414';
      ctx.lineWidth = Math.max(1, T * 0.025);
      ctx.beginPath();
      ctx.ellipse(sx + d.facing * T * 0.36, sy - T * 0.08, T * 0.16, T * 0.11, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    if (d.state === 'feast') this.icon('beer', sx + d.facing * T * 0.32, sy - T * 0.42 + bob, T * 0.3);
    // every dwarf carries a little candle light; miners with helmets shine brighter
    this.lights.push([d.x, d.y - 0.45, Z, d.variant === 3 ? 2.0 : 1.25, 0.8, '#ffd9a0']);
    d._sx = sx; d._sy = sy + bob;
  }

  // the ladder or plank a dwarf is hammering together, fading in as it grows
  drawBuildGhost(d) {
    const b = d.build;
    if (!b) return;
    const ctx = this.ctx;
    const prog = 1 - Math.max(0, d.timer) / b.total;
    ctx.globalAlpha = 0.25 + prog * 0.6;
    if (b.kind === 'bridge') {
      const cols = { front: '#8a5a32', top: '#c99559', side: '#6e4626' };
      this.box(b.x - 0.04, b.x - 0.04 + 1.08 * prog, b.y + 0.93, b.y + 1.03, 0.04, SLAB - 0.03, cols, ['top', 'front']);
    } else {
      this.setBack(1, 0.12);
      ctx.lineCap = 'round';
      const top = Math.min(b.y, b.fy), bot = Math.max(b.y, b.fy) + 1;
      const end = top + (bot - top) * prog;
      for (const [lw, col] of [[0.09, '#2e1c10'], [0.05, '#b98049']]) {
        ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.beginPath();
        ctx.moveTo(b.x + 0.3, top); ctx.lineTo(b.x + 0.3, end);
        ctx.moveTo(b.x + 0.7, top); ctx.lineTo(b.x + 0.7, end);
        for (let r = top + 0.2; r < end; r += 0.25) { ctx.moveTo(b.x + 0.3, r); ctx.lineTo(b.x + 0.7, r); }
        ctx.stroke();
      }
      this.identity();
    }
    ctx.globalAlpha = 1;
  }

  drawEntities(surface) {
    const list = this.game.dwarfs.filter((d) => (surface ? d.y <= 0.05 : d.y > 0.05) && d.alpha > 0.01);
    list.sort((a, b) => (a.x * 0.5 + a.y) - (b.x * 0.5 + b.y));
    for (const d of list) this.drawDwarf(d);
  }

  drawFront() {
    const w = this.game.world, ctx = this.ctx;
    const groups = new Map();
    const edges = [];
    const tops = [];
    for (let y = Math.max(0, this.y0); y <= this.y1; y++) {
      for (let x = this.x0; x <= this.x1; x++) {
        if (!w.solid(x, y)) continue;
        const m = w.get(x, y);
        const key = this.matKey(m);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(x, y);
        if (w.empty(x, y - 1)) { edges.push(x, y, x + 1, y); tops.push(x, y); }
        if (y + 1 < w.H && w.empty(x, y + 1)) edges.push(x, y + 1, x + 1, y + 1);
        if (x > 0 && w.empty(x - 1, y)) edges.push(x, y, x, y + 1);
        if (x < W - 1 && w.empty(x + 1, y)) edges.push(x + 1, y, x + 1, y + 1);
      }
    }
    this.setFront();
    for (const [key, cells] of groups) {
      ctx.beginPath();
      for (let i = 0; i < cells.length; i += 2) ctx.rect(cells[i] * TX, cells[i + 1] * TX, TX, TX);
      ctx.fillStyle = this.pattern(key, 'front');
      ctx.fill();
    }
    this.setFront(1);
    // grass fringe on the top soil
    if (this.y0 <= 0) {
      ctx.beginPath();
      for (let x = this.x0; x <= this.x1; x++) {
        if (!w.solid(x, 0)) continue;
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 1, 0);
        for (let k = 8; k >= 0; k--) {
          const u = x + k / 8;
          ctx.lineTo(u, 0.16 + (k % 2 ? 0.1 : 0) + hash2(x, k, 9) * 0.06);
        }
        ctx.closePath();
      }
      ctx.fillStyle = '#5fae3a';
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,60,20,0.6)';
      ctx.lineWidth = 0.03;
      ctx.stroke();
    }
    // bevel highlight under tunnel floors and outlines around every opening
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,238,200,0.22)';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    for (let i = 0; i < tops.length; i += 2) {
      if (tops[i + 1] === 0) continue;
      ctx.moveTo(tops[i] + 0.05, tops[i + 1] + 0.06);
      ctx.lineTo(tops[i] + 0.95, tops[i + 1] + 0.06);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(38,20,12,0.9)';
    ctx.lineWidth = 0.075;
    ctx.beginPath();
    for (let i = 0; i < edges.length; i += 4) {
      ctx.moveTo(edges[i], edges[i + 1]);
      ctx.lineTo(edges[i + 2], edges[i + 3]);
    }
    ctx.stroke();
    // layer tint: deeper earth gets a cooler, darker veil
    this.identity();
  }

  drawOres() {
    const g = this.game, w = g.world, ctx = this.ctx, T = this.T;
    for (let y = Math.max(0, this.y0); y <= this.y1; y++) {
      for (let x = this.x0; x <= this.x1; x++) {
        const i = y * W + x;
        const o = w.ore[i];
        if (!o || w.mat[i] === MAT.AIR) continue;
        const [sx, sy] = this.proj(x + 0.5, y + 0.5, SLAB);
        if (w.flags[i] & F_REV) {
          const ore = ORES[o];
          const heart = o === ORE_HEART;
          const s = T * (heart ? 0.95 : 0.56);
          ctx.fillStyle = 'rgba(20,10,5,0.35)';
          ctx.beginPath(); ctx.ellipse(sx, sy + s * 0.08, s * 0.42, s * 0.36, 0, 0, Math.PI * 2); ctx.fill();
          if (heart) {
            const pulse = 1 + Math.sin(this.time * 3) * 0.06;
            const hue = (this.time * 60) % 360;
            const gl = ctx.createRadialGradient(sx, sy, 0, sx, sy, s * 1.2);
            gl.addColorStop(0, `hsla(${hue},100%,80%,0.8)`);
            gl.addColorStop(1, `hsla(${hue},100%,70%,0)`);
            ctx.fillStyle = gl;
            ctx.beginPath(); ctx.arc(sx, sy, s * 1.2, 0, Math.PI * 2); ctx.fill();
            this.icon('diamond', sx, sy, s * pulse);
          } else {
            this.icon(ore.icon, sx, sy, s, (hash2(x, y, 31) - 0.5) * 0.6);
          }
          if (ore.glow) {
            this.lights.push([x + 0.5, y + 0.5, SLAB, heart ? 3 : 0.9, heart ? 1 : 0.55, ore.glow]);
            const tw = (this.time * 0.45 + hash2(x, y, 11)) % 1;
            if (tw < 0.12) this.star(sx + (hash2(x, y, 4) - 0.5) * s * 0.6, sy - s * 0.25, T * 0.13 * Math.sin(tw / 0.12 * Math.PI), '#fffbe8');
          }
        } else if (ORES[o].value >= 5) {
          // a faint glint hints at hidden treasure
          const tw = (this.time * 0.18 + hash2(x, y, 21)) % 1;
          if (tw < 0.06) {
            const a = Math.sin((tw / 0.06) * Math.PI);
            this.star(sx + (hash2(x, y, 22) - 0.5) * T * 0.6, sy + (hash2(x, y, 23) - 0.5) * T * 0.6, T * 0.12 * a, 'rgba(255,250,220,0.9)');
          }
        }
      }
    }
  }

  // dinosaur skeletons pressed against the glass
  drawDinos() {
    const w = this.game.world, ctx = this.ctx;
    for (const d of w.dinos) {
      if (d.y > this.y1 + 1 || d.y + d.h < this.y0 - 1) continue;
      const img = this.a.img['dino' + d.kind];
      const asp = img.width / img.height;
      let iw = d.w, ih = d.w / asp;
      if (ih > d.h) { ih = d.h; iw = d.h * asp; }
      this.setFront(1);
      ctx.globalAlpha = d.found ? 1 : 0.62;
      ctx.drawImage(img, d.x + (d.w - iw) / 2, d.y + (d.h - ih) / 2, iw, ih);
      ctx.globalAlpha = 1;
      this.identity();
    }
  }

  star(x, y, r, color) {
    if (r <= 0.5) return;
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
  }

  drawGlass() {
    const ctx = this.ctx;
    this.setFront(1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, this.game.world.H);
    ctx.clip();
    const v0 = Math.max(0, this.y0), v1 = Math.min(this.game.world.H, this.y1 + 2);
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.beginPath();
    for (let a = -40; a < W + 10; a += 9) {
      for (const [off, wd] of [[0, 0.9], [1.3, 0.25]]) {
        const u = a + off + v0 * 0.55;
        ctx.moveTo(u, v0);
        ctx.lineTo(u + wd, v0);
        ctx.lineTo(u + wd + (v1 - v0) * 0.55, v1);
        ctx.lineTo(u + (v1 - v0) * 0.55, v1);
        ctx.closePath();
      }
    }
    ctx.fill();
    ctx.restore();
    // glass edge highlight along the top
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.04;
    ctx.beginPath(); ctx.moveTo(0, 0.02); ctx.lineTo(W, 0.02); ctx.stroke();
    this.identity();
  }

  box(x0, x1, d0, d1, z0, z1, cols, faces) {
    // faces: front (+Z), top (-D), side (+X)
    const ctx = this.ctx;
    const P = (X, D, Z) => this.proj(X, D, Z);
    const poly = (pts, fill) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
    };
    ctx.strokeStyle = '#3b2414';
    ctx.lineWidth = Math.max(1, this.T * 0.03);
    ctx.lineJoin = 'round';
    if (faces.includes('top')) poly([P(x0, d0, z0), P(x1, d0, z0), P(x1, d0, z1), P(x0, d0, z1)], cols.top);
    if (faces.includes('front')) poly([P(x0, d0, z1), P(x1, d0, z1), P(x1, d1, z1), P(x0, d1, z1)], cols.front);
    if (faces.includes('side')) poly([P(x1, d0, z1), P(x1, d0, z0), P(x1, d1, z0), P(x1, d1, z1)], cols.side);
  }

  drawFrame() {
    const cols = { front: '#9b6a3c', top: '#c99559', side: '#6e4626' };
    const t = 0.32, zf = SLAB + 0.07, zb = -0.07;
    const top = Math.max(-0.3, this.y0 - 1), bot = this.y1 + 2;
    const faces = top < 0 ? ['top', 'front'] : ['front'];
    this.box(-t, 0, top, bot, zb, zf, cols, faces);
    this.box(W, W + t, top, bot, zb, zf, cols, [...faces, 'side']);
    // wood grain on the posts
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(60,35,18,0.35)';
    ctx.lineWidth = Math.max(1, this.T * 0.02);
    ctx.beginPath();
    for (const X of [-t * 0.5, W + t * 0.5]) {
      for (let D = Math.max(0, Math.floor(this.y0 / 1.7) * 1.7); D < this.y1 + 2; D += 1.7) {
        const [ax, ay] = this.proj(X - 0.05, D, zf);
        const [bx, by] = this.proj(X + 0.05, D + 0.9, zf);
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      }
    }
    ctx.stroke();
  }

  prop(name, X, heightCells, anchorX = 0.5, Z = HALF) {
    const img = this.a.img[name];
    const T = this.T;
    const h = heightCells * T;
    const w = h * (img.width / img.height);
    const [sx, sy] = this.proj(X, 0, Z);
    this.ctx.drawImage(img, sx - w * anchorX, sy - h + T * 0.06, w, h);
    return [sx, sy, w, h];
  }

  drawSurface() {
    const g = this.game, ctx = this.ctx, T = this.T;
    if (this.y0 > 2) {
      // still draw dwarfs that are on the surface (none visible) – nothing to do
      return;
    }
    // grass tufts along the front edge
    ctx.strokeStyle = '#3f8a2a';
    ctx.lineWidth = Math.max(1, T * 0.025);
    ctx.beginPath();
    for (let x = this.x0; x <= this.x1; x++) {
      if (!g.world.solid(x, 0)) continue;
      for (let k = 0; k < 4; k++) {
        const X = x + 0.12 + k * 0.25 + hash2(x, k, 2) * 0.1;
        const [sx, sy] = this.proj(X, 0, SLAB * (0.2 + hash2(x, k, 7) * 0.75));
        const hgt = T * (0.08 + hash2(x, k, 8) * 0.08);
        const sway = Math.sin(this.time * 1.5 + x + k) * T * 0.02;
        ctx.moveTo(sx - T * 0.03, sy); ctx.lineTo(sx + sway, sy - hgt);
        ctx.moveTo(sx + T * 0.03, sy); ctx.lineTo(sx + sway + T * 0.04, sy - hgt * 0.8);
      }
    }
    ctx.stroke();

    const list = [];
    list.push({ k: 0.6, f: () => this.prop('pine', 0.9, 3.0, 0.5, SLAB * 0.3) });
    list.push({ k: 1.6, f: () => this.prop('sign', 1.75, 1.2, 0.5) });
    list.push({ k: COTTAGE_X + 0.2, f: () => this.drawCottage() });
    list.push({ k: 14.8, f: () => this.prop('rocks', 15.2, 1.0) });
    list.push({ k: 16.6, f: () => this.prop('oak', 17.0, 3.1, 0.5, SLAB * 0.3) });
    list.push({ k: 18.5, f: () => this.prop('pine', 18.9, 2.7, 0.5, SLAB * 0.3) });
    list.push({ k: STASH_X + 0.3, f: () => this.drawStash() });
    list.push({ k: FEAST_X + 4.2, f: () => this.drawTable() });
    list.push({ k: ENTRANCE_X + 1.3, f: () => this.drawMine() });
    for (const d of g.dwarfs) {
      if (d.y <= 0.05 && d.alpha > 0.01) list.push({ k: d.x, f: () => this.drawDwarf(d) });
    }
    list.sort((a, b) => a.k - b.k);
    for (const it of list) it.f();
  }

  drawMine() {
    const [sx, sy, w, h] = this.prop('mine', ENTRANCE_X + 0.5, 1.75, 0.33, HALF);
    this.lights.push([ENTRANCE_X + 0.4, -0.9, HALF, 1.6, 0.9, '#ffb050']);
    void sx; void sy; void w; void h;
  }

  drawCottage() {
    const [sx, sy, w, h] = this.prop('cottage', COTTAGE_X + 0.5, 2.4, 0.42, SLAB * 0.3);
    const T = this.T;
    // chimney smoke
    this.smokeT -= this.dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.5 + Math.random() * 0.4;
      const ix = (sx - w * 0.42 + w * 0.66 - this.ox) / T;
      const iy = (sy - h * 0.86 - this.oy) / T;
      this.particles.push({ k: 'smoke', x: ix, y: iy, vx: 0.05, vy: -0.35, life: 3.2, t: 0, s: 0.12, c: '#ffffff' });
    }
    if (this.night > 0.3) {
      this.lights.push([COTTAGE_X + 0.6, -0.6, SLAB * 0.3, 2.2, this.night, '#ffc070']);
      const home = this.game.dwarfs.filter((d) => d.state === 'home').length;
      if (home) {
        this.ctx.fillStyle = `rgba(255,190,90,${0.5 * this.night})`;
        this.ctx.beginPath();
        this.ctx.ellipse(sx - w * 0.42 + w * 0.36, sy - h * 0.33, w * 0.06, h * 0.07, 0, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  drawStash() {
    const g = this.game, T = this.T;
    const [sx, sy] = this.proj(STASH_X + 0.5, 0, HALF);
    const s = T * 0.95;
    this.icon('cart', sx, sy - s * 0.42, s);
    if (g.gold > 0 && (this.time * 0.7) % 1 < 0.15) this.star(sx + T * 0.1, sy - s * 0.7, T * 0.1, '#fff7c2');
  }

  drawTable() {
    const g = this.game, T = this.T;
    const cols = { front: '#8a5a32', top: '#b07a45', side: '#6a4226' };
    const x0 = FEAST_X + 0.1, x1 = FEAST_X + 3.9;
    this.box(x0 + 0.1, x0 + 0.2, -0.3, 0, 0.12, 0.2, cols, ['front', 'side']);
    this.box(x1 - 0.2, x1 - 0.1, -0.3, 0, 0.12, 0.2, cols, ['front', 'side']);
    this.box(x0, x1, -0.36, -0.3, 0.06, 0.26, cols, ['top', 'front', 'side']);
    if (g.feast) {
      for (let i = 0; i < 4; i++) {
        const [sx, sy] = this.proj(FEAST_X + i + 0.55, -0.36, 0.16);
        this.icon(i === 1 ? 'chest' : 'beer', sx, sy - T * 0.14, T * (i === 1 ? 0.42 : 0.3));
      }
      this.lights.push([FEAST_X + 2, -0.6, 0.2, 3, 0.8, '#ffcf7a']);
    }
  }

  drawParticles(kinds) {
    const ctx = this.ctx, T = this.T;
    for (const p of this.particles) {
      if (!kinds.includes(p.k)) continue;
      const a = 1 - p.t / p.life;
      const [sx, sy] = this.isoToScreen(p.x, p.y);
      if (p.k === 'spark') this.star(sx, sy, p.s * T * a, p.c);
      else if (p.k === 'smoke') {
        ctx.globalAlpha = a * 0.5 * (1 - this.night * 0.5);
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(sx, sy, p.s * T, 0, Math.PI * 2); ctx.fill();
      } else if (p.k === 'conf') {
        ctx.globalAlpha = Math.min(1, a * 2);
        ctx.fillStyle = p.c;
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(p.r);
        ctx.fillRect(-p.s * T, -p.s * T * 0.5, p.s * T * 2, p.s * T);
        ctx.restore();
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.c;
        ctx.fillRect(sx - p.s * T / 2, sy - p.s * T / 2, p.s * T, p.s * T);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawLighting() {
    const lc = this.lctx, lw = this.light.width, lh = this.light.height;
    const sc = lw / this.cv.width;
    const T = this.T;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, lw, lh);
    // darkness by depth (+ night on the surface)
    const Xc = clamp(this.cam.x / ISO + HALF, 0, W);
    const yAt = (D) => ((Xc + HALF) * 0.5 + D) * T + this.oy;
    const dark = (D) => {
      const deep = D < 2 ? 0 : D < 84 ? Math.min(0.62, (D - 2) / 50 * 0.5 + (D > 55 ? (D - 55) / 30 * 0.12 : 0)) : 0.5;
      const surf = this.night * 0.3 * (D < 0 ? 1 : Math.max(0.35, 1 - D / 8));
      return Math.max(deep, surf);
    };
    const d0 = this.y0 - 14, d1 = this.y1 + 6;
    const g = lc.createLinearGradient(0, yAt(d0) * sc, 0, yAt(d1) * sc);
    for (let D = d0; D <= d1; D += 2) g.addColorStop((D - d0) / (d1 - d0), `rgba(10,6,28,${dark(D).toFixed(3)})`);
    lc.fillStyle = g;
    lc.fillRect(0, 0, lw, lh);
    // punch out the lights
    lc.globalCompositeOperation = 'destination-out';
    for (const [X, D, Z, r, s] of this.lights) {
      const [sx, sy] = this.proj(X, D, Z);
      const R = r * T * sc;
      const x = sx * sc, y = sy * sc;
      if (x < -R || y < -R || x > lw + R || y > lh + R) continue;
      const rg = lc.createRadialGradient(x, y, 0, x, y, R);
      rg.addColorStop(0, `rgba(0,0,0,${0.95 * s})`);
      rg.addColorStop(0.5, `rgba(0,0,0,${0.5 * s})`);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = rg;
      lc.fillRect(x - R, y - R, R * 2, R * 2);
    }
    const ctx = this.ctx;
    this.identity();
    ctx.drawImage(this.light, 0, 0, this.cv.width, this.cv.height);
    // warm additive glow
    ctx.globalCompositeOperation = 'lighter';
    for (const [X, D, Z, r, s, col] of this.lights) {
      if (r < 1.5 && s < 0.9) continue;
      const [sx, sy] = this.proj(X, D, Z);
      const R = r * T * 0.55;
      if (sx < -R || sy < -R || sx > this.cv.width + R || sy > this.cv.height + R) continue;
      const rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
      rg.addColorStop(0, hexA(col, 0.22 * s));
      rg.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = rg;
      ctx.fillRect(sx - R, sy - R, R * 2, R * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawOverlays() {
    const g = this.game, ctx = this.ctx, T = this.T, dpr = this.dpr;
    // flags
    for (const f of g.flags) {
      const [sx, sy] = this.proj(f.x + 0.5, f.y + 0.5, SLAB);
      const pulse = (this.time * 1.2) % 1;
      ctx.strokeStyle = `rgba(255,80,80,${1 - pulse})`;
      ctx.lineWidth = Math.max(2, T * 0.04);
      ctx.beginPath(); ctx.ellipse(sx, sy + T * 0.3, T * (0.25 + pulse * 0.3), T * (0.1 + pulse * 0.12), 0, 0, Math.PI * 2); ctx.stroke();
      this.icon('flag', sx + T * 0.05, sy - Math.abs(Math.sin(this.time * 3)) * T * 0.1, T * 0.7);
    }
    // selection
    const sel = this.selected;
    if (sel && sel.alpha > 0.1 && sel._sx !== undefined) {
      ctx.strokeStyle = '#ffe27a';
      ctx.lineWidth = Math.max(2, T * 0.035);
      ctx.setLineDash([T * 0.08, T * 0.06]);
      ctx.lineDashOffset = -this.time * T * 0.3;
      ctx.beginPath(); ctx.ellipse(sel._sx, sel._sy, T * 0.34, T * 0.11, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      this.label(sel.name, sel._sx, sel._sy + T * 0.32, '#ffe27a');
    }
    // bubbles
    const fs = clamp(T * 0.24, 11 * dpr, 17 * dpr);
    ctx.font = `600 ${fs}px Fredoka, "Trebuchet MS", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const d of g.dwarfs) {
      if (!d.bubble || d.alpha < 0.5 || d._sx === undefined) continue;
      const b = d.bubble;
      const a = Math.min(1, b.t * 3, (b.max - b.t) * 6);
      const bx = d._sx + d.facing * T * 0.18, by = d._sy - T * 1.12 - (1 - a) * T * 0.15;
      if (bx < -50 || by < -50 || bx > this.cv.width + 50 || by > this.cv.height + 50) continue;
      ctx.globalAlpha = a;
      let bw, bh;
      if (b.icon) { bw = fs * 2.2; bh = fs * 2.1; } else { bw = ctx.measureText(b.text).width + fs * 1.1; bh = fs * 1.75; }
      ctx.fillStyle = 'rgba(255,252,240,0.96)';
      ctx.strokeStyle = 'rgba(60,35,20,0.85)';
      ctx.lineWidth = Math.max(1.5, dpr * 1.5);
      roundRect(ctx, bx - bw / 2, by - bh / 2, bw, bh, bh * 0.45);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx - fs * 0.25, by + bh / 2 - 1);
      ctx.lineTo(bx - d.facing * fs * 0.2, by + bh / 2 + fs * 0.45);
      ctx.lineTo(bx + fs * 0.25, by + bh / 2 - 1);
      ctx.fill();
      if (b.icon) this.icon(b.icon, bx, by, fs * 1.7);
      else { ctx.fillStyle = '#4a2c18'; ctx.fillText(b.text, bx, by + fs * 0.05); }
      ctx.globalAlpha = 1;
    }
    // floaters
    ctx.font = `700 ${fs * 1.3}px Fredoka, "Trebuchet MS", sans-serif`;
    for (const f of this.floaters) {
      const [sx, sy] = this.isoToScreen(f.x, f.y);
      ctx.globalAlpha = 1 - f.t / f.life;
      ctx.lineWidth = dpr * 3;
      ctx.strokeStyle = 'rgba(60,30,10,0.9)';
      ctx.strokeText(f.text, sx, sy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, sx, sy);
    }
    ctx.globalAlpha = 1;
  }

  label(text, x, y, color) {
    const ctx = this.ctx, dpr = this.dpr;
    const fs = clamp(this.T * 0.22, 10 * dpr, 15 * dpr);
    ctx.font = `700 ${fs}px Fredoka, "Trebuchet MS", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + fs;
    ctx.fillStyle = 'rgba(40,22,12,0.8)';
    roundRect(ctx, x - w / 2, y - fs * 0.75, w, fs * 1.5, fs * 0.6);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + fs * 0.05);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export { F_CAVE };
