/** Tiny WebAudio synth for FIELD cues (Table 9-1) and robot feedback. */
export class Sound {
  constructor() { this.ctx = null; this.enabled = true; }

  unlock() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; }
  }

  tone(freq, dur, { type = 'sine', gain = 0.15, at = 0, slide = null } = {}) {
    if (!this.enabled || !this.ctx) return;
    const c = this.ctx, t0 = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  countdown(n) { this.tone(n > 0 ? 660 : 990, n > 0 ? 0.15 : 0.35, { type: 'square', gain: 0.08 }); }
  start() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, { type: 'square', gain: 0.07, at: i * 0.11 })); }
  bells() { [0, 0.25, 0.5].forEach((t) => this.tone(1320, 0.4, { gain: 0.1, at: t })); }
  whistle() { this.tone(1800, 0.5, { slide: 2300, gain: 0.08 }); this.tone(1400, 0.5, { slide: 1800, gain: 0.05, at: 0.05 }); }
  buzzer() { this.tone(110, 1.4, { type: 'sawtooth', gain: 0.1 }); this.tone(113, 1.4, { type: 'sawtooth', gain: 0.08 }); }
  launch() { this.tone(260, 0.12, { type: 'triangle', slide: 900, gain: 0.07 }); }
  intake() { this.tone(520, 0.05, { type: 'square', gain: 0.03 }); }
  tip() { this.tone(90, 0.35, { type: 'triangle', slide: 55, gain: 0.25 }); this.tone(880, 0.3, { gain: 0.08, at: 0.15 }); this.tone(1175, 0.4, { gain: 0.08, at: 0.28 }); }
  foul() { this.tone(220, 0.25, { type: 'square', gain: 0.06 }); this.tone(180, 0.3, { type: 'square', gain: 0.06, at: 0.2 }); }
  nectar() { this.tone(700, 0.08, { gain: 0.06 }); }
}
