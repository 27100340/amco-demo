import test from 'node:test';
import assert from 'node:assert/strict';
import { roomPolygons, deriveSurfaces, resolveSelector } from '../../website/assets/app/model/surfaces.js';
import { polygonArea, nodeWalls, findRoomFaces } from '../../website/assets/app/model/geometry.js';
import { twoRoomHouse as fixture } from '../fixtures/two-room-house.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
const close = (actual, expected, tol = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);
};
const byId = (surfaces) => new Map(surfaces.map((s) => [s.id, s]));

const square = (cx, cy, half, rotationDeg) => {
  const r = (rotationDeg * Math.PI) / 180;
  const corners = [[-half, -half], [half, -half], [half, half], [-half, half]];
  return corners.map(([x, y]) => [cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)]);
};
const boxBuilding = (rotationDeg) => {
  const pts = square(0, 0, 2, rotationDeg);
  return {
    schema: 'amco.building/1', id: 'box', name: 'Box', kind: 'house', source: 'trace',
    levels: [{ id: 'g', name: 'Ground', elevation: 0, height: 3.2, ceiling: 3, slab: 0.15 }],
    walls: pts.map((p, i) => ({ id: `w${i}`, level: 'g', a: p, b: pts[(i + 1) % 4], thickness: 0.2, openings: [] })),
    rooms: [{ id: 'r', level: 'g', name: 'Room', use: 'other', at: [0, 0] }]
  };
};

test('roomPolygons derives room shapes from the wall graph', () => {
  const polygons = roomPolygons(fixture);
  assert.equal(polygons.size, 2);
  close(polygonArea(polygons.get('lounge')), 20);
  close(polygonArea(polygons.get('bedroom')), 20);
});

test('roomPolygons prefers an explicit polygon and skips rooms without a shape', () => {
  const b = copy(fixture);
  b.rooms[0].polygon = [[0, 0], [0, 5], [4, 5], [4, 0]];
  b.rooms.push({ id: 'ghost', level: 'g', name: 'Ghost', use: 'other' });
  b.rooms.push({ id: 'outside', level: 'g', name: 'Yard', use: 'other', at: [20, 20] });
  const polygons = roomPolygons(b);
  close(polygonArea(polygons.get('lounge')), 20);
  assert.equal(polygons.has('ghost'), false);
  assert.equal(polygons.has('outside'), false);
});

test('every wall side becomes a surface, plus room ceilings', () => {
  const surfaces = deriveSurfaces(fixture);
  assert.equal(surfaces.filter((s) => s.side === 'L' || s.side === 'R').length, 14);
  assert.equal(surfaces.filter((s) => s.side === 'C').length, 2);
  const ids = surfaces.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const w of fixture.walls.filter((x) => x.role === 'exterior')) {
    const s = byId(surfaces);
    assert.notEqual(s.get(`${w.id}:L`).room, 'exterior', `${w.id}:L faces a room`);
    assert.equal(s.get(`${w.id}:R`).room, 'exterior', `${w.id}:R faces outside`);
  }
});

test('surface extents follow the mitred footprint', () => {
  const s = byId(deriveSurfaces(fixture));
  const inner = s.get('north-w:L');
  close(inner.t0, 0.0575);
  close(inner.t1, 3.885);
  close(inner.height, 3.05);
  const outer = s.get('south-w:R');
  close(outer.t0, -0.115);
  close(outer.t1, 4);
  const partition = s.get('partition:L');
  close(partition.t0, 0.115);
  close(partition.t1, 4.885);
});

test('surface areas net of openings', () => {
  const s = byId(deriveSurfaces(fixture));
  const lounge = s.get('north-w:L');
  close(lounge.grossArea, (3.885 - 0.0575) * 3.05);
  close(lounge.area, lounge.grossArea - 1.5 * 1.2);
  assert.deepEqual(lounge.openings.map((o) => o.id), ['win-lounge']);
  close(lounge.openings[0].start, 1.25);
  close(lounge.openings[0].end, 2.75);
  close(lounge.openings[0].sill, 0.9);
  close(lounge.openings[0].head, 2.1);
  for (const side of ['partition:L', 'partition:R']) {
    close(s.get(side).area, s.get(side).grossArea - 0.9 * 2.1);
  }
  const plain = s.get('south-w:L');
  close(plain.area, plain.grossArea);
  assert.deepEqual(plain.openings, []);
});

