// Tiny synthesized sound effects and a gentle music-box tune (WebAudio, no files).

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

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
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
      // simple echo for the music box
      const delay = this.ctx.createDelay();
      delay.delayTime.value = 0.33;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.28;
      this.musicGain.connect(delay);
      delay.connect(fb); fb.connect(delay);
      delay.connect(this.master);
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

  tone(freq, t0, dur, { type = 'sine', vol = 0.3, attack = 0.005, dest = this.master, slide = 0 } = {}) {
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
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  play(name, vol = 1) {
    if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.01;
    switch (name) {
      case 'dig-soft': this.thump(t, 500 + Math.random() * 200, 0.25 * vol, 0.09); break;
      case 'dig-hard':
        this.thump(t, 1600 + Math.random() * 400, 0.18 * vol, 0.06);
        this.tone(1800 + Math.random() * 300, t, 0.12, { type: 'triangle', vol: 0.05 * vol });
        break;
      case 'ore': this.tone(880, t, 0.15, { type: 'triangle', vol: 0.12 * vol }); this.tone(1320, t + 0.07, 0.2, { type: 'triangle', vol: 0.1 * vol }); break;
      case 'gem':
        [0, 4, 7, 12].forEach((s, i) => this.tone(1046 * 2 ** (s / 12), t + i * 0.06, 0.35, { type: 'sine', vol: 0.13 * vol }));
        break;
      case 'coin':
        this.tone(1568, t, 0.1, { type: 'square', vol: 0.05 * vol });
        this.tone(2093, t + 0.08, 0.3, { type: 'square', vol: 0.05 * vol });
        break;
      case 'discover':
        [0, 3, 7, 10, 14].forEach((s, i) => this.tone(523 * 2 ** (s / 12), t + i * 0.09, 0.5, { vol: 0.1 * vol }));
        break;
      case 'horn':
        this.tone(196, t, 0.9, { type: 'sawtooth', vol: 0.06, attack: 0.08 });
        this.tone(294, t + 0.05, 0.85, { type: 'sawtooth', vol: 0.04, attack: 0.08 });
        this.tone(392, t, 0.9, { type: 'triangle', vol: 0.08, attack: 0.06 });
        break;
      case 'cheer':
        [0, 4, 7, 12, 7, 12].forEach((s, i) => this.tone(659 * 2 ** (s / 12), t + i * 0.1, 0.25, { type: 'triangle', vol: 0.09 }));
        break;
      case 'upgrade':
        [0, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(392 * 2 ** (s / 12), t + i * 0.07, 0.4, { type: 'triangle', vol: 0.1 }));
        break;
      case 'tap': this.tone(660, t, 0.06, { type: 'sine', vol: 0.06 }); break;
      case 'error': this.tone(220, t, 0.18, { type: 'square', vol: 0.04, slide: 0.7 }); break;
      case 'heart':
        [0, 4, 7, 11, 14, 19, 24].forEach((s, i) => this.tone(523 * 2 ** (s / 12), t + i * 0.12, 1.2, { vol: 0.12 }));
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
        const beat = 0.42;
        // a slow lullaby: random walk over a pentatonic scale, bass every bar
        for (let i = 0; i < 4; i++) {
          if (Math.random() < 0.72) {
            this.step = Math.max(0, Math.min(PENTA.length - 1, this.step + Math.floor(Math.random() * 5) - 2));
            const f = 523.25 * 2 ** (PENTA[this.step] / 12);
            this.tone(f, t + i * beat, 1.4, { type: 'sine', vol: 0.5, dest: this.musicGain });
            this.tone(f * 2, t + i * beat, 0.5, { type: 'sine', vol: 0.06, dest: this.musicGain });
          }
        }
        const roots = [130.8, 174.6, 196, 130.8];
        this.tone(roots[Math.floor(Math.random() * 4)], t, beat * 4, { type: 'triangle', vol: 0.18, dest: this.musicGain, attack: 0.05 });
      }
      this.musicT = setTimeout(tick, 1680);
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
}
