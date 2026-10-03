import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { G, IN } from '../config.js';
import { toCQuat } from '../util.js';

export const materials = {
  ball: new CANNON.Material('ball'),
  field: new CANNON.Material('field'),
  robot: new CANNON.Material('robot'),
};

export function createWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.solver.iterations = 12;
  world.solver.tolerance = 1e-4;
  world.defaultContactMaterial.friction = 0.2;
  world.defaultContactMaterial.restitution = 0.2;

  const cm = (a, b, friction, restitution) =>
    world.addContactMaterial(new CANNON.ContactMaterial(a, b, {
      friction, restitution, contactEquationStiffness: 1e7, contactEquationRelaxation: 3,
    }));
  cm(materials.ball, materials.field, 0.35, 0.38);
  cm(materials.ball, materials.ball, 0.15, 0.3);
  cm(materials.ball, materials.robot, 0.25, 0.15);
  cm(materials.robot, materials.field, 0.0, 0.0);
  cm(materials.robot, materials.robot, 0.1, 0.0);

  // floor (TILES)
  const floor = new CANNON.Body({ mass: 0, material: materials.field });
  floor.addShape(new CANNON.Plane());
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);
  return world;
}

/**
 * Add a box collider (inches) to a body, optionally with a matching mesh
 * placed inside `group` (which should mirror the body transform).
 */
export function addBox(body, center, half, quat = null, mesh = null) {
  const shape = new CANNON.Box(new CANNON.Vec3(half[0] * IN, half[1] * IN, half[2] * IN));
  const off = new CANNON.Vec3(center[0] * IN, center[1] * IN, center[2] * IN);
  body.addShape(shape, off, quat ? toCQuat(quat) : undefined);
  if (mesh) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(half[0] * 2 * IN, half[1] * 2 * IN, half[2] * 2 * IN), mesh.material);
    m.position.set(center[0] * IN, center[1] * IN, center[2] * IN);
    if (quat) m.quaternion.copy(quat);
    m.castShadow = mesh.cast ?? true;
    m.receiveShadow = true;
    mesh.parent.add(m);
    return m;
  }
  return null;
}

/** Ring of tangent box segments (for FLOWER rings). */
export function addRing(body, cx, cz, y0, thick, rin, rout, segments = 12) {
  const rm = (rin + rout) / 2;
  const radial = (rout - rin) / 2;
  const tang = Math.PI * rm / segments * 1.12;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    addBox(body, [cx + Math.cos(a) * rm, y0 + thick / 2, cz + Math.sin(a) * rm], [radial, thick / 2, tang], q);
  }
}