test('surface labels name the room and side', () => {
  const s = byId(deriveSurfaces(fixture));
  assert.equal(s.get('north-w:L').label, 'Lounge, north wall');
  assert.equal(s.get('north-w:L').room, 'lounge');
  assert.equal(s.get('south-w:L').label, 'Lounge, south wall');
  assert.equal(s.get('west:L').label, 'Lounge, west wall');
  assert.equal(s.get('partition:L').label, 'Lounge, east wall');
  assert.equal(s.get('partition:R').label, 'Bedroom, west wall');
  assert.equal(s.get('partition:R').room, 'bedroom');
  assert.equal(s.get('east:L').label, 'Bedroom, east wall');
  assert.equal(s.get('lounge:ceiling').label, 'Lounge, ceiling');
});

test('deriveSurfaces exterior labels use the outward compass direction', () => {
  const s = byId(deriveSurfaces(fixture));
  assert.equal(s.get('north-w:R').label, 'Outside, north-facing wall');
  assert.equal(s.get('south-e:R').label, 'Outside, south-facing wall');
  assert.equal(s.get('east:R').label, 'Outside, east-facing wall');
  assert.equal(s.get('west:R').label, 'Outside, west-facing wall');
  const rotated = deriveSurfaces(boxBuilding(45)).filter((x) => x.room === 'exterior').map((x) => x.label).sort();
  assert.deepEqual(rotated, ['Outside, north-east-facing wall', 'Outside, north-west-facing wall',
    'Outside, south-east-facing wall', 'Outside, south-west-facing wall']);
  const nearlySquare = deriveSurfaces(boxBuilding(8)).filter((x) => x.room === 'r' && x.side !== 'C').map((x) => x.label).sort();
  assert.deepEqual(nearlySquare, ['Room, east wall', 'Room, north wall', 'Room, south wall', 'Room, west wall']);
});

test('ceilings carry the room area', () => {
  const ceiling = byId(deriveSurfaces(fixture)).get('bedroom:ceiling');
  assert.equal(ceiling.wallId, null);
  assert.equal(ceiling.side, 'C');
  assert.equal(ceiling.room, 'bedroom');
  assert.equal(ceiling.level, 'g');
  close(ceiling.area, 20);
});

test('a through wall split by a T-junction gives one surface per piece', () => {
  const b = copy(fixture);
  b.walls = b.walls.filter((w) => w.id !== 'south-e');
  b.walls[0].b = [8, 0];
  b.walls[0].openings = [{ id: 'win-south', type: 'window', at: 6, width: 1, height: 1, sill: 1 }];
  const s = byId(deriveSurfaces(b));
  assert.equal(s.get('south-w:L').room, 'lounge');
  assert.equal(s.get('south-w~2:L').room, 'bedroom');
  assert.equal(s.get('south-w~2:L').wallId, 'south-w~2');
  close(s.get('south-w~2:L').area, s.get('south-w~2:L').grossArea - 1);
  close(s.get('south-w:L').area, s.get('south-w:L').grossArea);
});

const corridorHouse = () => ({
  schema: 'amco.building/1', id: 'corridor-house', name: 'Corridor house', kind: 'house', source: 'trace',
  levels: [{ id: 'g', name: 'Ground', elevation: 0, height: 3.35, ceiling: 3.05, slab: 0.15 }],
  walls: [
    { id: 's', level: 'g', a: [0, 0], b: [8, 0], thickness: 0.23, openings: [] },
    { id: 'e', level: 'g', a: [8, 0], b: [8, 6], thickness: 0.23, openings: [] },
    { id: 'n', level: 'g', a: [8, 6], b: [0, 6], thickness: 0.23, openings: [] },
    { id: 'w', level: 'g', a: [0, 6], b: [0, 0], thickness: 0.23, openings: [] },
    { id: 'mid', level: 'g', a: [0, 2], b: [8, 2], thickness: 0.115, openings: [] },
    { id: 'p', level: 'g', a: [4, 2], b: [4, 6], thickness: 0.115, openings: [] }
  ],
  rooms: [
    { id: 'corridor', level: 'g', name: 'Corridor', use: 'corridor', at: [4, 1] },
    { id: 'lounge', level: 'g', name: 'Lounge', use: 'lounge', at: [2, 4] },
    { id: 'bedroom', level: 'g', name: 'Bedroom', use: 'bedroom', at: [6, 4] }
  ]
});

