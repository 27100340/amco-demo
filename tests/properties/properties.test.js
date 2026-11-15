import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateBuilding } from '../../website/assets/app/model/schema.js';
import { deriveSurfaces, resolveSelector, roomPolygons } from '../../website/assets/app/model/surfaces.js';
import { pointInPolygon } from '../../website/assets/app/model/geometry.js';
import { KIT_IDS } from '../../website/assets/app/engine/kits/ids.js';
import { CATALOGUE, findProperty } from '../../website/assets/app/properties/index.js';

const KITS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../website/assets/app/engine/kits');
const SHOWCASE_IDS = ['dha-residence', 'bahria-townhouse', 'gulberg-office', 'high-street-shops'];

/** Kit ids registered by the family files that all.js imports, read statically (no three.js). */
function registeredKitIds() {
  const all = readFileSync(join(KITS_DIR, 'all.js'), 'utf8');
  const files = [...all.matchAll(/import '\.\/([\w-]+\.js)';/g)].map((m) => m[1]);
  return files.flatMap((file) => [...readFileSync(join(KITS_DIR, file), 'utf8').matchAll(/registerKit\('([^']+)'/g)].map((m) => m[1]));
}

const buildings = await Promise.all(CATALOGUE.map(async (entry) => ({ entry, building: await entry.load() })));

test('the catalogue lists the four showcase properties with their fixed ids', () => {
  assert.deepEqual(CATALOGUE.map((e) => e.id), SHOWCASE_IDS);
  for (const entry of CATALOGUE) {
    assert.ok(['house', 'office', 'shop'].includes(entry.kind), `${entry.id} kind`);
    assert.equal(entry.still, `assets/img/stills/${entry.id}-exterior.webp`);
    assert.ok(entry.name && entry.blurb, `${entry.id} needs a name and blurb`);
    assert.equal(findProperty(entry.id), entry);
  }
  assert.equal(findProperty('nowhere'), null);
});

test('KIT_IDS matches the registerKit calls in the kit family files', () => {
  const registered = registeredKitIds();
  assert.equal(new Set(registered).size, registered.length, 'a kit id is registered twice');
  assert.deepEqual([...registered].sort(), [...KIT_IDS].sort());
});

for (const { entry, building } of buildings) {
  test(`${entry.id}: validates with no errors or warnings`, () => {
    const result = validateBuilding(building);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.ok, true);
    assert.equal(building.id, entry.id);
    assert.equal(building.source, 'showcase');
  });

  test(`${entry.id}: every fixture and opening infill uses a registered kit`, () => {
    for (const fixture of building.fixtures) assert.ok(KIT_IDS.includes(fixture.kit), `unknown kit ${fixture.kit}`);
    for (const wall of building.walls) {
      for (const opening of wall.openings) {
        if (opening.style) assert.ok(KIT_IDS.includes(opening.style), `unknown infill ${opening.style} on ${wall.id}`);
      }
    }
    for (const gate of building.site?.boundaryWall?.gates ?? []) assert.ok(KIT_IDS.includes(gate.style), `unknown gate ${gate.style}`);
  });

  test(`${entry.id}: catalogue views exist and point at real rooms`, () => {
    const viewIds = building.views.map((v) => v.id);
    assert.ok(viewIds.includes('exterior') && viewIds.includes('dollhouse'));
    assert.deepEqual(entry.views.map((v) => v.id), viewIds);
    for (const view of building.views.filter((v) => v.mode === 'room')) {
      assert.equal(view.id, `room:${view.room}`);
      const room = building.rooms.find((r) => r.id === view.room);
      assert.ok(room, `view ${view.id} has no room`);
      assert.equal(view.level, room.level);
    }
  });

  test(`${entry.id}: walls are authored pre-noded (no wall is split)`, () => {
    const split = deriveSurfaces(building).filter((s) => s.wallId && /~\d+$/.test(s.wallId));
    assert.deepEqual(split.map((s) => s.id), []);
  });

  test(`${entry.id}: every room has a shape, no internal face reads as outside, and no room is empty`, () => {
    const polygons = roomPolygons(building);
    const surfaces = deriveSurfaces(building);
    const internal = new Set(building.walls.filter((w) => w.role !== 'exterior').map((w) => w.id));
    assert.deepEqual(surfaces.filter((s) => s.room === 'exterior' && internal.has(s.wallId)).map((s) => s.id), []);
    for (const room of building.rooms) {
      const polygon = polygons.get(room.id);
      assert.ok(polygon, `room ${room.id} has no outline`);
      const furnished = building.fixtures.some((f) => f.level === room.level && pointInPolygon(f.at, polygon));
      assert.ok(furnished, `room ${room.id} has no fixtures`);
    }
  });

  test(`${entry.id}: every default paint selector reaches at least one surface`, () => {
    const surfaces = deriveSurfaces(building);
    for (const selector of Object.keys(building.defaults.paint)) {
      assert.ok(resolveSelector(building, surfaces, selector).length > 0, `selector ${selector} paints nothing`);
      assert.match(building.defaults.paint[selector], /^AM-\d{4}$/);
    }
  });
}

test('dha-residence keeps the room ids other pages link to', () => {
  const dha = buildings.find((b) => b.entry.id === 'dha-residence').building;
  for (const id of ['lounge', 'drawing-room', 'kitchen', 'master-bedroom', 'kids-bedroom']) {
    assert.ok(dha.rooms.some((r) => r.id === id), id);
    assert.ok(dha.views.some((v) => v.id === `room:${id}`), `view room:${id}`);
  }
});

test('gulberg-office has the open-plan room and glass meeting-room partitions', () => {
  const office = buildings.find((b) => b.entry.id === 'gulberg-office').building;
  assert.ok(office.rooms.some((r) => r.id === 'open-plan'));
  assert.ok(office.walls.some((w) => w.role === 'glass'));
  assert.ok(office.views.some((v) => v.id === 'room:open-plan'));
});

test('high-street-shops gives each unit its own front wall so façades paint separately', () => {
  const shops = buildings.find((b) => b.entry.id === 'high-street-shops').building;
  const surfaces = deriveSurfaces(shops);
  const fronts = ['s1', 's2', 's3'].map((id) => resolveSelector(shops, surfaces, `group:${id}:R:exterior`));
  for (const ids of fronts) assert.equal(ids.length, 1);
  assert.equal(new Set(fronts.flat()).size, 3);
});

for (const id of ['dha-residence', 'bahria-townhouse']) {
  test(`${id}: every stair void sits wholly inside one first-floor room`, () => {
    const building = buildings.find((b) => b.entry.id === id).building;
    const upper = building.levels.find((l) => l.id === 'f');
    assert.ok(upper.voids?.length > 0, 'level f has no voids');
    const polygons = roomPolygons(building);
    const rooms = building.rooms.filter((r) => r.level === 'f' && polygons.has(r.id));
    for (const hole of upper.voids) {
      const holder = rooms.find((r) => hole.every((p) => pointInPolygon(p, polygons.get(r.id))));
      assert.ok(holder, `void ${JSON.stringify(hole)} is not inside a single first-floor room`);
    }
  });

  test(`${id}: the stair reaches the first floor and every void has a guard rail`, () => {
    const building = buildings.find((b) => b.entry.id === id).building;
    const upper = building.levels.find((l) => l.id === 'f');
    const stair = building.fixtures.find((fx) => fx.kit.startsWith('stair.'));
    assert.equal(stair.params.height, upper.elevation);
    assert.equal(stair.params.clip, undefined);
    assert.ok(building.fixtures.some((fx) => fx.kit === 'balcony.rail' && fx.level === 'f' && upper.voids.some((hole) => {
      const xs = hole.map((p) => p[0]);
      const ys = hole.map((p) => p[1]);
      return fx.at[0] >= Math.min(...xs) - 0.2 && fx.at[0] <= Math.max(...xs) + 0.2 && fx.at[1] >= Math.min(...ys) - 0.2 && fx.at[1] <= Math.max(...ys) + 0.2;
    })), 'no rail beside the void');
  });
}
