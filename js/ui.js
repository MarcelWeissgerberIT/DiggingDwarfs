// DOM user interface: HUD, ticker, dwarf card, sheets (workshop, treasury, menu).
import { ORES, PICKS, ICON, HORN_MAX, MAX_DWARFS, ORE_HEART } from './config.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function iconHTML(name, cls = '') {
  const [r, c] = ICON[name] || ICON.gold;
  return `<i class="ico ${cls}" style="background-position:${c * 33.3333}% ${r * 33.3333}%"></i>`;
}
export function portraitHTML(variant, cls = '') {
  return `<i class="portrait ${cls}" style="background-position:0% ${variant * 33.3333}%"></i>`;
}

export class UI {
  constructor(app) {
    this.app = app; // { game, renderer, audio, setSpeed, newGame }
    this.mode = null; // 'flag'
    this.tickerItems = [];
    this.goldShown = 0;
    $('#btn-flag').addEventListener('click', () => this.toggleFlagMode());
    $('#btn-feast').addEventListener('click', () => this.feast());
    $('#btn-shop').addEventListener('click', () => this.openShop());
    $('#btn-treasury').addEventListener('click', () => this.openTreasury('items'));
    $('#btn-menu').addEventListener('click', () => this.openMenu());
    $('#btn-speed').addEventListener('click', () => this.cycleSpeed());
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
    $('#gold-val').textContent = Math.round(this.goldShown).toLocaleString('de-DE');
    $('#pop-val').textContent = g.dwarfs.length;
    $('#day-val').textContent = `Tag ${g.day}`;
    $('#clock-ico').textContent = g.isNight() ? '🌙' : '☀️';
    $('#depth-val').textContent = `${g.deepest * 2} m`;
    // horns
    const full = Math.floor(g.horns);
    const frac = g.horns - full;
    const horns = $('#horns').children;
    for (let i = 0; i < HORN_MAX; i++) {
      const el = horns[i];
      const fill = i < full ? 1 : i === full ? frac : 0;
      el.style.setProperty('--fill', fill.toFixed(3));
      el.classList.toggle('ready', i < full);
    }
    $('#btn-flag').classList.toggle('active', this.mode === 'flag');
    $('#btn-flag').classList.toggle('disabled', g.horns < 1);
    $('#btn-feast').classList.toggle('disabled', g.horns < 1 || !!g.feast);
    $('#btn-feast').classList.toggle('active', !!g.feast);
    const canBuy = (g.pickLevel < 4 && g.gold >= PICKS[g.pickLevel + 1].cost) ||
      (g.dwarfs.length < MAX_DWARFS && g.gold >= g.recruitCost());
    $('#btn-shop').classList.toggle('badge', canBuy);
    $('#buff').hidden = !(g.buffT > 0);
    if (g.buffT > 0) $('#buff-val').textContent = `${Math.ceil(g.buffT)}s`;
    this.updateCard();
    this.updateTicker(dt);
  }

