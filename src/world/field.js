import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { IN, FIELD, ZONES } from '../config.js';
import { materials, addBox } from './physics.js';
import { fieldTexture, venueFloorTexture } from './textures.js';
import { mergeStatic } from '../util.js';

export const mats = {
  alu: new THREE.MeshStandardMaterial({ color: 0xb9bec6, metalness: 0.65, roughness: 0.35 }),
  darkAlu: new THREE.MeshStandardMaterial({ color: 0x3a3e45, metalness: 0.5, roughness: 0.5 }),
  poly: new THREE.MeshStandardMaterial({ color: 0xdfe8f0, transparent: true, opacity: 0.12, roughness: 0.1, metalness: 0, side: THREE.DoubleSide, depthWrite: false }),
  black: new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.7 }),
};

/** TILES, perimeter, venue floor, ALLIANCE AREA tape. */
export function buildField(scene, world) {
  const H = FIELD.half;
  // TILES
  const tiles = new THREE.Mesh(
    new THREE.PlaneGeometry(H * 2 * IN, H * 2 * IN),
    new THREE.MeshStandardMaterial({ map: fieldTexture(), roughness: 0.95 }),
  );
  tiles.rotation.x = -Math.PI / 2;
  tiles.position.y = 0.0005;
  tiles.receiveShadow = true;
  scene.add(tiles);

  // venue floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ map: venueFloorTexture(), roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.004;
  floor.receiveShadow = true;
  scene.add(floor);

  const grp = new THREE.Group();
  scene.add(grp);

  // ALLIANCE AREA tape (2" lines, three sides; the fourth is the perimeter)
  for (const side of ['red', 'blue']) {
    const r = ZONES[side].allianceArea;
    const m = new THREE.MeshBasicMaterial({ color: side === 'red' ? 0xcf2a2f : 0x1f5ad6 });
    const outerX = side === 'red' ? r.x0 : r.x1;
    const strip = (x0, z0, x1, z1) => {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(Math.abs(x1 - x0), 2) * IN, Math.max(Math.abs(z1 - z0), 2) * IN), m);
      g.rotation.x = -Math.PI / 2;
      g.position.set((x0 + x1) / 2 * IN, -0.002, (z0 + z1) / 2 * IN);
      grp.add(g);
    };
    strip(r.x0, r.z0, r.x1, r.z0);
    strip(r.x0, r.z1, r.x1, r.z1);
    strip(outerX, r.z0, outerX, r.z1);
  }

  // perimeter walls: colliders + polycarbonate panels with aluminum rails
  const walls = new CANNON.Body({ mass: 0, material: materials.field });
  const t = FIELD.wallThickness, h = FIELD.wallHeight;
  const L = H + t;
  addBox(walls, [0, h / 2, -H - t / 2], [L, h / 2, t / 2]);
  addBox(walls, [0, h / 2, H + t / 2], [L, h / 2, t / 2]);
  addBox(walls, [-H - t / 2, h / 2, 0], [t / 2, h / 2, L]);
  addBox(walls, [H + t / 2, h / 2, 0], [t / 2, h / 2, L]);
  world.addBody(walls);

  const railM = { material: mats.darkAlu, parent: grp };
  const panelM = { material: mats.poly, parent: grp, cast: false };
  const sides = [
    { c: [0, -H - t / 2], along: 'x' }, { c: [0, H + t / 2], along: 'x' },
    { c: [-H - t / 2, 0], along: 'z' }, { c: [H + t / 2, 0], along: 'z' },
  ];
  const dummy = new CANNON.Body();
  for (const s of sides) {
    const hx = s.along === 'x' ? L : t / 2, hz = s.along === 'x' ? t / 2 : L;
    addBox(dummy, [s.c[0], h - 0.75, s.c[1]], [hx, 0.75, hz], null, railM);          // top rail
    addBox(dummy, [s.c[0], 0.75, s.c[1]], [hx, 0.75, hz], null, railM);              // bottom rail
    addBox(dummy, [s.c[0], h / 2, s.c[1]], [s.along === 'x' ? L : 0.1, h / 2 - 1.5, s.along === 'x' ? 0.1 : L], null, panelM);
    for (let k = -3; k <= 3; k++) {                                                   // posts
      const p = k * 24;
      const cx = s.along === 'x' ? p : s.c[0], cz = s.along === 'x' ? s.c[1] : p;
      addBox(dummy, [cx, h / 2, cz], [1, h / 2, 1], null, railM);
    }
  }
  mergeStatic(grp);
}
