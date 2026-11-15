import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeWalls, findRoomFaces, wallFootprints } from '../../website/assets/app/model/geometry.js';
import {
  wallGroups, nodeWallsGrouped, findRoomFacesGrouped, wallFootprintsGrouped, estimateNodedWalls
} from '../../website/assets/app/importers/extract/noding.js';
import { sampleHouse } from '../../tools/sample-drawings/sample-house.js';

/** Seeded random numbers in [0, 1). */
const random = (seed) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
};

/**
 * Walls of mixed kinds over a few small patches far apart: random crossings, ends a few
 * millimetres from other ends and from wall middles, duplicates, two levels and openings.
 */
function messyWalls(seed) {
  const rnd = random(seed);
  const walls = [];
  const patches = [[0, 0], [40, 0], [0, 40], [80, 80]];
  for (const [px, py] of patches) {
    const start = walls.length;
    for (let k = 0; k < 40; k++) {
      const a = [px + rnd() * 8, py + rnd() * 8];
      const angle = rnd() < 0.6 ? Math.round(rnd() * 2) * (Math.PI / 2) : rnd() * Math.PI;
      const len = 0.5 + rnd() * 6;
      const b = [a[0] + Math.cos(angle) * len, a[1] + Math.sin(angle) * len];
      const openings = rnd() < 0.3 ? [{ id: `o${walls.length}`, type: 'door', at: len / 2, width: Math.min(0.9, len / 2), height: 2.1, sill: 0 }] : [];
      walls.push({ id: `w${walls.length}`, level: rnd() < 0.8 ? 'ground' : 'first', a, b, thickness: rnd() < 0.5 ? 0.23 : 0.115, openings });
    }
    // Near misses that noding must join: an end 5 mm from another end and from a wall's middle.
    const p = walls[start];
    const q = walls[start + 1];
    walls.push({ id: `w${walls.length}`, level: p.level, a: [p.b[0] + 0.005, p.b[1]], b: [p.b[0] + 2, p.b[1] + 1], thickness: 0.23, openings: [] });
    const mid = [(q.a[0] + q.b[0]) / 2, (q.a[1] + q.b[1]) / 2];
    walls.push({ id: `w${walls.length}`, level: q.level, a: [mid[0], mid[1] + 0.004], b: [mid[0] + 1.5, mid[1] + 3], thickness: 0.115, openings: [] });
    walls.push({ ...walls[start + 2], id: `w${walls.length}`, openings: [] });
  }
  return walls;
}

/** A face as a comparable string: its area and its corners from the lowest-left one. */
function faceKey(face) {
  const corners = face.polygon.map((p) => `${p[0].toFixed(9)},${p[1].toFixed(9)}`);
  const first = corners.indexOf([...corners].sort()[0]);
  return `${face.area.toFixed(9)}|${[...corners.slice(first), ...corners.slice(0, first)].join(';')}`;
}

test('walls that cannot touch are put in separate groups', () => {
  const walls = [
    { a: [0, 0], b: [5, 0] },
    { a: [5, 0], b: [5, 4] },
    { a: [20, 0], b: [25, 0] },
    { a: [5.05, 4], b: [9, 4] },
    { a: [24, -3], b: [24, 3] }
  ];
  assert.deepEqual(wallGroups(walls), [0, 0, 1, 0, 1]);
  assert.deepEqual(wallGroups([]), []);
});

test('grouped noding gives exactly what nodeWalls gives', () => {
  const house = sampleHouse();
  const cases = [
    ['sample house', house.walls],
    ['sample house, one level', house.walls.filter((w) => w.level === house.walls[0].level)],
    ['messy walls 1', messyWalls(11)],
    ['messy walls 2', messyWalls(29)],
    ['walls without a level', messyWalls(5).map(({ level, ...rest }) => rest)]
  ];
  for (const [name, walls] of cases) {
    const before = structuredClone(walls);
    assert.deepEqual(nodeWallsGrouped(walls), nodeWalls(walls), name);
    assert.deepEqual(walls, before, `${name}: input not changed`);
  }
  assert.ok(new Set(wallGroups(messyWalls(11))).size >= 4, 'the messy walls really are in several groups');
});

test('grouped room faces and footprints match the ungrouped ones', () => {
  const house = sampleHouse();
  for (const [name, walls] of [['sample house', house.walls], ['messy walls', messyWalls(11)]]) {
    const noded = nodeWalls(walls);
    const keys = (faces) => faces.map(faceKey).sort();
    assert.deepEqual(keys(findRoomFacesGrouped(noded)), keys(findRoomFaces(noded)), `${name}: faces`);
    assert.deepEqual(wallFootprintsGrouped(noded), wallFootprints(noded), `${name}: footprints`);
  }
  assert.ok(findRoomFaces(nodeWalls(house.walls)).length >= 10, 'the house has rooms to compare');
});

test('the noded wall estimate counts T-junctions and crossings', () => {
  const tee = [{ a: [0, 0], b: [6, 0] }, { a: [3, 0], b: [3, 4] }];
  const cross = [{ a: [0, 0], b: [6, 0] }, { a: [3, -2], b: [3, 2] }];
  const corner = [{ a: [0, 0], b: [6, 0] }, { a: [6, 0], b: [6, 4] }];
  const grid = [];
  for (let k = 0; k < 5; k++) {
    grid.push({ a: [k * 3, -1], b: [k * 3, 13] }, { a: [-1, k * 3], b: [13, k * 3] });
  }
  const model = (walls) => walls.map((w, i) => ({ id: `w${i}`, level: 'g', thickness: 0.23, openings: [], ...w }));
  for (const [name, walls] of [['tee', tee], ['cross', cross], ['corner', corner], ['grid', grid]]) {
    assert.equal(estimateNodedWalls(walls), nodeWalls(model(walls)).length, name);
  }
  assert.equal(estimateNodedWalls(grid), 60);
  const stopped = estimateNodedWalls(grid, 20);
  assert.ok(stopped > 20 && stopped < 60, `counting stops soon after the limit (${stopped})`);
});
