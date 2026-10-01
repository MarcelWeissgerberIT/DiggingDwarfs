// DOM user interface: icons first, as few words as possible.
import { ORES, ORE_HEART, HORN_MAX, MAX_DWARFS, pickInfo } from './config.js';
import { iconSVG } from './icons.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('de-DE');

export const portraitHTML = (variant, cls = '') =>
  `<i class="portrait ${cls}" style="background-position:0% ${(variant % 6) * 20}%"></i>`;

function setIcon(el, name) {
  if (el.dataset.cur === name) return;
  el.dataset.cur = name;
  el.innerHTML = iconSVG(name);
}

export class UI {
  constructor(app) {
    this.app = app; // { game, renderer, audio, setSpeed, newGame }
    this.mode = null; // 'flag'
    this.tickerItems = [];
    this.goldShown = 0;
    document.querySelectorAll('[data-icon]').forEach((el) => setIcon(el, el.dataset.icon));
    $('#btn-flag').addEventListener('click', () => this.toggleFlagMode());
    $('#btn-feast').addEventListener('click', () => this.feast());
    $('#btn-shop').addEventListener('click', () => this.openShop());
    $('#btn-treasury').addEventListener('click', () => this.openTreasury('items'));
    $('#btn-menu').addEventListener('click', () => this.openMenu());
    $('#btn-speed').addEventListener('click', () => this.cycleSpeed());
    $('#btn-sound').addEventListener('click', () => { this.app.audio.toggleMute(); this.app.audio.unlock(); });
    $('#btn-watch').addEventListener('click', () => this.toggleWatch());
    $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') this.closeSheet(); });
    $('#card-close').addEventListener('click', () => this.select(null));
    $('#card-follow').addEventListener('click', () => this.toggleFollow());
  }

  get game() { return this.app.game; }

  // ---------- HUD ----------
  update(dt) {
    const g = this.game;
    this.goldShown += (g.gold - this.goldShown) * Math.min(1, dt * 6);
    if (Math.abs(g.gold - this.goldShown) < 0.5) this.goldShown = g.gold;
    $('#gold-val').textContent = fmt(this.goldShown);
    $('#pop-val').textContent = g.dwarfs.length;
    $('#day-val').textContent = g.day;
    setIcon($('#clock-ico'), g.isNight() ? 'moon' : 'sun');
    setIcon($('#btn-sound span'), this.app.audio.muted ? 'mute' : 'sound');
    $('#btn-watch').classList.toggle('active', !!this.app.renderer.auto);
    const full = Math.floor(g.horns);
    const frac = g.horns - full;
    const horns = $('#horns').children;
    for (let i = 0; i < HORN_MAX; i++) {
      horns[i].style.setProperty('--fill', (i < full ? 1 : i === full ? frac : 0).toFixed(3));
      horns[i].classList.toggle('ready', i < full);
    }
    $('#btn-flag').classList.toggle('active', this.mode === 'flag');
    $('#btn-flag').classList.toggle('disabled', g.horns < 1);
    $('#btn-feast').classList.toggle('disabled', g.horns < 1 || !!g.feast);
    $('#btn-feast').classList.toggle('active', !!g.feast);
    const canBuy = g.gold >= pickInfo(g.pickLevel + 1).cost || (g.dwarfs.length < MAX_DWARFS && g.gold >= g.recruitCost());
    $('#btn-shop').classList.toggle('badge', canBuy || g.stuck);
    $('#buff').hidden = !(g.buffT > 0);
    if (g.buffT > 0) $('#buff-val').textContent = Math.ceil(g.buffT);
    this.updateCard();
    this.updateTicker(dt);
  }

  // ---------- ticker: icon + a word or two ----------
  ticker(msg, icon, big) {
    const el = document.createElement('div');
    el.className = 'tick' + (big ? ' big' : '');
    el.innerHTML = (icon ? iconSVG(icon) : '') + `<span>${esc(msg)}</span>`;
    $('#ticker').prepend(el);
    this.tickerItems.unshift({ el, t: big ? 4 : 3 });
    while (this.tickerItems.length > 2) this.tickerItems.pop().el.remove();
  }

  updateTicker(dt) {
    for (const it of this.tickerItems) {
      it.t -= dt;
      if (it.t < 0.5) it.el.style.opacity = Math.max(0, it.t / 0.5);
    }
    this.tickerItems = this.tickerItems.filter((it) => {
      if (it.t <= 0) { it.el.remove(); return false; }
      return true;
    });
  }

  toast(msg, ms = 1800) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ---------- commands ----------
  toggleFlagMode() {
    if (this.mode === 'flag') { this.mode = null; $('#hint').hidden = true; return; }
    if (this.game.horns < 1) { this.toast('Kein Befehl übrig'); return; }
    this.mode = 'flag';
    $('#hint').hidden = false;
  }

  feast() {
    const r = this.game.startFeast();
    if (!r.ok) { this.toast(r.msg); return; }
    this.app.renderer.follow = null;
    this.app.renderer.centerOn(9, -0.5);
  }

