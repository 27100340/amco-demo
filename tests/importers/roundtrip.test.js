import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDrawingSet } from '../../tools/sample-drawings/drawings.mjs';
import { sampleHouse, SAMPLE_SCHEDULE } from '../../tools/sample-drawings/sample-house.js';
import { readDxfText, interpretDxf } from '../../website/assets/app/importers/interpret.js';
import { checkPackage } from '../../website/assets/app/importers/requirements.js';
import { assemble } from '../../website/assets/app/importers/assemble.js';
import { validateBuilding } from '../../website/assets/app/model/schema.js';
import { nodeWalls, distance } from '../../website/assets/app/model/geometry.js';

/** Reads every generated DXF through the same pipeline as the upload page's readDrawing. */
function importSet() {
  return buildDrawingSet().map((sheet) => {
    const { doc } = readDxfText(sheet.dxf);
    return { id: sheet.file, name: sheet.file, format: 'dxf', readable: true, doc, ...interpretDxf(doc), sheet };
  });
}

const parsed = importSet();
const model = sampleHouse();
const { building, schedule, report } = assemble(parsed, { name: 'Sample House', kind: 'house', floors: 2 });

const centre = (wall, o) => {
  const len = distance(wall.a, wall.b);
  return [wall.a[0] + ((wall.b[0] - wall.a[0]) * o.at) / len, wall.a[1] + ((wall.b[1] - wall.a[1]) * o.at) / len];
};
const sameWall = (p, q, tol) => (distance(p.a, q.a) <= tol && distance(p.b, q.b) <= tol) || (distance(p.a, q.b) <= tol && distance(p.b, q.a) <= tol);
const levelOf = (id) => model.levels.find((l) => l.id === id);

test('every sample DXF is classified into the slot its file name says', () => {
  const expected = {
    '01-ground-floor-plan.dxf': ['plan', 0, null],
    '02-first-floor-plan.dxf': ['plan', 1, null],
    '03-section-A-A.dxf': ['section', null, 'A'],
    '04-section-B-B.dxf': ['section', null, 'B'],
    '05-working-drawing-A-A.dxf': ['working', null, 'A'],
    '06-working-drawing-B-B.dxf': ['working', null, 'B'],
    '07-site-layout.dxf': ['layout', null, null]
  };
  assert.deepEqual(parsed.map((p) => p.name), Object.keys(expected));
  for (const p of parsed) {
    const [slot, levelIndex, section] = expected[p.name];
    assert.equal(p.slot, slot, p.name);
    assert.equal(p.levelIndex, levelIndex, p.name);
    assert.equal(p.section, section, p.name);
    assert.deepEqual(p.units, { unit: 'mm', factor: 0.001, source: 'header' }, p.name);
    assert.equal(p.sheet.slot, slot);
  }
  assert.deepEqual(parsed[0].sectionMarks, ['A', 'B']);
  assert.deepEqual(parsed[1].sectionMarks, ['A', 'B']);
  for (const p of parsed) assert.deepEqual(p.warnings, [], p.name);
});

test('each working drawing carries the whole door and window schedule', () => {
  for (const p of parsed.filter((d) => d.slot === 'working')) {
    assert.deepEqual(Object.keys(p.extracted.entries).sort(), Object.keys(SAMPLE_SCHEDULE).sort(), p.name);
  }
});

test('the sample package satisfies every requirement', () => {
  const result = checkPackage(parsed, { floors: 2 });
  assert.equal(result.complete, true, JSON.stringify(result.items.filter((i) => !i.satisfied)));
  assert.deepEqual(result.required.sections, ['A', 'B']);
});

test('the reconstruction is a valid building with no unexpected warnings', () => {
  const check = validateBuilding(building);
  assert.deepEqual(check.errors, []);
  assert.deepEqual(check.warnings, []);
  assert.deepEqual(report.warnings, []);
  assert.deepEqual(report.defaultsUsed, []);
});

test('walls: same count after noding both; every model wall matched within 20 mm and 5 mm thickness', () => {
  for (const level of model.levels) {
    const expected = nodeWalls(model.walls.filter((w) => w.level === level.id));
    const actual = nodeWalls(building.walls.filter((w) => w.level === level.id));
    assert.equal(actual.length, expected.length, `${level.id} wall count`);
    for (const w of expected) {
      const match = actual.find((a) => sameWall(a, w, 0.02));
      assert.ok(match, `${w.id} matched`);
      assert.ok(Math.abs(match.thickness - w.thickness) <= 0.005, `${w.id} thickness`);
      assert.equal(match.role, w.role, `${w.id} role`);
      if (w.height !== undefined) assert.ok(Math.abs(match.height - w.height) <= 0.005, `${w.id} height`);
    }
  }
});

