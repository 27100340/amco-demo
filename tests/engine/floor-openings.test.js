import test from 'node:test';
import assert from 'node:assert/strict';
import { flatPolygon, extrudePolygons, levelVoids } from '../../website/assets/app/engine/compile/mesh-utils.js';

/** Total area of a geometry's triangles facing up or down (plan area of a flat polygon). */
function flatArea(geometry) {
  const pos = geometry.attributes.position;
  const index = geometry.index;
  const count = index ? index.count : pos.count;
  let area = 0;
  for (let i = 0; i < count; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => (index ? index.getX(i + k) : i + k));
    const ax = pos.getX(a);
    const az = pos.getZ(a);
    const bx = pos.getX(b);
    const bz = pos.getZ(b);
    const cx = pos.getX(c);
    const cz = pos.getZ(c);
    area += Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
  }
  return area;
}

const ROOM = [[0, 0], [4, 0], [4, 4], [0, 4]];
const WELL = [[1, 1], [2, 1], [2, 3], [1, 3]];

test('a floor opening is cut out of the floor polygon that contains it', () => {
  assert.ok(Math.abs(flatArea(flatPolygon(ROOM, 0, true)) - 16) < 1e-6);
  assert.ok(Math.abs(flatArea(flatPolygon(ROOM, 0, true, [WELL])) - 14) < 1e-6);
});

test('an opening that crosses the polygon edge is ignored', () => {
  const across = [[3, 1], [5, 1], [5, 2], [3, 2]];
  assert.ok(Math.abs(flatArea(flatPolygon(ROOM, 0, false, [across])) - 16) < 1e-6);
});

test('a slab gets the opening and its sides', () => {
  const solid = extrudePolygons([ROOM], 3, 3.2);
  const cut = extrudePolygons([ROOM], 3, 3.2, [WELL]);
  assert.ok(cut.attributes.position.count > solid.attributes.position.count);
});

test('levelVoids keeps only usable polygons', () => {
  assert.deepEqual(levelVoids({}), []);
  assert.deepEqual(levelVoids(null), []);
  assert.deepEqual(levelVoids({ voids: [WELL, [[0, 0], [1, 1]], 'x', [[0, 0], [1, NaN], [1, 1]]] }), [WELL]);
});
