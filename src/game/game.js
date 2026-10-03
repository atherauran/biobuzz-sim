import * as THREE from 'three';
import { IN, MATCH, PHYS_DT, ZONES, FLOWER, HIVE, POINTS, ELEMENTS } from '../config.js';
import { clamp } from '../util.js';
import { createWorld } from '../world/physics.js';
import { createRenderer, placeDriverCamera } from '../world/scene.js';
import { buildField } from '../world/field.js';
import { buildFrame, Hive } from '../world/hive.js';
import { Flower } from '../world/flower.js';
import { BallSystem } from '../world/balls.js';
import { Robot } from './robot.js';
import { Input } from './input.js';
import { computeScore } from './scoring.js';
import { Hud } from '../ui/hud.js';
import { Menu, showResults, loadSettings } from '../ui/menu.js';
import { Sound } from '../ui/sound.js';

const OTHER = { red: 'blue', blue: 'red' };
const START_SLOTS = {
  red: [{ x: -63, z: 0, yaw: 0 }, { x: -63, z: -62, yaw: 0 }],
  blue: [{ x: 63, z: 0, yaw: Math.PI }, { x: 63, z: 62, yaw: Math.PI }],
};

export class Game {
  constructor(container) {
    this.settings = loadSettings();
    const { renderer, scene, camera } = createRenderer(container);
    Object.assign(this, { renderer, scene, camera });
    this.world = createWorld();
    this.sound = new Sound();
    buildField(scene, this.world);
    buildFrame(scene, this.world);
    this.hives = { red: new Hive(scene, this.world, 'red'), blue: new Hive(scene, this.world, 'blue') };
    for (const h of Object.values(this.hives)) h.onTip = (hv) => this.onTip(hv);
    this.flowers = FLOWER.list.map((d, i) => new Flower(scene, this.world, d, i));
    this.balls = new BallSystem(scene, this.world);
    this.ctx = { scene, world: this.world, balls: this.balls, sound: this.sound };
    this.robots = [];
    this.byPlayer = {};
    this.input = new Input();
    this.input.on((p, a) => this.onAction(p, a));
    this.hud = new Hud();
    this.menu = new Menu(this.settings, { onStart: () => this.startFromMenu(), onResume: () => this.resume() });
    this.phase = 'idle';
    this.paused = true;
    this.acc = 0;
    this.hudTimer = 0;
    this.perf = { ms: 0, fps: 60 };
    window.addEventListener('resize', () => { this.dirty = true; });
    this.setupField();
    this.applyView();
    this.menu.show(false);
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- setup
  applyView() {
    this.basis = placeDriverCamera(this.camera, this.settings.view, this.settings.eye);
    this.dirty = true;
    this.hud.labels(this.settings.mode, this.settings.view);
  }

  spawnRobots() {
    for (const r of this.robots) r.dispose();
    this.robots = []; this.byPlayer = {};
    const s = this.settings;
    const p1 = new Robot(this.ctx, { alliance: s.p1, label: '12345', start: START_SLOTS[s.p1][0], player: 'p1' });
    this.robots.push(p1); this.byPlayer.p1 = p1;
    if (s.players === '2') {
      const a = s.p2 === 'partner' ? s.p1 : OTHER[s.p1];
      const slot = s.p2 === 'partner' ? 1 : 0;
      const p2 = new Robot(this.ctx, { alliance: a, label: '54321', start: START_SLOTS[a][slot], player: 'p2' });
      this.robots.push(p2); this.byPlayer.p2 = p2;
    }
  }

  /** Stage SCORING ELEMENTS per §10.3.1 / Figure 10-2 and let them settle. */
  setupField() {
    this.spawnRobots();
    const B = this.balls;
    B.clear();
    for (const h of Object.values(this.hives)) h.reset();
    const pollen = B.balls.filter((b) => b.kind === 'P');
    const nectar = { red: B.balls.filter((b) => b.color === 'red'), blue: B.balls.filter((b) => b.color === 'blue') };
    let pi = 0;
    const P = () => pollen[pi++];
    const R = ELEMENTS.pollen.radius;
    // 4 POLLEN stacked in each FLOWER
    for (const f of this.flowers) for (let k = 0; k < 4; k++) B.place(P(), new THREE.Vector3(f.axis.x, (FLOWER.bottomRingThick * 0 + R + 0.05 + k * 2.8) * IN, f.axis.z));
    // 4 POLLEN per GARDEN, in a line from the corner nearest the ALLIANCE AREA
    for (let k = 0; k < 4; k++) {
      B.place(P(), new THREE.Vector3((-72 + R + 0.1 + k * 2.85) * IN, R * IN, (72 - R - 0.1) * IN));
      B.place(P(), new THREE.Vector3((72 - R - 0.1 - k * 2.85) * IN, R * IN, (-72 + R + 0.1) * IN));
    }
    // pre-loads: 4 per robot; absent robots' pre-loads go in their LOADING ZONE against the wall
    for (const a of ['red', 'blue']) {
      const present = this.robots.filter((r) => r.alliance === a);
      for (const r of present) for (let k = 0; k < 4; k++) { const b = P(); B.lift(b, 'held', r); r.queue.push(b); b.anim = 1; }
      const absent = 2 - present.length;
      const lz = ZONES[a].loadingZone, wx = ZONES[a].wallX, inward = ZONES[a].inward;
      const n = absent * 4, zc = (lz.z0 + lz.z1) / 2;
      for (let k = 0; k < n; k++) B.place(P(), new THREE.Vector3((wx + inward * (R + 0.1)) * IN, R * IN, (zc + (k - (n - 1) / 2) * 2.85) * IN));
    }
    // 3 NECTAR in each upward CELL against the back wall, toward the alliance's side; 5 in each ALLIANCE AREA
    for (const a of ['red', 'blue']) {
      const hv = this.hives[a], s = hv.upSign, sx = a === 'red' ? -1 : 1;
      const r = ELEMENTS.nectar.radius;
      for (let k = 0; k < 3; k++) {
        const local = new THREE.Vector3(sx * (HIVE.cellHalfWidth - r - 0.15 - k * (2 * r + 0.05)), HIVE.floorOffset + r + 0.1, s * (HIVE.cellInner + r + 0.1));
        B.place(nectar[a][k], hv.toWorld(local));
      }
      for (let k = 3; k < 8; k++) B.lift(nectar[a][k], 'supply');
    }
    this.hp = { red: { credits: 0 }, blue: { credits: 0 } };
    this.fouls = { red: { points: 0, count: 0 }, blue: { points: 0, count: 0 } };
    // settle everything before the drive team sees it
    for (let i = 0; i < 360; i++) {
      for (const h of Object.values(this.hives)) h.preStep(PHYS_DT, B.balls, this.settings);
      this.world.step(PHYS_DT);
    }
    for (const b of B.balls) if (b.state === 'field') b.inFlower = this.flowerIndexOf(b);
    for (const r of this.robots) r.update(0, { outtake: false }, this.hives[r.alliance], this.flowers, this.settings);
    B.sync();
    for (const h of Object.values(this.hives)) h.sync();
    this.score = computeScore(this);
  }

  // ---------------------------------------------------------------- match flow
  startFromMenu() {
    this.menu.hide();
    this.sound.enabled = this.settings.sound;
    this.sound.unlock();
    this.setupField();
    this.applyView();
    this.paused = false;
    this.input.enabled = true;
    this.input.down.clear();
    if (this.settings.mode === 'match') {
      this.phase = 'countdown';
      this.remaining = MATCH.teleop;
      this.cd = MATCH.countdown;
      this.lastCd = null;
      for (const r of this.robots) r.disabled = true;
    } else {
      this.phase = 'free';
      this.elapsed = 0;
    }
  }

  pause() {
    if (this.phase === 'idle') return;
    this.paused = true;
    this.input.enabled = false;
    this.input.down.clear();
    this.menu.show(true);
  }

  resume() {
    this.menu.hide();
    this.sound.enabled = this.settings.sound;
    this.applyView();
    this.paused = false;
    this.input.enabled = true;
  }

  get flowersOpen() { return this.phase === 'free' || this.phase === 'settle' || this.phase === 'done' || (this.phase === 'teleop' && this.remaining <= MATCH.flowerUnlock); }

  /** G426.B: all remaining NECTAR may be entered with 60 s or less left. */
  get allNectarOpen() { return this.phase === 'teleop' && this.remaining <= MATCH.flowerUnlock; }

  /** NECTAR a human player may enter now (G426): one per TIP of their HIVE, or all of it at 1:00. */
  hpAvailable(a) {
    const supply = this.balls.balls.filter((b) => b.state === 'supply' && b.color === a).length;
    if (this.allNectarOpen) return supply;
    if (this.phase !== 'teleop' && this.phase !== 'free') return 0;
    return Math.min(supply, this.hp[a].credits);
  }

  enterNectar(a) {
    if (this.hpAvailable(a) <= 0) {
      const left = this.balls.balls.some((b) => b.state === 'supply' && b.color === a);
      this.hud.toast(left ? `${a} human player: TIP your HIVE to enter NECTAR` : `${a} human player: no NECTAR left`, a);
      return;
    }
    const b = this.balls.balls.find((x) => x.state === 'supply' && x.color === a);
    const lz = ZONES[a].loadingZone, wx = ZONES[a].wallX, inward = ZONES[a].inward;
    const x = wx + inward * (3 + Math.random() * 4);
    const z = (lz.z0 + lz.z1) / 2 + (Math.random() - 0.5) * 14;
    this.balls.place(b, new THREE.Vector3(x * IN, 15 * IN, z * IN), new THREE.Vector3(inward * 0.3, 0, 0));
    if (!this.allNectarOpen) this.hp[a].credits--;
    this.sound.nectar();
  }

  onTip(hive) {
    const a = hive.alliance;
    this.hp[a].credits++;
    this.hud.toast(`${a} HIVE tipped +${POINTS.tip}`, a);
    this.sound.tip();
  }

  onAction(player, action) {
    if (player === 'global') {
      if (action === 'Escape') { if (this.menu.open) { if (this.phase !== 'idle') this.resume(); } else if (document.getElementById('results').hidden) this.pause(); }
      if (action === 'Tab' && !this.menu.open) { this.settings.view = this.settings.view === 'red' ? 'blue' : 'red'; this.applyView(); }
      return;
    }
    if (this.paused) return;
    const robot = this.byPlayer[player] || (this.settings.players === '1' ? this.byPlayer.p1 : null);
    if (!robot) return;
    if (action === 'auto') robot.toggleAuto();
    if (action === 'pwrDn') robot.adjPower(-1);
    if (action === 'pwrUp') robot.adjPower(1);
    if (action === 'hoodDn') robot.adjHood(-1);
    if (action === 'hoodUp') robot.adjHood(1);
    if (action === 'cycle') robot.cycle();
    const live = this.phase === 'teleop' || this.phase === 'free';
    if (!live) return;
    if (action === 'intake') robot.toggleIntake();
    if (action === 'shoot') robot.shoot();
    if (action === 'arm') robot.armDrop();
    if (action === 'hp') this.enterNectar(robot.alliance);
  }

  // ---------------------------------------------------------------- loop
  timeline(dt) {
    if (this.phase === 'countdown') {
      this.cd -= dt;
      const n = Math.ceil(this.cd);
      if (n !== this.lastCd) { this.lastCd = n; if (n > 0) { this.hud.countdown(String(n)); this.sound.countdown(n); } }
      if (this.cd <= 0) {
        this.phase = 'teleop';
        this.hud.countdown(null);
        this.sound.start(); this.sound.bells();
        for (const r of this.robots) r.disabled = false;
        this.hud.toast('TELEOP', 'honey');
      }
    } else if (this.phase === 'teleop') {
      const prev = this.remaining;
      this.remaining = Math.max(0, this.remaining - dt);
      if (prev > MATCH.flowerUnlock && this.remaining <= MATCH.flowerUnlock) { this.hud.toast('1:00 · FLOWERS open · all NECTAR available', 'honey'); this.sound.bells(); }
      if (prev > MATCH.endgameCue && this.remaining <= MATCH.endgameCue) { this.hud.toast('Final 20 seconds', 'honey'); this.sound.whistle(); }
      if (this.remaining <= 0) {
        this.phase = 'settle'; this.settleT = MATCH.settle;
        for (const r of this.robots) { r.disabled = true; r.intakeOn = false; }
        this.sound.buzzer();
        this.hud.toast('Match end · waiting for elements to settle', 'honey');
      }
    } else if (this.phase === 'settle') {
      this.settleT -= dt;
      if (this.settleT <= 0) {
        this.phase = 'done';
        this.score = computeScore(this);
        this.input.enabled = false;
        showResults(this.score, { onAgain: () => this.startFromMenu(), onMenu: () => { this.phase = 'idle'; this.menu.show(false); } });
      }
    } else if (this.phase === 'free') this.elapsed += dt;
  }

  flowerIndexOf(b) {
    for (const f of this.flowers) if (f.contents([b]).length) return f.index;
    return -1;
  }

  /** G410: NECTAR entering a FLOWER before 1:00 remains → MAJOR FOUL per NECTAR. */
  checkFlowerFouls() {
    for (const b of this.balls.balls) {
      if (b.state !== 'field' || b.kind !== 'N') { if (b.state !== 'field') b.inFlower = -1; continue; }
      const idx = this.flowerIndexOf(b);
      if (idx >= 0 && b.inFlower !== idx && this.phase === 'teleop' && this.remaining > MATCH.flowerUnlock) {
        this.fouls[b.color].points += POINTS.majorFoul;
        this.fouls[b.color].count++;
        this.hud.toast(`MAJOR FOUL · ${b.color} NECTAR in FLOWER before 1:00 · +20 ${OTHER[b.color]}`, 'foul');
        this.sound.foul();
      }
      b.inFlower = idx;
    }
  }

  step(h) {
    const s = this.settings;
    const p1 = this.input.axes('p1'), p2 = this.input.axes('p2');
    const inputs = { p1: s.players === '1' ? Input.merge(p1, p2) : p1, p2 };
    for (const r of this.robots) r.control(h, inputs[r.player], this.basis, s.drive);
    for (const hv of Object.values(this.hives)) hv.preStep(h, this.balls.balls, s);
    this.world.step(h);
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    if (now - this.last < 1000 / 75) return;          // ~60 fps on high-refresh displays
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.perf.fps = this.perf.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    this.advance(dt);
    if (this.paused && !this.dirty) return;            // nothing moves behind the menu
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
  }

  /** Advance simulation + game logic by dt seconds (no rendering). */
  advance(dt) {
    const s = this.settings;
    if (!this.paused && this.phase !== 'idle') {
      const t0 = performance.now();
      this.acc += dt;
      let n = 0;
      while (this.acc >= PHYS_DT && n < 14) { this.step(PHYS_DT); this.acc -= PHYS_DT; n++; }
      if (n >= 14) this.acc = 0;
      this.perf.ms = this.perf.ms * 0.9 + (performance.now() - t0) * 0.1;
      this.timeline(dt);
      const p1 = this.input.axes('p1'), p2 = this.input.axes('p2');
      const held = { p1: s.players === '1' ? Input.merge(p1, p2) : p1, p2 };
      for (const r of this.robots) r.update(dt, held[r.player], this.hives[r.alliance], this.flowers, s, (msg, a) => this.hud.toast(msg, a));
      const returned = this.balls.checkOut(dt, (x, z) => new THREE.Vector3(clamp(x, -66 * IN, 66 * IN), 6 * IN, clamp(z, -66 * IN, 66 * IN)));
      if (returned.length) { this.hud.toast('NECTAR left the FIELD · returned to drive team', returned[0].color); }
      this.checkFlowerFouls();
      if (this.phase !== 'done') this.score = computeScore(this);
    }
    this.balls.sync();
    for (const h of Object.values(this.hives)) h.sync();
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 1 / 15;
      this.updateHud();
    }
  }

