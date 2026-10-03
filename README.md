# BIOBUZZ Field Sim

A browser-based 3D driving simulator for the FIRST Tech Challenge 2026–27 game **BIOBUZZ™ presented by RTX**, built from Competition Manual V1. You drive a template robot from the drive team's position in the red or blue ALLIANCE AREA, score POLLEN and NECTAR, tip your HIVE, fill FLOWERS and act as your own human player.

No build step: plain ES modules, with three.js and cannon-es loaded from jsDelivr through an import map.

## Run it

ES modules don't load from `file://`, so serve the folder:

```bash
cd biobuzz-sim
python3 -m http.server 8000      # or: npx serve .
# open http://localhost:8000
```

Desktop Chrome, Edge, Firefox or Safari. Keyboard only.

## Modes

- **Match**: 3-second countdown, 2:00 TELEOP, FIELD cues at 1:00 and 0:20, robots disabled at 0:00, then a 2.5 s settle before final scoring with a breakdown and RANKING POINTS.
- **Free drive**: no clock and no G410 gating. Human player NECTAR still follows G426: one per TIP of your HIVE (there is no 1:00 release without a clock). Live score still runs.
- **1 or 2 players** on one keyboard. P2 can be your partner (same alliance) or an opponent. With one player, both key sets drive P1.

## Controls

| Action | P1 | P2 |
|---|---|---|
| Drive | `W A S D` | arrow keys |
| Turn | `Q` / `E` | `,` / `.` |
| Precision (hold) | Left Shift | Right Shift |
| Intake on/off | `F` | `;` |
| Outtake (hold) | `R` | `'` |
| Launch | Space | Enter or `/` |
| FLOWER arm drop | `V` | `L` |
| Cycle next ball | `C` | `P` |
| Auto-aim on/off | `T` | `\` |
| Flywheel − / + | `Z` / `X` | `[` / `]` |
| Hood − / + | `1` / `2` | `-` / `=` |
| Human player: enter NECTAR | `H` | `K` |

`Esc` opens the menu, `Tab` swaps between the red and blue driver views.

## What's modeled (and where it comes from)

| Element | Manual reference | Implementation |
|---|---|---|
| FIELD 144" × 144", 36 TILES, 12" perimeter | §9.2 | `field/field.js`, textures in `render/textures.js` |
| LOADING ZONES, GARDENS, ALLIANCE AREAS | §9.3, Fig 9-2/9-3 | `config.js` → `ZONES` |
| HIVE frame (49.46" × 38.95", pivots at 43.95") | §9.6.1 | `field/hive.js` → `buildFrame` |
| HIVE: bi-stable rocker at ±30°, two pentagonal CELLS (20" × 14" × 12") | §9.6.2, Fig 9-9…9-11 | `field/hive.js` → `Hive` (kinematic body) |
| FLOWERS: 4" top ring at 21.5", middle ring passes POLLEN but not NECTAR, retrieval opening | §9.7, Fig 9-12 | `field/flower.js` |
| POLLEN 2.8" (40), NECTAR 3.6" (8 red + 8 blue) | §9.8 | `elements/balls.js` |
| Starting layout | §10.3.1, Fig 10-2 | `game/game.js` → `setupField` |
| Point values, FLOWER ownership, bottom NECTAR bonus, GARDEN, PARK | §10.5, Table 10-2 | `game/scoring.js` |
| NECTAR entry: one per TIP, all at 1:00 | G426, G427 | `game/game.js` → `hpAvailable` / `enterNectar` |
| NECTAR in a FLOWER before 1:00 → MAJOR FOUL | G410 | `game/game.js` → `checkFlowerFouls` |
| Max 4 elements, no opponent NECTAR | G407, G408 | `robot/robot.js` (capacity + color sensor) |
| Elements leaving the FIELD | §10.8.2 | POLLEN reintroduced after 2.5 s, NECTAR back to the drive team |
| Robot size 18" start, 18 × 24 × 29" expanded | R102, R105 | `ROBOT` in `config.js` |

### Assumptions (not specified in the manual)

- **HIVE tip threshold.** The manual only says a tip happens when "enough" is launched in. Default: a tip when `pollen/8 + nectar/5 ≥ 1` for elements resting in the upward CELL, so the 3 staged NECTAR count as 60%. Both numbers can be changed in the menu.
- **Tip motion** is gravity-driven: the rocker starts slowly, speeds up as the load swings past the pivot (about 1 s total), then bounces off its stop. Elements in the old upward CELL ride it down, then slide and fall out onto the TILES. Tuning is in `HIVE` in `config.js`.
- **CELL lowest point.** The model matches the opening heights (53.5"–65.6"); the lowest point of the HIVE comes out a few inches higher than the manual's 25.5".
- **Robot starts** touching the perimeter wall on the alliance's side, holding its 4 pre-load POLLEN. Absent robots' pre-loads are placed in their LOADING ZONE against the wall, as §10.3.1 describes.
- **AUTO** isn't simulated. Match mode is TELEOP only, so LEAVE and AUTO PARK don't apply and SWARM RP counts PARK only.
- AprilTag stickers are decorative and not real 36h11 codes.

## Template robot

- Mecanum drive, 1.7 m/s top speed. Field-centric (relative to where you stand) or robot-centric.
- Front roller intake with a color sensor that refuses opponent NECTAR. It can also pull POLLEN out of a FLOWER's retrieval opening.
- Rear flywheel launcher with an adjustable hood. **Auto-aim** picks hood and speed for the distance to your upward CELL and shows whether you're lined up or on the wrong side of the opening. **Manual** mode uses your own flywheel/hood settings. A dashed arc previews the shot, including robot motion.
- Front arm that lifts the next element above a FLOWER and drops it through the top ring. A funnel centers it when you're within 3.5" of the FLOWER axis.

## Project layout

```
index.html              markup + import map
src/
  main.js               entry point
  config.js             all dimensions, point values, key bindings
  util.js               unit helpers
  style.css             HUD and menu styles
  game/
    game.js             match state machine, human player, fouls, main loop
    robot.js            template robot
    ballistics.js       trajectory preview + auto-aim solver
    scoring.js          Table 10-2 scoring and RANKING POINTS
    input.js            two-player keyboard handling
  world/
    physics.js          cannon-es world, materials, box/ring colliders
    scene.js            renderer, lights, driver camera
    textures.js         procedural canvas textures (tiles, balls, banner, tags)
    field.js            tiles, perimeter, alliance areas, NECTAR stands
    hive.js             HIVE frame + tipping rocker
    flower.js           FLOWER colliders, visuals, scoring volume
    balls.js            POLLEN / NECTAR bodies and state
  ui/
    hud.js              scoreboard, toasts, player panels
    menu.js             settings menu + results screen
    sound.js            WebAudio FIELD cues
```

To tune physics, open `src/config.js`. `window.__sim.simulate(seconds)` advances the game without rendering, which helps with scripted tests from the console.
