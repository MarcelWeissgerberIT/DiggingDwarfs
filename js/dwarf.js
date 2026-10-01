// A single dwarf with a tiny ant-like brain.
import {
  W, H, MATS, ORES, SACK_SIZE, STASH_X, COTTAGE_X, NAMES, LIKES,
} from './config.js';
import { dijkstra, pathTo, costTo } from './path.js';
import { F_REV } from './world.js';

const WALK = 2.3;
const CLIMB = 1.6;
const SWING = 0.55;
let nextId = 1;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const CHAT = [
  'Hallo!', 'Na du?', 'Glitzert\'s bei dir?', 'Gold!', 'Bier später?', 'Hihi', 'Echt jetzt?', 'Ich hab Hunger',
  'Psst…', 'Schöner Bart!', 'Ho ho!', '♪', { icon: 'gold' }, { icon: 'diamond' }, { icon: 'beer' }, 'Tief graben!',
];

const DIRS = [
  [[1, 0], 0.33], [[-1, 0], 0.33], [[0, 1], 0.1], [[1, 1], 0.1], [[-1, 1], 0.1], [[0, -1], 0.02], [[1, -1], 0.02],
];
function randomDir() {
  let r = Math.random();
  for (const [d, p] of DIRS) { if ((r -= p) <= 0) return d; }
  return [1, 0];
}

export class Dwarf {
  constructor(game, o = {}) {
    this.game = game;
    this.id = o.id ?? nextId;
    nextId = Math.max(nextId, this.id + 1);
    this.name = o.name ?? pick(NAMES);
    this.variant = o.variant ?? Math.floor(Math.random() * 4);
    this.cx = o.cx ?? 0;
    this.cy = o.cy ?? -1;
    this.x = this.cx + 0.5;
    this.y = this.cy + 1;
    this.facing = o.facing ?? 1;
    this.sack = o.sack ?? [];
    this.energy = o.energy ?? 100;
    this.dug = o.dug ?? 0;
    this.finds = o.finds ?? 0;
    this.best = o.best ?? 0;
    this.likes = o.likes ?? pick(LIKES);
    this.depthLove = o.depthLove ?? 0.25 + Math.random() * 0.75;
    this.joined = o.joined ?? 1;
    this.state = o.state === 'home' ? 'home' : 'idle';
    this.timer = o.timer ?? Math.random();
    this.task = null;
    this.path = [];
    this.move = null;
    this.digCell = null;
    this.digProg = 0;
    this.swingT = 0;
    this.bubble = null;
    this.thinkT = 3 + Math.random() * 10;
    this.alpha = this.state === 'home' ? 0 : 1;
    this.anim = Math.random() * 10;
  }

  serialize() {
    const { id, name, variant, cx, cy, facing, sack, energy, dug, finds, best, likes, depthLove, joined } = this;
    return {
      id, name, variant, cx, cy, facing, sack, energy: Math.round(energy), dug, finds, best, likes, depthLove, joined,
      state: this.state === 'home' ? 'home' : 'idle', timer: this.state === 'home' ? this.timer : 0,
    };
  }

  sackValue() { return this.sack.reduce((s, o) => s + ORES[o].value, 0); }

  say(content, dur = 2.6) {
    this.bubble = typeof content === 'string' ? { text: content, t: dur, max: dur } : { icon: content.icon, t: dur, max: dur };
  }

  activity() {
    const t = this.task?.kind;
    if (this.state === 'home') return 'schläft im Häuschen';
    if (this.state === 'sleep') return 'macht ein Nickerchen';
    if (this.state === 'feast') return 'feiert beim Festmahl';
    if (this.state === 'cheer') return 'jubelt!';
    if (this.state === 'craft') return 'behaut Steine für die Händler';
    if (this.state === 'chat') {
      const o = this.game.dwarfs.find((d) => d.id === this.chatWith);
      return o ? `plaudert mit ${o.name}` : 'plaudert';
    }
    if (this.state === 'dig') {
      if (t === 'mine') return `gräbt nach ${ORES[this.task.ore]?.name ?? 'Schätzen'}`;
      if (t === 'flag') return 'gräbt zur Flagge';
      return `gräbt durch ${MATS[this.game.world.get(this.digCell.x, this.digCell.y)]?.name ?? 'Erde'}`;
    }
    switch (t) {
      case 'mine': return `will ${ORES[this.task.ore]?.name ?? 'etwas'} holen`;
      case 'flag': return 'folgt deinem Befehl';
      case 'deposit': return 'bringt Schätze nach oben';
      case 'home': return 'geht nach Hause';
      case 'sleep': return 'sucht ein Schlafplätzchen';
      case 'feast': return 'eilt zum Festmahl';
      case 'wander': return 'schlendert herum';
      case 'craft': return 'geht Steine behauen';
      case 'chat': return 'will ein Schwätzchen halten';
      case 'explore': return 'erkundet neue Gänge';
      default: return 'überlegt…';
    }
  }

