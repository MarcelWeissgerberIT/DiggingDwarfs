// Colony state: dwarfs, treasure, commands, day/night, saving.
import {
  W, mat, band, valueMult, pickInfo, ORES, ORE_HEART, DINOS, DAY_LENGTH, NIGHT_START, HORN_MAX, HORN_REGEN,
  ENTRANCE_X, STASH_X, FEAST_X, MAX_DWARFS, NAMES, VILLAGE, VARIANTS,
} from './config.js';
import { World, F_LAMP } from './world.js';
import { Dwarf } from './dwarf.js';
import { dijkstra, costTo } from './path.js';

const SAVE_KEY = 'digging-dwarfs-save-v2';

export class Game {
  constructor(hooks = {}) {
    // hooks: event(msg, icon, big), strike, hammer, dug, deposit, craft, sfx, cheer, heart, dino
    this.hooks = hooks;
  }

  newGame(seed = (Math.random() * 1e9) | 0) {
    this.world = new World();
    this.world.generate(seed);
    this.dwarfs = [];
    this.gold = 0;
    this.totalGold = 0;
    this.pickLevel = 1;
    this.horns = HORN_MAX;
    this.time = DAY_LENGTH * 0.08;
    this.day = 1;
    this.flags = [];
    this.feast = null;
    this.buffT = 0;
    this.collection = {};
    this.claims = new Map();
    this.stuckT = 0;
    this.stuck = false;
    this.heartFound = false;
    this.deepest = 4;
    this.deepestBand = 0;
    this.feastsHeld = 0;
    this.village = { cottage: 0 }; // building id -> game time it was built
    const used = new Set();
    for (let i = 0; i < 3; i++) {
      const d = new Dwarf(this, { name: this.freshName(used), variant: [0, 4, 3][i], cx: ENTRANCE_X - 1 + i * 2, cy: -1 });
      d.facing = 1;
      this.dwarfs.push(d);
    }
  }

  freshName(used = new Set(this.dwarfs?.map((d) => d.name))) {
    const free = NAMES.filter((n) => !used.has(n));
    const n = free.length ? free[Math.floor(Math.random() * free.length)] : NAMES[Math.floor(Math.random() * NAMES.length)];
    used.add(n);
    return n;
  }

  // ---------- time ----------
  get phase() { return (this.time % DAY_LENGTH) / DAY_LENGTH; }
  isNight() { return this.phase >= NIGHT_START || this.phase < 0.02; }
  timeUntilMorning() {
    const p = this.phase;
    const target = p >= NIGHT_START ? 1.04 : 0.04;
    return Math.max(4, (target - p) * DAY_LENGTH);
  }

  digSpeed(d) {
    return (1 + 0.3 * (this.pickLevel - 1)) * (1 + 0.06 * (d.level - 1)) *
      (this.buffT > 0 ? 1.5 : 1) * (d.energy < 25 ? 0.7 : 1);
  }

  levelUp(d) {
    d.say({ icon: 'star' });
    this.event(`${d.name} ★${d.level}`, 'star');
    this.hooks.cheer?.(d);
  }

  // ---------- village & rooms ----------
  villageWants(b) {
    switch (b.id) {
      case 'house1': return this.dwarfs.length >= 5;
      case 'house2': return this.dwarfs.length >= 7;
      case 'house3': return this.dwarfs.length >= 10;
      case 'forge': return this.pickLevel >= 2;
      case 'museum': return (this.collection.dino || 0) >= 1;
      case 'tavern': return this.feastsHeld >= 1;
      default: return true;
    }
  }

  checkVillage() {
    for (const b of VILLAGE) {
      if (this.village[b.id] !== undefined || !this.villageWants(b)) continue;
      this.village[b.id] = this.time;
      this.event(b.name, b.kind === 'museum' ? 'bone' : b.kind === 'forge' ? 'hammer' : b.kind === 'tavern' ? 'beer' : 'dwarf', true);
      this.hooks.built?.(b);
    }
  }

  homes() {
    return VILLAGE.filter((b) => b.door !== undefined && this.village[b.id] !== undefined).map((b) => ({ col: b.door, z: b.z1 }));
  }

