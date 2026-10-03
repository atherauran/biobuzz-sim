import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { IN, HIVE } from '../config.js';
import { materials, addBox } from './physics.js';
import { quatAlong, mergeStatic } from '../util.js';
import { bannerTexture, aprilTexture } from './textures.js';
import { mats } from './field.js';

const RIM = { red: 0xc9262c, blue: 0x2a5bd0 };

/** Static A-frame: two triangles joined by a crossbar at the apex (§9.6.1). */
export function buildFrame(scene, world) {
  const body = new CANNON.Body({ mass: 0, material: materials.field });
  const grp = new THREE.Group();
  scene.add(grp);
  const M = { material: mats.alu, parent: grp };
  const { pivotHeight: ph, frameHalfWidth: fw, frameHalfDepth: fd } = HIVE;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const top = new THREE.Vector3(sx * fw, ph, 0), foot = new THREE.Vector3(sx * fw, 0, sz * fd);
      const dir = top.clone().sub(foot);
      const mid = top.clone().add(foot).multiplyScalar(0.5);
      addBox(body, [mid.x, mid.y, mid.z], [0.7, dir.length() / 2, 0.7], quatAlong(dir), M);
    }
    addBox(body, [sx * fw, 0.7, 0], [0.9, 0.7, fd + 1], null, { material: mats.darkAlu, parent: grp });   // base bar
    addBox(body, [sx * fw, ph + 1.2, 0], [1.2, 1.6, 1.2], null, { material: mats.darkAlu, parent: grp }); // apex block
  }
  addBox(body, [0, ph + 2.6, 0], [fw + 1, 0.8, 0.8], null, M);                                          // crossbar
  // BIOBUZZ panels on both faces of the frame
  const bm = new THREE.MeshStandardMaterial({ map: bannerTexture(), roughness: 0.6 });
  for (const sz of [-1, 1]) {
    const b = addBox(body, [0, 38.5, sz * 3.2], [10.4, 2.6, 0.15], null, { material: bm, parent: grp });
    if (sz < 0) b.rotation.y = Math.PI;
  }
  world.addBody(body);
  mergeStatic(grp);
}