  update(dt) {
    this.anim += dt;
    if (this.bubble && (this.bubble.t -= dt) <= 0) this.bubble = null;
    if (this.energy < 0) this.energy = 0;
    this.think(dt);
    switch (this.state) {
      case 'home':
        this.alpha = Math.max(0, this.alpha - dt * 3);
        this.energy = Math.min(100, this.energy + dt * 6);
        if ((this.timer -= dt) <= 0) {
          this.state = 'idle';
          this.timer = 0.4;
          this.say(pick(['Guten Morgen!', 'Auf geht\'s!', 'Frisch und munter!', '♪']));
        }
        return;
      case 'sleep':
        this.energy = Math.min(100, this.energy + dt * 4.5);
        if ((this.timer -= dt) <= 0 && this.energy >= 100) {
          this.state = 'idle';
          this.timer = 0.5;
          this.say('Ausgeschlafen!');
        }
        return;
      case 'cheer':
        if ((this.timer -= dt) <= 0) { this.state = 'idle'; this.timer = 0; }
        return;
      case 'chat':
        if ((this.chatT -= dt) <= 0) {
          this.chatT = 2.6;
          this.say(pick(CHAT), 2);
        }
        if ((this.timer -= dt) <= 0 || this.game.feast) { this.state = 'idle'; this.timer = 0.3; }
        return;
      case 'craft':
        this.swingT += dt;
        this.energy -= dt * 0.2;
        if (this.swingT >= SWING) {
          this.swingT -= SWING;
          this.game.hooks.strike?.(this, this.cx, 0, 3);
          if (++this.craftN % 7 === 0) this.game.craftGold(this);
        }
        if ((this.timer -= dt) <= 0 || this.game.feast) { this.state = 'idle'; this.timer = 0; }
        return;
      case 'feast':
        this.energy = Math.min(100, this.energy + dt * 3);
        if (!this.game.feast) { this.state = 'idle'; this.timer = Math.random(); }
        return;
      case 'walk':
        this.alpha = Math.min(1, this.alpha + dt * 3);
        this.walkUpdate(dt);
        return;
      case 'dig':
        this.digUpdate(dt);
        return;
      default:
        this.alpha = Math.min(1, this.alpha + dt * 3);
        if ((this.timer -= dt) > 0) return;
        this.next();
    }
  }

  next() {
    if (this.path.length) { this.step(); return; }
    if (this.task) {
      const t = this.task;
      this.task = null;
      this.finish(t);
      if (this.state !== 'idle' || this.timer > 0) return;
    }
    this.choose();
  }

  step() {
    const n = this.path[0];
    const w = this.game.world;
    if (Math.abs(n.x - this.cx) + Math.abs(n.y - this.cy) !== 1) { this.abort(); return; }
    if (n.x !== this.cx) this.facing = n.x > this.cx ? 1 : -1;
    if (w.solid(n.x, n.y)) {
      if (!w.canDig(n.x, n.y, this.game.pickLevel)) { this.abort(); return; }
      this.state = 'dig';
      this.digCell = n;
      this.digProg = 0;
      this.swingT = 0;
      return;
    }
    this.path.shift();
    this.move = n;
    this.state = 'walk';
  }

  walkUpdate(dt) {
    const m = this.move;
    const tx = m.x + 0.5, ty = m.y + 1;
    const vertical = m.y !== this.cy;
    const g = this.game;
    const sp = (vertical ? CLIMB : WALK) * (g.buffT > 0 ? 1.25 : 1) * (this.energy < 20 ? 0.75 : 1);
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const s = sp * dt;
    this.energy -= dt * 0.06;
    if (d <= s) {
      this.x = tx; this.y = ty; this.cx = m.x; this.cy = m.y;
      this.move = null;
      this.state = 'idle';
      this.timer = 0;
      this.next();
    } else {
      this.x += (dx / d) * s;
      this.y += (dy / d) * s;
    }
  }

