import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPaint, applyFinish, defaultPaintState, scopeSurfaceIds, paintGroups
} from '../../website/assets/app/engine/paint-state.js';
import { deriveSurfaces } from '../../website/assets/app/model/surfaces.js';
import { twoRoomHouse as fixture } from '../fixtures/two-room-house.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
const surfaces = deriveSurfaces(fixture);
const idsWhere = (keep) => surfaces.filter(keep).map((s) => s.id);

test('applyPaint returns a new state and keeps the old one untouched', () => {
  const before = { 'west:L': { code: 'AM-1001', finish: 'silk' } };
  const after = applyPaint(before, ['west:L', 'east:L'], 'AM-5006');
  assert.deepEqual(before, { 'west:L': { code: 'AM-1001', finish: 'silk' } });
  assert.deepEqual(after['west:L'], { code: 'AM-5006', finish: 'silk' });
  assert.deepEqual(after['east:L'], { code: 'AM-5006', finish: 'matt' });
});

test('applyPaint uses the finish given, and ignores unknown finishes', () => {
  const state = applyPaint({}, ['west:L'], 'AM-5006', 'gloss');
  assert.equal(state['west:L'].finish, 'gloss');
  assert.equal(applyPaint(state, ['west:L'], 'AM-5006', 'shiny')['west:L'].finish, 'gloss');
});

test('applyFinish changes only painted surfaces', () => {
  const state = applyFinish({ 'west:L': { code: 'AM-1001', finish: 'matt' } }, ['west:L', 'east:L'], 'silk');
  assert.deepEqual(state, { 'west:L': { code: 'AM-1001', finish: 'silk' } });
});

test('room scope paints every surface in the room', () => {
  const ids = scopeSurfaceIds(surfaces, 'west:L', 'room');
  const loungeWalls = idsWhere((s) => s.room === 'lounge' && s.side !== 'C');
  assert.deepEqual(ids, loungeWalls);
  assert.ok(ids.length >= 4);
  const state = applyPaint({}, ids, 'AM-5006', 'matt');
  for (const id of loungeWalls) assert.equal(state[id].code, 'AM-5006');
  for (const id of idsWhere((s) => s.room === 'bedroom')) assert.equal(state[id], undefined);
});

test('room scope leaves the ceiling alone unless the ceiling is selected', () => {
  assert.ok(!scopeSurfaceIds(surfaces, 'west:L', 'room').includes('lounge:ceiling'));
  assert.deepEqual(scopeSurfaceIds(surfaces, 'lounge:ceiling', 'room'), ['lounge:ceiling']);
});

test('surface scope paints the whole group of a split wall', () => {
  const b = copy(fixture);
  b.walls = b.walls.filter((w) => w.id !== 'south-e' && w.id !== 'south-w');
  b.walls.push({ id: 'south', level: 'g', a: [0, 0], b: [8, 0], thickness: 0.23, role: 'exterior', openings: [] });
  const split = deriveSurfaces(b);
  const outside = split.filter((s) => s.wallId && s.wallId.startsWith('south') && s.room === 'exterior');
  assert.equal(outside.length, 2);
  const ids = scopeSurfaceIds(split, outside[0].id, 'surface');
  assert.deepEqual(ids.sort(), outside.map((s) => s.id).sort());
});

test('exterior and all scopes need no selection', () => {
  assert.deepEqual(scopeSurfaceIds(surfaces, null, 'exterior'), idsWhere((s) => s.room === 'exterior'));
  assert.equal(scopeSurfaceIds(surfaces, null, 'all').length, surfaces.length);
  assert.deepEqual(scopeSurfaceIds(surfaces, null, 'room'), []);
  assert.deepEqual(scopeSurfaceIds(surfaces, 'nope', 'surface'), []);
});

test('defaultPaintState applies broad selectors first and specific ones over them', () => {
  const b = copy(fixture);
  b.defaults = { finish: 'silk', paint: { 'west:L': 'AM-5006', 'room:lounge': 'AM-1004', '*': 'AM-1001' } };
  const state = defaultPaintState(b, surfaces);
  assert.deepEqual(state['west:L'], { code: 'AM-5006', finish: 'silk' });
  assert.equal(state['partition:L'].code, 'AM-1004');
  assert.equal(state['east:L'].code, 'AM-1001');
  assert.equal(Object.keys(state).length, surfaces.length);
});

test('defaultPaintState leaves cladded surfaces and buildings without defaults unpainted', () => {
  const clad = surfaces.map((s) => (s.id === 'west:R' ? { ...s, cladding: 'brick' } : s));
  const b = copy(fixture);
  b.defaults = { paint: { exterior: 'AM-1006' } };
  const state = defaultPaintState(b, clad);
  assert.equal(state['west:R'], undefined);
  assert.equal(state['east:R'].code, 'AM-1006');
  assert.deepEqual(defaultPaintState(fixture, surfaces), {});
});

test('paintGroups gives one row per group with the area summed and unique labels', () => {
  const pieces = [
    { id: 'w1:L', group: 'w1:L:lounge', label: 'Lounge, north wall', room: 'lounge', level: 'g', area: 4 },
    { id: 'w1~2:L', group: 'w1:L:lounge', label: 'Lounge, north wall', room: 'lounge', level: 'g', area: 6 },
    { id: 'w2:L', group: 'w2:L:lounge', label: 'Lounge, north wall', room: 'lounge', level: 'g', area: 3 }
  ];
  const rows = paintGroups(pieces, { 'w1~2:L': { code: 'AM-5006', finish: 'matt' } });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].area, 10);
  assert.deepEqual(rows[0].surfaceIds, ['w1:L', 'w1~2:L']);
  assert.equal(rows[0].code, 'AM-5006');
  assert.equal(rows[0].label, 'Lounge, north wall');
  assert.equal(rows[1].label, 'Lounge, north wall (2)');
  assert.equal(rows[1].code, null);
});