export class Hive {
  constructor(scene, world, alliance) {
    this.alliance = alliance;
    this.pivot = new THREE.Vector3((alliance === 'red' ? -1 : 1) * HIVE.hiveCenterX * IN, HIVE.pivotHeight * IN, 0);
    // Red starts with the audience-side CELL up, blue with the rear-side CELL up (Fig 10-2).
    this.phi = alliance === 'red' ? -HIVE.stableAngle : HIVE.stableAngle;
    this.state = 'stable';
    this.omega = 0; this.fillTimer = 0; this.tips = 0; this.fill = 0;
    this.onTip = null;

    // kinematic bodies with zero velocity fall asleep and stop integrating, so keep it awake
    this.body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: materials.field, allowSleep: false });
    this.body.position.set(this.pivot.x, this.pivot.y, this.pivot.z);
    this.setAngle(this.phi);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.build();
    mergeStatic(this.group);
    world.addBody(this.body);
    this.sync();
  }

  build() {
    const { cellHalfWidth: W, cellShoulder: sh, cellHeight: Hc, cellInner: zi, cellOuter: zo, floorOffset: y0 } = HIVE;
    const rimMat = new THREE.MeshStandardMaterial({ color: RIM[this.alliance], roughness: 0.45, metalness: 0.1 });
    const clear = new THREE.MeshStandardMaterial({ color: 0xeef3f8, transparent: true, opacity: 0.2, roughness: 0.15, side: THREE.DoubleSide, depthWrite: false });
    const b = this.body, g = this.group;
    const hz = (zo - zi) / 2;
    const Lr = Math.hypot(W, Hc - sh);
    // pentagon outline for rims / back wall
    const pent = (inset) => {
      const s = new THREE.Shape();
      s.moveTo(-W + inset, y0 + inset); s.lineTo(W - inset, y0 + inset); s.lineTo(W - inset, y0 + sh - inset * 0.4);
      s.lineTo(0, y0 + Hc - inset * 1.2); s.lineTo(-W + inset, y0 + sh - inset * 0.4); s.closePath();
      return s;
    };
    const rimShape = pent(0); rimShape.holes.push(pent(1.3));
    const rimGeo = new THREE.ExtrudeGeometry(rimShape, { depth: 0.8, bevelEnabled: false });
    rimGeo.translate(0, 0, -0.4); rimGeo.scale(IN, IN, IN);

    for (const s of [1, -1]) {
      const zc = s * (zi + zo) / 2;
      // colliders (1" thick walls)
      addBox(b, [0, y0 - 0.5, zc], [W + 0.5, 0.5, hz]);
      addBox(b, [W + 0.5, y0 + sh / 2, zc], [0.5, sh / 2, hz]);
      addBox(b, [-W - 0.5, y0 + sh / 2, zc], [0.5, sh / 2, hz]);
      for (const sx of [1, -1]) {
        const dx = -sx * W / Lr, dy = (Hc - sh) / Lr;                    // along the roof, shoulder → apex
        const nx = sx * (Hc - sh) / Lr, ny = W / Lr;                      // outward normal
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(dy, dx));
        addBox(b, [sx * W / 2 + nx * 0.5, y0 + (sh + Hc) / 2 + ny * 0.5, zc], [Lr / 2 + 0.6, 0.5, hz], q);
        // clear roof panel
        const p = new THREE.Mesh(new THREE.PlaneGeometry(Lr * IN, (zo - zi) * IN), clear);
        p.position.set(sx * W / 2 * IN, (y0 + (sh + Hc) / 2) * IN, zc * IN);
        p.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
        g.add(p);
      }
      addBox(b, [0, y0 + Hc / 2, s * (zi - 0.5)], [W + 1, Hc / 2 + 0.5, 0.5]);   // back wall
      // clear panels: floor + sides + back
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(2 * W * IN, (zo - zi) * IN), clear);
      fl.rotation.x = -Math.PI / 2; fl.position.set(0, y0 * IN, zc * IN); g.add(fl);
      for (const sx of [1, -1]) {
        const sp = new THREE.Mesh(new THREE.PlaneGeometry((zo - zi) * IN, sh * IN), clear);
        sp.rotation.y = Math.PI / 2; sp.position.set(sx * W * IN, (y0 + sh / 2) * IN, zc * IN); g.add(sp);
      }
      const back = new THREE.Mesh(new THREE.ShapeGeometry(pent(0)).scale(IN, IN, IN), clear);
      back.position.z = s * zi * IN; g.add(back);
      // rims at inner and outer ends
      for (const z of [zi, zo]) {
        const r = new THREE.Mesh(rimGeo, rimMat);
        r.position.z = s * z * IN; r.castShadow = true; g.add(r);
      }
      // corner rails along the prism
      for (const [x, y] of [[-W, y0], [W, y0], [-W, y0 + sh], [W, y0 + sh], [0, y0 + Hc]]) {
        const e = new THREE.Mesh(new THREE.BoxGeometry(0.7 * IN, 0.7 * IN, (zo - zi) * IN), rimMat);
        e.position.set(x * IN, y * IN, zc * IN); e.castShadow = true; g.add(e);
      }
      // AprilTag cluster on the underside of the CELL floor, facing the TILES (§9.9)
      const audience = (this.alliance === 'red') === (s > 0);
      const ids = this.alliance === 'red' ? (audience ? [34, 35, 36, 37] : [30, 31, 32, 33]) : (audience ? [38, 39, 40, 41] : [42, 43, 44, 45]);
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(16 * IN, 5 * IN), new THREE.MeshBasicMaterial({ map: aprilTexture(ids, this.alliance === 'red' ? '#c9262c' : '#2a5bd0') }));
      tag.rotation.x = Math.PI / 2; tag.position.set(0, (y0 - 1.05) * IN, s * (zi + 3) * IN);
      if (s < 0) tag.rotation.z = Math.PI;
      g.add(tag);
    }
    // arm + pivot bracket
    const M = { material: mats.alu, parent: g };
    addBox(b, [0, y0 - 2, 0], [0.9, 1, zi], null, M);
    addBox(new CANNON.Body(), [0, (y0 - 2) / 2, 0], [0.6, Math.abs(y0 - 2) / 2 + 0.6, 2.5], null, { material: mats.darkAlu, parent: g });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.4 * IN, 1.4 * IN, 3 * IN, 20), mats.darkAlu);
    hub.rotation.z = Math.PI / 2; g.add(hub);
  }

  /** Which CELL faces up: +1 → local +Z cell, -1 → local -Z cell. */
  get upSign() { return this.phi < 0 ? 1 : -1; }

  /** World (m) → hive local (inches). */
  toLocal(p, out = new THREE.Vector3()) {
    const q = this.body.quaternion;
    _q.set(-q.x, -q.y, -q.z, q.w);
    return out.set(p.x - this.pivot.x, p.y - this.pivot.y, p.z - this.pivot.z).applyQuaternion(_q).multiplyScalar(1 / IN);
  }

  toWorld(local) {
    const q = this.body.quaternion;
    return local.clone().multiplyScalar(IN).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w)).add(this.pivot);
  }

  /** Is a ball center (world, m) inside the upward CELL's interior? */
  inUpCell(p) {
    if (this.state !== 'stable') return false;
    const { cellHalfWidth: W, cellShoulder: sh, cellHeight: Hc, cellInner: zi, cellOuter: zo, floorOffset: y0 } = HIVE;
    const l = this.toLocal(p, _v);
    const z = l.z * this.upSign;
    if (z < zi || z > zo || Math.abs(l.x) > W || l.y < y0) return false;
    return l.y <= y0 + sh + (Hc - sh) * (1 - Math.abs(l.x) / W) + 0.5;
  }

  /** Aim point inside the upward CELL and its outward opening normal (world). */
  target() {
    const { cellOuter: zo, floorOffset: y0 } = HIVE;
    const s = this.upSign;
    const point = this.toWorld(new THREE.Vector3(0, y0 + 5, s * (zo - 4.5)));
    const q = this.body.quaternion;
    const normal = new THREE.Vector3(0, 0, s).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
    return { point, normal };
  }

  /** Called before each physics step. `balls` supplies the tip load. */
  preStep(h, balls, settings) {
    if (this.state === 'stable') {
      this.setAngle(this.phi);
      let f = 0;
      for (const b of balls) {
        if (b.state !== 'field') continue;
        if (this.inUpCell(b.body.position)) f += b.kind === 'N' ? 1 / settings.tipNectar : 1 / settings.tipPollen;
      }
      this.fill = f;
      if (f >= 0.999) {
        this.fillTimer += h;
        if (this.fillTimer > 0.3) this.startTip(balls);
      } else this.fillTimer = 0;
      return;
    }
    // Rocker driven by gravity: the loaded CELL pulls harder as it swings past the pivot,
    // then the arm hits the stop and bounces until it comes to rest.
    const { tipAccel, holdAccel, stopRestitution } = HIVE;
    const target = this.targetPhi, dir = this.dir;
    if (this.state === 'tipping') {
      const u = (this.phi - this.startPhi) * dir / (2 * HIVE.stableAngle);
      this.omega += dir * (tipAccel[0] + tipAccel[1] * u) * h;
    } else this.omega += dir * holdAccel * h;
    let next = this.phi + this.omega * h, w = this.omega;
    if ((next - target) * dir >= 0) {
      next = target;
      w = (target - this.phi) / h;
      this.omega = -this.omega * stopRestitution;
      if (this.state === 'tipping') {
        this.state = 'settling';
        this.tips++;
        this.onTip?.(this);
      }
      if (Math.abs(this.omega) < 0.2) { this.omega = 0; this.state = 'stable'; this.fillTimer = 0; }
    }
    this.setAngle(this.phi, w);
    this.phi = next;
  }

  /** Pose the body at `phi`; the step integrates it forward by `w`. */
  setAngle(phi, w = 0) {
    this.body.quaternion.setFromAxisAngle(_x, phi);
    this.body.angularVelocity.set(w, 0, 0);
    this.body.aabbNeedsUpdate = true;
  }

  startTip(balls) {
    this.state = 'tipping';
    this.startPhi = this.phi;
    this.dir = this.phi < 0 ? 1 : -1;
    this.targetPhi = -this.phi;
    this.omega = 0;
    this.fill = 0;
    for (const b of balls) if (b.state === 'field') b.body.wakeUp();
  }

  sync() {
    const q = this.body.quaternion;
    this.group.position.copy(this.pivot);
    this.group.quaternion.set(q.x, q.y, q.z, q.w);
  }

  reset() {
    this.phi = this.alliance === 'red' ? -HIVE.stableAngle : HIVE.stableAngle;
    this.state = 'stable'; this.omega = 0; this.fillTimer = 0; this.tips = 0; this.fill = 0;
    this.setAngle(this.phi);
    this.sync();
  }
}
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _x = new CANNON.Vec3(1, 0, 0);
