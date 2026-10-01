// Colony state: dwarfs, treasure, commands, day/night, saving.
import {
  W, H, MATS, ORES, ORE_HEART, PICKS, DAY_LENGTH, NIGHT_START, HORN_MAX, HORN_REGEN,
  ENTRANCE_X, STASH_X, FEAST_X, MAX_DWARFS, NAMES,
} from './config.js';
import { World, F_LAMP } from './world.js';
import { Dwarf } from './dwarf.js';
import { dijkstra, costTo } from './path.js';

const SAVE_KEY = 'digging-dwarfs-save-v1';

export class Game {
  constructor(hooks = {}) {
    this.hooks = hooks; // { event(msg), strike(d,x,y,m), dug(d,x,y,m,ore), deposit(d,gold), sfx(name), cheer(d) }
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
    this.log = [];
    this.claims = new Map();
    this.stuckT = 0;
    this.heartFound = false;
    this.deepest = 4;
    const used = new Set();
    for (let i = 0; i < 3; i++) {
      const d = new Dwarf(this, { name: this.freshName(used), variant: i, cx: ENTRANCE_X - 1 + i * 2, cy: -1 });
      d.facing = 1;
      this.dwarfs.push(d);
    }
    this.chronicle('Drei Zwerge ziehen in die Ameisenfarm ein.', 'pick');
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
    return (1 + 0.3 * (this.pickLevel - 1)) * (this.buffT > 0 ? 1.5 : 1) * (d.energy < 25 ? 0.7 : 1);
  }

  update(dt) {
    const wasNight = this.isNight();
    this.time += dt;
    if (this.phase < 0.02 && wasNight === false) { /* no-op */ }
    if (!wasNight && this.isNight()) this.event('Die Nacht bricht herein. Müde Zwerge gehen schlafen.', 'lantern');
    if (wasNight && !this.isNight()) {
      this.day++;
      this.event(`Tag ${this.day} beginnt!`, 'pick');
    }
    if (this.horns < HORN_MAX) this.horns = Math.min(HORN_MAX, this.horns + dt / HORN_REGEN);
    if (this.buffT > 0) this.buffT -= dt;
    if (this.stuckT > 0) this.stuckT -= dt;
    if (this.feast) this.updateFeast(dt);
    for (const d of this.dwarfs) d.update(dt);
  }

