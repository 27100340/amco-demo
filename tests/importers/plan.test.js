import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPlan, MAX_WALLS, MAX_SYMBOL_ENTITIES } from '../../website/assets/app/importers/extract/plan.js';
import { detectUnits } from '../../website/assets/app/importers/extract/units.js';
import { createDxf } from '../../tools/sample-drawings/dxf-writer.mjs';
import {
  singleRoom, twoRooms, roomWithOpenings, inchRoomOnLayer0, rect, parse, scatteredLines, roomGrid, wallStubs, stubLattice
} from '../fixtures/dxf/plans.js';
import { parseDxf } from '../../website/assets/app/importers/dxf/reader.js';

const MM = { factor: 0.001 };
const TOO_MANY_WALLS = `The lines on this drawing's wall layer make more than ${MAX_WALLS.toLocaleString('en-GB')} walls, which is too many to build in 3D. Turn off hatching and patterns on the wall layer, or split the plan into smaller drawings, and export again.`;
const near = (actual, expected, tol, label = '') => {
  assert.ok(Math.abs(actual - expected) <= tol, `${label} expected ${expected} ± ${tol}, got ${actual}`);
};
/** True when the wall runs between p and q (either direction) within tol. */
const joins = (wall, p, q, tol = 1e-6) => {
  const d = (x, y) => Math.hypot(x[0] - y[0], x[1] - y[1]);
  return (d(wall.a, p) <= tol && d(wall.b, q) <= tol) || (d(wall.a, q) <= tol && d(wall.b, p) <= tol);
};
const hasWall = (walls, p, q, tol) => walls.some((w) => joins(w, p, q, tol));
/** Plan position of an opening's centre. */
const openingPoint = (plan, opening) => {
  const w = plan.walls[opening.wall];
  const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  return [w.a[0] + ((w.b[0] - w.a[0]) * opening.at) / len, w.a[1] + ((w.b[1] - w.a[1]) * opening.at) / len];
};

test('a single rectangular room gives four 230 mm walls on the centreline and one room', () => {
  const plan = extractPlan(singleRoom(), MM);
  assert.equal(plan.walls.length, 4);
  for (const w of plan.walls) near(w.thickness, 0.23, 1e-6, 'thickness');
  const c = [[0.115, 0.115], [4.345, 0.115], [4.345, 3.345], [0.115, 3.345]];
  for (let i = 0; i < 4; i++) assert.ok(hasWall(plan.walls, c[i], c[(i + 1) % 4], 1e-6), `wall ${i}`);
  assert.equal(plan.rooms.length, 1);
  assert.equal(plan.rooms[0].name, null);
  assert.equal(plan.wallLayer, 'A-WALL');
  assert.deepEqual(plan.warnings, []);
});

test('walls on layers such as WALL_EXT, A_WALL, WALLS_9IN and WALL1 are found without guessing', () => {
  for (const layer of ['WALL_EXT', 'A_WALL', 'WALLS_9IN', 'WALL1']) {
    const d = createDxf();
    rect(d, layer, [0, 0], [4460, 3460]);
    rect(d, layer, [230, 230], [4230, 3230]);
    d.line('A-FURN', [1000, 1000], [1000, 1230]);
    d.text('A-ANNO-TTLB', [0, -1500], 500, 'GROUND FLOOR PLAN');
    const plan = extractPlan(parse(d), MM);
    assert.equal(plan.walls.length, 4, layer);
    assert.equal(plan.wallLayer, layer);
    assert.deepEqual(plan.warnings, [], `${layer}: no "Wall layer guessed" warning`);
  }
});

test('two rooms and a partition with T-junctions give 7 walls after noding and named rooms', () => {
  const plan = extractPlan(twoRooms(), MM);
  assert.equal(plan.walls.length, 7);
  const partition = plan.walls.filter((w) => Math.abs(w.thickness - 0.115) < 1e-6);
  assert.equal(partition.length, 1);
  assert.ok(joins(partition[0], [4.115, 0.115], [4.115, 5.115], 1e-6));
  assert.ok(hasWall(plan.walls, [0.115, 0.115], [4.115, 0.115], 1e-6), 'south wall split at the T');
  assert.ok(hasWall(plan.walls, [4.115, 0.115], [8.115, 0.115], 1e-6));
  const names = plan.rooms.map((r) => r.name).sort();
  assert.deepEqual(names, ['BED ROOM', 'LOUNGE'], 'size text is not part of the name');
  assert.equal(plan.rooms.find((r) => r.name === 'BED ROOM').use, 'bedroom');
  assert.equal(plan.rooms.find((r) => r.name === 'LOUNGE').use, 'lounge');
});