  tapWorld(cssX, cssY) {
    const r = this.app.renderer;
    if (r.auto) r.setAuto(false);
    if (this.mode === 'flag') {
      const c = r.cellAt(cssX, cssY);
      const res = this.game.placeFlag(c.x, c.y);
      if (!res.ok) { this.toast(res.msg); return; }
      this.mode = null;
      $('#hint').hidden = true;
      return;
    }
    this.select(r.dwarfAt(cssX, cssY));
  }

  // ---------- dwarf card ----------
  select(d) {
    const r = this.app.renderer;
    r.selected = d;
    if (!d) { r.follow = null; $('#dwarf-card').hidden = true; return; }
    $('#dwarf-card').hidden = false;
    $('#card-portrait').style.backgroundPosition = `0% ${(d.variant % 6) * 20}%`;
    $('#card-name').textContent = d.name;
    this.updateCard(true);
  }

  // observer mode: the camera wanders from dwarf to dwarf and jumps to exciting moments
  toggleWatch() {
    const r = this.app.renderer;
    r.setAuto(!r.auto);
    if (r.auto) { $('#dwarf-card').hidden = true; this.toast('Zuschauen'); }
  }

  toggleFollow() {
    const r = this.app.renderer;
    if (!r.selected) return;
    r.follow = r.follow ? null : r.selected;
    if (r.follow && r.cam.T < 50) r.cam.T = 56;
  }

  updateCard(force = false) {
    const d = this.app.renderer.selected;
    if (!d) return;
    this.cardT = (this.cardT || 0) - 1;
    if (!force && this.cardT > 0) return;
    this.cardT = 10;
    const [icon, label] = d.activity();
    const key = icon + label;
    if ($('#card-act').dataset.k !== key) {
      $('#card-act').dataset.k = key;
      $('#card-act').innerHTML = iconSVG(icon) + `<span>${esc(label)}</span>`;
    }
    $('#card-level').textContent = `★${d.level}`;
    $('#card-energy').style.width = `${Math.round(d.energy)}%`;
    $('#card-energy').classList.toggle('low', d.energy < 25);
    const sackKey = d.sack.map((s) => s[0]).join(',');
    if ($('#card-sack').dataset.k !== sackKey) {
      $('#card-sack').dataset.k = sackKey;
      $('#card-sack').innerHTML = d.sack.map(([o]) => iconSVG(ORES[o].icon)).join('');
    }
    $('#card-follow').classList.toggle('active', this.app.renderer.follow === d);
  }

  // ---------- sheets ----------
  openSheet(html) {
    $('#sheet-body').innerHTML = html;
    $('#sheet').hidden = false;
    requestAnimationFrame(() => $('#sheet').classList.add('open'));
  }
  closeSheet() {
    $('#sheet').classList.remove('open');
    setTimeout(() => { if (!$('#sheet').classList.contains('open')) $('#sheet').hidden = true; }, 250);
  }

  priceBtn(act, cost, disabled) {
    return `<button class="buy" data-act="${act}" ${disabled ? 'disabled' : ''}>${iconSVG('coin')}<span>${fmt(cost)}</span></button>`;
  }

  openShop() {
    const render = () => {
      const g = this.game;
      const rc = g.recruitCost();
      const full = g.dwarfs.length >= MAX_DWARFS;
      const next = pickInfo(g.pickLevel + 1);
      return `
      <div class="sheet-head">${iconSVG('hammer')}<h2>Werkstatt</h2><span class="sheet-gold">${iconSVG('coin')}${fmt(g.gold)}</span></div>
      <div class="shop-card">
        ${portraitHTML(g.dwarfs.length % 4, 'big')}
        <div class="txt"><b>+1 Zwerg</b><small>${g.dwarfs.length} / ${MAX_DWARFS}</small></div>
        ${full ? '<span class="done">voll</span>' : this.priceBtn('recruit', rc, g.gold < rc)}
      </div>
      <div class="shop-card ${g.stuck ? 'glow' : ''}">
        <span class="big-ic">${iconSVG('pick')}</span>
        <div class="txt"><b>${esc(next.name)}</b><small><i class="swatch" style="background-image:url(assets/tex/${next.tex}.jpg)"></i>${esc(next.unlocks)}</small></div>
        ${this.priceBtn('pick', next.cost, g.gold < next.cost)}
      </div>
      <button class="close" data-act="close">${iconSVG('close')}</button>`;
    };
    this.openSheet(render());
    this.bindSheet(render);
  }

