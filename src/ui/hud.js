const $ = (id) => document.getElementById(id);

const KEYS = {
  p1: { intake: 'F', auto: 'T', shoot: 'Space', arm: 'V', hp: 'H' },
  p2: { intake: ';', auto: '\\', shoot: 'Enter', arm: 'L', hp: 'K' },
};

export class Hud {
  constructor() {
    this.el = { sRed: $('sRed'), sBlue: $('sBlue'), tRed: $('tRed'), tBlue: $('tBlue'), hRed: $('hRed'), hBlue: $('hBlue'),
      clock: $('clock'), phase: $('phase'), toasts: $('toasts'), cd: $('countdown'), pp: { p1: $('pp1'), p2: $('pp2') },
      mode: $('modeLbl'), view: $('viewLbl'), fps: $('fps') };
    this.cache = {};
  }

  set(el, key, v) { if (this.cache[key] !== v) { this.cache[key] = v; el.textContent = v; } }

  scoreboard(score, clockText, phaseText, phaseOpen, hp) {
    const e = this.el;
    this.set(e.sRed, 'sr', String(score.red.total));
    this.set(e.sBlue, 'sb', String(score.blue.total));
    this.set(e.tRed, 'tr', `${score.red.tips} · hive ${Math.round(Math.min(1, score.red.fill) * 100)}%`);
    this.set(e.tBlue, 'tb', `${score.blue.tips} · hive ${Math.round(Math.min(1, score.blue.fill) * 100)}%`);
    this.set(e.hRed, 'hr', hp.red);
    this.set(e.hBlue, 'hb', hp.blue);
    this.set(e.clock, 'clk', clockText);
    this.set(e.phase, 'ph', phaseText);
    e.phase.classList.toggle('open', phaseOpen);
  }

  toast(text, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    this.el.toasts.prepend(t);
    while (this.el.toasts.children.length > 4) this.el.toasts.lastChild.remove();
    setTimeout(() => t.classList.add('fade'), 2400);
    setTimeout(() => t.remove(), 2900);
  }

  countdown(text) {
    this.el.cd.hidden = text == null;
    if (text != null) this.el.cd.textContent = text;
  }

  labels(mode, view) {
    this.el.mode.textContent = mode === 'match' ? 'Match' : 'Free drive';
    this.el.view.textContent = view === 'red' ? 'Red area' : 'Blue area';
  }

  /** Player panel: hopper slots, intake/aim state, launcher numbers. */
  panel(key, robot, visible, hpText) {
    const el = this.el.pp[key];
    el.hidden = !visible;
    if (!visible || !robot) return;
    el.className = `hud pp ${robot.alliance}`;
    const k = KEYS[key];
    const a = robot.aim;
    const slots = [0, 1, 2, 3].map((i) => {
      const b = robot.queue[i];
      return `<span class="slot ${b ? b.slotKey : ''} ${i === 0 && b ? 'next' : ''}"></span>`;
    }).join('');
    let aimChip = '';
    if (a && a.err != null) {
      if (a.wrongSide) aimChip = '<span class="chip bad">wrong side of CELL</span>';
      else if (Math.abs(a.err) < 4 && a.reachable) aimChip = `<span class="chip ok">on target ${a.err.toFixed(0)}°</span>`;
      else aimChip = `<span class="chip">${!a.reachable ? 'too far' : 'turn ' + (a.err > 0 ? 'right' : 'left') + ' ' + Math.abs(a.err).toFixed(0) + '°'}</span>`;
    } else aimChip = '<span class="chip">HIVE tipping…</span>';
    const trim = (v, unit, d = 0) => (robot.auto && v ? ` <small>(${v > 0 ? '+' : ''}${v.toFixed(d)}${unit})</small>` : '');
    const html = `
      <div class="top"><span class="name">${key.toUpperCase()} · ${robot.alliance} ${robot.label}</span><span class="tag">${robot.disabled ? 'disabled' : robot.count + '/4 held'}</span></div>
      <div class="slots">${slots}<span style="flex:1"></span>${aimChip}</div>
      <div class="stats">
        <div class="stat"><span>Intake <kbd>${k.intake}</kbd></span><b><span class="chip ${robot.intakeOn ? 'on' : ''}">${robot.intakeOn ? 'on' : 'off'}</span></b></div>
        <div class="stat"><span>Aim <kbd>${k.auto}</kbd></span><b><span class="chip ${robot.auto ? 'on' : ''}">${robot.auto ? 'auto' : 'manual'}</span></b></div>
        <div class="stat"><span>Flywheel</span><b>${a ? a.speed.toFixed(2) : robot.power.toFixed(2)} m/s${trim(robot.powerOff, '', 2)}</b></div>
        <div class="stat"><span>Hood</span><b>${a ? a.hood : robot.hood}°${trim(robot.hoodOff, '°')}</b></div>
        <div class="stat"><span>Arm <kbd>${k.arm}</kbd></span><b>${robot.arm.phase === 'idle' ? 'ready' : robot.arm.phase}</b></div>
        <div class="stat"><span>NECTAR <kbd>${k.hp}</kbd></span><b>${hpText}</b></div>
      </div>`;
    if (this.cache['pp' + key] !== html) { this.cache['pp' + key] = html; el.innerHTML = html; }
  }
}