test('door gap with leaf and swing arc on A-DOOR and tag D1 becomes a door opening', () => {
  const plan = extractPlan(roomWithOpenings(), MM);
  assert.equal(plan.walls.length, 4);
  const door = plan.openings.find((o) => o.type === 'door');
  assert.ok(door, 'door found');
  near(door.width, 0.9, 1e-6, 'door width');
  assert.equal(door.tag, 'D1');
  const p = openingPoint(plan, door);
  near(p[0], 1.95, 0.03, 'door x');
  near(p[1], 0.115, 0.03, 'door y');
  const wall = plan.walls[door.wall];
  assert.ok(joins(wall, [0.115, 0.115], [4.345, 0.115], 1e-6), 'the wall runs through the door gap');
});

test('window lines inside the wall band on A-GLAZ with W1 become a window', () => {
  const plan = extractPlan(roomWithOpenings(), MM);
  const win = plan.openings.find((o) => o.type === 'window');
  assert.ok(win, 'window found');
  near(win.width, 1.5, 1e-6, 'window width');
  assert.equal(win.tag, 'W1');
  const p = openingPoint(plan, win);
  near(p[0], 1.75, 0.03, 'window x');
  near(p[1], 3.345, 0.03, 'window y');
  assert.equal(plan.rooms[0].name, 'STUDY');
  assert.equal(plan.rooms[0].use, 'study');
});

test('inch drawing on layer 0 without $INSUNITS: units and wall layer are guessed', () => {
  const doc = inchRoomOnLayer0();
  assert.equal(doc.insunits, null);
  const units = detectUnits(doc);
  assert.deepEqual(units, { unit: 'in', factor: 0.0254, source: 'heuristic' });
  const plan = extractPlan(doc, { factor: units.factor });
  assert.equal(plan.walls.length, 4);
  for (const w of plan.walls) near(w.thickness, 0.2286, 1e-6, 'thickness');
  assert.equal(plan.wallLayer, '0');
  assert.ok(plan.warnings.some((w) => /^Wall layer guessed/.test(w)), plan.warnings.join(' | '));
  assert.equal(plan.rooms.length, 1);
  assert.equal(plan.rooms[0].name, 'BED ROOM');
  near(plan.rooms[0].at[0], 81 * 0.0254, 1e-6);
});

test('section marks on A-ANNO-SECT give the distinct labels', () => {
  const d = createDxf();
  rect(d, 'A-WALL', [0, 0], [4460, 3460]);
  rect(d, 'A-WALL', [230, 230], [4230, 3230]);
  d.line('A-ANNO-SECT', [2230, -1000], [2230, 4460]);
  for (const [x, y, label] of [[2230, -1400, 'A'], [2230, 4860, 'A'], [-1400, 1730, 'B'], [5860, 1730, 'B']]) {
    d.circle('A-ANNO-SECT', [x, y], 400);
    d.text('A-ANNO-SECT', [x, y], 300, label, 0, { h: 'center', v: 'middle' });
  }
  d.text('A-GRID', [-2000, -2000], 300, 'C');
  const plan = extractPlan(parse(d), MM);
  assert.deepEqual(plan.sectionMarks, ['A', 'B']);
  assert.equal(plan.walls.length, 4, 'the cut line is not a wall');
});

test('an arc on the wall layer is skipped with a warning; a door swing on it is not', () => {
  const d = createDxf();
  rect(d, 'A-WALL', [0, 0], [4460, 3460]);
  rect(d, 'A-WALL', [230, 230], [4230, 3230]);
  d.arc('A-WALL', [2230, 3460], 2000, 0, 180);
  d.arc('A-WALL', [1000, 230], 900, 0, 90);
  d.line('A-WALL', [1000, 230], [1000, 1130]);
  const plan = extractPlan(parse(d), MM);
  assert.ok(plan.warnings.some((w) => /^Curved wall skipped: 1 arc /.test(w)), plan.warnings.join(' | '));
  assert.equal(plan.walls.length, 4);
  const door = plan.openings.find((o) => o.type === 'door');
  assert.ok(door, 'the quarter-circle swing on the wall layer is read as a door');
  near(door.width, 0.9, 1e-6);
});