  bindSheet(render) {
    const body = $('#sheet-body');
    body.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      const a = this.app.audio;
      if (act === 'close') return this.closeSheet();
      if (act === 'tab') return this.openTreasury(b.dataset.tab);
      if (act === 'music') { a.setMusic(!a.musicOn); a.unlock(); body.innerHTML = render(); return; }
      if (act === 'sfx') { a.setSfx(!a.sfxOn); body.innerHTML = render(); return; }
      if (act === 'help') return this.openHelp();
      if (act === 'new') {
        if (b.dataset.confirm) { this.closeSheet(); this.app.newGame(); return; }
        b.dataset.confirm = '1';
        b.classList.add('confirm');
        b.querySelector('b').textContent = 'Sicher?';
        return;
      }
      if (act === 'dwarf') {
        const d = this.game.dwarfs.find((x) => x.id === Number(b.dataset.id));
        this.closeSheet();
        if (d) { this.select(d); this.app.renderer.follow = d; if (this.app.renderer.cam.T < 50) this.app.renderer.cam.T = 56; }
        return;
      }
      let res;
      if (act === 'recruit') res = this.game.recruit();
      if (act === 'pick') res = this.game.upgradePick();
      if (res) {
        if (!res.ok) this.toast(res.msg);
        body.innerHTML = render();
      }
    };
  }

  openTreasury(tab = 'items') {
    const render = () => {
      const g = this.game;
      const tabs = `<div class="tabs">
        <button data-act="tab" data-tab="items" class="${tab === 'items' ? 'on' : ''}" aria-label="Schätze">${iconSVG('diamond')}</button>
        <button data-act="tab" data-tab="colony" class="${tab === 'colony' ? 'on' : ''}" aria-label="Zwerge">${iconSVG('dwarf')}</button></div>`;
      let body = '';
      if (tab === 'items') {
        const cells = ORES.map((o, i) => {
          if (!o) return '';
          const n = g.collection[i] || 0;
          return `<div class="cell ${n ? '' : 'unknown'} ${i === ORE_HEART ? 'heart' : ''}">${iconSVG(o.icon)}<b>${n ? fmt(n) : '?'}</b></div>`;
        });
        const dinos = g.collection.dino || 0;
        cells.push(`<div class="cell ${dinos ? '' : 'unknown'}">${iconSVG('bone')}<b>${dinos || '?'}</b></div>`);
        body = `<div class="stats"><span>${iconSVG('coin')}${fmt(g.totalGold)}</span><span>${iconSVG('layers')}${g.deepest * 2} m</span></div>
          <div class="grid">${cells.join('')}</div>`;
      } else {
        body = '<div class="list">' + g.dwarfs.map((d) => {
          const [icon] = d.activity();
          return `<button class="row" data-act="dwarf" data-id="${d.id}">${portraitHTML(d.variant)}<b>${esc(d.name)}</b>${iconSVG(icon)}<span class="nums">${d.finds}</span></button>`;
        }).join('') + '</div>';
      }
      return `<div class="sheet-head">${iconSVG('chest')}<h2>Schätze</h2></div>${tabs}${body}<button class="close" data-act="close">${iconSVG('close')}</button>`;
    };
    if ($('#sheet').hidden) this.openSheet(render()); else $('#sheet-body').innerHTML = render();
    this.bindSheet(render);
  }

  openMenu() {
    const render = () => {
      const a = this.app.audio;
      return `<div class="list">
        <button class="row" data-act="music">${iconSVG('note')}<b>Musik</b><span class="toggle ${a.musicOn ? 'on' : ''}"></span></button>
        <button class="row" data-act="sfx">${iconSVG('sound')}<b>Geräusche</b><span class="toggle ${a.sfxOn ? 'on' : ''}"></span></button>
        <button class="row" data-act="help">${iconSVG('question')}<b>Hilfe</b></button>
        <button class="row danger" data-act="new">${iconSVG('seed')}<b>Neue Farm</b></button>
      </div>
      <button class="close" data-act="close">${iconSVG('close')}</button>`;
    };
    this.openSheet(render());
    this.bindSheet(render);
  }

  openHelp() {
    const row = (ic, t) => `<div class="help-row">${iconSVG(ic)}<span>${t}</span></div>`;
    const html = `<div class="help">
        ${row('dwarf', 'Zwerge graben von selbst')}
        ${row('flag', 'Tippen = Grabziel')}
        ${row('beer', 'Festmahl = schneller graben')}
        ${row('horn', 'Max. 3 Befehle, laden nach')}
        ${row('hammer', 'Gold → Zwerge & Hacken')}
        ${row('bone', 'Dinos im Gestein finden')}
      </div>
      <button class="close primary" data-act="close">Los!</button>`;
    this.openSheet(html);
    this.bindSheet(() => html);
  }

  cycleSpeed() {
    const s = this.app.speed === 1 ? 2 : this.app.speed === 2 ? 4 : 1;
    this.app.setSpeed(s);
    setIcon($('#btn-speed span'), s === 1 ? 'play' : s === 2 ? 'fast' : 'faster');
  }

  showHeart(d) {
    this.openSheet(`<div class="help center"><div class="heart-big">${iconSVG('diamond')}</div>
      <h2>Herz des Berges!</h2><p>${esc(d.name)}</p></div>
      <button class="close primary" data-act="close">${iconSVG('star')}</button>`);
    this.bindSheet(() => '');
  }
}
