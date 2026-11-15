import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WALL_THICKNESS, DEFAULT_SCHEDULE, normaliseBuilding, normaliseSchedule, openingTypeOf, isUnnamedRoom,
  nextId, takenIds, interiorPoint, levelPlan, syncRooms, connectedEnds, fitOpening, rescaleLevel,
  deriveLevelHeights, levelCounts, renameTag, fitGate, reseatGates
} from '../../website/assets/app/editor/model-ops.js';
import { pointInPolygon } from '../../website/assets/app/model/geometry.js';
import { validateBuilding } from '../../website/assets/app/model/schema.js';
import { twoRoomHouse } from '../fixtures/two-room-house.js';

const copy = (value) => structuredClone(value);
const close = (actual, expected, tol = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);
};
const wall = (id, a, b, extra = {}) => ({ id, level: 'g', a, b, thickness: 0.2286, role: 'exterior', openings: [], ...extra });
const level = (id, elevation, extra = {}) => ({ id, name: id, elevation, height: 3.2, ceiling: 3.05, slab: 0.15, ...extra });
const square = (size = 4) => [
  wall('s', [0, 0], [size, 0]), wall('e', [size, 0], [size, size]),
  wall('n', [size, size], [0, size]), wall('w', [0, size], [0, 0])
];
const house = (walls, rooms = []) => ({
  schema: 'amco.building/1', id: 'h', name: 'H', kind: 'house', source: 'trace',
  levels: [level('g', 0)], walls, rooms, fixtures: [], views: []
});

test('wall thickness presets are exactly 9 and 4½ inches', () => {
  close(WALL_THICKNESS.full, 9 * 0.0254);
  close(WALL_THICKNESS.half, 4.5 * 0.0254);
});

test('default schedule holds the standard Pakistani sizes in metres', () => {
  const ft = 0.3048;
  const inch = 0.0254;
  assert.deepEqual(Object.keys(DEFAULT_SCHEDULE), ['D1', 'D2', 'W1', 'W2', 'V1']);
  close(DEFAULT_SCHEDULE.D1.width, 3 * ft);
  close(DEFAULT_SCHEDULE.D1.height, 7 * ft);
  close(DEFAULT_SCHEDULE.D2.width, 2 * ft + 6 * inch);
  close(DEFAULT_SCHEDULE.W1.width, 4 * ft);
  close(DEFAULT_SCHEDULE.W1.sill, 3 * ft);
  close(DEFAULT_SCHEDULE.W2.width, 6 * ft);
  close(DEFAULT_SCHEDULE.V1.height, ft + 6 * inch);
  close(DEFAULT_SCHEDULE.V1.sill, 6 * ft);
  assert.equal(DEFAULT_SCHEDULE.D1.type, 'door');
  assert.equal(DEFAULT_SCHEDULE.V1.type, 'ventilator');
});

test('normaliseBuilding copies the input and fills missing lists and a level', () => {
  const input = { schema: 'amco.building/1', id: 'x', name: 'X', kind: 'house', source: 'trace', levels: [] };
  const out = normaliseBuilding(input);
  assert.notEqual(out, input);
  assert.deepEqual(out.walls, []);
  assert.deepEqual(out.rooms, []);
  assert.equal(out.levels.length, 1);
  assert.equal(out.levels[0].elevation, 0);
  assert.equal(input.levels.length, 0);
  const fixture = normaliseBuilding(twoRoomHouse);
  assert.deepEqual(fixture, twoRoomHouse);
  fixture.walls[0].a[0] = 99;
  assert.equal(twoRoomHouse.walls[0].a[0], 0);
});

test('normaliseSchedule: given rows win, then sizes used by openings, then defaults', () => {
  const fromDefaults = normaliseSchedule(undefined, house([]));
  assert.deepEqual(fromDefaults, DEFAULT_SCHEDULE);
  assert.notEqual(fromDefaults.D1, DEFAULT_SCHEDULE.D1);

  const fromBuilding = normaliseSchedule({}, twoRoomHouse);
  close(fromBuilding.W1.width, 1.5);
  close(fromBuilding.W1.height, 1.2);
  close(fromBuilding.W1.sill, 0.9);
  assert.equal(fromBuilding.W1.type, 'window');
  close(fromBuilding.D1.width, 0.9);
  close(fromBuilding.D2.width, DEFAULT_SCHEDULE.D2.width);

  const given = { W1: { type: 'window', width: 1, height: 1, sill: 1, material: 'ALUMINIUM' } };
  const kept = normaliseSchedule(given, twoRoomHouse);
  assert.deepEqual(Object.keys(kept), ['W1', 'W2', 'D1']);
  assert.equal(kept.W1.width, 1);
  assert.equal(kept.W1.material, 'ALUMINIUM');
  close(kept.W2.width, 1.2);
});