test('a 4½″ partition into a 9″ wall and a 9″ wall into a 4½″ partition both join', () => {
  const d = createDxf();
  // 9″ outer box, 6000 × 4000 clear. A 9″ cross wall at x = 3000 runs north from the south wall
  // to a 4½″ partition at y = 2500; the partition runs from the west wall to the east wall.
  const t = 228.6;
  const p = 114.3;
  rect(d, 'A-WALL', [0, 0], [6000 + 2 * t, 4000 + 2 * t]);
  const py = t + 2500;
  const cx = t + 3000;
  d.poly('A-WALL', [[t, t], [cx - t / 2, t], [cx - t / 2, py - p / 2], [t, py - p / 2]], true);
  d.poly('A-WALL', [[cx + t / 2, t], [6000 + t, t], [6000 + t, py - p / 2], [cx + t / 2, py - p / 2]], true);
  d.poly('A-WALL', [[t, py + p / 2], [6000 + t, py + p / 2], [6000 + t, 4000 + t], [t, 4000 + t]], true);
  d.text('A-AREA-IDEN', [1500, 1000], 200, 'DRAWING ROOM');
  d.text('A-AREA-IDEN', [4500, 1000], 200, 'DINING');
  d.text('A-AREA-IDEN', [3000, 3500], 200, 'KITCHEN');
  const plan = extractPlan(parse(d), MM);
  const cross = plan.walls.filter((w) => Math.abs(w.thickness - 0.2286) < 1e-6 && Math.abs(w.a[0] - w.b[0]) < 1e-9 && Math.abs(w.a[0] - cx / 1000) < 1e-6);
  assert.equal(cross.length, 1, 'one 9″ cross wall');
  assert.ok(joins(cross[0], [cx / 1000, t / 2000], [cx / 1000, py / 1000], 1e-6), 'it reaches the partition centreline');
  const partition = plan.walls.filter((w) => Math.abs(w.thickness - 0.1143) < 1e-6);
  assert.equal(partition.length, 2, 'the partition is split where the 9″ wall meets it');
  assert.equal(plan.walls.length, 4 + 2 + 2 + 1 + 1);
  assert.deepEqual(plan.rooms.map((r) => r.name).sort(), ['DINING', 'DRAWING ROOM', 'KITCHEN']);
});

test('a door right at a corner still closes the corner', () => {
  const d = createDxf();
  const wall = (a, b) => d.line('A-WALL', a, b);
  // South wall door from the inner face of the west wall (x 230) to x 1130.
  wall([0, 0], [230, 0]); wall([1130, 0], [4460, 0]);
  wall([1130, 230], [4230, 230]);
  wall([230, 0], [230, 230]);
  wall([1130, 0], [1130, 230]);
  wall([4460, 0], [4460, 3460]); wall([4230, 230], [4230, 3230]);
  wall([0, 3460], [4460, 3460]); wall([230, 3230], [4230, 3230]);
  wall([0, 0], [0, 3460]); wall([230, 230], [230, 3230]);
  d.line('A-DOOR', [1130, 230], [1130, 1130]);
  d.arc('A-DOOR', [1130, 230], 900, 90, 180);
  const plan = extractPlan(parse(d), MM);
  assert.equal(plan.walls.length, 4);
  assert.ok(hasWall(plan.walls, [0.115, 0.115], [4.345, 0.115], 1e-6), 'south wall runs to the corner');
  assert.equal(plan.rooms.length, 1);
  const door = plan.openings.find((o) => o.type === 'door');
  near(door.width, 0.9, 1e-6);
  near(openingPoint(plan, door)[0], 0.68, 0.03);
  assert.equal(door.tag, null);
});