test('T-split pieces facing one room share a group and a label', () => {
  const s = byId(deriveSurfaces(corridorHouse()));
  const first = s.get('mid:R');
  const second = s.get('mid~2:R');
  assert.equal(first.room, 'corridor');
  assert.equal(second.room, 'corridor');
  assert.equal(first.group, 'mid:R:corridor');
  assert.equal(second.group, 'mid:R:corridor');
  assert.equal(first.label, 'Corridor, north wall');
  assert.equal(second.label, first.label);
});

test('T-split pieces facing different rooms get different groups', () => {
  const s = byId(deriveSurfaces(corridorHouse()));
  assert.equal(s.get('mid:L').group, 'mid:L:lounge');
  assert.equal(s.get('mid~2:L').group, 'mid:L:bedroom');
  assert.notEqual(s.get('mid:L').group, s.get('mid~2:L').group);
});

test('resolveSelector expands a group to every piece in it', () => {
  const b = corridorHouse();
  const surfaces = deriveSurfaces(b);
  assert.deepEqual(resolveSelector(b, surfaces, 'group:mid:R:corridor'), ['mid:R', 'mid~2:R']);
  assert.deepEqual(resolveSelector(b, surfaces, 'group:mid:L:lounge'), ['mid:L']);
  assert.deepEqual(resolveSelector(b, surfaces, 'group:nope:L:lounge'), []);
});

test('ceilings and site surfaces are groups of their own', () => {
  const b = copy(fixture);
  b.site = { boundary: [[-2, -4], [10, -4], [10, 5], [-2, 5]], boundaryWall: { height: 2, thickness: 0.23, gates: [] }, ground: [] };
  const s = byId(deriveSurfaces(b));
  assert.equal(s.get('lounge:ceiling').group, 'lounge:ceiling');
  assert.equal(s.get('site:inner').group, 'site:inner');
  assert.equal(s.get('site:outer').group, 'site:outer');
  assert.equal(s.get('north-w:L').group, 'north-w:L:lounge');
  assert.equal(s.get('north-w:R').group, 'north-w:R:exterior');
});

const plainWall = (id, a, b, thickness = 0.23) => ({ id, level: 'g', a, b, thickness, openings: [] });
const simpleBuilding = (walls, rooms) => ({
  schema: 'amco.building/1', id: 'x', name: 'X', kind: 'house', source: 'trace',
  levels: [{ id: 'g', name: 'Ground', elevation: 0, height: 3.2, ceiling: 3, slab: 0.15 }],
  walls,
  rooms
});
const fourByThree = () => [plainWall('s', [0, 0], [4, 0]), plainWall('e', [4, 0], [4, 3]), plainWall('n', [4, 3], [0, 3]), plainWall('wv', [0, 3], [0, 0])];

test('deriveSurfaces stays id-unique when stored walls are re-noded', () => {
  const stored = nodeWalls([plainWall('s', [0, 0], [8, 0]), plainWall('e', [8, 0], [8, 5]), plainWall('n', [8, 5], [0, 5]),
    plainWall('wv', [0, 5], [0, 0]), plainWall('p', [4, 0], [4, 5], 0.115)]);
  const b = simpleBuilding([...stored, plainWall('q', [2, 0], [2, 5], 0.115)], [
    { id: 'r1', level: 'g', name: 'A', use: 'other', at: [1, 2] },
    { id: 'r2', level: 'g', name: 'B', use: 'other', at: [3, 2] },
    { id: 'r3', level: 'g', name: 'C', use: 'other', at: [6, 2] }
  ]);
  const surfaces = deriveSurfaces(b);
  const ids = surfaces.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  const s = byId(surfaces);
  const expected = { 's:L': [0.115, 1.9425, 'r1'], 's~3:L': [0.0575, 1.9425, 'r2'], 's~2:L': [0.0575, 3.885, 'r3'] };
  for (const [id, [t0, t1, room]] of Object.entries(expected)) {
    close(s.get(id).t0, t0);
    close(s.get(id).t1, t1);
    assert.equal(s.get(id).room, room);
    assert.equal(s.get(id).group, `s:L:${room}`);
  }
});

