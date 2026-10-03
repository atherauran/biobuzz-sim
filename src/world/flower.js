import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { IN, FLOWER } from '../config.js';
import { materials, addBox, addRing } from './physics.js';
import { mats } from './field.js';
import { mergeStatic } from '../util.js';

const gold = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.3, roughness: 0.4 });
const green = new THREE.MeshStandardMaterial({ color: 0x3f9b3a, roughness: 0.45 });
const purple = new THREE.MeshStandardMaterial({ color: 0x7a3fb0, roughness: 0.5 });

function ringMesh(rin, rout, thick, mat) {
  const s = new THREE.Shape();
  s.absarc(0, 0, rout * IN, 0, Math.PI * 2, false);
  const h = new THREE.Path();
  h.absarc(0, 0, rin * IN, 0, Math.PI * 2, true);
  s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick * IN, bevelEnabled: false, curveSegments: 28 });
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/**
 * FLOWER: POLLEN and NECTAR drop in through the 4" top ring and stack in the
 * tube. The middle ring passes POLLEN (2.8") but stops NECTAR (3.6"), so only
 * POLLEN can reach the retrieval opening at the bottom (§9.7, G418).
 */
export class Flower {
  constructor(scene, world, def, index) {
    const F = FLOWER;
    this.index = index;
    this.n = new THREE.Vector2(def.nx, def.nz);
    this.ax = def.x + def.nx * F.wallOffset;
    this.az = def.z + def.nz * F.wallOffset;
    this.axis = new THREE.Vector3(this.ax * IN, 0, this.az * IN);
    const body = new CANNON.Body({ mass: 0, material: materials.field });
    const grp = new THREE.Group();
    scene.add(grp);
    const { ax, az } = this;
    const midTop = F.midRingBottom + F.midRingThick;
    const topBottom = F.topRingTop - F.topRingThick;

    addRing(body, ax, az, 0, F.bottomRingThick, F.bottomRingInner, F.bottomRingOuter);
    addRing(body, ax, az, F.midRingBottom, F.midRingThick, F.midRingInner, F.midRingOuter);
    addRing(body, ax, az, topBottom, F.topRingThick, F.topRingInner, F.topRingOuter);
    // tube: 8 invisible panels so elements stack inside
    const seg = 8, rp = F.tubeInner + 0.25, tubeH = topBottom - midTop;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      addBox(body, [ax + Math.cos(a) * rp, midTop + tubeH / 2, az + Math.sin(a) * rp], [0.25, tubeH / 2, rp * Math.tan(Math.PI / seg) * 1.1], q);
    }
    // square extrusion on the wall side joining lower and middle rings
    const px = ax - def.nx * 3.4, pz = az - def.nz * 3.4;
    addBox(body, [px, midTop / 2, pz], [0.6, midTop / 2, 0.6], null, { material: mats.alu, parent: grp });
    // backstop above the top ring on the wall side
    const qa = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(def.nz, def.nx));
    addBox(body, [ax - def.nx * 3.0, F.topRingTop + F.backstopHeight / 2, az - def.nz * 3.0], [0.3, F.backstopHeight / 2, 2.4], qa, { material: purple, parent: grp });
    world.addBody(body);

    // visuals
    const place = (m, y) => { m.position.set(ax * IN, y * IN, az * IN); grp.add(m); };
    place(ringMesh(F.bottomRingInner, F.bottomRingOuter, F.bottomRingThick, mats.black), 0);
    place(ringMesh(F.midRingInner, F.midRingOuter, F.midRingThick, mats.black), F.midRingBottom);
    place(ringMesh(F.topRingInner, F.topRingOuter, F.topRingThick, gold), topBottom);
    const ang0 = Math.atan2(def.nz, def.nx);
    for (let k = 0; k < 4; k++) {
      const a = ang0 + Math.PI / 4 + k * Math.PI / 2;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * IN, 0.55 * IN, tubeH * IN, 14), green);
      p.position.set((ax + Math.cos(a) * 2.75) * IN, (midTop + tubeH / 2) * IN, (az + Math.sin(a) * 2.75) * IN);
      p.castShadow = true;
      grp.add(p);
    }
    mergeStatic(grp);
    this.midTop = midTop;
  }

  /** Elements at least partially inside the FLOWER scoring volume (top ring → middle ring). */
  contents(balls) {
    const out = [];
    for (const b of balls) {
      if (b.state !== 'field') continue;
      const p = b.body.position;
      const dx = p.x / IN - this.ax, dz = p.z / IN - this.az;
      if (dx * dx + dz * dz > 2.5 * 2.5) continue;
      const y = p.y / IN;
      if (y > this.midTop && y - b.r < FLOWER.topRingTop) out.push(b);
    }
    out.sort((a, b) => a.body.position.y - b.body.position.y);
    return out;
  }

  /** Scoring for this FLOWER: owner (top-most NECTAR) and bottom-NECTAR alliance. */
  evaluate(balls) {
    const list = this.contents(balls);
    const nectar = list.filter((b) => b.kind === 'N');
    return {
      count: list.length,
      owner: nectar.length ? nectar[nectar.length - 1].color : null,
      bottom: nectar.length ? nectar[0].color : null,
      list,
    };
  }

  topPoint() { return new THREE.Vector3(this.ax * IN, (FLOWER.topRingTop + 2.6) * IN, this.az * IN); }
}