test('walls on a partial-height layer are marked partial', () => {
  const d = createDxf();
  rect(d, 'A-WALL', [0, 0], [4460, 3460]);
  d.line('A-WALL', [230, 230], [230, 3230]);
  d.line('A-WALL', [230, 3230], [4230, 3230]);
  d.line('A-WALL', [4230, 3230], [4230, 230]);
  d.line('A-WALL', [230, 230], [4230, 230]);
  const plan = extractPlan(parse(d), MM);
  assert.ok(plan.walls.every((w) => !w.partial));

  const e = createDxf();
  e.poly('A-WALL', [[0, 0], [0, 3460], [4460, 3460], [4460, 0]], false);
  e.poly('A-WALL', [[230, 0], [230, 3230], [4230, 3230], [4230, 0]], false);
  e.line('A-WALL-PRHT', [0, 0], [4460, 0]);
  e.line('A-WALL-PRHT', [230, 230], [4230, 230]);
  const balcony = extractPlan(parse(e), MM);
  const low = balcony.walls.filter((w) => w.partial);
  assert.equal(low.length, 1);
  assert.ok(joins(low[0], [0.115, 0.115], [4.345, 0.115], 1e-6));
  assert.equal(balcony.walls.length, 4);
  assert.equal(balcony.rooms.length, 1);
});

test('a plan with no walls gives a clear warning instead of failing', () => {
  const d = createDxf();
  d.text('A-ANNO-TTLB', [0, 0], 500, 'GROUND FLOOR PLAN');
  const plan = extractPlan(parse(d), MM);
  assert.deepEqual(plan.walls, []);
  assert.deepEqual(plan.rooms, []);
  assert.ok(plan.warnings.some((w) => /No walls found/.test(w)));
});

test('too many lines on the wall layer: extraction stops early with a plain warning', () => {
  const doc = parseDxf(scatteredLines(20000));
  const started = performance.now();
  const plan = extractPlan(doc, MM);
  const ms = performance.now() - started;
  assert.deepEqual(plan.walls, []);
  assert.deepEqual(plan.rooms, []);
  assert.ok(plan.warnings.includes('This drawing has too many lines on the wall layer (20,000). Turn off hatching and patterns on the wall layer, or explode fewer blocks, and export again.'), plan.warnings.join(' | '));
  assert.ok(ms < 10000, `generous bound for a loaded machine; took ${Math.round(ms)} ms`);
});

test('a guessed wall layer with too many lines is reported the same way', () => {
  const doc = parseDxf(scatteredLines(20000, { layer: '0', insunits: null }));
  const started = performance.now();
  const units = detectUnits(doc);
  const plan = extractPlan(doc, { factor: units.factor });
  const ms = performance.now() - started;
  assert.deepEqual(plan.walls, []);
  assert.ok(plan.warnings.some((w) => /too many lines on the wall layer \(20,000\)/.test(w)), plan.warnings.join(' | '));
  assert.ok(ms < 10000, `took ${Math.round(ms)} ms`);
});

test('scattered lines below the limit finish and find no rooms in the noise', () => {
  const doc = parseDxf(scatteredLines(6000));
  const started = performance.now();
  const plan = extractPlan(doc, MM);
  const ms = performance.now() - started;
  assert.ok(!plan.warnings.some((w) => /too many lines/.test(w)));
  assert.ok(ms < 20000, `took ${Math.round(ms)} ms`);
});

test('a large regular plan (20 × 20 rooms, 3,280 wall lines) gives every wall, door and room', () => {
  const doc = roomGrid(20, 20);
  const started = performance.now();
  const plan = extractPlan(doc, MM);
  const ms = performance.now() - started;
  assert.equal(plan.rooms.length, 400);
  assert.equal(new Set(plan.rooms.map((r) => r.name)).size, 400);
  assert.equal(plan.openings.filter((o) => o.type === 'door').length, 400);
  for (const w of plan.walls) near(w.thickness, 0.23, 1e-6, 'thickness');
  assert.deepEqual(plan.warnings, []);
  assert.ok(ms < 20000, `took ${Math.round(ms)} ms`);
});

test('evenly spaced hatch lines that pair into thousands of walls are refused with a plain warning', () => {
  const d = createDxf();
  for (let i = 0; i < 10000; i++) d.line('A-WALL', [i * 50, 0], [i * 50, 3000]);
  d.text('A-ANNO-TTLB', [0, -1500], 500, 'GROUND FLOOR PLAN');
  const doc = parse(d);
  const started = performance.now();
  const plan = extractPlan(doc, MM);
  const ms = performance.now() - started;
  assert.deepEqual(plan.walls, []);
  assert.equal(plan.overLimit, true);
  assert.deepEqual(plan.warnings, [TOO_MANY_WALLS]);
  assert.ok(ms < 10000, `took ${Math.round(ms)} ms`);
});