test('openings: every model opening matched by tag within 30 mm, sizes exact from the schedule', () => {
  const actual = building.walls.flatMap((w) => w.openings.map((o) => ({ ...o, level: w.level, point: centre(w, o) })));
  const expected = model.walls.flatMap((w) => w.openings.map((o) => ({ ...o, level: w.level, point: centre(w, o) })));
  assert.equal(actual.length, expected.length, 'opening count');
  for (const o of expected) {
    const match = actual.find((a) => a.tag === o.tag && a.level === o.level && distance(a.point, o.point) <= 0.03);
    assert.ok(match, `${o.id} (${o.tag}) matched`);
    assert.equal(match.type, o.type, `${o.id} type`);
    assert.ok(Math.abs(match.width - o.width) <= 1e-9, `${o.id} width ${match.width} vs ${o.width}`);
    assert.ok(Math.abs(match.height - o.height) <= 1e-9, `${o.id} height ${match.height} vs ${o.height}`);
    assert.ok(Math.abs(match.sill - o.sill) <= 1e-9, `${o.id} sill`);
  }
  for (const [tag, entry] of Object.entries(SAMPLE_SCHEDULE)) {
    assert.ok(Math.abs(schedule[tag].width - entry.width) <= 1e-9, `${tag} schedule width`);
    assert.ok(Math.abs(schedule[tag].height - entry.height) <= 1e-9, `${tag} schedule height`);
    assert.equal(schedule[tag].type, entry.type);
  }
});

test('rooms by name and level', () => {
  const key = (r) => `${r.level}:${r.name}`;
  assert.deepEqual(building.rooms.map(key).sort(), model.rooms.map(key).sort());
  for (const r of building.rooms) {
    const m = model.rooms.find((x) => key(x) === key(r));
    assert.equal(r.use, m.use, r.name);
  }
});

test('levels: elevations, ceilings, slabs and parapet within 5 mm', () => {
  assert.equal(building.levels.length, model.levels.length);
  building.levels.forEach((l, i) => {
    const m = model.levels[i];
    assert.equal(l.id, m.id);
    for (const key of ['elevation', 'height', 'ceiling', 'slab']) {
      assert.ok(Math.abs(l[key] - m[key]) <= 0.005, `${l.id} ${key}: ${l[key]} vs ${m[key]}`);
    }
  });
  assert.ok(Math.abs(building.levels[1].parapet - levelOf('first').parapet) <= 0.005);
});

test('site: boundary within 20 mm, boundary wall, gate, ground and street', () => {
  const site = building.site;
  assert.equal(site.boundary.length, model.site.boundary.length);
  for (const p of model.site.boundary) assert.ok(site.boundary.some((q) => distance(p, q) <= 0.02), `corner ${p}`);
  assert.ok(Math.abs(site.boundaryWall.thickness - model.site.boundaryWall.thickness) <= 0.005);
  assert.ok(Math.abs(site.boundaryWall.height - model.site.boundaryWall.height) <= 0.005);
  assert.equal(site.boundaryWall.gates.length, 1);
  assert.ok(distance(site.boundaryWall.gates[0].at, model.site.boundaryWall.gates[0].at) <= 0.02);
  assert.ok(Math.abs(site.boundaryWall.gates[0].width - model.site.boundaryWall.gates[0].width) <= 0.02);
  assert.deepEqual(site.ground.map((g) => g.material).sort(), model.site.ground.map((g) => g.material).sort());
  assert.deepEqual(site.street.side, model.site.street.side);
  assert.ok(Math.abs(site.street.width - model.site.street.width) <= 0.02);
});

test('report counts match the model', () => {
  const opening = model.walls.flatMap((w) => w.openings);
  assert.deepEqual(report.counts, {
    walls: building.walls.length,
    doors: opening.filter((o) => o.type === 'door').length,
    windows: opening.filter((o) => o.type === 'window').length,
    rooms: model.rooms.length,
    levels: 2
  });
});
