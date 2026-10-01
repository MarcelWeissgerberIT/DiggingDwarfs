// A single dwarf with a tiny ant-like brain.
import {
  W, mat, ORES, SACK_SIZE, STASH_X, NAMES, LIKES, VARIANTS,
} from './config.js';
import { dijkstra, pathTo, costTo } from './path.js';
import { F_REV, F_LADDER } from './world.js';

const WALK = 2.3;
const CLIMB = 1.6;
const SWING = 0.55;
let nextId = 1;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// speech bubbles are pictures, not words
const CHAT = [
  { icon: 'gold' }, { icon: 'diamond' }, { icon: 'beer' }, { icon: 'heart' }, { icon: 'note' }, { icon: 'question' },
  { icon: 'bang' }, { icon: 'star' }, { icon: 'mushroom' }, { icon: 'amethyst' }, '♪', '?', '!',
];
const BUILD_TIME = { ladder: 1.3, bridge: 1.8 };

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
    this.variant = o.variant ?? Math.floor(Math.random() * VARIANTS);
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
    this.build = null;
    this.door = o.door ?? null;   // house door this dwarf sleeps behind: { col, z }
    this.doorP = this.state === 'home' ? 1 : 0;
    this.bed = null;
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
    const home = this.state === 'home';
    return {
      id, name, variant, cx, cy, facing, sack, energy: Math.round(energy), dug, finds, best, likes, depthLove, joined,
      state: home ? 'home' : 'idle', timer: home ? this.timer : 0, door: home ? this.door : null,
    };
  }

  // experience: digging makes a dwarf better at it
  get level() { return 1 + Math.floor(Math.sqrt(this.dug / 10)); }

  // sack items are [oreId, value]
  sackValue() { return this.sack.reduce((s, it) => s + it[1], 0); }

  say(content, dur = 2.4) {
    this.bubble = typeof content === 'string' ? { text: content, t: dur, max: dur } : { icon: content.icon, t: dur, max: dur };
  }

  // [icon, two-word label] for the info card
  activity() {
    const t = this.task?.kind;
    switch (this.state) {
      case 'home': case 'enter': return ['moon', 'schläft'];
      case 'exit': return ['sun', 'wach'];
      case 'sleep': return ['zzz', 'döst'];
      case 'feast': return ['beer', 'feiert'];
      case 'cheer': return ['star', 'jubelt'];
      case 'craft': return ['hammer', 'klopft Steine'];
      case 'chat': return ['heart', 'plaudert'];
      case 'build': return ['hammer', this.build?.kind === 'bridge' ? 'baut Brücke' : 'baut Leiter'];
      case 'dig': return [t === 'mine' ? ORES[this.task.ore]?.icon ?? 'pick' : t === 'flag' ? 'flag' : 'pick', 'gräbt'];
      default: break;
    }
    switch (t) {
      case 'mine': return [ORES[this.task.ore]?.icon ?? 'pick', 'unterwegs'];
      case 'flag': return ['flag', 'unterwegs'];
      case 'deposit': return ['cart', 'trägt Schätze'];
      case 'home': return ['moon', 'geht heim'];
      case 'sleep': return ['zzz', 'müde'];
      case 'feast': return ['beer', 'zum Fest'];
      case 'wander': return ['note', 'bummelt'];
      case 'craft': return ['hammer', 'geht klopfen'];
      case 'chat': return ['heart', 'sucht Gesellschaft'];
      case 'explore': return ['pick', 'erkundet'];
      default: return ['question', 'überlegt'];
    }
  }

  update(dt) {
    this.anim += dt;
    if (this.bubble && (this.bubble.t -= dt) <= 0) this.bubble = null;
    if (this.energy < 0) this.energy = 0;
    this.think(dt);
    switch (this.state) {
      case 'enter': {
        // walk from the path back to the house door, then vanish inside
        const len = Math.max(0.3, Math.abs(this.door.z - 0.25));
        this.doorP = Math.min(1, this.doorP + (dt * 1.4) / len);
        if (this.doorP >= 1) this.state = 'home';
        return;
      }
      case 'home':
        this.alpha = Math.max(0, this.alpha - dt * 4);
        this.energy = Math.min(100, this.energy + dt * 6);
        if ((this.timer -= dt) <= 0) {
          this.state = 'exit';
          this.alpha = 1;
        }
        return;
      case 'exit': {
        const len = Math.max(0.3, Math.abs((this.door?.z ?? 0) - 0.25));
        this.doorP = Math.max(0, this.doorP - (dt * 1.4) / len);
        if (this.doorP <= 0) {
          this.state = 'idle';
          this.timer = 0.3;
          this.door = null;
          this.say(pick([{ icon: 'sun' }, '♪']));
        }
        return;
      }
      case 'sleep':
        this.energy = Math.min(100, this.energy + dt * (this.bed ? 6 : 4.5));
        if ((this.timer -= dt) <= 0 && this.energy >= 100) {
          if (this.bed) this.bed.taken = null;
          this.bed = null;
          this.state = 'idle';
          this.timer = 0.5;
          this.say({ icon: 'sun' });
        }
        return;
      case 'cheer':
        if ((this.timer -= dt) <= 0) { this.state = 'idle'; this.timer = 0; }
        return;
      case 'build':
        this.swingT += dt;
        if (this.swingT >= SWING) {
          this.swingT -= SWING;
          this.game.hooks.hammer?.(this);
        }
        if ((this.timer -= dt) <= 0) {
          const b = this.build;
          const w = this.game.world;
          if (b.kind === 'bridge') w.setBridge(b.x, b.y); else for (const [x, y] of b.cells) w.setLadder(x, y);
          this.build = null;
          this.state = 'idle';
          this.timer = 0;
        }
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
    // cells we only had to dig out (chamber ceilings) are not entered
    if (n.digOnly) { this.path.shift(); this.state = 'idle'; this.timer = 0.15; return; }
    // climbing needs a ladder, crossing a hole needs a plank: build them first
    if (n.y !== this.cy) {
      if (!w.ladder(this.cx, this.cy) || !w.ladder(n.x, n.y)) {
        this.startBuild('ladder', n, [[this.cx, this.cy], [n.x, n.y]], this.cy);
        return;
      }
    } else if (!w.supported(n.x, n.y)) {
      const after = this.path[1];
      const goesVertical = after && !after.digOnly && after.x === n.x && after.y !== n.y;
      if (n.y < 0) {
        // a hole in the meadow: the shaft ladder doubles as a step
        this.startBuild('ladder', n, [[n.x, 0]], 0);
        return;
      }
      if (goesVertical) {
        if (!w.ladder(n.x, n.y)) {
          const cells = [[n.x, n.y]];
          if (w.empty(after.x, after.y)) cells.push([after.x, after.y]);
          this.startBuild('ladder', n, cells, cells.length > 1 ? after.y : n.y);
          return;
        }
      } else {
        this.startBuild('bridge', n, null, n.y);
        return;
      }
    }
    this.path.shift();
    this.move = n;
    this.state = 'walk';
  }

  startBuild(kind, n, cells, fy) {
    this.state = 'build';
    this.build = { kind, x: n.x, y: n.y, fy, cells, total: BUILD_TIME[kind] };
    this.timer = BUILD_TIME[kind];
    this.swingT = 0;
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
    this.digProg += (dt * g.digSpeed(this)) / mat(m).time;
    this.energy -= dt * 0.38;
    if (this.digProg >= 1) {
      const lvl = this.level;
      this.dug++;
      g.digCell(this, n.x, n.y);
      if (this.level > lvl) g.levelUp(this);
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
    if (this.state === 'enter') { this.state = 'exit'; this.alpha = 1; return; }
    if (this.state === 'exit') return;
    if (this.bed) this.bed.taken = null;
    this.bed = null;
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
      if (this.goTo('flag', flag.x, flag.y, { flag })) { this.say({ icon: 'flag' }); return; }
      g.dropFlag(flag, true);
    }
    const map = dijkstra(w, this.cx, this.cy, { pick: g.pickLevel, seed: (Math.random() * 1e9) | 0 });

    // 1) known treasure nearby?
    let best = null, bestScore = -Infinity;
    const ya = 0, yb = Math.min(w.H, g.deepest + 12);
    for (let y = ya; y < yb; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const o = w.ore[i];
        if (!o || !(w.flags[i] & F_REV) || g.claims.has(i)) continue;
        if (!w.canDig(x, y, g.pickLevel)) continue;
        const c = costTo(map, x, y);
        if (!isFinite(c) || c > 160) continue;
        let s = 12 + ORES[o].value * 0.5 - c * 0.3 + Math.random() * 3;
        if ((this.likes === 'kristall' && (o === 3 || o === 7)) || (this.likes === 'gold' && o === 2) ||
          (this.likes === 'knochen' && o === 8)) s += 6;
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
    if (Math.random() < 0.16) {
      this.state = 'idle';
      this.timer = 2 + Math.random() * 4;
      if (Math.random() < 0.5) this.say(pick(['♪', '♫', { icon: 'note' }, { icon: 'heart' }]));
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
      for (let y = Math.max(-1, this.cy - 15); y < Math.min(w.H, this.cy + 15); y++) for (let x = 0; x < W; x++) {
        const c = costTo(wm, x, y);
        if (c > 3 && c < 14 && w.empty(x, y) && (y === -1 || w.solid(x, y + 1))) opts.push([x, y]);
      }
      if (opts.length) {
        const [x, y] = pick(opts);
        if (this.goTo('wander', x, y, {}, wm)) return;
      }
    }

    // 3) now and then carve out a cosy chamber along a gallery
    if (Math.random() < (w.rooms.length < g.dwarfs.length ? 0.22 : 0.06) && this.goChamber(map)) return;

    // 4) explore: bore a new winding gallery from somewhere in the burrow
    if (this.goBore()) return;
    // fallback: dig towards a random spot near the burrow
    const empties = [];
    for (let y = ya; y < yb; y++) for (let x = 0; x < W; x++) {
      if (w.empty(x, y) && isFinite(costTo(map, x, y))) empties.push([x, y]);
    }
    if (!empties.length) empties.push([this.cx, Math.max(0, this.cy)]);
    let target = null; bestScore = -Infinity;
    for (let k = 0; k < 16; k++) {
      const b = pick(empties);
      const [dx, dy] = randomDir();
      const len = 3 + Math.floor(Math.random() * 6);
      const tx = Math.max(0, Math.min(W - 1, b[0] + dx * len));
      const ty = Math.max(2, Math.min(w.H - 3, b[1] + dy * len));
      if (!w.solid(tx, ty) || !w.canDig(tx, ty, g.pickLevel)) continue;
      const c = costTo(map, tx, ty);
      if (!isFinite(c)) continue;
      const s = Math.random() * 2.5 + Math.min(w.smell(tx, ty, 3), 60) * 0.05 - w.emptyAround(tx, ty, 2) * 0.8 - c * 0.02;
      if (s > bestScore) { bestScore = s; target = [tx, ty]; }
    }
    if (target && this.goTo('explore', target[0], target[1], {}, map)) return;

    // nothing diggable – the pick is too weak for what's around.
    // Go up and chisel building stones for the traders instead.
    g.stuckNow();
    if (Math.random() < 0.5) this.say('?');
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
    const ya = 0, yb = Math.min(w.H, g.deepest + 12);
    for (let y = ya; y < yb; y++) for (let x = 0; x < W; x++) {
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
        if (nx < 0 || nx >= W || ny < 1 || ny >= w.H - 2) {
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

  // a cosy 3x2 hall: the dwarf widens a gallery and digs the ceiling from below
  goChamber(map) {
    const g = this.game, w = g.world;
    const yb = Math.min(w.H - 4, g.deepest + 2);
    const spots = [];
    for (let y = 4; y < yb; y++) for (let x = 1; x < W - 1; x++) {
      if (!w.empty(x, y) || !isFinite(costTo(map, x, y))) continue;
      if (![x - 1, x, x + 1].every((cx) => w.solid(cx, y + 1) && w.solid(cx, y - 1) && w.solid(cx, y - 2))) continue;
      spots.push([x, y]);
    }
    for (let k = 0; k < 14 && spots.length; k++) {
      const [x, y] = spots.splice(Math.floor(Math.random() * spots.length), 1)[0];
      if (w.rooms.some((o) => Math.abs(o.x - x) <= 4 && Math.abs(o.y - y) <= 3)) continue;
      const cells = [[x + 1, y], [x + 1, y - 1], [x, y - 1], [x - 1, y - 1], [x - 1, y]];
      if (cells.some(([cx, cy]) => w.solid(cx, cy) && !w.canDig(cx, cy, g.pickLevel))) continue;
      if (cells.some(([cx, cy]) => w.oreAt(cx, cy) || w.flag(cx, cy, F_LADDER))) continue;
      if (w.emptyAround(x, y, 2) > 9) continue;
      if (!this.goTo('explore', x, y, {}, map)) continue;
      this.path.push(
        { x: x + 1, y }, { x: x + 1, y: y - 1, digOnly: true },
        { x, y }, { x, y: y - 1, digOnly: true },
        { x: x - 1, y }, { x: x - 1, y: y - 1, digOnly: true },
      );
      this.task.x = x - 1;
      this.task.y = y;
      this.task.room = { x, y };
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
      const door = g.nearestHome(this.x);
      if (door && this.goTo('home', door.col, -1, { noDig: true, door })) { this.say({ icon: 'moon' }); return; }
    }
    const wm = dijkstra(g.world, this.cx, this.cy, { noDig: true, maxCost: 45 });
    // a free bed in a bedroom nearby?
    const room = g.freeBed(wm, this);
    if (room && this.goTo('sleep', room.x, room.y, { bed: room }, wm)) { room.taken = this.id; this.say({ icon: 'zzz' }); return; }
    // otherwise sleep where we are – but on solid ground, not on a ladder
    if (g.world.supported(this.cx, this.cy)) { this.finish({ kind: 'sleep' }); return; }
    let best = null, bc = Infinity;
    for (let y = Math.max(0, this.cy - 20); y < Math.min(g.world.H, this.cy + 20); y++) for (let x = 0; x < W; x++) {
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
        this.state = 'enter';
        this.door = t.door || { col: this.cx, z: 0.25 };
        this.doorP = 0;
        this.timer = g.isNight() ? g.timeUntilMorning() + Math.random() * 8 : 16 + Math.random() * 12;
        break;
      case 'sleep':
        this.state = 'sleep';
        this.timer = 6;
        this.bed = t.bed || null;
        if (t.bed) t.bed.taken = this.id;
        this.say({ icon: 'zzz' }, 3);
        break;
      case 'feast':
        if (g.feast) {
          this.state = 'feast';
          this.facing = this.cx < g.feastCenter() ? 1 : -1;
          this.say({ icon: 'beer' });
        }
        break;
      case 'craft':
        this.state = 'craft';
        this.timer = 16 + Math.random() * 10;
        this.swingT = 0;
        this.craftN = 0;
        this.say({ icon: 'hammer' });
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
        if (Math.random() < 0.3) this.say(pick(['♪', '♫', { icon: 'gold' }]));
        break;
      default:
        if (t.room) g.addRoom(t.room);
        this.timer = 0.2 + Math.random() * 0.8;
    }
  }

  think(dt) {
    if ((this.thinkT -= dt) > 0 || this.bubble) return;
    this.thinkT = 16 + Math.random() * 22;
    if (this.state === 'home' || this.state === 'feast' || this.state === 'build') return;
    if (this.state === 'sleep') { this.say({ icon: 'zzz' }, 3); this.thinkT = 5; return; }
    let pool;
    if (this.state === 'dig') pool = ['♪', '!'];
    else if (this.sack.length) pool = [{ icon: ORES[this.sack[this.sack.length - 1][0]].icon }];
    else if (this.energy < 30) pool = [{ icon: 'zzz' }];
    else pool = ['♪', '♫', { icon: 'beer' }, { icon: 'gold' }, { icon: 'heart' }, { icon: 'diamond' }];
    this.say(pick(pool));
  }

}