test('crossing wall lines that would split into thousands of walls are refused before noding', () => {
  // 2,450 double-line stubs at any angle over 30 × 30 m: under both limits before noding, but
  // their crossings would split them into about 24,000 walls (minutes of work).
  const doc = parseDxf(wallStubs(2450, { span: 30000, anyAngle: true }));
  const started = performance.now();
  const plan = extractPlan(doc, MM);
  const ms = performance.now() - started;
  assert.deepEqual(plan.walls, []);
  assert.equal(plan.overLimit, true);
  assert.deepEqual(plan.warnings, [TOO_MANY_WALLS]);
  assert.ok(ms < 15000, `took ${Math.round(ms)} ms`);
});

test('many separate walls are noded group by group and all kept', () => {
  // 31 × 31 = 961 separate stubs: comparing every wall with every other took several seconds.
  const doc = parseDxf(stubLattice(31));
  const started = performance.now();
  const plan = extractPlan(doc, MM);
  const ms = performance.now() - started;
  assert.equal(plan.walls.length, 961);
  assert.deepEqual(plan.rooms, []);
  assert.deepEqual(plan.warnings, []);
  assert.ok(ms < 15000, `took ${Math.round(ms)} ms`);
});

test('the wall limit counts the walls left after crossings are split', () => {
  // A grid of 36 + 36 long walls crossing each other: 72 walls before noding, 2,664 after.
  const d = createDxf();
  for (let k = 0; k < 36; k++) {
    rect(d, 'A-WALL', [k * 3000, -1000], [k * 3000 + 230, 110000]);
    rect(d, 'A-WALL', [-1000, k * 3000], [110000, k * 3000 + 230]);
  }
  d.text('A-ANNO-TTLB', [0, -3000], 500, 'GROUND FLOOR PLAN');
  const plan = extractPlan(parse(d), MM);
  assert.equal(plan.overLimit, true);
  assert.deepEqual(plan.warnings, [TOO_MANY_WALLS]);
});

/** A 4460 × 3460 mm room with a 900 mm door gap whose door symbol is `count` short hatch lines. */
function roomWithHatchedDoor(count) {
  const d = createDxf();
  const wall = (a, b) => d.line('A-WALL', a, b);
  wall([0, 0], [1500, 0]); wall([2400, 0], [4460, 0]); wall([230, 230], [1500, 230]); wall([2400, 230], [4230, 230]);
  wall([1500, 0], [1500, 230]); wall([2400, 0], [2400, 230]); wall([4460, 0], [4460, 3460]); wall([4230, 230], [4230, 3230]);
  wall([0, 3460], [4460, 3460]); wall([230, 3230], [4230, 3230]); wall([0, 0], [0, 3460]); wall([230, 230], [230, 3230]);
  for (let i = 0; i < count; i++) {
    const x = 1500 + (i % 900);
    d.line('A-DOOR', [x, 10 + (i % 200)], [x + 0.5, 12 + (i % 200)]);
  }
  d.text('A-ANNO-TTLB', [0, -1500], 500, 'GROUND FLOOR PLAN');
  return parse(d);
}

test('a door drawn as dense hatching is grouped quickly; far too many door lines are left out with a warning', () => {
  let started = performance.now();
  const dense = extractPlan(roomWithHatchedDoor(MAX_SYMBOL_ENTITIES), MM);
  let ms = performance.now() - started;
  assert.equal(dense.openings.filter((o) => o.type === 'door').length, 1);
  near(dense.openings[0].width, 0.9, 0.01, 'door width');
  assert.equal(dense.rooms.length, 1);
  assert.ok(ms < 8000, `dense door took ${Math.round(ms)} ms (comparing every pair of lines took minutes)`);

  started = performance.now();
  const refused = extractPlan(roomWithHatchedDoor(60000), MM);
  ms = performance.now() - started;
  assert.deepEqual(refused.openings, []);
  assert.ok(refused.walls.length >= 4, 'the walls are still read');
  assert.deepEqual(refused.warnings, ['This drawing has too many lines on the door and window layers (60,000), so doors and windows were left out. Turn off hatching and patterns on those layers and export again.']);
  assert.ok(ms < 8000, `took ${Math.round(ms)} ms`);
});
