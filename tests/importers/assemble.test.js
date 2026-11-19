import test from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '../../website/assets/app/importers/assemble.js';
import { validateBuilding } from '../../website/assets/app/model/schema.js';
import { findRoomFaces, nodeWalls, pointInPolygon } from '../../website/assets/app/model/geometry.js';
import { smallPackage } from '../fixtures/dxf/package.js';
import { twoRooms } from '../fixtures/dxf/plans.js';
import { extractPlan } from '../../website/assets/app/importers/extract/plan.js';
import { extractSchedule } from '../../website/assets/app/importers/extract/schedule.js';
import { parseDxf } from '../../website/assets/app/importers/dxf/reader.js';
import { createDxf } from '../../tools/sample-drawings/dxf-writer.mjs';

const near = (actual, expected, tol = 1e-6, label = '') => {
  assert.ok(Math.abs(actual - expected) <= tol, `${label} expected ${expected}, got ${actual}`);
};
const openings = (building) => building.walls.flatMap((w) => w.openings.map((o) => ({ ...o, wall: w })));

test('plan + section + schedule + layout give a valid building', () => {
  const { building, schedule, report } = assemble(smallPackage(), { name: 'Test House', kind: 'house', floors: 1 });
  const check = validateBuilding(building);
  assert.deepEqual(check.errors, []);
  assert.deepEqual(check.warnings, []);
  assert.equal(building.schema, 'amco.building/1');
  assert.equal(building.id, 'test-house');
  assert.equal(building.name, 'Test House');
  assert.equal(building.kind, 'house');
  assert.equal(building.source, 'dxf');
  assert.deepEqual(building.walls.map((w) => w.id), ['w1', 'w2', 'w3', 'w4']);
  assert.deepEqual(openings(building).map((o) => o.id).sort(), ['o1', 'o2']);
  assert.ok(building.walls.every((w) => w.role === 'exterior' && w.drawing === 'gf' && w.level === 'ground'));
  assert.ok(openings(building).every((o) => o.drawing === 'gf'));
  assert.deepEqual(building.meta.drawings.map((d) => d.name), ['ground.dxf', 'section-a.dxf', 'working-a.dxf', 'site.dxf']);
  assert.deepEqual(report.counts, { walls: 4, doors: 1, windows: 1, rooms: 1, levels: 1 });
  assert.deepEqual(report.unitsUsed.map((u) => u.unit), ['mm', 'mm', 'mm', 'mm']);
  assert.deepEqual(Object.keys(schedule).sort(), ['D1', 'W1']);
  near(schedule.D1.width, 1.05);
});

test('level heights come from the section', () => {
  const { building } = assemble(smallPackage(), { name: 'Test', floors: 1 });
  assert.equal(building.levels.length, 1);
  const [g] = building.levels;
  assert.equal(g.id, 'ground');
  assert.equal(g.name, 'Ground floor');
  near(g.elevation, 0);
  near(g.ceiling, 3.05);
  near(g.slab, 0.3);
  near(g.height, 3.35);
  near(g.parapet, 1.0);
});

test('opening sizes come from the schedule, with a warning when the plan width differs by more than 5%', () => {
  const { building, report } = assemble(smallPackage(), { name: 'Test', floors: 1 });
  const door = openings(building).find((o) => o.tag === 'D1');
  near(door.width, 1.05, 1e-9, 'schedule width wins');
  near(door.height, 2.1);
  assert.equal(door.sill, 0);
  assert.equal(door.type, 'door');
  assert.ok(report.warnings.some((w) => /D1/.test(w) && /schedule/i.test(w)), report.warnings.join(' | '));
  const win = openings(building).find((o) => o.tag === 'W1');
  near(win.width, 1.5);
  near(win.height, 1.2);
  near(win.sill, 0.9, 1e-9, 'window sill from the schedule');
  assert.ok(!report.warnings.some((w) => /W1/.test(w)), 'W1 matches its schedule');
});

test('the plan is moved onto the site footprint', () => {
  const { building, report } = assemble(smallPackage(), { name: 'Test', floors: 1 });
  const xs = building.walls.flatMap((w) => [w.a[0], w.b[0]]);
  const ys = building.walls.flatMap((w) => [w.a[1], w.b[1]]);
  near(Math.min(...xs), 2.115, 1e-6, 'west centreline');
  near(Math.min(...ys), 5.115, 1e-6, 'south centreline');
  near(Math.max(...xs), 6.345, 1e-6);
  near(Math.max(...ys), 8.345, 1e-6);
  assert.deepEqual(report.alignment.gf.offset.map((v) => Math.round(v * 1e6) / 1e6), [2, 5]);
  assert.equal(report.alignment.gf.factor, 0.001);
  const [room] = building.rooms;
  assert.equal(room.name, 'Study');
  assert.equal(room.use, 'study');
  assert.equal(room.id, 'study');
  const face = findRoomFaces(nodeWalls(building.walls))[0];
  assert.ok(pointInPolygon(room.at, face.polygon), 'the room label point moved with the plan');
  const site = building.site;
  assert.equal(site.boundary.length, 4);
  near(site.boundaryWall.thickness, 0.23);
  near(site.boundaryWall.height, 7 * 0.3048);
  assert.equal(site.boundaryWall.gates.length, 1);
  near(site.boundaryWall.gates[0].width, 3.6);
  assert.deepEqual(site.ground.map((g) => g.material), ['lawn']);
  assert.equal(site.street.side, 'south');
  near(site.street.width, 30 * 0.3048);
});