test('openingTypeOf maps schedule types onto Building Model opening types', () => {
  assert.equal(openingTypeOf({ type: 'door' }, 'D1'), 'door');
  assert.equal(openingTypeOf({ type: 'ventilator' }, 'V1'), 'window');
  assert.equal(openingTypeOf({ type: 'WINDOW' }, 'W1'), 'window');
  assert.equal(openingTypeOf({ type: 'garage' }, 'G1'), 'garage');
  assert.equal(openingTypeOf({}, 'D4'), 'door');
  assert.equal(openingTypeOf({}, 'X9'), 'window');
});

test('ids: nextId skips every id already in the building', () => {
  const taken = takenIds(twoRoomHouse);
  assert.ok(taken.has('partition') && taken.has('door-1') && taken.has('lounge'));
  assert.equal(nextId('door', taken), 'door-2');
  assert.equal(nextId('w', new Set(['w1', 'w2'])), 'w3');
});

test('interiorPoint is inside convex, L-shaped and U-shaped outlines', () => {
  const shapes = [
    [[0, 0], [4, 0], [4, 3], [0, 3]],
    [[0, 0], [6, 0], [6, 1], [1, 1], [1, 6], [0, 6]],
    [[0, 0], [5, 0], [5, 5], [4, 5], [4, 1], [1, 1], [1, 5], [0, 5]]
  ];
  for (const shape of shapes) {
    const p = interiorPoint(shape);
    assert.ok(pointInPolygon(p, shape), `[${p}] is outside`);
  }
  assert.deepEqual(interiorPoint([[0, 0], [4, 0], [4, 4], [0, 4]]), [2, 2]);
});

test('levelPlan nodes walls and maps every piece back to its stored wall', () => {
  const plan = levelPlan(twoRoomHouse, 'g');
  assert.equal(plan.walls.length, 7);
  assert.equal(plan.pieces.length, 7);
  assert.equal(plan.faces.length, 2);
  for (const { piece, wallId } of plan.pieces) {
    assert.ok(plan.footprints.get(piece.id).polygon.length >= 4);
    assert.ok(twoRoomHouse.walls.some((w) => w.id === wallId));
  }
  const tee = house([wall('long', [0, 0], [8, 0]), wall('stub', [4, 0], [4, 3])]);
  const tPlan = levelPlan(tee, 'g');
  assert.equal(tPlan.pieces.length, 3);
  assert.deepEqual(tPlan.pieces.map((p) => p.wallId), ['long', 'long', 'stub']);
});

test('syncRooms leaves a building whose rooms already match its faces alone', () => {
  const b = copy(twoRoomHouse);
  const result = syncRooms(b);
  assert.deepEqual(result, { created: [], removed: [] });
  assert.deepEqual(b.rooms, twoRoomHouse.rooms);
});

test('syncRooms creates a "Room N" for a new face, flagged as unnamed', () => {
  const b = house(square());
  const result = syncRooms(b);
  assert.equal(b.rooms.length, 1);
  const [room] = b.rooms;
  assert.deepEqual(result.created, [room.id]);
  assert.equal(room.name, 'Room 1');
  assert.equal(room.use, 'other');
  assert.equal(room.level, 'g');
  assert.deepEqual(room.at, [2, 2]);
  assert.equal(isUnnamedRoom(room), true);
  assert.equal(isUnnamedRoom({ name: 'Kitchen', use: 'kitchen' }), false);
  assert.equal(validateBuilding(b).warnings.length, 0);
});

test('syncRooms numbers new rooms after existing "Room N" names', () => {
  const b = house([...square(), wall('p', [2, 0], [2, 4], { thickness: 0.1143 })],
    [{ id: 'room-1', level: 'g', name: 'Room 1', use: 'other', at: [1, 2] }]);
  syncRooms(b);
  assert.deepEqual(b.rooms.map((r) => r.name), ['Room 1', 'Room 2']);
  assert.notEqual(b.rooms[1].id, 'room-1');
});

