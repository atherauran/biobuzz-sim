import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { IN, ELEMENTS, FIELD } from '../config.js';
import { materials } from './physics.js';
import { ballTexture } from './textures.js';

const geo = {
  P: new THREE.SphereGeometry(ELEMENTS.pollen.radius * IN, 24, 16),
  N: new THREE.SphereGeometry(ELEMENTS.nectar.radius * IN, 24, 16),
};
const mat = {
  Y: new THREE.MeshStandardMaterial({ map: ballTexture(ELEMENTS.pollen.color), roughness: 0.55 }),
  red: new THREE.MeshStandardMaterial({ map: ballTexture(ELEMENTS.nectar.red), roughness: 0.5 }),
  blue: new THREE.MeshStandardMaterial({ map: ballTexture(ELEMENTS.nectar.blue), roughness: 0.5 }),
};

let nextId = 1;

/**
 * A SCORING ELEMENT. `state` is one of:
 *   'field'  – simulated rigid body on the FIELD
 *   'held'   – CONTROLLED inside a robot (body removed from the world)
 *   'supply' – NECTAR waiting with the human player (shown on the HUD only)
 *   'out'    – left the FIELD, waiting to be reintroduced
 */
export class Ball {
  constructor(kind, color) {
    this.id = nextId++;
    this.kind = kind;                 // 'P' pollen | 'N' nectar
    this.color = color;               // null for pollen, 'red' | 'blue' for nectar
    const spec = kind === 'P' ? ELEMENTS.pollen : ELEMENTS.nectar;
    this.r = spec.radius;
    this.body = new CANNON.Body({
      mass: spec.mass, material: materials.ball, shape: new CANNON.Sphere(spec.radius * IN),
      linearDamping: ELEMENTS.linearDamping, angularDamping: ELEMENTS.angularDamping,
      sleepSpeedLimit: 0.04, sleepTimeLimit: 0.6,
    });
    this.mesh = new THREE.Mesh(geo[kind], mat[kind === 'P' ? 'Y' : color]);
    this.mesh.castShadow = true;
    this.state = 'none';
    this.holder = null;
    this.noCapture = 0;
    this.outTimer = 0;
    this.inFlower = -1;               // index of FLOWER whose scoring volume it is in (for G410)
  }
  get slotKey() { return this.kind === 'P' ? 'Y' : this.color === 'red' ? 'R' : 'B'; }
}

export class BallSystem {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.balls = [];
    // 40 POLLEN, 8 red + 8 blue NECTAR (§9.8)
    for (let i = 0; i < 40; i++) this.balls.push(new Ball('P', null));
    for (let i = 0; i < 8; i++) this.balls.push(new Ball('N', 'red'));
    for (let i = 0; i < 8; i++) this.balls.push(new Ball('N', 'blue'));
    for (const b of this.balls) scene.add(b.mesh);
  }

  place(b, pos, vel = null) {
    if (b.state !== 'field') this.world.addBody(b.body);
    b.state = 'field';
    b.holder = null;
    b.body.position.set(pos.x, pos.y, pos.z);
    b.body.velocity.set(vel ? vel.x : 0, vel ? vel.y : 0, vel ? vel.z : 0);
    b.body.angularVelocity.set(0, 0, 0);
    b.body.wakeUp();
    b.mesh.visible = true;
  }

  lift(b, state, holder = null) {
    if (b.state === 'field') this.world.removeBody(b.body);
    b.state = state;
    b.holder = holder;
    if (state === 'supply') b.mesh.visible = false;
  }

  onField() { return this.balls.filter((b) => b.state === 'field'); }

  /** Remove everything from the world (used by reset). */
  clear() {
    for (const b of this.balls) { this.lift(b, 'none'); b.inFlower = -1; b.noCapture = 0; }
  }

  wakeAll() { for (const b of this.balls) if (b.state === 'field') b.body.wakeUp(); }

  /** Handle elements that left the FIELD (§10.8.2). Returns list of NECTAR returned to drive teams. */
  checkOut(dt, pollenDropPoint) {
    const lim = (FIELD.half + 1.5) * IN;
    const returned = [];
    for (const b of this.balls) {
      if (b.state === 'field') {
        const p = b.body.position;
        if (Math.abs(p.x) > lim || Math.abs(p.z) > lim || p.y < -0.05) {
          if (b.kind === 'N') { this.lift(b, 'supply'); returned.push(b); }
          else { this.lift(b, 'out'); b.outTimer = 2.5; b.mesh.visible = false; b.lastX = p.x; b.lastZ = p.z; }
        }
      } else if (b.state === 'out') {
        b.outTimer -= dt;
        if (b.outTimer <= 0) this.place(b, pollenDropPoint(b.lastX, b.lastZ));
      }
      if (b.noCapture > 0) b.noCapture -= dt;
    }
    return returned;
  }

  sync() {
    for (const b of this.balls) {
      if (b.state === 'field') {
        b.mesh.position.copy(b.body.position);
        b.mesh.quaternion.copy(b.body.quaternion);
      }
    }
  }
}