  nearestHome(x) {
    let best = null, bd = Infinity;
    for (const h of this.homes()) {
      const d = Math.abs(h.col + 0.5 - x);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  addRoom(r) {
    const w = this.world;
    if (w.rooms.some((o) => Math.abs(o.x - r.x) <= 2 && Math.abs(o.y - r.y) <= 1)) return;
    for (let dx = -1; dx <= 1; dx++) if (!w.empty(r.x + dx, r.y) || !w.empty(r.x + dx, r.y - 1)) return;
    const beds = w.rooms.filter((o) => o.type === 'bed').length;
    const type = beds < Math.ceil(this.dwarfs.length / 2) ? 'bed' : w.rooms.length % 4 === 3 ? 'shrine' : 'store';
    w.rooms.push({ x: r.x, y: r.y, type, taken: null });
  }

  freeBed(map, d) {
    let best = null, bc = Infinity;
    for (const r of this.world.rooms) {
      if (r.type !== 'bed' || (r.taken && r.taken !== d.id)) continue;
      const c = costTo(map, r.x, r.y);
      if (c < bc) { bc = c; best = r; }
    }
    return best;
  }

  update(dt) {
    const wasNight = this.isNight();
    this.time += dt;
    if (wasNight && !this.isNight()) this.day++;
    if (this.horns < HORN_MAX) this.horns = Math.min(HORN_MAX, this.horns + dt / HORN_REGEN);
    if (this.buffT > 0) this.buffT -= dt;
    if (this.stuckT > 0) this.stuckT -= dt; else this.stuck = false;
    if (this.feast) this.updateFeast(dt);
    for (const d of this.dwarfs) d.update(dt);
    this.villageT = (this.villageT || 0) - dt;
    if (this.villageT <= 0) { this.villageT = 1; this.checkVillage(); }
  }

  // ---------- world interaction ----------
  digCell(d, x, y) {
    const w = this.world;
    const { ore, mat: m, caves, dino } = w.dig(x, y);
    const b = m - 1;
    if (y > this.deepest) this.deepest = y;
    if (b > this.deepestBand) {
      this.deepestBand = b;
      this.event(band(b).name, 'layers', true);
    }
    this.hooks.dug?.(d, x, y, m, ore);
    if (caves > 0) {
      this.event('Höhle!', 'mushroom');
      d.say({ icon: 'mushroom' });
      this.hooks.sfx?.('discover', x, y);
    }
    if (dino) this.foundDino(d, dino);
    if (ore) {
      const o = ORES[ore];
      const value = Math.round(o.value * valueMult(b));
      d.sack.push([ore, value]);
      d.finds++;
      if (!d.best || ORES[d.best].value < o.value) d.best = ore;
      this.hooks.sfx?.(o.value >= 10 ? 'gem' : 'ore', x, y);
      if (ore === ORE_HEART) {
        this.heartFound = true;
        this.event('Herz des Berges!', 'diamond', true);
        this.hooks.heart?.(d);
        this.cheerAround(d, 99);
      } else if (o.value >= 18) {
        this.event(`${d.name}: ${o.name}`, o.icon, true);
        this.cheerAround(d, 6);
      }
      d.say({ icon: o.icon });
      if (d.task?.kind === 'mine' && d.task.x === x && d.task.y === y) d.path = [];
    }
    // the colony hangs up lanterns every few cells
    if (y > 1 && !this.lampNear(x, y, 4) && Math.random() < 0.4) {
      w.flags[w.idx(x, y)] |= F_LAMP;
    }
  }

  foundDino(d, dino) {
    const bonus = Math.round(60 * valueMult(this.world.bandAt(dino.x, dino.y)) * (1 + dino.h * 0.3));
    this.gold += bonus;
    this.totalGold += bonus;
    this.collection.dino = (this.collection.dino || 0) + 1;
    this.event(`${DINOS[dino.kind].name}! +${bonus}`, 'bone', true);
    this.hooks.dino?.(d, dino, bonus);
    this.cheerAround(d, 8);
  }

  lampNear(x, y, r) {
    const w = this.world;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (w.flag(x + dx, y + dy, F_LAMP)) return true;
    }
    return false;
  }

  cheerAround(d, r) {
    d.state = 'cheer';
    d.timer = 1.6;
    this.hooks.cheer?.(d);
    for (const o of this.dwarfs) {
      if (o === d || !['idle', 'walk', 'chat', 'cheer'].includes(o.state) || o.move) continue;
      if (Math.abs(o.cx - d.cx) + Math.abs(o.cy - d.cy) <= r) {
        o.state = 'cheer';
        o.timer = 1.2;
        o.say(Math.random() < 0.5 ? { icon: 'star' } : { icon: 'heart' });
      }
    }
  }

  deposit(d) {
    if (!d.sack.length) return;
    let sum = 0;
    for (const [o, v] of d.sack) {
      sum += v;
      this.collection[o] = (this.collection[o] || 0) + 1;
    }
    d.sack = [];
    this.gold += sum;
    this.totalGold += sum;
    this.hooks.deposit?.(d, sum);
    this.hooks.sfx?.('coin', STASH_X, -1);
    d.state = 'cheer';
    d.timer = 0.9;
  }

  craftGold(d) {
    this.gold += 1;
    this.totalGold += 1;
    this.hooks.craft?.(d);
  }

  unclaim(task) {
    if (task?.claim !== undefined && this.claims.get(task.claim) !== undefined) this.claims.delete(task.claim);
  }

  stuckNow() {
    this.stuck = true;
    this.stuckT = 60;
  }

  // ---------- commands ----------
  placeFlag(x, y) {
    const w = this.world;
    if (y < 0 || y >= w.H || x < 0 || x >= W) return { ok: false, msg: 'Nicht hier' };
    if (this.horns < 1) return { ok: false, msg: 'Kein Befehl übrig' };
    if (this.flags.length >= 3) return { ok: false, msg: 'Max. 3 Flaggen' };
    if (this.flags.some((f) => f.x === x && f.y === y)) return { ok: false, msg: 'Schon markiert' };
    if (w.solid(x, y) && !w.canDig(x, y, this.pickLevel)) {
      return { ok: false, msg: w.flag(x, y, 64) ? 'Dino bleibt heil!' : `${mat(w.get(x, y)).name}: zu hart` };
    }
    const flag = { x, y, id: Math.random(), dwarf: null };
    let best = null, bc = Infinity;
    for (const d of this.dwarfs) {
      if (d.state === 'home' || d.task?.kind === 'flag') continue;
      const m = dijkstra(w, d.cx, d.cy, { pick: this.pickLevel, seed: 3 });
      const c = costTo(m, x, y) + (d.state === 'sleep' ? 40 : 0);
      if (c < bc) { bc = c; best = d; }
    }
    if (!best || !isFinite(bc)) return { ok: false, msg: 'Unerreichbar' };
    this.horns -= 1;
    flag.dwarf = best.id;
    this.flags.push(flag);
    best.interrupt();
    this.hooks.sfx?.('horn');
    return { ok: true };
  }

  flagFor(d) {
    let f = this.flags.find((fl) => fl.dwarf === d.id);
    if (!f) {
      f = this.flags.find((fl) => fl.dwarf === null || !this.dwarfs.some((o) => o.id === fl.dwarf));
      if (f) f.dwarf = d.id;
    }
    return f;
  }

  dropFlag(flag) {
    this.flags = this.flags.filter((f) => f !== flag);
  }

  flagReached(flag, d) {
    if (!this.flags.includes(flag)) return;
    this.flags = this.flags.filter((f) => f !== flag);
    d.say({ icon: 'star' });
    d.state = 'cheer';
    d.timer = 1;
  }

  startFeast() {
    if (this.feast) return { ok: false, msg: 'Läuft schon' };
    if (this.horns < 1) return { ok: false, msg: 'Kein Befehl übrig' };
    this.horns -= 1;
    this.feast = { t: 0, served: 0 };
    for (const d of this.dwarfs) d.interrupt();
    this.hooks.sfx?.('horn');
    return { ok: true };
  }

  feastSeat(d) {
    const idx = this.dwarfs.indexOf(d);
    return FEAST_X + (idx % 4);
  }
  feastCenter() { return FEAST_X + 1.5; }

  updateFeast(dt) {
    const f = this.feast;
    f.t += dt;
    const seated = this.dwarfs.filter((d) => d.state === 'feast').length;
    if (seated > 0) f.served += dt;
    if (f.served > 22 || f.t > 100) {
      this.feast = null;
      this.feastsHeld++;
      this.buffT = 120;
      for (const d of this.dwarfs) d.energy = 100;
      this.hooks.sfx?.('cheer');
    }
  }

  recruitCost() { return Math.round(30 * Math.pow(1.75, this.dwarfs.length - 3)); }

  recruit() {
    if (this.dwarfs.length >= MAX_DWARFS) return { ok: false, msg: 'Farm ist voll' };
    const c = this.recruitCost();
    if (this.gold < c) return { ok: false, msg: 'Zu wenig Gold' };
    this.gold -= c;
    const taken = this.dwarfs.map((o) => o.variant);
    const fresh = [...Array(VARIANTS).keys()].filter((v) => !taken.includes(v));
    const variant = fresh.length ? fresh[Math.floor(Math.random() * fresh.length)] : Math.floor(Math.random() * VARIANTS);
    const d = new Dwarf(this, { name: this.freshName(), variant, cx: 0, cy: -1, joined: this.day });
    d.say({ icon: 'heart' });
    this.dwarfs.push(d);
    this.hooks.sfx?.('cheer');
    this.event(d.name, 'dwarf');
    return { ok: true };
  }

  upgradePick() {
    const p = pickInfo(this.pickLevel + 1);
    if (this.gold < p.cost) return { ok: false, msg: 'Zu wenig Gold' };
    this.gold -= p.cost;
    this.pickLevel++;
    this.stuckT = 0;
    this.stuck = false;
    this.hooks.sfx?.('upgrade');
    this.event(p.name, 'pick', true);
    return { ok: true };
  }

  event(msg, icon, big = false) {
    this.hooks.event?.(msg, icon, big);
  }

  // ---------- persistence ----------
  serialize() {
    return {
      v: 2,
      saved: Date.now(),
      world: this.world.serialize(),
      dwarfs: this.dwarfs.map((d) => d.serialize()),
      gold: this.gold, totalGold: this.totalGold, pickLevel: this.pickLevel, horns: this.horns,
      time: this.time, day: this.day, buffT: this.buffT, collection: this.collection,
      heartFound: this.heartFound, deepest: this.deepest, deepestBand: this.deepestBand,
      feastsHeld: this.feastsHeld, village: this.village,
      flags: this.flags.map((f) => ({ x: f.x, y: f.y })),
    };
  }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize())); } catch (e) { /* storage full or blocked */ }
  }

  static hasSave() {
    try {
      localStorage.removeItem('digging-dwarfs-save-v1'); // the old, finite farm can't be continued
      return !!localStorage.getItem(SAVE_KEY);
    } catch (e) { return false; }
  }

  static clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }

  load() {
    let o;
    try { o = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return false; }
    if (!o || o.v !== 2) return false;
    this.world = World.deserialize(o.world);
    this.gold = o.gold; this.totalGold = o.totalGold; this.pickLevel = o.pickLevel; this.horns = o.horns;
    this.time = o.time; this.day = o.day; this.buffT = o.buffT || 0; this.collection = o.collection || {};
    this.heartFound = !!o.heartFound; this.deepest = o.deepest || 4; this.deepestBand = o.deepestBand || 0;
    this.feastsHeld = o.feastsHeld || 0;
    this.village = o.village || { cottage: 0 };
    this.flags = (o.flags || []).map((f) => ({ ...f, id: Math.random(), dwarf: null }));
    this.feast = null;
    this.claims = new Map();
    this.stuckT = 0;
    this.stuck = false;
    this.dwarfs = o.dwarfs.map((d) => new Dwarf(this, d));
    this.savedAt = o.saved;
    return true;
  }
}
