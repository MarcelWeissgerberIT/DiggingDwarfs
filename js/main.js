// Boot, main loop and glue between simulation, renderer, audio and UI.
import { ISO, SLAB, ORES, ENTRANCE_X, STASH_X } from './config.js';
import { loadAssets } from './assets.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { SoundBoard } from './audio.js';

const $ = (s) => document.querySelector(s);
const STEP = 1 / 30;

const app = {
  speed: 1,
  audio: new SoundBoard(),
  setSpeed(s) { app.speed = s; },
};

function onScreen(x, y) {
  const r = app.renderer;
  if (!r || !r.T) return false;
  const [sx, sy] = r.proj(x + 0.5, y + 0.5, SLAB);
  return sx > -50 && sy > -50 && sx < r.cv.width + 50 && sy < r.cv.height + 50;
}

// pick and hammer noises only for the dwarf you watch (or when zoomed in close)
function audible(d) {
  const r = app.renderer;
  return r.follow === d || r.selected === d || (r.cam.T > 70 && onScreen(d.cx, d.cy));
}

const hooks = {
  event: (msg, icon, big) => app.ui?.ticker(msg, icon, big),
  strike: (d, x, y, m) => {
    if (!app.renderer || app.simulating) return;
    app.renderer.crumbs(x, y, m, 3);
    if (audible(d)) app.audio.play('dig');
  },
  hammer: (d) => {
    if (!app.renderer || app.simulating) return;
    const b = d.build;
    if (b) app.renderer.sparkle(b.x + 0.5, b.y + 0.9, '#d9a066', 2);
    if (audible(d)) app.audio.play('build');
  },
  dug: (d, x, y, m, ore) => {
    if (!app.renderer || app.simulating) return;
    app.renderer.crumbs(x, y, m, 9);
    if (ore) app.renderer.sparkle(x + 0.5, y + 0.6, ORES[ore].glow || '#fff6c0', ORES[ore].value >= 10 ? 16 : 8);
  },
  deposit: (d, sum) => {
    if (!app.renderer || app.simulating) return;
    app.renderer.floater(STASH_X + 0.5, -1.1, `+${sum}`);
    app.renderer.sparkle(STASH_X + 0.5, -0.5, '#ffe27a', 12);
  },
  craft: (d) => {
    if (!app.renderer || app.simulating) return;
    app.renderer.floater(d.x + d.facing * 0.3, d.y - 1.1, '+1', '#e8e8f0');
  },
  cheer: (d) => { if (app.renderer && !app.simulating) app.renderer.confetti(d.x, d.y - 0.6, 16); },
  dino: (d, dino, bonus) => {
    if (!app.renderer || app.simulating) return;
    app.renderer.confetti(dino.x + dino.w / 2, dino.y + dino.h / 2, 50);
    app.renderer.floater(dino.x + dino.w / 2, dino.y, `+${bonus}`);
    app.audio.play('discover');
  },
  heart: (d) => {
    if (app.simulating) return;
    app.renderer.confetti(d.x, d.y - 0.6, 120);
    app.audio.play('heart');
    setTimeout(() => app.ui.showHeart(d), 900);
  },
  sfx: (name, x, y) => {
    if (app.simulating) return;
    if (x === undefined || onScreen(x, y)) app.audio.play(name);
  },
};

function resetCamera() {
  const r = app.renderer;
  r.cam.T = Math.max(30, Math.min(60, r.cssW / (10 * ISO)));
  r.follow = null;
  r.selected = null;
  r.centerOn(ENTRANCE_X + 4.5, 4.5, true);
}

function newGame() {
  Game.clearSave();
  app.game.newGame();
  app.ui.select(null);
  resetCamera();
  app.game.save();
}
app.newGame = newGame;

function catchUp() {
  const g = app.game;
  if (!g.savedAt) return;
  const away = Math.min(1800, (Date.now() - g.savedAt) / 1000);
  if (away < 20) return;
  const before = g.totalGold;
  app.simulating = true;
  for (let t = 0; t < away; t += 0.25) g.update(0.25);
  app.simulating = false;
  const gained = g.totalGold - before;
  const min = Math.round(away / 60);
  if (gained > 0) setTimeout(() => app.ui.ticker(`+${gained} (${min} Min.)`, 'coin', true), 600);
}

let last = 0;
let acc = 0;
let saveT = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000 || 0);
  last = now;
  if (!document.hidden && app.running) {
    acc += dt * app.speed;
    let n = 0;
    while (acc >= STEP && n < 12) { app.game.update(STEP); acc -= STEP; n++; }
    if (n === 12) acc = 0;
    app.input.update(dt);
    app.renderer.draw(dt);
    app.ui.update(dt);
    saveT += dt;
    if (saveT > 15) { saveT = 0; app.game.save(); }
  }
  requestAnimationFrame(frame);
}

async function boot() {
  const bar = $('#load-bar');
  let assets;
  try {
    assets = await loadAssets((p) => { bar.style.width = `${Math.round(p * 100)}%`; });
  } catch (e) {
    $('#loading').textContent = 'Fehler: ' + e.message;
    return;
  }
  app.game = new Game(hooks);
  const hasSave = Game.hasSave() && app.game.load();
  if (!hasSave) app.game.newGame();
  app.renderer = new Renderer($('#game'), assets, app.game);
  app.ui = new UI(app);
  app.input = new Input($('#game'), app.renderer, (x, y) => app.ui.tapWorld(x, y));
  resetCamera();
  window.addEventListener('resize', () => app.renderer.resize());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { app.game.save(); app.audio.suspend(); } else { app.audio.resume(); }
  });
  window.addEventListener('pagehide', () => app.game.save());

  $('#loading').hidden = true;
  $('#start-buttons').hidden = false;
  $('#btn-play').textContent = hasSave ? 'Weiterspielen' : 'Spielen';
  $('#btn-new').hidden = !hasSave;
  const start = (fresh) => {
    app.audio.unlock();
    if (fresh) newGame(); else if (hasSave) catchUp();
    $('#start').classList.add('gone');
    setTimeout(() => { $('#start').hidden = true; }, 600);
    app.running = true;
    let seen = false;
    try { seen = !!localStorage.getItem('digging-dwarfs-help'); localStorage.setItem('digging-dwarfs-help', '1'); } catch (e) { /* ignore */ }
    if (!seen) setTimeout(() => app.ui.openHelp(), 700);
  };
  $('#btn-play').addEventListener('click', () => start(false));
  $('#btn-new').addEventListener('click', () => start(true));
  // render the farm behind the title already
  app.running = true;
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
  window.__dd = app; // handy for debugging in the console
}

boot();
