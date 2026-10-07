import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { IN, ROBOT, ZONES } from '../config.js';
import { clamp, lerp, smooth, yawOf, inRectM, mergeStatic } from '../util.js';
import { materials } from '../world/physics.js';
import { plateTexture, rollerTexture } from '../world/textures.js';
import { trajectory, solveShot } from './ballistics.js';

const SLOT_X = [-4.2, -0.2, 3.8, 7.6];     // hopper positions (local inches), slot 0 feeds the shooter
const up = new THREE.Vector3(0, 1, 0);

/**
 * Template robot: mecanum drivetrain, front roller intake with a color sensor,
 * rear flywheel launcher with adjustable hood, and a front arm that lifts an
 * element over a FLOWER and drops it through the top ring.
 */
export class Robot {
  constructor(ctx, { alliance, label, start, player }) {
    this.ctx = ctx;
    this.alliance = alliance;
    this.label = label;
    this.player = player;
    this.start = start;
    this.queue = [];
    this.intakeOn = false;
    this.outtake = false;
    this.auto = true;
    this.power = ROBOT.power.def;
    this.hood = ROBOT.hood.def;
    this.powerOff = 0;                   // auto-aim trims, added on top of the solved shot
    this.hoodOff = 0;
    this.cool = 0;
    this.outTimer = 0;
    this.arm = { phase: 'idle', t: 0, ball: null, angle: ROBOT.arm.rest };
    this.disabled = false;
    this.rejectTimer = 0;
    this.wheelSpin = 0; this.rollerSpin = 0;
    this.aim = null;
    this.fwd = new THREE.Vector3(); this.right = new THREE.Vector3(); this.pos = new THREE.Vector3();

    const hy = (ROBOT.top - ROBOT.bottom) / 2;
    this.bodyY = (ROBOT.bottom + hy) * IN;
    this.body = new CANNON.Body({
      mass: ROBOT.mass, material: materials.robot,
      shape: new CANNON.Box(new CANNON.Vec3(ROBOT.half * IN, hy * IN, ROBOT.half * IN)),
      linearDamping: 0.01, angularDamping: 0.01,
    });
    this.body.allowSleep = false;
    this.body.linearFactor.set(1, 0, 1);
    this.body.angularFactor.set(0, 1, 0);
    ctx.world.addBody(this.body);

    this.group = new THREE.Group();
    ctx.scene.add(this.group);
    this.buildMesh();
    this.buildPreview();
    this.reset();
  }

