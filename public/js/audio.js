// Efectos de sonido sintetizados con WebAudio (sin archivos).
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.6;
    this.last = {};
  }

  /** Hay que llamarlo en un gesto del usuario (click/toque) para que el navegador permita audio. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {
      /* sin audio */
    }
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  tone(freq, dur, { type = 'sine', gain = 0.2, slide = 0, delay = 0 } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  play(name) {
    if (!this.ctx || this.volume <= 0 || this.ctx.state !== 'running') return;
    const now = performance.now();
    const minGap = { eat: 70, kill: 120, hurt: 200 }[name] || 0;
    if (minGap && now - (this.last[name] || 0) < minGap) return;
    this.last[name] = now;
    switch (name) {
      case 'eat':
        this.tone(520 + Math.random() * 180, 0.06, { type: 'triangle', gain: 0.05, slide: 200 });
        break;
      case 'kill':
        this.tone(160, 0.18, { type: 'square', gain: 0.1, slide: -80 });
        this.tone(660, 0.12, { type: 'triangle', gain: 0.08, delay: 0.05 });
        break;
      case 'hurt':
        this.tone(300, 0.2, { type: 'sawtooth', gain: 0.06, slide: -180 });
        break;
      case 'split':
        this.tone(220, 0.12, { type: 'triangle', gain: 0.1, slide: 420 });
        break;
      case 'eject':
        this.tone(700, 0.05, { type: 'sine', gain: 0.05, slide: -300 });
        break;
      case 'death':
        this.tone(440, 0.5, { type: 'sawtooth', gain: 0.1, slide: -380 });
        break;
      case 'count':
        this.tone(660, 0.12, { type: 'square', gain: 0.07 });
        break;
      case 'go':
        this.tone(990, 0.3, { type: 'square', gain: 0.08 });
        break;
      case 'ach':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', gain: 0.09, delay: i * 0.08 }));
        break;
      case 'level':
        [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.2, { type: 'square', gain: 0.06, delay: i * 0.07 }));
        break;
      case 'click':
        this.tone(900, 0.03, { type: 'sine', gain: 0.04 });
        break;
      default:
        break;
    }
  }
}