test('defaultsUsed lists every default', () => {
  const { building, report } = assemble(smallPackage({ section: false, working: false, wallHeight: false }), { name: 'Test', floors: 1 });
  assert.equal(validateBuilding(building).ok, true);
  const used = report.defaultsUsed.join(' | ');
  for (const pattern of [/ceiling height 3\.05 m/i, /slab 0\.15 m/i, /parapet 1\.07 m/i, /sill 0\.90 m/i, /door and window head 2\.10 m/i, /boundary wall height 2\.13 m/i]) {
    assert.match(used, pattern);
  }
  const [g] = building.levels;
  near(g.ceiling, 3.05);
  near(g.slab, 0.15);
  near(g.height, 3.2);
  near(g.parapet, 1.07);
  const win = openings(building).find((o) => o.type === 'window');
  near(win.sill, 0.9);
  near(win.height, 1.2);
  const door = openings(building).find((o) => o.type === 'door');
  near(door.width, 0.9, 1e-9, 'measured width without a schedule');
  near(door.height, 2.1);
  assert.ok(report.warnings.includes('No schedule sizes for D1 and W1, so their widths were measured from the plan and standard heights were used.'), report.warnings.join(' | '));
  assert.ok(!report.warnings.some((w) => /No schedule entry/.test(w)), 'one line, not one per tag');
});

test('every enclosed face becomes a room; unnamed ones are numbered; roles follow the outer face', () => {
  const doc = twoRooms();
  const plan = extractPlan(doc, { factor: 0.001 });
  plan.rooms = plan.rooms.map((r) => (r.name === 'LOUNGE' ? { ...r, name: null, use: 'other' } : r));
  const parsed = [{ id: 'gf', name: 'g.dxf', slot: 'plan', levelIndex: 0, doc, extracted: plan, units: { unit: 'mm', factor: 0.001, source: 'header' } }];
  const { building, report } = assemble(parsed, { name: 'Two rooms', floors: 2 });
  assert.equal(building.levels.length, 2);
  assert.deepEqual(building.levels.map((l) => l.id), ['ground', 'first']);
  near(building.levels[1].elevation, 3.2);
  assert.ok(report.warnings.some((w) => /first floor/i.test(w) && /plan/i.test(w)));
  assert.deepEqual(building.rooms.map((r) => r.name).sort(), ['Bed Room', 'Room 1']);
  assert.deepEqual(building.rooms.map((r) => r.id).sort(), ['bed-room', 'room-1']);
  const partition = building.walls.find((w) => Math.abs(w.thickness - 0.115) < 1e-9);
  assert.equal(partition.role, 'partition');
  assert.equal(building.walls.filter((w) => w.role === 'exterior').length, 6);
  assert.equal(validateBuilding(building).ok, true);
  assert.equal(building.site, undefined);
});

test('tags missing from the schedule are listed once for the whole building, not once per opening', () => {
  const [ground] = smallPackage({ section: false, working: false, layout: false });
  const first = { ...ground, id: 'ff', name: 'first.dxf', levelIndex: 1 };
  const { report } = assemble([ground, first], { name: 'Test', floors: 2 });
  const lines = report.warnings.filter((w) => /schedule/i.test(w));
  assert.deepEqual(lines, ['No schedule sizes for D1 and W1, so their widths were measured from the plan and standard heights were used.']);
});

test('ventilator and plain-opening schedule entries give a window and an opening', () => {
  const MM = { unit: 'mm', factor: 0.001, source: 'header' };
  const [plan] = smallPackage({ section: false, working: false, layout: false });
  const d = createDxf();
  d.text('A-ANNO-SCHD', [0, 0], 200, 'D1 OPENING 900 x 2100');
  d.text('A-ANNO-SCHD', [0, -400], 200, 'W1 VENTILATOR 1500 x 450 SILL 1800');
  d.text('A-ANNO-TTLB', [0, 2000], 500, 'WORKING DRAWING SECTION A-A');
  const doc = parseDxf(d.toString());
  const working = { id: 'wa', name: 'working-a.dxf', slot: 'working', levelIndex: null, section: 'A', doc, extracted: extractSchedule(doc, MM), units: MM };
  const { building } = assemble([plan, working], { name: 'Test', floors: 1 });
  const byTag = Object.fromEntries(openings(building).map((o) => [o.tag, o]));
  assert.equal(byTag.D1.type, 'opening');
  near(byTag.D1.sill, 0);
  assert.equal(byTag.W1.type, 'window');
  near(byTag.W1.sill, 1.8);
  near(byTag.W1.height, 0.45);
});

test('a floor plan the project has no floor for is reported, not dropped silently', () => {
  const [ground] = smallPackage({ section: false, working: false, layout: false });
  const spare = { ...ground, id: 'ff', name: 'first.dxf', levelIndex: null };
  const { report } = assemble([ground, spare], { name: 'Test', floors: 1 });
  assert.ok(report.warnings.some((w) => /left out because the project has 1 floor \(first\.dxf\)/.test(w)));
  const fits = assemble([ground, { ...spare, levelIndex: 1 }], { name: 'Test', floors: 2 });
  assert.ok(!fits.report.warnings.some((w) => /left out/.test(w)));
});
