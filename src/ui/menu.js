import { DEFAULT_SETTINGS } from '../config.js';
import { rankingPoints } from '../game/scoring.js';

const KEY = 'biobuzz-sim-settings-v1';
const $ = (id) => document.getElementById(id);

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** Start/pause menu: segmented options, sliders, Start / Resume. */
export class Menu {
  constructor(settings, { onStart, onResume }) {
    this.s = settings;
    this.root = $('menu');
    this.root.querySelectorAll('.seg').forEach((seg) => {
      const opt = seg.dataset.opt;
      seg.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.dataset.toggle) this.s[btn.dataset.v] = !this.s[btn.dataset.v];
          else this.s[opt] = btn.dataset.v;
          if (opt === 'p1' && !this.touchedView) this.s.view = btn.dataset.v;
          if (opt === 'view') this.touchedView = true;
          this.render();
        });
      });
    });
    const slider = (id, key, fmt) => {
      const el = $(id), out = $(id + 'V');
      el.value = this.s[key];
      const upd = () => { this.s[key] = +el.value; out.textContent = fmt(+el.value); };
      el.addEventListener('input', upd);
      upd();
    };
    slider('oPol', 'tipPollen', (v) => `${v} POLLEN`);
    slider('oNec', 'tipNectar', (v) => `${v} NECTAR`);
    slider('oEye', 'eye', (v) => `${v.toFixed(2)} m`);
    $('startBtn').addEventListener('click', () => { saveSettings(this.s); onStart(); });
    $('resumeBtn').addEventListener('click', () => { saveSettings(this.s); onResume(); });
    this.render();
  }

  render() {
    this.root.querySelectorAll('.seg').forEach((seg) => {
      const opt = seg.dataset.opt;
      seg.querySelectorAll('button').forEach((btn) => {
        const on = btn.dataset.toggle ? !!this.s[btn.dataset.v] : String(this.s[opt]) === btn.dataset.v;
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
    const two = this.s.players === '2';
    $('p2l').style.opacity = two ? 1 : 0.35;
    this.root.querySelector('[data-opt="p2"]').style.opacity = two ? 1 : 0.35;
  }

  show(paused) {
    $('resumeBtn').hidden = !paused;
    $('startBtn').textContent = paused ? 'Restart' : 'Start';
    this.render();
    this.root.hidden = false;
    $('startBtn').focus({ preventScroll: true });
  }
  hide() { this.root.hidden = true; }
  get open() { return !this.root.hidden; }
}

/** End-of-MATCH breakdown with RANKING POINTS. */
export function showResults(score, { onAgain, onMenu }) {
  const r = score.red, b = score.blue;
  const rp = { red: rankingPoints(score, 'red'), blue: rankingPoints(score, 'blue') };
  const rows = [
    ['HIVE TIPS', `${r.tips} × 20`, r.tipPts, `${b.tips} × 20`, b.tipPts],
    ['Left in upward CELL', `${r.cell} × 2`, r.cellPts, `${b.cell} × 2`, b.cellPts],
    ['In owned FLOWERS', `${r.flowerOwned} × 2`, r.flowerPts, `${b.flowerOwned} × 2`, b.flowerPts],
    ['Bottom NECTAR bonus', `${r.bottom} × 5`, r.bottomPts, `${b.bottom} × 5`, b.bottomPts],
    ['GARDEN', `${r.garden} × 1`, r.gardenPts, `${b.garden} × 1`, b.gardenPts],
    ['TELEOP PARK', `${r.park} × 5`, r.parkPts, `${b.park} × 5`, b.parkPts],
    ['Opponent fouls', '', r.foulPts, '', b.foulPts],
  ];
  const winner = r.total === b.total ? 'Tie' : r.total > b.total ? 'Red wins' : 'Blue wins';
  $('resTitle').textContent = winner;
  $('resTitle').style.color = r.total === b.total ? 'var(--honey)' : r.total > b.total ? 'var(--red)' : 'var(--blue)';
  const rpRow = (a) => `${rp[a].win + rp[a].pollinator1 + rp[a].pollinator2 + rp[a].swarm} RP`;
  const rpDetail = (a) => [rp[a].win ? (rp[a].win === 3 ? 'Win 3' : 'Tie 1') : 'Win 0', `Pollinator 1: ${rp[a].pollinator1}`, `Pollinator 2: ${rp[a].pollinator2}`, `Swarm: ${rp[a].swarm}`].join(' · ');
  $('resTable').innerHTML = `
    <thead><tr><th></th><th class="r" colspan="2">Red</th><th class="b" colspan="2">Blue</th></tr></thead>
    <tbody>
      ${rows.map((x) => `<tr><td>${x[0]}</td><td>${x[1]}</td><td>${x[2]}</td><td>${x[3]}</td><td>${x[4]}</td></tr>`).join('')}
      <tr class="total"><td>Total</td><td></td><td>${r.total}</td><td></td><td>${b.total}</td></tr>
      <tr><td>RANKING POINTS</td><td colspan="2">${rpRow('red')}<br><small>${rpDetail('red')}</small></td><td colspan="2">${rpRow('blue')}<br><small>${rpDetail('blue')}</small></td></tr>
    </tbody>`;
  const el = $('results');
  el.hidden = false;
  $('againBtn').onclick = () => { el.hidden = true; onAgain(); };
  $('menuBtn').onclick = () => { el.hidden = true; onMenu(); };
}