test('syncRooms drops rooms whose face disappears and merges rooms sharing one face', () => {
  const open = copy(twoRoomHouse);
  open.walls = open.walls.filter((w) => w.id !== 'west');
  const lost = syncRooms(open);
  assert.deepEqual(open.rooms.map((r) => r.id), ['bedroom']);
  assert.deepEqual(lost.removed, ['lounge']);

  const merged = copy(twoRoomHouse);
  merged.walls = merged.walls.filter((w) => w.id !== 'partition');
  syncRooms(merged);
  assert.deepEqual(merged.rooms.map((r) => r.id), ['lounge']);
});

test('syncRooms prefers a named room over an unnamed one in the same face', () => {
  const b = house(square(), [
    { id: 'room-1', level: 'g', name: 'Room 1', use: 'other', at: [1, 1] },
    { id: 'k', level: 'g', name: 'Kitchen', use: 'kitchen', at: [3, 3] }
  ]);
  syncRooms(b);
  assert.deepEqual(b.rooms.map((r) => r.id), ['k']);
});

test('syncRooms keeps rooms with explicit polygons and rooms on other levels', () => {
  const b = house(square(), [
    { id: 'poly', level: 'g', name: 'Hall', use: 'hall', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] },
    { id: 'up', level: 'f', name: 'Up', use: 'bedroom', at: [1, 1] }
  ]);
  b.levels.push(level('f', 3.35));
  b.walls.push(...square().map((w) => ({ ...w, id: `f-${w.id}`, level: 'f' })));
  syncRooms(b);
  assert.deepEqual(b.rooms.map((r) => r.id), ['poly', 'up']);
  b.walls = b.walls.filter((w) => w.level === 'g');
  syncRooms(b);
  assert.deepEqual(b.rooms.map((r) => r.id), ['poly']);
});

test('syncRooms moves a label point that sits on a wall back into its room', () => {
  const b = house(square(), [{ id: 'r', level: 'g', name: 'Lounge', use: 'lounge', at: [0.05, 2] }]);
  syncRooms(b);
  assert.deepEqual(b.rooms[0].at, [2, 2]);
});

test('connectedEnds finds every wall end at a point on the level', () => {
  const ends = connectedEnds(twoRoomHouse.walls, [4, 0.01], 'g');
  assert.deepEqual(ends.map((e) => `${e.wallId}.${e.end}`).sort(), ['partition.a', 'south-e.a', 'south-w.b']);
  assert.deepEqual(connectedEnds(twoRoomHouse.walls, [4, 0.01], 'f'), []);
});

test('fitOpening snaps the centre to 5 cm and accepts a free spot', () => {
  const b = house([wall('long', [0, 0], [8, 0]), wall('stub', [4, 0], [4, 3], { thickness: 0.1143 })]);
  const fit = fitOpening(b, 'long', { at: 2.03, width: 0.9 });
  assert.equal(fit.ok, true);
  close(fit.at, 2.05);
});

test('fitOpening rejects overrunning the wall, cutting a junction and overlapping', () => {
  const b = house([
    wall('long', [0, 0], [8, 0], { openings: [{ id: 'w-1', type: 'window', at: 6, width: 1.2, height: 1.2, sill: 0.9, tag: 'W1' }] }),
    wall('stub', [4, 0], [4, 3], { thickness: 0.1143 })
  ]);
  assert.equal(fitOpening(b, 'long', { at: 0.3, width: 0.9 }).reason, 'overrun');
  assert.equal(fitOpening(b, 'long', { at: 7.8, width: 0.9 }).reason, 'overrun');
  assert.equal(fitOpening(b, 'long', { at: 4.2, width: 0.9 }).reason, 'junction');
  const overlap = fitOpening(b, 'long', { at: 6.5, width: 0.9 });
  assert.equal(overlap.reason, 'overlap');
  assert.equal(overlap.other.id, 'w-1');
  assert.equal(fitOpening(b, 'long', { at: 6.1, width: 1.2 }, 'w-1').ok, true);
  assert.equal(fitOpening(b, 'missing', { at: 1, width: 1 }).reason, 'missing');
});

test('fitOpening keeps clear of corner walls by half their thickness', () => {
  const b = house(square(4));
  assert.equal(fitOpening(b, 's', { at: 0.5, width: 0.9 }).reason, 'junction');
  assert.equal(fitOpening(b, 's', { at: 0.6, width: 0.9 }).ok, true);
});