  // ---------- ticker ----------
  ticker(msg, icon, important) {
    const el = document.createElement('div');
    el.className = 'tick' + (important ? ' important' : '');
    el.innerHTML = (icon ? iconHTML(icon) : '') + `<span>${esc(msg)}</span>`;
    $('#ticker').prepend(el);
    this.tickerItems.unshift({ el, t: important ? 6 : 4.2 });
    while (this.tickerItems.length > 3) {
      const old = this.tickerItems.pop();
      old.el.remove();
    }
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

  toast(msg, ms = 2400) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ---------- commands ----------
  toggleFlagMode() {
    this.app.audio.play('tap');
    if (this.mode === 'flag') { this.mode = null; $('#hint').hidden = true; return; }
    if (this.game.horns < 1) { this.toast('Kein Befehl übrig – das Horn erholt sich gerade.'); this.app.audio.play('error'); return; }
    this.mode = 'flag';
    $('#hint').hidden = false;
    $('#hint').innerHTML = `${iconHTML('flag')} Tippe auf eine Stelle im Boden – ein Zwerg gräbt dorthin.`;
  }

  feast() {
    const r = this.game.startFeast();
    if (!r.ok) { this.toast(r.msg); this.app.audio.play('error'); return; }
    this.app.renderer.centerOn(9, -1);
    this.app.renderer.follow = null;
  }

  tapWorld(cssX, cssY) {
    const r = this.app.renderer;
    if (this.mode === 'flag') {
      const c = r.cellAt(cssX, cssY);
      const res = this.game.placeFlag(c.x, c.y);
      if (!res.ok) { this.toast(res.msg); this.app.audio.play('error'); return; }
      this.mode = null;
      $('#hint').hidden = true;
      return;
    }
    const d = r.dwarfAt(cssX, cssY);
    this.select(d);
    if (d) this.app.audio.play('tap');
  }

  // ---------- dwarf card ----------
  select(d) {
    const r = this.app.renderer;
    r.selected = d;
    if (!d) { r.follow = null; $('#dwarf-card').hidden = true; return; }
    $('#dwarf-card').hidden = false;
    $('#card-portrait').style.backgroundPosition = `0% ${d.variant * 33.3333}%`;
    $('#card-name').textContent = d.name;
    this.updateCard(true);
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
    $('#card-act').textContent = d.activity();
    $('#card-energy').style.width = `${Math.round(d.energy)}%`;
    $('#card-energy').classList.toggle('low', d.energy < 25);
    const best = d.best ? `${iconHTML(ORES[d.best].icon, 'sm')} ${ORES[d.best].name}` : '—';
    $('#card-stats').innerHTML =
      `<span>⛏ ${d.dug} Felder</span><span>💎 ${d.finds} Funde</span><span>Bester Fund: ${best}</span><span>Mag: ${esc(d.likes)}</span>`;
    $('#card-sack').innerHTML = d.sack.length ? d.sack.map((o) => iconHTML(ORES[o].icon, 'sm')).join('') : '<em>leerer Sack</em>';
    $('#card-follow').classList.toggle('active', this.app.renderer.follow === d);
    $('#card-follow').textContent = this.app.renderer.follow === d ? '👁 Folge ich' : '👁 Folgen';
  }

  // ---------- sheets ----------
  openSheet(html) {
    this.app.audio.play('tap');
    $('#sheet-body').innerHTML = html;
    $('#sheet').hidden = false;
    requestAnimationFrame(() => $('#sheet').classList.add('open'));
  }
  closeSheet() {
    $('#sheet').classList.remove('open');
    setTimeout(() => { if (!$('#sheet').classList.contains('open')) $('#sheet').hidden = true; }, 250);
    this.sheetRefresh = null;
  }

  openShop() {
    const render = () => {
      const g = this.game;
      const rc = g.recruitCost();
      const full = g.dwarfs.length >= 12;
      const next = g.pickLevel < 4 ? PICKS[g.pickLevel + 1] : null;
      return `
      <h2>${iconHTML('pick')} Werkstatt</h2>
      <p class="sub">Du hast <b>${g.gold.toLocaleString('de-DE')}</b> ${iconHTML('gold', 'sm')} Gold</p>
      <div class="shop-card">
        ${portraitHTML((g.dwarfs.length) % 4, 'big')}
        <div class="txt"><h3>Neuer Zwerg</h3><p>${full ? 'Die Farm ist voll belegt.' : `Ein weiterer fleißiger Gräber. (${g.dwarfs.length}/12)`}</p></div>
        <button class="buy" data-act="recruit" ${full || g.gold < rc ? 'disabled' : ''}>${full ? 'voll' : `${rc} ${iconHTML('gold', 'sm')}`}</button>
      </div>
      <div class="shop-card">
        ${iconHTML('pick', 'big')}
        <div class="txt"><h3>${next ? next.name : PICKS[4].name}</h3><p>${next ? `Bessere Spitzhacken für alle: ${next.desc} und gräbt schneller.` : 'Die Zwerge haben die beste Spitzhacke.'}</p>
        <p class="tiny">Aktuell: ${PICKS[g.pickLevel].name}</p></div>
        <button class="buy" data-act="pick" ${!next || g.gold < next.cost ? 'disabled' : ''}>${next ? `${next.cost} ${iconHTML('gold', 'sm')}` : '✓'}</button>
      </div>
      <p class="tiny center">Gold bekommst du, wenn die Zwerge Schätze zur Lore an der Oberfläche bringen.</p>
      <button class="close" data-act="close">Schließen</button>`;
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
      if (act === 'close') return this.closeSheet();
      let res;
      if (act === 'recruit') res = this.game.recruit();
      if (act === 'pick') res = this.game.upgradePick();
      if (act === 'tab') return this.openTreasury(b.dataset.tab);
      if (act === 'music') { this.app.audio.setMusic(!this.app.audio.musicOn); body.innerHTML = render(); return; }
      if (act === 'sfx') { this.app.audio.setSfx(!this.app.audio.sfxOn); body.innerHTML = render(); return; }
      if (act === 'help') return this.openHelp();
      if (act === 'new') {
        if (b.dataset.confirm) { this.closeSheet(); this.app.newGame(); return; }
        b.dataset.confirm = '1';
        b.textContent = 'Wirklich? Alles geht verloren!';
        return;
      }
      if (act === 'dwarf') {
        const d = this.game.dwarfs.find((x) => x.id === Number(b.dataset.id));
        this.closeSheet();
        if (d) { this.select(d); this.app.renderer.follow = d; if (this.app.renderer.cam.T < 50) this.app.renderer.cam.T = 56; }
        return;
      }
      if (res) {
        if (!res.ok) { this.toast(res.msg); this.app.audio.play('error'); } else this.toast('Erledigt!');
        body.innerHTML = render();
      }
    };
  }

  openTreasury(tab = 'items') {
    const render = () => {
      const g = this.game;
      const tabs = `<div class="tabs">
        <button data-act="tab" data-tab="items" class="${tab === 'items' ? 'on' : ''}">Schätze</button>
        <button data-act="tab" data-tab="colony" class="${tab === 'colony' ? 'on' : ''}">Kolonie</button>
        <button data-act="tab" data-tab="log" class="${tab === 'log' ? 'on' : ''}">Chronik</button></div>`;
      let body = '';
      if (tab === 'items') {
        const found = ORES.filter((o, i) => o && g.collection[i]).length;
        body = `<p class="sub">${found} von ${ORES.length - 1} Schatzarten entdeckt · ${g.totalGold.toLocaleString('de-DE')} Gold gesammelt</p><div class="grid">` +
          ORES.map((o, i) => {
            if (!o) return '';
            const n = g.collection[i] || 0;
            if (!n) return `<div class="cell unknown">${iconHTML(i === ORE_HEART ? 'diamond' : o.icon, 'big')}<b>???</b><small>${i === ORE_HEART ? 'ganz tief unten…' : '&nbsp;'}</small></div>`;
            return `<div class="cell ${i === ORE_HEART ? 'heart' : ''}">${iconHTML(o.icon, 'big')}<b>${o.name}</b><small>×${n} · ${o.value} Gold</small></div>`;
          }).join('') + '</div>';
      } else if (tab === 'colony') {
        body = `<p class="sub">Tiefster Stollen: ${g.deepest * 2} m · Spitzhacke: ${PICKS[g.pickLevel].name}</p><div class="list">` +
          g.dwarfs.map((d) => `<button class="row" data-act="dwarf" data-id="${d.id}">${portraitHTML(d.variant)}<span><b>${esc(d.name)}</b><small>${esc(d.activity())}</small></span><span class="nums">⛏ ${d.dug}<br>💎 ${d.finds}</span></button>`).join('') +
          '</div>';
      } else {
        body = '<div class="log">' + (g.log.length ? g.log.map((l) => `<div class="logrow">${iconHTML(l.icon || 'pick', 'sm')}<span><small>Tag ${l.day}</small> ${esc(l.msg)}</span></div>`).join('') : '<p>Noch nichts passiert.</p>') + '</div>';
      }
      return `<h2>${iconHTML('chest')} Schatzkammer</h2>${tabs}${body}<button class="close" data-act="close">Schließen</button>`;
    };
    if ($('#sheet').hidden) this.openSheet(render()); else $('#sheet-body').innerHTML = render();
    this.bindSheet(render);
  }

  openMenu() {
    const render = () => {
      const a = this.app.audio;
      return `<h2>⚙️ Menü</h2>
      <div class="list">
        <button class="row" data-act="music"><span>🎵</span><span><b>Musik</b><small>${a.musicOn ? 'an' : 'aus'}</small></span></button>
        <button class="row" data-act="sfx"><span>🔔</span><span><b>Geräusche</b><small>${a.sfxOn ? 'an' : 'aus'}</small></span></button>
        <button class="row" data-act="help"><span>❓</span><span><b>Anleitung</b><small>So funktioniert die Zwergenfarm</small></span></button>
        <button class="row danger" data-act="new"><span>🌱</span><span><b>Neues Spiel</b><small>Neue Farm mit neuen Zwergen</small></span></button>
      </div>
      <p class="tiny center">Spielstand wird automatisch gespeichert.<br>Grafiken erstellt mit OpenArt.</p>
      <button class="close" data-act="close">Schließen</button>`;
    };
    this.openSheet(render());
    this.bindSheet(render);
  }

  openHelp() {
    const html = `<h2>❓ Die Zwergenfarm</h2>
      <div class="help">
        <p>👀 <b>Du bist Beobachter.</b> Die Zwerge graben ganz von allein Stollen durch die Erde – wie Ameisen in einer Ameisenfarm. Sie suchen Gold, Kristalle und Diamanten und tragen alles zur Lore an der Oberfläche.</p>
        <p>📯 <b>Nur wenige Befehle.</b> Du hast höchstens 3 Hornstöße. Sie laden sich langsam wieder auf.</p>
        <p>${iconHTML('flag', 'sm')} <b>Graben:</b> Tippe danach auf eine Stelle im Boden – der nächste Zwerg gräbt dorthin.</p>
        <p>${iconHTML('beer', 'sm')} <b>Festmahl:</b> Alle Zwerge kommen an die Tafel, erholen sich und graben danach 2 Minuten schneller.</p>
        <p>${iconHTML('pick', 'sm')} <b>Werkstatt:</b> Mit Gold neue Zwerge anwerben und bessere Spitzhacken kaufen. Tiefere Gesteine brauchen bessere Hacken.</p>
        <p>✨ Glitzert es irgendwo im Gestein? Dort ist etwas verborgen…</p>
        <p>🌙 Nachts gehen müde Zwerge schlafen. Tippe einen Zwerg an, um ihm zu folgen.</p>
        <p>💎 Ganz unten, im Glutfels, soll das legendäre <b>Herz des Berges</b> liegen.</p>
        <p>✋ Ziehen = bewegen · Zwei Finger / Mausrad = zoomen · ⏩ = Zeitraffer</p>
      </div>
      <button class="close primary" data-act="close">Los geht's!</button>`;
    this.openSheet(html);
    this.bindSheet(() => html);
  }

  cycleSpeed() {
    const s = this.app.speed === 1 ? 2 : this.app.speed === 2 ? 4 : 1;
    this.app.setSpeed(s);
    $('#btn-speed').textContent = s === 1 ? '▶︎ 1×' : s === 2 ? '⏩ 2×' : '⏩ 4×';
    this.app.audio.play('tap');
  }

  showHeart(d) {
    this.openSheet(`<h2>💎 Das Herz des Berges!</h2>
      <div class="help center"><div class="heart-big">${iconHTML('diamond', 'huge')}</div>
      <p><b>${esc(d.name)}</b> hat tief unten im Glutfels das legendäre Herz des Berges gefunden!</p>
      <p>Die ganze Kolonie feiert. Deine Zwergenfarm ist nun eine Legende – aber gegraben wird natürlich weiter.</p></div>
      <button class="close primary" data-act="close">Hurra!</button>`);
    this.bindSheet(() => '');
  }
}
