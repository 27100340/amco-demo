import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA, ROOM_USES, createBuilding, validateBuilding, guessRoomUse
} from '../../website/assets/app/model/schema.js';
import { twoRoomHouse as fixture } from '../fixtures/two-room-house.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
const hasMessage = (list, fragment) => list.some((m) => m.includes(fragment));

test('schema constants', () => {
  assert.equal(SCHEMA, 'amco.building/1');
  assert.deepEqual(ROOM_USES, ['living', 'drawing', 'lounge', 'dining', 'kitchen', 'bedroom', 'bath', 'study', 'hall', 'stair', 'store', 'porch', 'balcony', 'office', 'reception', 'meeting', 'pantry', 'shop', 'cafe', 'fitting', 'corridor', 'other']);
});

test('createBuilding returns an empty building', () => {
  const b = createBuilding({ id: 'p1', name: 'My house', kind: 'house', source: 'trace' });
  assert.equal(b.schema, SCHEMA);
  assert.equal(b.id, 'p1');
  assert.equal(b.name, 'My house');
  assert.equal(b.kind, 'house');
  assert.equal(b.source, 'trace');
  assert.deepEqual(b.levels, []);
  assert.deepEqual(b.walls, []);
  assert.deepEqual(b.rooms, []);
  assert.deepEqual(b.fixtures, []);
  assert.deepEqual(b.views, []);
  assert.equal(validateBuilding(b).ok, true);
});

test('the fixture validates cleanly', () => {
  const result = validateBuilding(fixture);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.ok, true);
});

test('validateBuilding catches missing and duplicate ids', () => {
  const b = copy(fixture);
  b.walls[1].id = 'south-w';
  delete b.rooms[0].id;
  b.levels.push({ ...b.levels[0] });
  const result = validateBuilding(b);
  assert.equal(result.ok, false);
  assert.ok(hasMessage(result.errors, 'duplicate wall id "south-w"'), result.errors.join('\n'));
  assert.ok(hasMessage(result.errors, 'room 1 has no id'), result.errors.join('\n'));
  assert.ok(hasMessage(result.errors, 'duplicate level id "g"'), result.errors.join('\n'));
});

test('validateBuilding catches unknown level references', () => {
  const b = copy(fixture);
  b.walls[0].level = 'f9';
  b.rooms[1].level = 'f9';
  b.fixtures.push({ kit: 'sofa.3seat', level: 'basement', at: [2, 2], rotation: 0 });
  const result = validateBuilding(b);
  assert.ok(hasMessage(result.errors, 'wall "south-w" is on unknown level "f9"'), result.errors.join('\n'));
  assert.ok(hasMessage(result.errors, 'room "bedroom" is on unknown level "f9"'), result.errors.join('\n'));
  assert.ok(hasMessage(result.errors, 'fixture 1 (sofa.3seat) is on unknown level "basement"'), result.errors.join('\n'));
});

test('validateBuilding catches degenerate walls', () => {
  const b = copy(fixture);
  b.walls[0].b = [0, 0];
  b.walls[1].thickness = 0;
  const result = validateBuilding(b);
  assert.ok(hasMessage(result.errors, 'wall "south-w" has zero length'), result.errors.join('\n'));
  assert.ok(hasMessage(result.errors, 'wall "south-e" must have a thickness above zero'), result.errors.join('\n'));
});

test('validateBuilding catches openings that overrun their wall', () => {
  const b = copy(fixture);
  b.walls[4].openings[0].at = 3.5;
  const result = validateBuilding(b);
  assert.equal(result.ok, false);
  assert.ok(hasMessage(result.errors, 'opening "win-lounge" overruns wall "north-w"'), result.errors.join('\n'));
});

test('validateBuilding catches overlapping openings', () => {
  const b = copy(fixture);
  b.walls[4].openings.push({ id: 'win-2', type: 'window', at: 2.9, width: 1, height: 1.2, sill: 0.9 });
  const result = validateBuilding(b);
  assert.equal(result.ok, false);
  assert.ok(hasMessage(result.errors, 'openings "win-lounge" and "win-2" overlap on wall "north-w"'), result.errors.join('\n'));
});

test('validateBuilding warns about rooms without a shape and tall openings', () => {
  const b = copy(fixture);
  b.rooms.push({ id: 'store', level: 'g', name: 'Store', use: 'store' });
  b.walls[2].openings[0].height = 2.5;
  const result = validateBuilding(b);
  assert.equal(result.ok, true);
  assert.ok(hasMessage(result.warnings, 'room "store" has neither a polygon nor a label point'), result.warnings.join('\n'));
  assert.ok(hasMessage(result.warnings, 'opening "win-bedroom" on wall "east" is taller than the wall'), result.warnings.join('\n'));
});

test('validateBuilding warns when a room label point is not inside a closed loop', () => {
  const b = copy(fixture);
  b.rooms[0].at = [-5, -5];
  const result = validateBuilding(b);
  assert.ok(hasMessage(result.warnings, 'room "lounge" label point is not inside a closed loop of walls'), result.warnings.join('\n'));
});

test('validateBuilding rejects reserved and unsafe ids', () => {
  const b = copy(fixture);
  b.rooms[0].id = 'exterior';
  b.rooms[1].id = 'site';
  b.walls[0].id = 'room';
  b.walls[1].id = 'group';
  b.walls[2].id = 'site';
  b.walls[3].id = 'north:e';
  const result = validateBuilding(b);
  assert.equal(result.ok, false);
  for (const message of ['room id "exterior" is reserved', 'room id "site" is reserved', 'wall id "room" is reserved',
    'wall id "group" is reserved', 'wall id "site" is reserved', 'wall id "north:e" must not contain ":"']) {
    assert.ok(hasMessage(result.errors, message), `${message}\n${result.errors.join('\n')}`);
  }
});

test('guessRoomUse maps common room names', () => {
  const cases = [
    ['Master Bedroom', 'bedroom'], ['Bed Room 2', 'bedroom'], ['Master', 'bedroom'], ['Guest Room', 'bedroom'],
    ['TV Lounge', 'lounge'], ['Family Room', 'lounge'], ['Living Room', 'living'], ['Drawing Room', 'drawing'],
    ['Dining Hall', 'dining'], ['Kitchen', 'kitchen'], ['Master Bath', 'bath'], ['Toilet', 'bath'],
    ['Washroom', 'bath'], ['Powder Room', 'bath'], ['W.C.', 'bath'], ['Store', 'store'], ['Staircase', 'stair'],
    ['Car Porch', 'porch'], ['Porch', 'porch'], ['Balcony', 'balcony'], ['Roof Terrace', 'balcony'],
    ['Office', 'office'], ['Work Area', 'office'], ['Reception', 'reception'], ['Lobby', 'reception'],
    ['Meeting Room', 'meeting'], ['Conference', 'meeting'], ['Board Room', 'meeting'], ['Pantry', 'pantry'],
    ['Shop 1', 'shop'], ['Store Front', 'shop'], ['Café', 'cafe'], ['Cafe', 'cafe'], ['Fitting Room', 'fitting'],
    ['Changing', 'fitting'], ['Corridor', 'corridor'], ['Passage', 'corridor'], ['Hall', 'hall'], ['Study', 'study'],
    ['Cupboard', 'other'], ['Servant Quarter', 'other'], ['', 'other']
  ];
  for (const [name, use] of cases) assert.equal(guessRoomUse(name), use, name);
  assert.equal(guessRoomUse(undefined), 'other');
  for (const [, use] of cases) assert.ok(ROOM_USES.includes(use));
});
