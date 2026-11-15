import test from 'node:test';
import assert from 'node:assert/strict';
import { hitTest, levelRooms } from '../../website/assets/app/editor/hit.js';
import { levelPlan } from '../../website/assets/app/editor/model-ops.js';
import { twoRoomHouse } from '../fixtures/two-room-house.js';

const plan = levelPlan(twoRoomHouse, 'g');
const hit = (pt, options) => hitTest(twoRoomHouse, 'g', plan, pt, 0.1, options);

test('a wall end wins when ends are on, and can be turned off', () => {
  assert.deepEqual(hit([4.03, 0.02]), { kind: 'end', wallId: 'south-w', point: [4, 0] });
  assert.equal(hit([4.03, 0.02], { ends: false }).kind, 'wall');
});

test('openings, including a door swing, win over their wall', () => {
  assert.deepEqual(hit([8, 2.5]), { kind: 'opening', id: 'win-bedroom', wallId: 'east' });
  assert.deepEqual(hit([4.0, 1.0]), { kind: 'opening', id: 'door-1', wallId: 'partition' });
  assert.deepEqual(hit([3.6, 0.9]), { kind: 'opening', id: 'door-1', wallId: 'partition' });
});

test('walls, then rooms, then nothing', () => {
  assert.deepEqual(hit([2, 0.05]), { kind: 'wall', id: 'south-w' });
  assert.deepEqual(hit([6, 3.5]), { kind: 'room', id: 'bedroom' });
  assert.equal(hit([20, 20]), null);
});

test('levelRooms pairs each room with its face', () => {
  const rooms = levelRooms(twoRoomHouse, 'g', plan);
  assert.deepEqual(rooms.map((r) => r.room.id), ['lounge', 'bedroom']);
  assert.ok(Math.abs(rooms[0].area - 20) < 1e-9);
});

test('site hits: gate, corner, boundary line', () => {
  const building = {
    ...twoRoomHouse,
    site: {
      boundary: [[-2, -2], [10, -2], [10, 8], [-2, 8]],
      boundaryWall: { height: 2.1, thickness: 0.23, gates: [{ at: [4, -2], width: 3 }] },
      ground: []
    }
  };
  const siteHit = (pt) => hitTest(building, 'site', null, pt, 0.1);
  assert.deepEqual(siteHit([5, -2]), { kind: 'gate', index: 0 });
  assert.deepEqual(siteHit([10.05, 8]), { kind: 'vertex', index: 2 });
  assert.deepEqual(siteHit([10, 3]), { kind: 'boundary' });
  assert.equal(siteHit([4, 4]), null);
});
