// Tiny synthesized sound effects and a gentle music-box tune (WebAudio, no files).

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

export class SoundBoard {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
    this.musicT = null;
    this.step = 0;
    try {
      const s = JSON.parse(localStorage.getItem('digging-dwarfs-audio') || '{}');
      if (s.sfx === false) this.sfxOn = false;
      if (s.music === false) this.musicOn = false;
    } catch (e) { /* ignore */ }
  }

  persist() {
    try { localStorage.setItem('digging-dwarfs-audio', JSON.stringify({ sfx: this.sfxOn, music: this.musicOn })); } catch (e) { /* ignore */ }
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.4;
      // a gentle low-pass takes the edge off every sound
      this.soft = this.ctx.createBiquadFilter();
      this.soft.type = 'lowpass';
      this.soft.frequency.value = 2600;
      this.soft.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.07;
      this.musicGain.connect(this.soft);
      // simple echo for the music box
      const delay = this.ctx.createDelay();
      delay.delayTime.value = 0.33;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.28;
      this.musicGain.connect(delay);
      delay.connect(fb); fb.connect(delay);
      delay.connect(this.soft);
      const len = this.ctx.sampleRate * 0.4;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.musicOn) this.startMusic();
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  tone(freq, t0, dur, { type = 'sine', vol = 0.3, attack = 0.01, dest = this.soft, slide = 0 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  thump(t0, freq, vol, dur = 0.12) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.soft);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  play(name, vol = 1) {
    if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // never stack the same sound: a calm farm, not an arcade
    this.last = this.last || {};
    const gap = { dig: 0.5, build: 0.6, ore: 0.25, gem: 0.4, coin: 0.3 }[name] ?? 0.15;
    if (this.last[name] && now - this.last[name] < gap) return;
    this.last[name] = now;
    const t = now + 0.01;
    switch (name) {
      case 'dig': this.thump(t, 380 + Math.random() * 120, 0.07 * vol, 0.08); break;
      case 'build': this.thump(t, 700 + Math.random() * 100, 0.05 * vol, 0.05); break;
      case 'ore': this.tone(784, t, 0.25, { vol: 0.05 * vol }); break;
      case 'gem':
        [0, 4, 7].forEach((s, i) => this.tone(880 * 2 ** (s / 12), t + i * 0.08, 0.5, { vol: 0.05 * vol }));
        break;
      case 'coin':
        this.tone(1047, t, 0.3, { vol: 0.045 }); this.tone(1319, t + 0.07, 0.4, { vol: 0.04 });
        break;
      case 'discover':
        [0, 4, 7, 11].forEach((s, i) => this.tone(523 * 2 ** (s / 12), t + i * 0.12, 0.6, { vol: 0.05 }));
        break;
      case 'horn':
        this.tone(220, t, 0.8, { type: 'triangle', vol: 0.06, attack: 0.12 });
        this.tone(330, t + 0.05, 0.75, { type: 'sine', vol: 0.04, attack: 0.12 });
        break;
      case 'cheer':
        [0, 4, 7, 12].forEach((s, i) => this.tone(659 * 2 ** (s / 12), t + i * 0.11, 0.4, { vol: 0.045 }));
        break;
      case 'upgrade':
        [0, 7, 12, 16].forEach((s, i) => this.tone(392 * 2 ** (s / 12), t + i * 0.09, 0.5, { vol: 0.05 }));
        break;
      case 'heart':
        [0, 4, 7, 11, 14, 19].forEach((s, i) => this.tone(523 * 2 ** (s / 12), t + i * 0.14, 1.2, { vol: 0.06 }));
        break;
      default: break;
    }
  }

  startMusic() {
    if (this.musicT || !this.ctx) return;
    const tick = () => {
      if (!this.musicOn || !this.ctx) { this.musicT = null; return; }
      if (this.ctx.state === 'running') {
        const t = this.ctx.currentTime + 0.05;
        const beat = 0.62;
        // a slow lullaby: random walk over a pentatonic scale, bass every bar
        for (let i = 0; i < 4; i++) {
          if (Math.random() < 0.45) {
            this.step = Math.max(0, Math.min(PENTA.length - 1, this.step + Math.floor(Math.random() * 5) - 2));
            const f = 523.25 * 2 ** (PENTA[this.step] / 12);
            this.tone(f, t + i * beat, 1.8, { type: 'sine', vol: 0.45, dest: this.musicGain, attack: 0.03 });
          }
        }
        const roots = [130.8, 174.6, 196, 130.8];
        this.tone(roots[Math.floor(Math.random() * 4)], t, beat * 4, { type: 'sine', vol: 0.22, dest: this.musicGain, attack: 0.2 });
      }
      this.musicT = setTimeout(tick, 2480);
    };
    tick();
  }

  stopMusic() {
    clearTimeout(this.musicT);
    this.musicT = null;
  }

  setMusic(on) {
    this.musicOn = on;
    this.persist();
    if (on) this.startMusic(); else this.stopMusic();
  }

  setSfx(on) {
    this.sfxOn = on;
    this.persist();
  }

  get muted() { return !this.sfxOn && !this.musicOn; }
  toggleMute() {
    const on = this.muted;
    this.sfxOn = on;
    this.setMusic(on);
  }
}