  buildMesh() {
    const g = this.group;
    const col = this.alliance === 'red' ? 0xd8353b : 0x2f63d8;
    const chassis = new THREE.MeshStandardMaterial({ color: 0x2c3036, metalness: 0.55, roughness: 0.45 });
    const alu = new THREE.MeshStandardMaterial({ color: 0xa9afb8, metalness: 0.7, roughness: 0.35 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xf2b632, roughness: 0.5 });
    const box = (w, h, d, m, x, y, z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w * IN, h * IN, d * IN), m);
      b.position.set(x * IN, y * IN, z * IN); b.castShadow = true; b.receiveShadow = true; g.add(b); return b;
    };
    box(17, 0.6, 15, chassis, 0, 2.6, 0);                       // base plate
    for (const s of [-1, 1]) {                                  // side rails with team number
      box(17.6, 5, 0.6, chassis, 0, 4.6, s * 8.2);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(9 * IN, 2.3 * IN), new THREE.MeshBasicMaterial({ map: plateTexture(this.label, this.alliance === 'red' ? '#c9262c' : '#2a5bd0') }));
      plate.position.set(-1.5 * IN, 5 * IN, s * 8.55 * IN);
      if (s < 0) plate.rotation.y = Math.PI;
      g.add(plate);
    }
    box(2, 9, 12.5, alu, -6.5, 8.6, 0);                         // rear tower
    box(15, 0.4, 5, chassis, 1, 8.6, 0);                        // hopper floor
    for (const s of [-1, 1]) box(15, 1.2, 0.3, alu, 1, 9.2, s * 2.4);   // hopper rails
    // shooter: flywheel + hood plate (tilts with hood angle)
    const fly = new THREE.Mesh(new THREE.CylinderGeometry(2 * IN, 2 * IN, 4.2 * IN, 24), new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.4, metalness: 0.4 }));
    fly.rotation.x = Math.PI / 2; fly.position.set(-7.5 * IN, 14.6 * IN, 0); fly.castShadow = true; g.add(fly);
    this.flywheel = fly;
    this.hoodPivot = new THREE.Group(); this.hoodPivot.position.set(-7.5 * IN, 14.6 * IN, 0); g.add(this.hoodPivot);
    const hoodPlate = new THREE.Mesh(new THREE.BoxGeometry(6 * IN, 0.35 * IN, 5 * IN), accent);
    hoodPlate.position.set(2 * IN, 2.7 * IN, 0); hoodPlate.castShadow = true; this.hoodPivot.add(hoodPlate);
    this.hoodPlate = hoodPlate;
    for (const s of [-1, 1]) box(4, 7, 0.3, alu, -7.5, 13, s * 2.6);
    // mecanum wheels
    const wm = new THREE.MeshStandardMaterial({ map: rollerTexture('#26282c', '#5a5f67'), roughness: 0.8 });
    this.wheels = [];
    for (const [x, z] of [[6.3, 7.4], [-6.3, 7.4], [6.3, -7.4], [-6.3, -7.4]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(2.05 * IN, 2.05 * IN, 1.6 * IN, 20), wm);
      w.rotation.x = Math.PI / 2; w.position.set(x * IN, 2.05 * IN, z * IN); w.castShadow = true;
      g.add(w); this.wheels.push(w);
    }
    // intake roller
    const rm = new THREE.MeshStandardMaterial({ map: rollerTexture('#1c1e22', '#f2b632'), roughness: 0.7 });
    this.roller = new THREE.Mesh(new THREE.CylinderGeometry(1.25 * IN, 1.25 * IN, 15 * IN, 18), rm);
    this.roller.rotation.x = Math.PI / 2; this.roller.position.set(10.2 * IN, 2.3 * IN, 0); this.roller.castShadow = true;
    g.add(this.roller);
    for (const s of [-1, 1]) box(3.4, 3.2, 0.3, alu, 9, 3, s * 7.8);
    // alliance flag
    const flag = new THREE.Mesh(new THREE.BoxGeometry(2.5 * IN, 2.5 * IN, 2.5 * IN), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35 }));
    flag.position.set(-6.5 * IN, 13.8 * IN, -4.5 * IN); g.add(flag);
    // FLOWER arm
    const A = ROBOT.arm;
    this.armPivot = new THREE.Group(); this.armPivot.position.set(A.pivotX * IN, A.pivotY * IN, 0); g.add(this.armPivot);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(A.length * IN, 0.8 * IN, 0.8 * IN), alu);
    bar.position.x = A.length / 2 * IN; bar.castShadow = true; this.armPivot.add(bar);
    const cup = new THREE.Mesh(new THREE.TorusGeometry(1.7 * IN, 0.3 * IN, 8, 20), accent);
    cup.rotation.x = Math.PI / 2; cup.position.x = A.length * IN; this.armPivot.add(cup);
    for (const s of [-1, 1]) box(1, 4, 0.4, alu, A.pivotX, A.pivotY - 2, s * 1);
    mergeStatic(g, [fly, this.roller, ...this.wheels]);
  }

  buildPreview() {
    const n = 400;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setDrawRange(0, 0);
    const m = new THREE.LineDashedMaterial({ color: this.alliance === 'red' ? 0xff8a8e : 0x8fb4ff, dashSize: 0.06, gapSize: 0.04, transparent: true, opacity: 0.85 });
    this.preview = new THREE.Line(geo, m);
    this.preview.frustumCulled = false;
    this.ctx.scene.add(this.preview);
    this.previewPts = [];
    const mk = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.008, 8, 32), new THREE.MeshBasicMaterial({ color: 0xf2b632, transparent: true, opacity: 0.7 }));
    this.targetMarker = mk;
    this.ctx.scene.add(mk);
  }

  reset() {
    const s = this.start;
    this.body.position.set(s.x * IN, this.bodyY, s.z * IN);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), s.yaw);
    this.queue = [];
    this.intakeOn = false; this.outtake = false; this.cool = 0;
    this.arm = { phase: 'idle', t: 0, ball: null, angle: ROBOT.arm.rest };
    this.disabled = false;
    this.updateFrame();
  }

  get count() { return this.queue.length + (this.arm.ball ? 1 : 0); }

  updateFrame() {
    const yaw = yawOf(this.body.quaternion);
    this.yaw = yaw;
    this.fwd.set(Math.cos(yaw), 0, -Math.sin(yaw));
    this.right.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.pos.set(this.body.position.x, 0, this.body.position.z);
  }

  local(lx, ly, lz, out = new THREE.Vector3()) {
    return out.copy(this.pos).addScaledVector(this.fwd, lx * IN).addScaledVector(this.right, lz * IN).setY(ly * IN);
  }

  /** Velocity control, called every physics sub-step. */
  control(h, inp, basis, mode) {
    this.updateFrame();
    let x = 0, y = 0, turn = 0, slow = false;
    if (!this.disabled && inp) { x = inp.x; y = inp.y; turn = inp.turn; slow = inp.slow; }
    const F = mode === 'robot' ? this.fwd : basis.fwd;
    const R = mode === 'robot' ? this.right : basis.right;
    let vx = F.x * x + R.x * y, vz = F.z * x + R.z * y;
    const len = Math.hypot(vx, vz);
    if (len > 1) { vx /= len; vz /= len; }
    const vmax = ROBOT.maxSpeed * (slow ? ROBOT.slowFactor : 1);
    vx *= vmax; vz *= vmax;
    const b = this.body;
    let dx = vx - b.velocity.x, dz = vz - b.velocity.z;
    const dl = Math.hypot(dx, dz), lim = ROBOT.accel * h;
    if (dl > lim) { dx *= lim / dl; dz *= lim / dl; }
    b.velocity.x += dx; b.velocity.z += dz; b.velocity.y = 0;
    const wdes = turn * ROBOT.maxTurn * (slow ? 0.45 : 1);
    const dw = clamp(wdes - b.angularVelocity.y, -ROBOT.turnAccel * h, ROBOT.turnAccel * h);
    b.angularVelocity.set(0, b.angularVelocity.y + dw, 0);
    b.position.y = this.bodyY;
  }

  // ---- actions -------------------------------------------------------
  toggleIntake() { if (!this.disabled) this.intakeOn = !this.intakeOn; }
  toggleAuto() { this.auto = !this.auto; }
  // In auto-aim the keys trim the solved shot; in manual they set the shot directly.
  adjPower(d) {
    const step = d * ROBOT.power.step;
    if (this.auto) this.powerOff = +(this.powerOff + step).toFixed(2);
    else this.power = clamp(+(this.power + step).toFixed(2), ROBOT.power.min, ROBOT.power.max);
  }
  adjHood(d) {
    const step = d * ROBOT.hood.step;
    if (this.auto) this.hoodOff += step;
    else this.hood = clamp(this.hood + step, ROBOT.hood.min, ROBOT.hood.max);
  }
  cycle() { if (this.queue.length > 1) this.queue.push(this.queue.shift()); }

  shoot() {
    if (this.disabled || this.cool > 0 || !this.queue.length || !this.aim) return false;
    const b = this.queue.shift();
    this.ctx.balls.place(b, this.aim.exit, this.aim.vel);
    b.noCapture = 0.8;
    this.cool = ROBOT.shootCooldown;
    this.ctx.sound?.launch();
    return true;
  }

  armDrop() {
    if (this.disabled || this.arm.phase !== 'idle' || !this.queue.length) return;
    const b = this.queue.shift();
    this.arm = { phase: 'load', t: 0, ball: b, angle: ROBOT.arm.rest, from: b.mesh.position.clone() };
  }

  armEnd(angleDeg, out = new THREE.Vector3()) {
    const A = ROBOT.arm, a = angleDeg * Math.PI / 180;
    return this.local(A.pivotX + A.length * Math.cos(a), A.pivotY + A.length * Math.sin(a) + 1.2, 0, out);
  }

  /** Per-frame logic: intake capture, outtake, arm sequencing, aiming, visuals. */
  update(dt, held, hive, flowers, settings, notify) {
    this.updateFrame();
    const balls = this.ctx.balls;
    this.cool = Math.max(0, this.cool - dt);
    this.rejectTimer = Math.max(0, this.rejectTimer - dt);
    this.outtake = !this.disabled && held.outtake;

    // --- intake (G407 capacity, G408 color sensor) ---
    if (this.intakeOn && !this.outtake && !this.disabled) {
      const I = ROBOT.intake;
      let woke = false;
      for (const b of balls.balls) {
        if (b.state !== 'field' || b.noCapture > 0) continue;
        const p = b.body.position;
        const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
        const lx = (dx * this.fwd.x + dz * this.fwd.z) / IN;
        if (lx < I.x0 - 1 || lx > I.pullX1) continue;
        const lz = (dx * this.right.x + dz * this.right.z) / IN;
        const y = p.y / IN;
        if (Math.abs(lz) > I.pullHalfZ || y > I.pullY + b.r) continue;
        const opp = b.kind === 'N' && b.color !== this.alliance;
        if (opp) {
          if (lx < I.x1 && Math.abs(lz) < I.halfZ) {
            b.body.velocity.x += this.fwd.x * 0.25; b.body.velocity.z += this.fwd.z * 0.25; b.body.wakeUp();
            if (this.rejectTimer <= 0) { notify?.('Color sensor: opponent NECTAR rejected', this.alliance); this.rejectTimer = 3; }
          }
          continue;
        }
        const inCapture = lx >= I.x0 && lx <= I.x1 && Math.abs(lz) <= I.halfZ && y <= I.maxY + (b.r - 1.4);
        if (inCapture && this.count < ROBOT.capacity) {
          b.from = b.mesh.position.clone();
          b.anim = 0;
          balls.lift(b, 'held', this);
          this.queue.push(b);
          if (!woke) { balls.wakeAll(); woke = true; }
          this.ctx.sound?.intake();
        } else if (this.count < ROBOT.capacity) {
          // roller draws elements in
          const tx = this.pos.x + this.fwd.x * 10 * IN, tz = this.pos.z + this.fwd.z * 10 * IN;
          const ux = tx - p.x, uz = tz - p.z, ul = Math.hypot(ux, uz) || 1;
          b.body.velocity.x += ux / ul * I.pullAccel * dt;
          b.body.velocity.z += uz / ul * I.pullAccel * dt;
          b.body.wakeUp();
        }
      }
    }

    // --- outtake (hold) ---
    this.outTimer -= dt;
    if (this.outtake && this.outTimer <= 0 && this.queue.length) {
      const b = this.queue.shift();
      const p = this.local(12.8, 2.3, 0);
      const v = this.fwd.clone().multiplyScalar(1.4).add(new THREE.Vector3(this.body.velocity.x, 0, this.body.velocity.z));
      balls.place(b, p, v);
      b.noCapture = 0.9;
      this.outTimer = 0.25;
    }

    // --- FLOWER arm ---
    const A = ROBOT.arm, arm = this.arm;
    if (arm.phase !== 'idle') {
      arm.t += dt;
      if (arm.phase === 'load') {
        arm.angle = A.rest;
        const k = Math.min(1, arm.t / 0.18);
        arm.ball.mesh.position.lerpVectors(arm.from, this.armEnd(A.rest), smooth(k));
        if (k >= 1) { arm.phase = 'extend'; arm.t = 0; }
      } else if (arm.phase === 'extend') {
        const k = Math.min(1, arm.t / 0.35);
        arm.angle = lerp(A.rest, A.out, smooth(k));
        arm.ball.mesh.position.copy(this.armEnd(arm.angle));
        if (k >= 1) {
          const p = this.armEnd(A.out);
          let best = null, bd = A.funnel * IN;
          for (const f of flowers) {
            const d = Math.hypot(f.axis.x - p.x, f.axis.z - p.z);
            if (d < bd) { bd = d; best = f; }
          }
          if (best) { p.x = best.axis.x; p.z = best.axis.z; p.y = Math.max(p.y, best.topPoint().y); }
          balls.place(arm.ball, p, new THREE.Vector3(0, -0.2, 0));
          arm.ball.noCapture = 1.2;
          arm.ball = null;
          arm.phase = 'return'; arm.t = 0;
        }
      } else if (arm.phase === 'return') {
        const k = Math.min(1, arm.t / 0.3);
        arm.angle = lerp(A.out, A.rest, smooth(k));
        if (k >= 1) arm.phase = 'idle';
      }
    }
    if (this.disabled && arm.phase === 'idle') arm.angle = A.rest;

    // --- aim ---
    this.computeAim(hive, settings);

    // --- visuals ---
    this.group.position.set(this.body.position.x, 0, this.body.position.z);
    this.group.rotation.y = this.yaw;
    const speed = Math.hypot(this.body.velocity.x, this.body.velocity.z);
    this.wheelSpin += (speed / (2.05 * IN)) * dt * (this.body.velocity.x * this.fwd.x + this.body.velocity.z * this.fwd.z >= 0 ? 1 : -1);
    for (const w of this.wheels) w.rotation.y = -this.wheelSpin;
    if (this.intakeOn || this.outtake) this.rollerSpin += dt * (this.outtake ? -18 : 18);
    this.roller.rotation.y = this.rollerSpin;
    this.flywheel.rotation.y += dt * (this.queue.length ? 40 : 8);
    this.hoodPivot.rotation.z = (this.aim ? this.aim.hood : this.hood) * Math.PI / 180 - Math.PI / 4;
    this.armPivot.rotation.z = arm.angle * Math.PI / 180;
    const tmp = new THREE.Vector3();
    this.queue.forEach((b, i) => {
      const tgt = this.local(SLOT_X[i], 9.1 + b.r, 0, tmp);
      if (b.anim !== undefined && b.anim < 1) {
        b.anim = Math.min(1, b.anim + dt / 0.16);
        b.mesh.position.lerpVectors(b.from, tgt, smooth(b.anim));
      } else b.mesh.position.copy(tgt);
    });

    // trajectory preview
    const show = settings.arc && this.queue.length > 0 && !this.disabled && this.aim;
    this.preview.visible = !!show;
    if (show) {
      trajectory(this.aim.exit, this.aim.vel, this.previewPts);
      const arr = this.preview.geometry.attributes.position.array;
      const n = Math.min(this.previewPts.length, 400);
      for (let i = 0; i < n; i++) { const q = this.previewPts[i]; arr[i * 3] = q.x; arr[i * 3 + 1] = q.y; arr[i * 3 + 2] = q.z; }
      this.preview.geometry.attributes.position.needsUpdate = true;
      this.preview.geometry.setDrawRange(0, n);
      this.preview.computeLineDistances();
    }
    this.targetMarker.visible = this.auto && !this.disabled && !!this.aim;
    if (this.targetMarker.visible && this.aim.target) {
      this.targetMarker.position.copy(this.aim.target.point);
      this.targetMarker.lookAt(this.aim.target.point.clone().add(this.aim.target.normal));
    }
  }

  computeAim(hive, settings) {
    const exit = this.local(ROBOT.shooterExit.x, ROBOT.shooterExit.y, 0);
    const target = hive && hive.state === 'stable' ? hive.target() : null;
    let hood = this.hood, speed = this.power, reachable = true;
    if (this.auto && target) {
      const s = solveShot(exit, target.point, ROBOT);
      hood = clamp(Math.round(s.hood) + this.hoodOff, ROBOT.hood.min, ROBOT.hood.max);
      speed = clamp(s.speed + this.powerOff, ROBOT.power.min, ROBOT.power.max);
      reachable = s.reachable;
    }
    const th = hood * Math.PI / 180;
    const vel = this.fwd.clone().multiplyScalar(speed * Math.cos(th)).addScaledVector(up, speed * Math.sin(th));
    vel.x += this.body.velocity.x; vel.z += this.body.velocity.z;
    let err = null, wrongSide = false;
    if (target) {
      const dx = target.point.x - exit.x, dz = target.point.z - exit.z;
      err = Math.atan2(dx * this.right.x + dz * this.right.z, dx * this.fwd.x + dz * this.fwd.z) * 180 / Math.PI;
      const nx = target.normal.x, nz = target.normal.z;
      wrongSide = (exit.x - target.point.x) * nx + (exit.z - target.point.z) * nz < 0;
    }
    this.aim = { exit, vel, hood, speed, err, wrongSide, reachable, target };
  }

  /** PARK: at least partially inside own LOADING ZONE (§10.5.4). */
  parked() {
    const r = ZONES[this.alliance].loadingZone;
    for (let i = -9; i <= 9; i += 3) for (let j = -9; j <= 9; j += 3) {
      const p = this.local(i, 0, j, _p);
      if (inRectM(p.x, p.z, r)) return true;
    }
    return false;
  }

  dispose() {
    this.ctx.world.removeBody(this.body);
    this.ctx.scene.remove(this.group, this.preview, this.targetMarker);
  }
}
const _p = new THREE.Vector3();