  digUpdate(dt) {
    const n = this.digCell;
    const g = this.game;
    const w = g.world;
    if (w.empty(n.x, n.y)) { this.state = 'idle'; this.timer = 0; return; }
    const m = w.get(n.x, n.y);
    this.swingT += dt;
    if (this.swingT >= SWING) {
      this.swingT -= SWING;
      g.hooks.strike?.(this, n.x, n.y, m);
    }
    this.digProg += (dt * g.digSpeed(this)) / MATS[m].time;
    this.energy -= dt * 0.38;
    if (this.digProg >= 1) {
      this.dug++;
      g.digCell(this, n.x, n.y);
      if (this.state === 'dig') { this.state = 'idle'; this.timer = 0; }
    }
  }

  abort() {
    if (this.task) this.game.unclaim(this.task);
    this.task = null;
    this.path = [];
    this.move = null;
    this.state = 'idle';
    this.timer = 0.6;
  }

  // Interrupt whatever we do (feast, new flag…)
  interrupt() {
    if (this.task) this.game.unclaim(this.task);
    this.task = null;
    this.path = [];
    if (this.state === 'walk') return; // finish the current step first
    if (this.state === 'home') { this.timer = Math.min(this.timer, 0.5); return; }
    this.state = 'idle';
    this.timer = 0.1;
  }

  goTo(kind, tx, ty, extra = {}, map = null) {
    const g = this.game;
    const m = map ?? dijkstra(g.world, this.cx, this.cy, { pick: g.pickLevel, seed: (Math.random() * 1e9) | 0, noDig: extra.noDig });
    let p = pathTo(m, tx, ty);
    if (!p && extra.noDig) {
      const m2 = dijkstra(g.world, this.cx, this.cy, { pick: g.pickLevel, seed: 1 });
      p = pathTo(m2, tx, ty);
    }
    if (!p) return false;
    this.task = { kind, x: tx, y: ty, ...extra };
    this.path = p;
    this.state = 'idle';
    this.timer = 0;
    return true;
  }