test('rescaleLevel scales positions about the origin but keeps sizes', () => {
  const b = copy(twoRoomHouse);
  rescaleLevel(b, 'g', [0, 0], 2);
  const east = b.walls.find((w) => w.id === 'east');
  assert.deepEqual(east.a, [16, 0]);
  assert.deepEqual(east.b, [16, 10]);
  close(east.thickness, 0.23);
  close(east.openings[0].at, 5);
  close(east.openings[0].width, 1.2);
  assert.deepEqual(b.rooms[0].at, [4, 5]);
});

test('rescaleLevel on the site scales the plot, gates and ground', () => {
  const b = copy(twoRoomHouse);
  b.site = {
    boundary: [[1, 1], [3, 1], [3, 3]],
    boundaryWall: { height: 2.1, thickness: 0.23, gates: [{ at: [2, 1], width: 3 }] },
    ground: [{ polygon: [[1, 1], [2, 1], [2, 2]], material: 'lawn' }]
  };
  rescaleLevel(b, 'site', [1, 1], 2);
  assert.deepEqual(b.site.boundary, [[1, 1], [5, 1], [5, 5]]);
  assert.deepEqual(b.site.boundaryWall.gates[0].at, [3, 1]);
  assert.equal(b.site.boundaryWall.gates[0].width, 3);
  assert.deepEqual(b.site.ground[0].polygon[2], [3, 3]);
  assert.deepEqual(b.walls[0].b, [4, 0]);
});

test('deriveLevelHeights sets floor-to-floor from the next floor level', () => {
  const levels = [level('f', 3.4), level('g', 0)];
  deriveLevelHeights(levels);
  close(levels.find((l) => l.id === 'g').height, 3.4);
  close(levels.find((l) => l.id === 'f').height, 3.2);
});

test('levelCounts counts walls, doors, windows and rooms to name on a level', () => {
  const b = copy(twoRoomHouse);
  b.rooms.push({ id: 'room-1', level: 'g', name: 'Room 1', use: 'other', at: [1, 1] });
  assert.deepEqual(levelCounts(b, 'g'), { walls: 7, doors: 1, windows: 2, openings: 0, rooms: 3, unnamed: 1 });
});

test('renameTag moves a schedule row and the openings that use it', () => {
  const b = copy(twoRoomHouse);
  const schedule = normaliseSchedule({}, b);
  assert.equal(renameTag(b, schedule, 'W1', 'W9'), true);
  assert.equal(schedule.W1, undefined);
  close(schedule.W9.width, 1.5);
  assert.equal(b.walls.find((w) => w.id === 'north-w').openings[0].tag, 'W9');
  assert.equal(renameTag(b, schedule, 'W9', 'W2'), false);
  assert.equal(renameTag(b, schedule, 'W9', ''), false);
});

test('fitGate seats a gate on the nearest boundary edge and rejects corners and overlaps', () => {
  const site = {
    boundary: [[0, 0], [10, 0], [10, 8], [0, 8]],
    boundaryWall: { height: 2.1, thickness: 0.2286, gates: [{ at: [3, 0], width: 2 }] },
    ground: []
  };
  const ok = fitGate(site, [7, 0.2], 3);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.at, [7, 0]);
  assert.equal(fitGate(site, [9.2, 0.1], 3).reason, 'overrun');
  assert.equal(fitGate(site, [4.5, 0], 2).reason, 'overlap');
  assert.equal(fitGate(site, [4.5, 0], 2, 0).ok, true);
  assert.equal(fitGate({ boundary: [] }, [1, 1], 1).reason, 'none');
});

test('reseatGates moves gates back onto the boundary after it changes', () => {
  const site = {
    boundary: [[0, 0], [12, 0], [12, 8], [0, 8]],
    boundaryWall: { height: 2.1, thickness: 0.2, gates: [{ at: [6, 0.5], width: 3 }, { at: [40, 40], width: 3 }] },
    ground: []
  };
  reseatGates(site);
  assert.deepEqual(site.boundaryWall.gates, [{ at: [6, 0], width: 3 }]);
});

test('syncRooms re-centres a label left near a new partition after a split', () => {
  const b = house([...square(8), wall('p', [5, 0], [5, 8], { thickness: 0.1143 })],
    [{ id: 'r', level: 'g', name: 'Lounge', use: 'lounge', at: [4.5, 4] }]);
  syncRooms(b);
  const lounge = b.rooms.find((r) => r.id === 'r');
  assert.deepEqual(lounge.at, [2.5, 4]);
  assert.equal(b.rooms.length, 2);
});
