import { BINDINGS } from '../config.js';

const ACTIONS = ['shoot', 'intake', 'arm', 'cycle', 'auto', 'pwrDn', 'pwrUp', 'hoodDn', 'hoodUp', 'hp'];
const REPEATABLE = new Set(['pwrDn', 'pwrUp', 'hoodDn', 'hoodUp']);

/** Keyboard state for two drivers sharing one keyboard. */
export class Input {
  constructor() {
    this.down = new Set();
    this.handlers = [];
    this.enabled = false;
    this.lookup = new Map();          // code → [{player, action}]
    for (const [player, b] of Object.entries(BINDINGS)) {
      for (const a of ACTIONS) {
        for (const code of [].concat(b[a])) {
          if (!this.lookup.has(code)) this.lookup.set(code, []);
          this.lookup.get(code).push({ player, action: a });
        }
      }
    }
    this.claimed = new Set(Object.values(BINDINGS).flatMap((b) => Object.values(b).flat()));
    this.claimed.add('Tab'); this.claimed.add('Escape');
    window.addEventListener('keydown', (e) => this.onDown(e));
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  onDown(e) {
    if (!this.enabled && e.code !== 'Escape') return;                   // menus keep normal keyboard behavior
    if (e.target?.tagName === 'INPUT' && e.code !== 'Escape') return;
    if (this.claimed.has(e.code)) e.preventDefault();
    this.down.add(e.code);
    if (e.code === 'Escape' || e.code === 'Tab') { if (!e.repeat) this.emit('global', e.code); return; }
    const list = this.lookup.get(e.code);
    if (!list) return;
    for (const { player, action } of list) {
      if (e.repeat && !REPEATABLE.has(action)) continue;
      this.emit(player, action);
    }
  }

  on(fn) { this.handlers.push(fn); }
  emit(player, action) { for (const h of this.handlers) h(player, action); }

  /** Drive axes for one key set: x forward, y right, turn (+ = counter-clockwise). */
  axes(player) {
    const b = BINDINGS[player], d = this.down;
    return {
      x: (d.has(b.up) ? 1 : 0) - (d.has(b.down) ? 1 : 0),
      y: (d.has(b.right) ? 1 : 0) - (d.has(b.left) ? 1 : 0),
      turn: (d.has(b.turnL) ? 1 : 0) - (d.has(b.turnR) ? 1 : 0),
      slow: d.has(b.slow),
      outtake: d.has(b.outtake),
    };
  }

  /** Combine both key sets (single-player mode lets either set drive P1). */
  static merge(a, b) {
    const c = (u, v) => Math.max(-1, Math.min(1, u + v));
    return { x: c(a.x, b.x), y: c(a.y, b.y), turn: c(a.turn, b.turn), slow: a.slow || b.slow, outtake: a.outtake || b.outtake };
  }
}