  choose() {
    const g = this.game;
    const w = g.world;
    if (g.feast) { if (this.goFeast()) return; }
    if (this.sack.length >= SACK_SIZE || this.sackValue() >= 18) { if (this.goDeposit()) return; }
    if (this.energy < 18) { this.goRest(true); return; }
    if (g.isNight() && this.energy < 75 && Math.random() < 0.5) { this.goRest(false); return; }
    const flag = g.flagFor(this);
    if (flag) {
      if (this.goTo('flag', flag.x, flag.y, { flag })) { this.say(pick(['Jawohl!', 'Wird gemacht!', 'Zu Befehl!'])); return; }
      g.dropFlag(flag, true);
    }
    const map = dijkstra(w, this.cx, this.cy, { pick: g.pickLevel, seed: (Math.random() * 1e9) | 0 });

    // 1) known treasure nearby?
    let best = null, bestScore = -Infinity;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const o = w.ore[i];
        if (!o || !(w.flags[i] & F_REV) || g.claims.has(i)) continue;
        if (!w.canDig(x, y, g.pickLevel)) continue;
        const c = costTo(map, x, y);
        if (!isFinite(c) || c > 160) continue;
        let s = 12 + ORES[o].value * 0.5 - c * 0.3 + Math.random() * 3;
        if ((this.likes.includes('Kristall') && (o === 3 || o === 7)) || (this.likes.includes('Gold') && o === 2) ||
          (this.likes.includes('Knochen') && o === 8)) s += 6;
        if (s > bestScore) { bestScore = s; best = { x, y, o, i }; }
      }
    }
    if (best && Math.random() < 0.88) {
      if (this.goTo('mine', best.x, best.y, { ore: best.o, claim: best.i }, map)) {
        g.claims.set(best.i, this.id);
        if (ORES[best.o].value >= 10 && Math.random() < 0.6) this.say({ icon: ORES[best.o].icon });
        return;
      }
    }
    if (this.sack.length && Math.random() < 0.35) { if (this.goDeposit()) return; }

    // 2) a little break or a chat with a neighbour
    if (Math.random() < 0.12) {
      this.state = 'idle';
      this.timer = 2 + Math.random() * 4;
      this.say(pick(['♪', 'Päuschen…', 'Hmm…', '♫', { icon: 'mushroom' }, 'Schön hier']));
      return;
    }
    if (Math.random() < 0.18) {
      const wm = dijkstra(w, this.cx, this.cy, { noDig: true, maxCost: 10 });
      const mates = g.dwarfs.filter((o) => o !== this && (o.state === 'idle' || o.state === 'cheer') && !o.move &&
        o.task?.kind !== 'deposit' && o.task?.kind !== 'flag' && costTo(wm, o.cx, o.cy) <= 10);
      if (mates.length) {
        const o = pick(mates);
        if (this.goTo('chat', o.cx, o.cy, { other: o.id }, wm)) return;
      }
    }

    // 3) stroll a bit (keeps the farm lively)
    if (Math.random() < 0.12) {
      const wm = dijkstra(w, this.cx, this.cy, { noDig: true, maxCost: 14 });
      const opts = [];
      for (let y = -1; y < H; y++) for (let x = 0; x < W; x++) {
        const c = costTo(wm, x, y);
        if (c > 3 && c < 14 && w.empty(x, y) && (y === -1 || w.solid(x, y + 1))) opts.push([x, y]);
      }
      if (opts.length) {
        const [x, y] = pick(opts);
        if (this.goTo('wander', x, y, {}, wm)) return;
      }
    }

    // 3) now and then carve out a cosy chamber along a gallery
    if (Math.random() < 0.1 && this.goChamber(map)) return;

    // 4) explore: bore a new winding gallery from somewhere in the burrow
    if (this.goBore()) return;
    // fallback: dig towards a random spot near the burrow
    const empties = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (w.empty(x, y) && isFinite(costTo(map, x, y))) empties.push([x, y]);
    }
    if (!empties.length) empties.push([this.cx, Math.max(0, this.cy)]);
    let target = null; bestScore = -Infinity;
    for (let k = 0; k < 16; k++) {
      const b = pick(empties);
      const [dx, dy] = randomDir();
      const len = 3 + Math.floor(Math.random() * 6);
      const tx = Math.max(0, Math.min(W - 1, b[0] + dx * len));
      const ty = Math.max(2, Math.min(H - 3, b[1] + dy * len));
      if (!w.solid(tx, ty) || !w.canDig(tx, ty, g.pickLevel)) continue;
      const c = costTo(map, tx, ty);
      if (!isFinite(c)) continue;
      const s = Math.random() * 2.5 + Math.min(w.smell(tx, ty, 3), 60) * 0.05 - w.emptyAround(tx, ty, 2) * 0.8 - c * 0.02;
      if (s > bestScore) { bestScore = s; target = [tx, ty]; }
    }
    if (target && this.goTo('explore', target[0], target[1], {}, map)) return;

    // nothing diggable – the pick is too weak for what's around.
    // Go up and chisel building stones for the traders instead.
    g.stuck(this);
    if (Math.random() < 0.5) this.say(pick(['Zu hart…', 'Bessere Hacke?', 'Hmpf.']));
    if (this.goTo('craft', STASH_X + 1 + Math.floor(Math.random() * 2), -1, { noDig: true })) return;
    this.state = 'idle';
    this.timer = 2 + Math.random() * 3;
  }

  // Plan a gallery like an ant would: mostly sideways, stepping down now and
  // then (a staircase), joining other tunnels instead of running alongside them.
  goBore() {
    const g = this.game, w = g.world;
    const wm = dijkstra(w, this.cx, this.cy, { noDig: true });
    const bases = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (w.empty(x, y) && isFinite(costTo(wm, x, y)) && (w.solid(x - 1, y) || w.solid(x + 1, y) || w.solid(x, y + 1))) bases.push([x, y]);
    }
    if (!bases.length) return false;
    const pDown = 0.18 + this.depthLove * 0.22;
    let best = null, bestScore = -Infinity;
    for (let k = 0; k < 18; k++) {
      let b = pick(bases);
      const b2 = pick(bases);
      if (Math.random() < this.depthLove && b2[1] > b[1]) b = b2;
      const shaft = Math.random() < 0.1;
      let dir = Math.random() < 0.5 ? 1 : -1;
      if (!shaft && w.empty(b[0] + dir, b[1])) dir = -dir;
      const len = shaft ? 3 + Math.floor(Math.random() * 3) : 5 + Math.floor(Math.random() * 9);
      const cells = [];
      const mayJoin = Math.random() < 0.3;
      let x = b[0], y = b[1], lastDown = shaft ? false : true;
      for (let i = 0; i < len; i++) {
        let nx = x, ny = y;
        if (shaft || (!lastDown && Math.random() < pDown)) ny = y + 1; else nx = x + dir;
        if (nx < 0 || nx >= W || ny < 1 || ny >= H - 2) {
          if (shaft || ny !== y) break;
          dir = -dir; continue; // bounce off the glass walls
        }
        if (w.empty(nx, ny)) break;
        if (!w.canDig(nx, ny, g.pickLevel)) {
          if (!shaft && ny === y && w.canDig(x, y + 1, g.pickLevel) && w.solid(x, y + 1) && !lastDown) { nx = x; ny = y + 1; } else break;
        }
        // keep a thick earth wall between galleries (ant farms aren't swiss cheese)
        if (i >= 2 && !mayJoin && this.crowded(nx, ny, x, y, cells)) break;
        cells.push({ x: nx, y: ny });
        lastDown = ny !== y;
        const px = x, py = y;
        x = nx; y = ny;
        // touching another tunnel? connect and stop
        let touch = false;
        for (const [ax, ay] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if ((ax !== px || ay !== py) && ay >= 0 && w.empty(ax, ay)) touch = true;
        }
        if (touch) break;
      }
      if (cells.length < (shaft ? 2 : 3)) continue;
      const end = cells[cells.length - 1];
      const s = Math.random() * 2 + this.depthLove * end.y * 0.035 + Math.min(w.smell(end.x, end.y, 3), 60) * 0.05 +
        cells.length * 0.12 - costTo(wm, b[0], b[1]) * 0.03;
      if (s > bestScore) { bestScore = s; best = { base: b, cells }; }
    }
    if (!best) return false;
    if (!this.goTo('explore', best.base[0], best.base[1], {}, wm)) return false;
    for (const c of best.cells) this.path.push(c);
    const end = best.cells[best.cells.length - 1];
    this.task.x = end.x;
    this.task.y = end.y;
    return true;
  }

  crowded(nx, ny, px, py, planned) {
    const w = this.game.world;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const ax = nx + dx, ay = ny + dy;
      if (ay < 0 || (ax === px && ay === py)) continue;
      if (Math.abs(ax - px) + Math.abs(ay - py) <= 1 && Math.abs(dx) + Math.abs(dy) >= 2) continue; // behind us
      if (w.empty(ax, ay) && !planned.some((c) => c.x === ax && c.y === ay)) return true;
    }
    return false;
  }

  goChamber(map) {
    const g = this.game, w = g.world;
    for (let k = 0; k < 12; k++) {
      const x = 1 + Math.floor(Math.random() * (W - 2));
      const y = 4 + Math.floor(Math.random() * (Math.min(H - 4, g.deepest + 2) - 4));
      if (!w.empty(x, y) || !w.solid(x, y + 1) || !isFinite(costTo(map, x, y))) continue;
      const cells = [[x + 1, y], [x + 1, y - 1], [x, y - 1], [x - 1, y - 1], [x - 1, y]];
      const solid = cells.filter(([cx, cy]) => w.solid(cx, cy));
      if (solid.length < 4 || cells.some(([cx, cy]) => w.solid(cx, cy) && !w.canDig(cx, cy, g.pickLevel))) continue;
      if (cells.some(([cx, cy]) => w.oreAt(cx, cy))) continue;
      if (w.emptyAround(x, y, 2) > 9) continue;
      if (!this.goTo('explore', x, y, {}, map)) continue;
      for (const [cx, cy] of cells) this.path.push({ x: cx, y: cy });
      this.task.x = x - 1;
      this.task.y = y;
      return true;
    }
    return false;
  }

  goDeposit() {
    return this.goTo('deposit', STASH_X, -1, { noDig: true });
  }

  goFeast() {
    const seat = this.game.feastSeat(this);
    return this.goTo('feast', seat, -1, { noDig: true });
  }

  goRest(urgent) {
    const g = this.game;
    if (this.cy < 30 || (!urgent && this.cy < 45)) {
      if (this.goTo('home', COTTAGE_X, -1, { noDig: true })) { this.say(pick(['Feierabend!', 'Gähn…', 'Ab ins Bett'])); return; }
    }
    // sleep where we are – but on solid ground, not on a ladder
    if (g.world.solid(this.cx, this.cy + 1)) { this.finish({ kind: 'sleep' }); return; }
    const wm = dijkstra(g.world, this.cx, this.cy, { noDig: true, maxCost: 30 });
    let best = null, bc = Infinity;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = costTo(wm, x, y);
      if (c < bc && g.world.empty(x, y) && g.world.solid(x, y + 1)) { bc = c; best = [x, y]; }
    }
    if (best && this.goTo('sleep', best[0], best[1], {}, wm)) return;
    this.finish({ kind: 'sleep' });
  }

  finish(t) {
    const g = this.game;
    switch (t.kind) {
      case 'mine': g.unclaim(t); break;
      case 'flag': g.flagReached(t.flag, this); break;
      case 'deposit': g.deposit(this); break;
      case 'home':
        this.state = 'home';
        this.timer = g.isNight() ? g.timeUntilMorning() + Math.random() * 8 : 16 + Math.random() * 12;
        break;
      case 'sleep':
        this.state = 'sleep';
        this.timer = 6;
        this.say('Zzz', 3);
        break;
      case 'feast':
        if (g.feast) {
          this.state = 'feast';
          this.facing = this.cx < g.feastCenter() ? 1 : -1;
          this.say(pick(['Prost!', 'Hurra!', { icon: 'beer' }]));
        }
        break;
      case 'craft':
        this.state = 'craft';
        this.timer = 16 + Math.random() * 10;
        this.swingT = 0;
        this.craftN = 0;
        this.say(pick(['Steine klopfen!', 'Für die Händler!', 'Tock!']));
        break;
      case 'chat': {
        const o = g.dwarfs.find((d) => d.id === t.other);
        if (o && Math.abs(o.cx - this.cx) + Math.abs(o.cy - this.cy) <= 1 && ['idle', 'cheer'].includes(o.state) && !o.move && !g.feast) {
          o.interrupt();
          for (const [a, b] of [[this, o], [o, this]]) {
            a.state = 'chat';
            a.timer = 4.5 + Math.random() * 2;
            a.chatWith = b.id;
            a.chatT = a === this ? 0 : 1.3;
            a.facing = b.x > a.x ? 1 : b.x < a.x ? -1 : a.facing;
          }
        }
        break;
      }
      case 'wander':
        this.timer = 0.8 + Math.random() * 2;
        if (Math.random() < 0.4) this.say(pick(['♪', '♫', 'Hmm…', 'Schön hier', { icon: 'gold' }]));
        break;
      default:
        this.timer = 0.2 + Math.random() * 0.8;
    }
  }

  think(dt) {
    if ((this.thinkT -= dt) > 0 || this.bubble) return;
    this.thinkT = 9 + Math.random() * 16;
    if (this.state === 'home' || this.state === 'feast') return;
    if (this.state === 'sleep') { this.say('Zzz', 3); this.thinkT = 4; return; }
    let pool;
    if (this.state === 'dig') pool = ['Hau ruck!', 'Tock, tock', 'Puh…', '♪', 'Hepp!'];
    else if (this.sack.length) pool = [{ icon: ORES[this.sack[this.sack.length - 1]].icon }, 'Schwer!', '♪'];
    else if (this.energy < 30) pool = ['Gähn…', 'Müde…'];
    else if (this.cy > 82) pool = ['So warm hier…', 'Es glüht!', '♪'];
    else if (this.cy > 55) pool = ['Dunkel hier…', 'Echo!', '♫'];
    else pool = ['♪', '♫', 'Hmm…', { icon: 'beer' }, { icon: 'gold' }, 'Hihi', 'Gold!', '❤'];
    this.say(pick(pool));
  }
}
