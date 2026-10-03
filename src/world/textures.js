import * as THREE from 'three';
import { FIELD, ZONES } from '../config.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Whole-field TILE texture incl. seams, interlock tabs and tape (loading zones, gardens). */
export function fieldTexture() {
  const S = 2048, half = FIELD.half, px = S / (half * 2);
  const [c, g] = canvas(S, S);
  const X = (x) => (x + half) * px, Z = (z) => (z + half) * px;
  // tiles with slight tonal variation + foam grain
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    const v = 92 + Math.floor(rnd() * 10);
    g.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    g.fillRect(i * 24 * px, j * 24 * px, 24 * px, 24 * px);
  }
  const img = g.getImageData(0, 0, S, S);
  for (let k = 0; k < img.data.length; k += 4) {
    const n = (rnd() - 0.5) * 14;
    img.data[k] += n; img.data[k + 1] += n; img.data[k + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // seams with interlock tabs
  g.strokeStyle = 'rgba(30,32,36,0.85)';
  g.lineWidth = 3;
  const tabs = (horizontal, pos) => {
    g.beginPath();
    const n = 36, len = S / n, t = 0.5 * px * 1.4;
    for (let k = 0; k < n; k++) {
      const a = k * len, b = a + len * 0.3, cc = a + len * 0.7, d = a + len;
      const off = (k % 2 ? 1 : -1) * t;
      if (horizontal) {
        g.moveTo(a, pos); g.lineTo(b, pos); g.lineTo(b, pos + off); g.lineTo(cc, pos + off); g.lineTo(cc, pos); g.lineTo(d, pos);
      } else {
        g.moveTo(pos, a); g.lineTo(pos, b); g.lineTo(pos + off, b); g.lineTo(pos + off, cc); g.lineTo(pos, cc); g.lineTo(pos, d);
      }
    }
    g.stroke();
  };
  for (let k = 1; k < 6; k++) { tabs(true, k * 24 * px); tabs(false, k * 24 * px); }
  // tape
  const tapeRed = '#cf2a2f', tapeBlue = '#1f5ad6', w = 1 * px;
  const lz = (r, col, inward) => {
    g.fillStyle = col;
    g.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * px, w);            // rear edge
    g.fillRect(X(r.x0), Z(r.z1) - w, (r.x1 - r.x0) * px, w);        // audience edge
    const xi = inward > 0 ? X(r.x1) - w : X(r.x0);
    g.fillRect(xi, Z(r.z0), w, (r.z1 - r.z0) * px);                 // field-side edge
  };
  lz(ZONES.red.loadingZone, tapeRed, 1);
  lz(ZONES.blue.loadingZone, tapeBlue, -1);
  const gd = (r, col) => { g.fillStyle = col; g.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * px, (r.z1 - r.z0) * px); };
  gd(ZONES.red.garden, tapeRed);
  gd(ZONES.blue.garden, tapeBlue);
  // faint tile coordinates like Fig 9-5 (A–F / 1–6) for orientation
  g.fillStyle = 'rgba(255,255,255,0.07)';
  g.font = `600 ${3.2 * px}px "IBM Plex Sans", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    g.fillText('ABCDEF'[i] + (6 - j), (i * 24 + 12) * px, (j * 24 + 12) * px);
  }
  return tex(c, { aniso: 16 });
}

/** Wiffle-ball texture: solid color with darker holes. */
export function ballTexture(hex) {
  const [c, g] = canvas(256, 128);
  const col = new THREE.Color(hex);
  g.fillStyle = `#${col.getHexString()}`;
  g.fillRect(0, 0, 256, 128);
  const dark = col.clone().multiplyScalar(0.35);
  g.fillStyle = `#${dark.getHexString()}`;
  const rows = [22, 64, 106];
  rows.forEach((y, ri) => {
    const n = ri === 1 ? 8 : 6;
    for (let k = 0; k < n; k++) {
      const x = (k + (ri % 2 ? 0 : 0.5)) * (256 / n);
      g.beginPath();
      g.ellipse(x, y, ri === 1 ? 9 : 7, ri === 1 ? 10 : 7, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
  return tex(c);
}

export function bannerTexture() {
  const [c, g] = canvas(1024, 256);
  g.fillStyle = '#f3d23a'; g.fillRect(0, 0, 1024, 256);
  // honeycomb band
  g.strokeStyle = 'rgba(160,110,0,0.55)'; g.lineWidth = 5;
  const hex = (x, y, r) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i + Math.PI / 6; g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); } g.closePath(); g.stroke(); };
  for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) hex(30 + i * 44 + (j % 2) * 22, 30 + j * 38, 22);
  g.fillStyle = '#141414';
  g.font = '900 128px "Big Shoulders Display", Impact, sans-serif';
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('BIOBUZZ', 300, 132);
  g.font = '600 28px "IBM Plex Sans", sans-serif';
  g.fillText('FIRST TECH CHALLENGE 2026–27', 305, 218);
  return tex(c);
}

export function plateTexture(text, color) {
  const [c, g] = canvas(512, 128);
  g.fillStyle = color; g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#ffffff';
  g.font = '900 96px "Big Shoulders Display", Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  return tex(c);
}

/** AprilTag-like cluster sticker (4 tags). Patterns are decorative, not real 36h11 codes. */
export function aprilTexture(ids, stripe) {
  const [c, g] = canvas(512, 160);
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 512, 160);
  g.fillStyle = stripe; g.fillRect(0, 138, 512, 22);
  const xs = [30, 140, 262, 372];
  xs.forEach((x, k) => {
    let s = ids[k] * 9301 + 49297;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    g.fillStyle = '#000'; g.fillRect(x, 20, 110, 110);
    g.fillStyle = '#fff';
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) if (r() > 0.5) g.fillRect(x + 13.75 + i * 13.75, 20 + 13.75 + j * 13.75, 13.75, 13.75);
    g.fillStyle = '#fff'; g.font = '600 14px sans-serif'; g.fillText('ID ' + ids[k], x + 40, 153);
  });
  return tex(c);
}

export function venueFloorTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#23262c'; g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512);
  for (let k = 0; k < img.data.length; k += 4) {
    const n = (Math.random() - 0.5) * 10;
    img.data[k] += n; img.data[k + 1] += n; img.data[k + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const t = tex(c, { repeat: true });
  t.repeat.set(12, 12);
  return t;
}

export function rollerTexture(base, stripe) {
  const [c, g] = canvas(128, 64);
  g.fillStyle = base; g.fillRect(0, 0, 128, 64);
  g.fillStyle = stripe;
  for (let i = 0; i < 8; i++) g.fillRect(i * 16, 0, 6, 64);
  const t = tex(c, { repeat: true });
  return t;
}
