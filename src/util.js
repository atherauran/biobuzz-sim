import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { IN } from './config.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);

/** inches → THREE.Vector3 in meters */
export const vin = (x, y, z) => new THREE.Vector3(x * IN, y * IN, z * IN);
/** inches → CANNON.Vec3 in meters */
export const cin = (x, y, z) => new CANNON.Vec3(x * IN, y * IN, z * IN);

export const toCQuat = (q) => new CANNON.Quaternion(q.x, q.y, q.z, q.w);

/** Quaternion that rotates +Y onto a direction (for posts/legs). */
export function quatAlong(dir) {
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
}

/** Is point (x,z) in meters inside rect given in inches, with a margin in meters. */
export function inRectM(x, z, r, margin = 0) {
  return x >= r.x0 * IN - margin && x <= r.x1 * IN + margin && z >= r.z0 * IN - margin && z <= r.z1 * IN + margin;
}

/** Yaw (about +Y) of a CANNON quaternion that only rotates about Y. */
export const yawOf = (q) => 2 * Math.atan2(q.y, q.w);

export function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Merge a group's static child meshes into one mesh per material/shadow setting,
 * so each costs one draw call in the main and shadow passes. `keep` stays separate.
 */
export function mergeStatic(group, keep = []) {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const buckets = new Map();
  for (const m of [...group.children]) {
    if (!m.isMesh || keep.includes(m)) continue;
    const key = `${m.material.uuid}${m.castShadow}${m.receiveShadow}`;
    if (!buckets.has(key)) buckets.set(key, { m, geos: [] });
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    buckets.get(key).geos.push(g.applyMatrix4(_mat.multiplyMatrices(inv, m.matrixWorld)));
    group.remove(m);
  }
  for (const { m, geos } of buckets.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), m.material);
    mesh.castShadow = m.castShadow; mesh.receiveShadow = m.receiveShadow;
    group.add(mesh);
  }
}
const _mat = new THREE.Matrix4();