  /** Test/debug helper: run the simulation for `seconds` of game time. */
  simulate(seconds, dt = 1 / 60) {
    for (let t = 0; t < seconds; t += dt) this.advance(dt);
  }

  updateHud() {
    const s = this.settings;
    let clock = '2:00', phaseText = 'Flowers locked';
    if (this.phase === 'free' || (this.phase === 'idle' && s.mode === 'free')) {
      const e = this.elapsed || 0;
      clock = `${Math.floor(e / 60)}:${String(Math.floor(e % 60)).padStart(2, '0')}`;
      phaseText = 'Free drive';
    } else if (this.phase === 'countdown') { clock = '2:00'; phaseText = 'Get ready'; }
    else if (this.phase === 'teleop' || this.phase === 'settle' || this.phase === 'done') {
      const r = Math.ceil(this.remaining ?? 0);
      clock = `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
      phaseText = this.phase === 'teleop' ? (this.remaining <= MATCH.flowerUnlock ? 'Flowers open' : 'Flowers locked') : 'Match over';
    }
    const hpA = { red: this.hpAvailable('red'), blue: this.hpAvailable('blue') };
    const supply = (a) => this.balls.balls.filter((b) => b.state === 'supply' && b.color === a).length;
    const hpText = (a) => `${hpA[a]} ready / ${supply(a)}`;
    this.hud.scoreboard(this.score, clock, phaseText, this.flowersOpen && this.phase !== 'free', { red: hpText('red'), blue: hpText('blue') });
    this.hud.panel('p1', this.byPlayer.p1, this.phase !== 'idle', this.byPlayer.p1 ? hpText(this.byPlayer.p1.alliance) : '');
    this.hud.panel('p2', this.byPlayer.p2, this.phase !== 'idle' && !!this.byPlayer.p2, this.byPlayer.p2 ? hpText(this.byPlayer.p2.alliance) : '');
    this.hud.el.fps.textContent = `${this.perf.fps.toFixed(0)} fps · physics ${this.perf.ms.toFixed(1)} ms`;
  }
}
