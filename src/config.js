// Central configuration. All FIELD dimensions are in inches (as in the
// Competition Manual V1) and converted to meters with `IN`.
//
// World frame (three.js, Y up):
//   +X  toward the BLUE alliance wall   (red wall at X = -72")
//   +Z  toward the AUDIENCE             (rear wall at Z = -72")
// Manual "field y" (rear-positive) therefore maps to world Z = -y.

export const IN = 0.0254;
export const G = 9.81;

export const FIELD = {
  half: 72,              // 144" x 144" inside the perimeter (§9.2)
  tile: 24,              // 36 tiles, 24" each
  wallHeight: 12,
  wallThickness: 2,
};

// ALLIANCE AREA, LOADING ZONE, GARDEN (§9.3). Rects are {x0,x1,z0,z1} in inches.
export const ZONES = {
  red: {
    allianceArea: { x0: -72 - 54, x1: -72, z0: -48, z1: 48 },
    loadingZone:  { x0: -72, x1: -61, z0: -47.5, z1: -24.5 },
    garden:       { x0: -72, x1: -49, z0: 70, z1: 72 },        // audience wall, corner nearest red area
    wallX: -72, inward: 1,
  },
  blue: {
    allianceArea: { x0: 72, x1: 72 + 54, z0: -48, z1: 48 },
    loadingZone:  { x0: 61, x1: 72, z0: 24.5, z1: 47.5 },
    garden:       { x0: 49, x1: 72, z0: -72, z1: -70 },        // rear wall, corner nearest blue area
    wallX: 72, inward: -1,
  },
};

// HIVE structure (§9.6). Pivots sit on the frame crossbar.
export const HIVE = {
  pivotHeight: 43.95,
  hiveCenterX: 12.75,          // 25.5" center to center
  frameHalfWidth: 24.73,       // 49.46" frame width (along X)
  frameHalfDepth: 19.48,       // 38.95" frame depth (along Z)
  stableAngle: 30 * Math.PI / 180,
  // CELL: pentagonal prism, axis along the arm. Opening = outer pentagon end.
  cellHalfWidth: 10,           // 20" wide
  cellShoulder: 7.61,          // side wall height
  cellHeight: 14,              // floor to apex
  cellInner: 9.41,             // back wall distance from pivot (along arm)
  cellOuter: 21.45,            // opening distance from pivot (42.91" overall)
  floorOffset: -1.4,           // CELL floor, measured perpendicular to the arm from the pivot
  tipAccel: [1.2, 8],          // rad/s² at the start / end of the swing (load moving past the pivot)
  holdAccel: 8,                // rad/s² pressing the arm onto its stop once tipped
  stopRestitution: 0.3,        // bounce off the stop
};

// FLOWER (§9.7). Axis 4.3" off the wall; heights above TILES.
export const FLOWER = {
  wallOffset: 4.3,
  topRingTop: 21.5, topRingThick: 0.9, topRingInner: 2.0, topRingOuter: 3.4,
  midRingBottom: 3.98, midRingThick: 0.45, midRingInner: 1.6, midRingOuter: 3.0,
  bottomRingThick: 0.43, bottomRingInner: 1.45, bottomRingOuter: 3.0,
  tubeInner: 2.1,
  backstopHeight: 1.25,
  // axis position (world inches) and inward normal of the wall it hangs on
  list: [
    { x: -24, z: -72, nx: 0, nz: 1 },   // rear wall, column B/C seam
    { x: 24, z: 72, nx: 0, nz: -1 },    // audience wall, column D/E seam
    { x: -72, z: 24, nx: 1, nz: 0 },    // red wall, row 2 seam
    { x: 72, z: -24, nx: -1, nz: 0 },   // blue wall, row 4 seam
  ],
};

// SCORING ELEMENTS (§9.8)
export const ELEMENTS = {
  pollen: { radius: 1.4, mass: 0.026, color: 0xf4c21b },
  nectar: { radius: 1.8, mass: 0.045, red: 0xd7263d, blue: 0x2458d6 },
  linearDamping: 0.15,
  angularDamping: 0.35,
};

// Point values (Table 10-2)
export const POINTS = {
  tip: 20, cell: 2, bottomNectar: 5, flowerOwned: 2, garden: 1, park: 5,
  minorFoul: 5, majorFoul: 20,
};
export const RP = { pollinator1: 4, pollinator2: 7, swarm: 16 };

export const MATCH = { teleop: 120, countdown: 3, flowerUnlock: 60, endgameCue: 20, settle: 2.5 };

// Template robot (R102/R105: 18" cube start, 18x24x29 expansion)
export const ROBOT = {
  half: 9, bottom: 0.6, top: 13,
  mass: 15,
  maxSpeed: 1.7, accel: 6.0,          // m/s, m/s^2
  maxTurn: 3.8, turnAccel: 18,        // rad/s, rad/s^2
  slowFactor: 0.38,
  capacity: 4,                        // G407
  shooterExit: { x: -6.5, y: 17.5 },  // local inches
  shootCooldown: 0.3,
  power: { min: 2, max: 11, step: 0.25, def: 6.0 },
  hood: { min: 20, max: 75, step: 1, def: 55 },
  intake: { x0: 8.5, x1: 14.5, halfZ: 7.5, maxY: 3.6, pullX1: 20, pullHalfZ: 9.5, pullY: 5, pullAccel: 5 },
  arm: { pivotX: 8, pivotY: 13, length: 13, rest: 100, out: 58, funnel: 3.5 },
};

export const BINDINGS = {
  p1: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', turnL: 'KeyQ', turnR: 'KeyE', slow: 'ShiftLeft',
        shoot: ['Space'], intake: 'KeyF', outtake: 'KeyR', arm: 'KeyV', cycle: 'KeyC', auto: 'KeyT',
        pwrDn: 'KeyZ', pwrUp: 'KeyX', hoodDn: 'Digit1', hoodUp: 'Digit2', hp: 'KeyH' },
  p2: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', turnL: 'Comma', turnR: 'Period', slow: 'ShiftRight',
        shoot: ['Enter', 'Slash', 'NumpadEnter'], intake: 'Semicolon', outtake: 'Quote', arm: 'KeyL', cycle: 'KeyP', auto: 'Backslash',
        pwrDn: 'BracketLeft', pwrUp: 'BracketRight', hoodDn: 'Minus', hoodUp: 'Equal', hp: 'KeyK' },
};

export const DEFAULT_SETTINGS = {
  mode: 'match', players: '1', p1: 'red', p2: 'partner', view: 'red', drive: 'field',
  tipPollen: 8, tipNectar: 5, eye: 1.7, arc: true, sound: true,
};

export const PHYS_DT = 1 / 240;