test('an identical duplicate wall does not double-count paint area', () => {
  const rooms = [{ id: 'r', level: 'g', name: 'Room', use: 'other', at: [2, 1.5] }];
  const plain = deriveSurfaces(simpleBuilding(fourByThree(), rooms));
  assert.deepEqual(deriveSurfaces(simpleBuilding([...fourByThree(), plainWall('dupe', [0, 0], [4, 0])], rooms)), plain);
  assert.deepEqual(deriveSurfaces(simpleBuilding([...fourByThree(), plainWall('dupe', [4, 0], [0, 0])], rooms)), plain);
});

test('a stub overshooting a wall leaves the far face continuous', () => {
  const walls = [plainWall('s', [0, 0], [8, 0]), plainWall('e', [8, 0], [8, 5]), plainWall('n', [8, 5], [0, 5]),
    plainWall('wv', [0, 5], [0, 0]), plainWall('p', [4, -0.05], [4, 5], 0.115)];
  const b = simpleBuilding(walls, [
    { id: 'a', level: 'g', name: 'A', use: 'other', at: [2, 2] },
    { id: 'b', level: 'g', name: 'B', use: 'other', at: [6, 2] }
  ]);
  const s = byId(deriveSurfaces(b));
  close(s.get('s:R').t0, -0.115);
  close(s.get('s:R').t1, 4);
  close(s.get('s~2:R').t0, 0);
  close(s.get('s~2:R').t1, 4.115);
  assert.equal(s.get('s:R').group, s.get('s~2:R').group);
  close(s.get('p:L').t0, 0.115);
  close(s.get('p:L').t1, 4.885);
  assert.equal(findRoomFaces(nodeWalls(walls)).length, 2);
});

test('boundary wall surfaces are derived from the site', () => {
  const b = copy(fixture);
  b.site = {
    boundary: [[-2, -4], [10, -4], [10, 5], [-2, 5]],
    boundaryWall: { height: 2.1, thickness: 0.23, gates: [{ at: [4, -4], width: 3, style: 'gate.sliding' }] },
    ground: []
  };
  const s = byId(deriveSurfaces(b));
  const inner = s.get('site:inner');
  const outer = s.get('site:outer');
  assert.equal(inner.label, 'Boundary wall, inside');
  assert.equal(outer.label, 'Boundary wall, outside');
  assert.equal(inner.room, 'site');
  close(inner.grossArea, 42 * 2.1);
  close(inner.area, 42 * 2.1 - 3 * 2.1);
  close(outer.area, inner.area);
  close(inner.openings[0].start, 4.5);
  close(inner.openings[0].end, 7.5);
});

test('deriveSurfaces does not mutate the building', () => {
  const before = JSON.stringify(fixture);
  deriveSurfaces(fixture);
  assert.equal(JSON.stringify(fixture), before);
});

test('resolveSelector handles every selector kind', () => {
  const b = copy(fixture);
  b.site = { boundary: [[-2, -4], [10, -4], [10, 5], [-2, 5]], boundaryWall: { height: 2, thickness: 0.23, gates: [] }, ground: [] };
  const surfaces = deriveSurfaces(b);
  assert.deepEqual(resolveSelector(b, surfaces, '*'), surfaces.map((s) => s.id));
  assert.deepEqual(resolveSelector(b, surfaces, 'exterior').sort(),
    ['east:R', 'north-e:R', 'north-w:R', 'south-e:R', 'south-w:R', 'west:R']);
  assert.deepEqual(resolveSelector(b, surfaces, 'site'), ['site:inner', 'site:outer']);
  assert.deepEqual(resolveSelector(b, surfaces, 'room:lounge').sort(),
    ['lounge:ceiling', 'north-w:L', 'partition:L', 'south-w:L', 'west:L']);
  assert.deepEqual(resolveSelector(b, surfaces, 'partition:R'), ['partition:R']);
  assert.deepEqual(resolveSelector(b, surfaces, 'room:attic'), []);
  assert.deepEqual(resolveSelector(b, surfaces, 'nope:L'), []);
});
