import { IN, POINTS, ZONES, RP } from '../config.js';

const OTHER = { red: 'blue', blue: 'red' };

/** Is an element at least partially inside a GARDEN (infinitely tall volume, §10.5.3)? */
function inGarden(b, rect) {
  const p = b.body.position, r = b.r * IN;
  return p.x >= rect.x0 * IN - r && p.x <= rect.x1 * IN + r && p.z >= rect.z0 * IN - r && p.z <= rect.z1 * IN + r;
}

/**
 * Score both alliances from the current FIELD state (Table 10-2).
 * TIPS and fouls accumulate during the MATCH; everything else is a snapshot,
 * assessed for real once everything comes to rest after 0:00.
 */
export function computeScore({ hives, flowers, balls, robots, fouls }) {
  const s = {};
  for (const a of ['red', 'blue']) {
    s[a] = { tips: hives[a].tips, tipPts: hives[a].tips * POINTS.tip, cell: 0, cellPts: 0, flowerOwned: 0, flowerPts: 0,
      bottom: 0, bottomPts: 0, garden: 0, gardenPts: 0, park: 0, parkPts: 0, foulPts: fouls[OTHER[a]].points, fill: hives[a].fill };
  }
  const field = balls.balls.filter((b) => b.state === 'field');
  for (const a of ['red', 'blue']) {
    const hv = hives[a];
    for (const b of field) if (hv.inUpCell(b.body.position)) s[a].cell++;
    for (const b of field) if (inGarden(b, ZONES[a].garden)) s[a].garden++;
  }
  const flowerState = flowers.map((f) => f.evaluate(field));
  for (const fs of flowerState) {
    if (fs.owner) s[fs.owner].flowerOwned += fs.count;
    if (fs.bottom) s[fs.bottom].bottom++;
  }
  for (const r of robots) if (r.parked()) s[r.alliance].park++;
  for (const a of ['red', 'blue']) {
    const x = s[a];
    x.cellPts = x.cell * POINTS.cell;
    x.flowerPts = x.flowerOwned * POINTS.flowerOwned;
    x.bottomPts = x.bottom * POINTS.bottomNectar;
    x.gardenPts = x.garden * POINTS.garden;
    x.parkPts = x.park * POINTS.park;
    x.total = x.tipPts + x.cellPts + x.flowerPts + x.bottomPts + x.gardenPts + x.parkPts + x.foulPts;
  }
  s.flowers = flowerState;
  return s;
}

/** RANKING POINTS for the results screen (Table 10-3, "All Other Events"). */
export function rankingPoints(s, a) {
  const o = OTHER[a];
  const win = s[a].total > s[o].total ? 3 : s[a].total === s[o].total ? 1 : 0;
  return {
    win,
    pollinator1: s[a].tips >= RP.pollinator1 ? 1 : 0,
    pollinator2: s[a].tips >= RP.pollinator2 ? 1 : 0,
    swarm: s[a].parkPts >= RP.swarm ? 1 : 0,   // LEAVE is AUTO-only, so only PARK counts here
  };
}