  // ---------- world interaction ----------
  digCell(d, x, y) {
    const w = this.world;
    const { ore, mat, caves } = w.dig(x, y);
    if (y > this.deepest) {
      this.deepest = y;
      if (y % 10 === 0) this.event(`${d.name} erreicht ${y * 2} m Tiefe!`, 'pick');
    }
    this.hooks.dug?.(d, x, y, mat, ore);
    if (caves > 0) {
      this.chronicle(`${d.name} entdeckt eine Höhle mit Leuchtpilzen!`, 'mushroom');
      d.say('Eine Höhle!');
      this.hooks.sfx?.('discover', x, y);
    }
    if (ore) {
      d.sack.push(ore);
      d.finds++;
      const o = ORES[ore];
      if (!d.best || ORES[d.best].value < o.value) d.best = ore;
      this.hooks.sfx?.(o.value >= 10 ? 'gem' : 'ore', x, y);
      if (ore === ORE_HEART) {
        this.heartFound = true;
        this.chronicle(`${d.name} hat das HERZ DES BERGES gefunden!!!`, 'diamond', true);
        this.hooks.heart?.(d);
        this.cheerAround(d, 99);
      } else if (o.value >= 18) {
        this.chronicle(`${d.name} hat ${articled(o.name)} gefunden!`, o.icon, true);
        this.cheerAround(d, 6);
      } else if (o.value >= 10 && Math.random() < 0.5) {
        this.event(`${d.name} findet ${articled(o.name)}.`, o.icon);
      }
      d.say({ icon: o.icon });
      if (d.task?.kind === 'mine' && d.task.x === x && d.task.y === y) d.path = [];
    }
    // the colony hangs up lanterns every few cells
    if (y > 1 && !this.lampNear(x, y, 4) && Math.random() < 0.4) {
      w.flags[w.idx(x, y)] |= F_LAMP;
    }
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
      if (o === d || o.state === 'home' || o.state === 'sleep') continue;
      if (Math.abs(o.cx - d.cx) + Math.abs(o.cy - d.cy) <= r && o.state !== 'walk') {
        o.state = 'cheer';
        o.timer = 1.2;
        o.say(['Hurra!', 'Juhu!', 'Toll!', '❤'][Math.floor(Math.random() * 4)]);
      }
    }
  }

  deposit(d) {
    if (!d.sack.length) return;
    let sum = 0;
    for (const o of d.sack) {
      sum += ORES[o].value;
      this.collection[o] = (this.collection[o] || 0) + 1;
    }
    d.sack = [];
    this.gold += sum;
    this.totalGold += sum;
    this.hooks.deposit?.(d, sum);
    this.hooks.sfx?.('coin', STASH_X, -1);
    d.state = 'cheer';
    d.timer = 0.9;
    if (sum >= 40) this.event(`${d.name} bringt Schätze im Wert von ${sum} Gold!`, 'cart');
  }

  craftGold(d) {
    this.gold += 1;
    this.totalGold += 1;
    this.hooks.craft?.(d);
  }

  unclaim(task) {
    if (task?.claim !== undefined && this.claims.get(task.claim) !== undefined) this.claims.delete(task.claim);
  }

  stuck() {
    if (this.stuckT > 0) return;
    this.stuckT = 90;
    if (this.pickLevel < 4) this.event('Hier ist alles zu hart! Die Zwerge behauen jetzt Steine – eine bessere Spitzhacke würde helfen.', 'pick', true);
  }

  // ---------- commands ----------
  placeFlag(x, y) {
    const w = this.world;
    if (y < 0 || y >= H || x < 0 || x >= W) return { ok: false, msg: 'Dort kann man nicht graben.' };
    if (this.horns < 1) return { ok: false, msg: 'Keine Befehle übrig – warte, bis das Horn sich erholt.' };
    if (this.flags.length >= 3) return { ok: false, msg: 'Es sind schon 3 Flaggen gesetzt.' };
    if (this.flags.some((f) => f.x === x && f.y === y)) return { ok: false, msg: 'Hier steht schon eine Flagge.' };
    if (w.solid(x, y) && !w.canDig(x, y, this.pickLevel)) {
      return { ok: false, msg: `${MATS[w.get(x, y)].name} ist zu hart für die ${PICKS[this.pickLevel].name}.` };
    }
    const flag = { x, y, id: Math.random(), dwarf: null };
    // the closest available dwarf takes the job
    let best = null, bc = Infinity;
    for (const d of this.dwarfs) {
      if (d.state === 'home' || d.task?.kind === 'flag') continue;
      const m = dijkstra(w, d.cx, d.cy, { pick: this.pickLevel, seed: 3 });
      const c = costTo(m, x, y) + (d.state === 'sleep' ? 40 : 0);
      if (c < bc) { bc = c; best = d; }
    }
    if (!best) return { ok: false, msg: 'Kein Zwerg kann dorthin gelangen.' };
    this.horns -= 1;
    flag.dwarf = best.id;
    this.flags.push(flag);
    best.interrupt();
    this.hooks.sfx?.('horn');
    this.event(`${best.name} gräbt zur Flagge.`, 'flag');
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

  dropFlag(flag, unreachable) {
    this.flags = this.flags.filter((f) => f !== flag);
    if (unreachable) this.event('Die Flagge ist unerreichbar und wurde entfernt.', 'flag');
  }

  flagReached(flag, d) {
    if (!this.flags.includes(flag)) return;
    this.flags = this.flags.filter((f) => f !== flag);
    d.say(['Erledigt!', 'Geschafft!', 'Hier bin ich!'][Math.floor(Math.random() * 3)]);
    d.state = 'cheer';
    d.timer = 1;
  }

  startFeast() {
    if (this.feast) return { ok: false, msg: 'Das Festmahl läuft schon!' };
    if (this.horns < 1) return { ok: false, msg: 'Keine Befehle übrig – warte, bis das Horn sich erholt.' };
    this.horns -= 1;
    this.feast = { t: 0, served: 0 };
    for (const d of this.dwarfs) d.interrupt();
    this.hooks.sfx?.('horn');
    this.chronicle('Festmahl! Alle Zwerge eilen an die Tafel.', 'beer');
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
      this.buffT = 120;
      for (const d of this.dwarfs) d.energy = 100;
      this.chronicle('Gestärkt vom Festmahl graben alle 2 Minuten lang schneller!', 'beer');
      this.hooks.sfx?.('cheer');
    }
  }

  recruitCost() { return Math.round(30 * Math.pow(1.75, this.dwarfs.length - 3)); }

  recruit() {
    if (this.dwarfs.length >= MAX_DWARFS) return { ok: false, msg: 'Die Farm ist voll!' };
    const c = this.recruitCost();
    if (this.gold < c) return { ok: false, msg: `Du brauchst ${c} Gold.` };
    this.gold -= c;
    const d = new Dwarf(this, { name: this.freshName(), cx: 0, cy: -1, joined: this.day });
    d.say('Hallo!');
    this.dwarfs.push(d);
    this.hooks.sfx?.('cheer');
    this.chronicle(`${d.name} ist der Kolonie beigetreten!`, 'pick');
    return { ok: true };
  }

  upgradePick() {
    if (this.pickLevel >= 4) return { ok: false, msg: 'Die beste Spitzhacke ist schon da.' };
    const p = PICKS[this.pickLevel + 1];
    if (this.gold < p.cost) return { ok: false, msg: `Du brauchst ${p.cost} Gold.` };
    this.gold -= p.cost;
    this.pickLevel++;
    this.stuckT = 0;
    this.hooks.sfx?.('upgrade');
    this.chronicle(`Neue ${p.name}! Die Zwerge ${p.desc}.`, 'pick', true);
    return { ok: true };
  }

  // ---------- messages ----------
  event(msg, icon, important = false) {
    this.hooks.event?.(msg, icon, important);
  }
  chronicle(msg, icon, important = false) {
    this.log.unshift({ day: this.day, msg, icon });
    if (this.log.length > 60) this.log.length = 60;
    this.event(msg, icon, important);
  }

  // ---------- persistence ----------
  serialize() {
    return {
      v: 1,
      saved: Date.now(),
      world: this.world.serialize(),
      dwarfs: this.dwarfs.map((d) => d.serialize()),
      gold: this.gold, totalGold: this.totalGold, pickLevel: this.pickLevel, horns: this.horns,
      time: this.time, day: this.day, buffT: this.buffT, collection: this.collection, log: this.log,
      heartFound: this.heartFound, deepest: this.deepest,
      flags: this.flags.map((f) => ({ x: f.x, y: f.y })),
    };
  }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize())); } catch (e) { /* storage full or blocked */ }
  }

  static hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }

  static clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }

  load() {
    let o;
    try { o = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return false; }
    if (!o || o.v !== 1) return false;
    this.world = World.deserialize(o.world);
    this.gold = o.gold; this.totalGold = o.totalGold; this.pickLevel = o.pickLevel; this.horns = o.horns;
    this.time = o.time; this.day = o.day; this.buffT = o.buffT || 0; this.collection = o.collection || {};
    this.log = o.log || []; this.heartFound = !!o.heartFound; this.deepest = o.deepest || 4;
    this.flags = (o.flags || []).map((f) => ({ ...f, id: Math.random(), dwarf: null }));
    this.feast = null;
    this.claims = new Map();
    this.stuckT = 0;
    this.dwarfs = o.dwarfs.map((d) => new Dwarf(this, d));
    this.savedAt = o.saved;
    return true;
  }
}

function articled(name) {
  const fem = ['Schatztruhe'];
  const neu = ['Gold', 'Fossil', 'Herz des Berges', 'Mithril'];
  if (name === 'Gold' || name === 'Mithril' || name === 'Kohle') return name;
  if (name === 'Diamant') return 'einen Diamanten';
  if (fem.includes(name)) return 'eine ' + name;
  if (neu.includes(name)) return 'ein ' + name;
  return 'einen ' + name;
}
