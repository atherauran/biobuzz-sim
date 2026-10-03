import * as THREE from 'three';
import { G, ELEMENTS } from '../config.js';
import { clamp } from '../util.js';

const DAMP = ELEMENTS.linearDamping;

/** Integrate a launched element the same way the physics engine does (gravity + linear damping, no contacts). */
export function trajectory(p0, v0, out, { dt = 1 / 120, maxT = 2.4, floor = 0.02 } = {}) {
  const p = p0.clone(), v = v0.clone();
  const k = Math.pow(1 - DAMP, dt);
  let n = 0;
  out[n++] = p.clone();
  for (let t = 0; t < maxT; t += dt) {
    v.y -= G * dt;
    v.multiplyScalar(k);
    p.addScaledVector(v, dt);
    out[n++] = p.clone();
    if (p.y < floor && v.y < 0) break;
  }
  out.length = n;
  return out;
}

/** Horizontal range at which a 2D shot descends through height h (or null). */
function rangeAt(speed, theta, h) {
  const dt = 1 / 240, k = Math.pow(1 - DAMP, dt);
  let s = 0, y = 0, vx = speed * Math.cos(theta), vy = speed * Math.sin(theta);
  for (let t = 0; t < 3; t += dt) {
    const py = y, ps = s;
    vy -= G * dt; vx *= k; vy *= k;
    s += vx * dt; y += vy * dt;
    if (vy < 0 && y <= h && py > h) return ps + (s - ps) * ((py - h) / (py - y));
    if (y < -1) return null;
  }
  return null;
}

/**
 * Solve hood angle + flywheel exit speed that drops the element into `target`
 * on its way down. Returns {hood (deg), speed (m/s), dist (m)}.
 */
export function solveShot(exit, target, limits) {
  const dx = target.x - exit.x, dz = target.z - exit.z;
  const d = Math.hypot(dx, dz);
  const h = target.y - exit.y;
  let hoodDeg = clamp(74 - 7.5 * d, 42, 72);
  let th = hoodDeg * Math.PI / 180;
  while (d * Math.tan(th) - h <= 0.05 && hoodDeg < limits.hood.max) { hoodDeg += 2; th = hoodDeg * Math.PI / 180; }
  const c = Math.cos(th);
  let v = Math.sqrt(Math.max(0.1, G * d * d / (2 * c * c * Math.max(0.02, d * Math.tan(th) - h))));
  for (let i = 0; i < 6; i++) {
    const r = rangeAt(v, th, h);
    if (!r) { v *= 1.1; continue; }
    v *= Math.sqrt(d / r);
  }
  return { hood: hoodDeg, speed: clamp(v, limits.power.min, limits.power.max), dist: d, reachable: v <= limits.power.max };
}
