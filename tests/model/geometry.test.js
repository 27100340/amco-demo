import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EPS, sub, add, scale, dot, cross, length, normalize, leftNormal, distance, lerp,
  lineIntersection, projectOnSegment, polygonArea, polygonCentroid, pointInPolygon,
  nodeWalls, wallFootprints, findRoomFaces, baseWallId
} from '../../website/assets/app/model/geometry.js';
import { twoRoomHouse as fixture } from '../fixtures/two-room-house.js';

const round = (p, digits = 6) => p.map((v) => Number(v.toFixed(digits)) + 0);
const close = (actual, expected, tol = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);
};
const wall = (id, a, b, thickness = 0.2, extra = {}) => ({ id, a, b, thickness, level: 'g', openings: [], ...extra });

test('vector helpers', () => {
  assert.ok(EPS > 0 && EPS < 1e-6);
  assert.deepEqual(sub([3, 4], [1, 1]), [2, 3]);
  assert.deepEqual(add([3, 4], [1, 1]), [4, 5]);
  assert.deepEqual(scale([3, 4], 2), [6, 8]);
  assert.equal(dot([1, 2], [3, 4]), 11);
  assert.equal(cross([1, 0], [0, 1]), 1);
  assert.equal(length([3, 4]), 5);
  assert.deepEqual(normalize([0, 5]), [0, 1]);
  assert.deepEqual(normalize([0, 0]), [0, 0]);
  assert.deepEqual(leftNormal([1, 0]), [0, 1]);
  assert.deepEqual(leftNormal([0, 1]), [-1, 0]);
  assert.equal(distance([0, 0], [3, 4]), 5);
  assert.deepEqual(lerp([0, 0], [4, 2], 0.5), [2, 1]);
});

test('lineIntersection meets crossing lines and rejects parallel ones', () => {
  assert.deepEqual(lineIntersection([0, 1], [1, 0], [2, 0], [0, 1]), [2, 1]);
  assert.equal(lineIntersection([0, 0], [1, 0], [0, 1], [2, 0]), null);
});

test('projectOnSegment reports unclamped t, foot point and distance', () => {
  const r = projectOnSegment([3, 2], [0, 0], [2, 0]);
  close(r.t, 1.5);
  assert.deepEqual(r.point, [3, 0]);
  close(r.distance, 2);
});

test('polygon area is signed, centroid and containment work', () => {
  const square = [[0, 0], [2, 0], [2, 2], [0, 2]];
  assert.equal(polygonArea(square), 4);
  assert.equal(polygonArea([...square].reverse()), -4);
  assert.deepEqual(polygonCentroid(square), [1, 1]);
  assert.equal(pointInPolygon([1, 1], square), true);
  assert.equal(pointInPolygon([3, 1], square), false);
});

test('mitred L corner meets exactly', () => {
  const walls = [{ id: 'w1', a: [0, 0], b: [4, 0], thickness: 0.2, level: 'g', openings: [] },
    { id: 'w2', a: [4, 0], b: [4, 3], thickness: 0.2, level: 'g', openings: [] }];
  const fp = wallFootprints(walls);
  assert.deepEqual(round(fp.get('w1').L[1]), [3.9, 0.1]);
  assert.deepEqual(round(fp.get('w2').L[0]), [3.9, 0.1]);
  assert.deepEqual(round(fp.get('w1').R[1]), [4.1, -0.1]);
  assert.deepEqual(round(fp.get('w2').R[0]), [4.1, -0.1]);
  assert.deepEqual(fp.get('w1').L[1], fp.get('w2').L[0]);
  assert.equal(fp.get('w1').polygon.length, 4);
});

test('free ends are square and polygon runs R.start, R.end, L.end, L.start', () => {
  const fp = wallFootprints([wall('w1', [0, 0], [4, 0])]).get('w1');
  assert.deepEqual(fp.R.map((p) => round(p)), [[0, -0.1], [4, -0.1]]);
  assert.deepEqual(fp.L.map((p) => round(p)), [[0, 0.1], [4, 0.1]]);
  assert.deepEqual(fp.polygon.map((p) => round(p)), [[0, -0.1], [4, -0.1], [4, 0.1], [0, 0.1]]);
  assert.ok(polygonArea(fp.polygon) > 0);
});

test('collinear junction uses the plain perpendicular offsets', () => {
  const same = wallFootprints([wall('w1', [0, 0], [4, 0]), wall('w2', [4, 0], [8, 0])]);
  assert.deepEqual(round(same.get('w1').L[1]), [4, 0.1]);
  assert.deepEqual(round(same.get('w2').L[0]), [4, 0.1]);
  assert.deepEqual(round(same.get('w1').R[1]), [4, -0.1]);
  assert.deepEqual(round(same.get('w2').R[0]), [4, -0.1]);
  const stepped = wallFootprints([wall('w1', [0, 0], [4, 0], 0.2), wall('w2', [4, 0], [8, 0], 0.1)]);
  assert.deepEqual(round(stepped.get('w1').L[1]), [4, 0.1]);
  assert.deepEqual(round(stepped.get('w2').L[0]), [4, 0.05]);
});

test('acute-angle clamp falls back to square ends near the node', () => {
  const angle = (10 * Math.PI) / 180;
  const walls = [wall('w1', [0, 0], [4, 0]), wall('w2', [0, 0], [4 * Math.cos(angle), 4 * Math.sin(angle)])];
  const fp = wallFootprints(walls);
  const corners = [fp.get('w1').L[0], fp.get('w1').R[0], fp.get('w2').L[0], fp.get('w2').R[0]];
  for (const c of corners) assert.ok(distance(c, [0, 0]) <= 3 * 0.2 + 1e-9, `corner ${c} too far`);
  assert.deepEqual(round(fp.get('w1').L[0]), [0, 0.1]);
  assert.deepEqual(round(fp.get('w1').R[0]), [0, -0.1]);
  const wide = (60 * Math.PI) / 180;
  const mitred = wallFootprints([wall('w1', [0, 0], [4, 0]), wall('w2', [0, 0], [4 * Math.cos(wide), 4 * Math.sin(wide)])]);
  const inner = mitred.get('w1').L[0];
  close(inner[1], 0.1);
  close(inner[0], 0.1 / Math.tan(wide / 2));
  assert.deepEqual(inner, mitred.get('w2').R[0]);
});

test('3-way T junction footprints share exact corner points and leave no gap', () => {
  const walls = [wall('w1', [0, 0], [4, 0]), wall('w1~2', [4, 0], [8, 0]), wall('w2', [4, 0], [4, 5])];
  const fp = wallFootprints(walls);
  assert.deepEqual(fp.get('w1').L[1], fp.get('w2').L[0]);
  assert.deepEqual(fp.get('w2').R[0], fp.get('w1~2').L[0]);
  assert.deepEqual(fp.get('w1').R[1], fp.get('w1~2').R[0]);
  assert.deepEqual(round(fp.get('w1').L[1]), [3.9, 0.1]);
  assert.deepEqual(round(fp.get('w1~2').L[0]), [4.1, 0.1]);
  assert.deepEqual(round(fp.get('w1').R[1]), [4, -0.1]);
  const covered = [...fp.values()].reduce((sum, f) => sum + polygonArea(f.polygon), 0);
  close(covered, 8 * 0.2 + (5 - 0.1) * 0.2, 1e-9);
});

test('T-junction splits the through wall', () => {
  const input = [wall('w1', [0, 0], [8, 0]), wall('w2', [4, 0], [4, 5])];
  const noded = nodeWalls(input);
  assert.equal(noded.length, 3);
  assert.deepEqual(noded.map((w) => w.id), ['w1', 'w1~2', 'w2']);
  assert.deepEqual(noded[0].a, [0, 0]);
  assert.deepEqual(noded[0].b, [4, 0]);
  assert.deepEqual(noded[1].a, [4, 0]);
  assert.deepEqual(noded[1].b, [8, 0]);
  assert.deepEqual(input[0].b, [8, 0], 'input must not be mutated');
});

test('nodeWalls moves a stub end that is just off the through wall onto it', () => {
  const noded = nodeWalls([wall('w1', [0, 0], [8, 0]), wall('w2', [4, 0.015], [4, 5])]);
  assert.equal(noded.length, 3);
  const stub = noded.find((w) => w.id === 'w2');
  assert.deepEqual(round(stub.a), [4, 0]);
  assert.deepEqual(stub.a, noded.find((w) => w.id === 'w1').b);
});

test('split walls re-base their openings', () => {
  const openings = [
    { id: 'o1', type: 'window', at: 2, width: 1, height: 1.2, sill: 0.9 },
    { id: 'o2', type: 'window', at: 6, width: 1, height: 1.2, sill: 0.9 },
    { id: 'o3', type: 'door', at: 4.2, width: 1, height: 2.1, sill: 0 }
  ];
  const noded = nodeWalls([wall('w1', [0, 0], [8, 0], 0.2, { openings }), wall('w2', [4, 0], [4, 5])]);
  const first = noded.find((w) => w.id === 'w1');
  const second = noded.find((w) => w.id === 'w1~2');
  assert.deepEqual(first.openings.map((o) => [o.id, o.at]), [['o1', 2]]);
  assert.deepEqual(second.openings.map((o) => o.id), ['o2', 'o3']);
  close(second.openings[0].at, 2);
  close(second.openings[1].at, 0.5, 1e-9);
  assert.equal(openings[1].at, 6, 'input openings must not be mutated');
});

test('nodeWalls snaps nearby ends to their mean and drops collapsed walls', () => {
  const noded = nodeWalls([wall('w1', [0, 0], [4, 0]), wall('w2', [4.01, 0.01], [4, 3]), wall('tiny', [9, 9], [9.01, 9])]);
  assert.deepEqual(noded.map((w) => w.id), ['w1', 'w2']);
  assert.deepEqual(round(noded[0].b), [4.005, 0.005]);
  assert.deepEqual(noded[0].b, noded[1].a);
});

test('nodeWalls splits walls that cross', () => {
  const noded = nodeWalls([wall('h', [0, 2], [6, 2]), wall('v', [3, 0], [3, 5])]);
  assert.deepEqual(noded.map((w) => w.id), ['h', 'h~2', 'v', 'v~2']);
  assert.deepEqual(round(noded[0].b), [3, 2]);
  assert.deepEqual(noded[0].b, noded[2].b);
});

test('walls on different levels never interact', () => {
  const noded = nodeWalls([wall('w1', [0, 0], [8, 0]), wall('w2', [4, 0], [4, 5], 0.2, { level: 'f1' })]);
  assert.deepEqual(noded.map((w) => w.id), ['w1', 'w2']);
  const fp = wallFootprints(noded);
  assert.deepEqual(round(fp.get('w2').L[0]), [3.9, 0]);
});

test('nodeWalls is idempotent', () => {
  const once = nodeWalls([wall('w1', [0, 0], [8, 0]), wall('w2', [4, 0], [4, 5]), wall('w3', [0, 0], [0, 5])]);
  assert.deepEqual(nodeWalls(once), once);
});

test('two rooms found in fixture', () => {
  const faces = findRoomFaces(fixture.walls);
  assert.equal(faces.length, 2);
  for (const face of faces) {
    close(face.area, 20);
    assert.ok(polygonArea(face.polygon) > 0, 'faces are anticlockwise');
  }
});

test('findRoomFaces finds an L-shaped room and ignores dangling walls', () => {
  const pts = [[0, 0], [6, 0], [6, 3], [3, 3], [3, 6], [0, 6]];
  const walls = pts.map((p, i) => wall(`w${i}`, p, pts[(i + 1) % pts.length]));
  walls.push(wall('stub', [1, 1], [2, 1]));
  walls.push(wall('spur', [6, 0], [8, 0]));
  const faces = findRoomFaces(walls);
  assert.equal(faces.length, 1);
  close(faces[0].area, 27);
  assert.equal(pointInPolygon([4, 2], faces[0].polygon), true);
  assert.equal(pointInPolygon([4, 4], faces[0].polygon), false);
});

test('findRoomFaces drops open chains and slivers', () => {
  assert.equal(findRoomFaces([wall('a', [0, 0], [4, 0]), wall('b', [4, 0], [4, 4])]).length, 0);
  const sliver = [[0, 0], [2, 0], [2, 0.2], [0, 0.2]];
  assert.equal(findRoomFaces(sliver.map((p, i) => wall(`s${i}`, p, sliver[(i + 1) % 4]))).length, 0);
});

const box = (x0, y0, x1, y1) => {
  const p = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  return p.map((q, i) => wall(`b${i}`, q, p[(i + 1) % 4], 0.23));
};
const nodePairs = (walls) => walls.map((w) => [w.a, w.b].map((p) => p.join(',')).sort().join('|'));

test('baseWallId strips every trailing piece suffix', () => {
  assert.equal(baseWallId('w1'), 'w1');
  assert.equal(baseWallId('w1~2'), 'w1');
  assert.equal(baseWallId('w1~2~3'), 'w1');
  assert.equal(baseWallId('a~b'), 'a~b');
});

test('re-noding already-noded walls keeps ids unique', () => {
  const stored = nodeWalls([wall('w1', [0, 0], [8, 0]), wall('w2', [4, 0], [4, 5])]);
  const renoded = nodeWalls([...stored, wall('w3', [2, 0], [2, 5])]);
  assert.deepEqual(renoded.map((w) => w.id), ['w1', 'w1~3', 'w1~2', 'w2', 'w3']);
  assert.deepEqual(renoded[1].a, [2, 0]);
  assert.deepEqual(renoded[1].b, [4, 0]);
  assert.equal(wallFootprints(renoded).size, renoded.length);
});

test('an identical duplicate wall is dropped, keeping its openings when they fit', () => {
  const window = { id: 'dup-win', type: 'window', at: 1, width: 1, height: 1, sill: 1 };
  const noded = nodeWalls([...box(0, 0, 4, 3), wall('dupe', [4, 0], [0, 0], 0.23, { openings: [window] })]);
  assert.deepEqual(noded.map((w) => w.id), ['b0', 'b1', 'b2', 'b3']);
  assert.deepEqual(noded[0].openings.map((o) => [o.id, o.at]), [['dup-win', 3]]);
  const clash = nodeWalls([
    ...box(0, 0, 4, 3).map((w) => (w.id === 'b0' ? { ...w, openings: [{ ...window, id: 'own', at: 3 }] } : w)),
    wall('dupe', [4, 0], [0, 0], 0.23, { openings: [window] })
  ]);
  assert.deepEqual(clash[0].openings.map((o) => o.id), ['own']);
});

test('collinear overlapping walls are noded without doubled coverage', () => {
  const noded = nodeWalls([wall('s1', [0, 0], [3, 0]), wall('s2', [2, 0], [4, 0]), wall('e', [4, 0], [4, 3]), wall('n', [4, 3], [0, 3]), wall('wv', [0, 3], [0, 0])]);
  assert.deepEqual(noded.map((w) => w.id), ['s1', 's1~2', 's2', 'e', 'n', 'wv']);
  const pairs = nodePairs(noded);
  assert.equal(new Set(pairs).size, pairs.length);
  const south = noded.filter((w) => w.a[1] === 0 && w.b[1] === 0);
  close(south.reduce((sum, w) => sum + distance(w.a, w.b), 0), 4);
  assert.deepEqual(findRoomFaces(noded).map((f) => Number(f.area.toFixed(6))), [12]);
});

test('a stub overshooting a wall by less than its half-thickness is trimmed back', () => {
  const noded = nodeWalls([...box(0, 0, 8, 5), wall('p', [4, -0.05], [4, 5], 0.115)]);
  assert.deepEqual(noded.map((w) => w.id), ['b0', 'b0~2', 'b1', 'b2', 'b2~2', 'b3', 'p']);
  const stub = noded.find((w) => w.id === 'p');
  assert.deepEqual(round(stub.a), [4, 0]);
  assert.equal(findRoomFaces(noded).length, 2);
  const longer = nodeWalls([...box(0, 0, 8, 5), wall('p', [4, -0.5], [4, 5], 0.115)]);
  assert.equal(longer.filter((w) => w.id.startsWith('p')).length, 2, 'a stub that sticks out keeps its outside piece');
});

test('wall ends that miss a corner diagonally are merged into it', () => {
  for (const end of [[4.015, 0.015], [3.985, 0.015], [4.012, 0.018]]) {
    const walls = box(0, 0, 4, 3);
    walls[1] = wall('b1', end, [4, 3], 0.23);
    const noded = nodeWalls(walls);
    assert.deepEqual(noded[1].a, noded[0].b, `end ${end}`);
    assert.ok(distance(noded[1].a, [4, 0]) <= 0.02, `end ${end} merged near the corner`);
    const faces = findRoomFaces(noded);
    assert.equal(faces.length, 1, `end ${end}`);
    close(faces[0].area, 12, 0.1);
  }
});

test('skewed T junctions with a thin stub tile without overlap or gap', () => {
  const rect = (w) => {
    const d = normalize(sub(w.b, w.a));
    const o = scale(leftNormal(d), w.thickness / 2);
    return [sub(w.a, o), sub(w.b, o), add(w.b, o), add(w.a, o)];
  };
  for (const deg of [45, 60, 70, 90, 120]) {
    const r = (deg * Math.PI) / 180;
    const noded = nodeWalls([wall('t', [-4, 0], [4, 0], 0.23), wall('s', [0, 0], [4 * Math.cos(r), 4 * Math.sin(r)], 0.115)]);
    const polygons = [...wallFootprints(noded).values()].map((f) => f.polygon);
    const bands = noded.map(rect);
    let overlap = 0;
    let gap = 0;
    const steps = 250;
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < steps; j++) {
        const p = [-0.5 + (i + 0.5) / steps, -0.5 + (j + 0.5) / steps];
        const count = polygons.filter((poly) => pointInPolygon(p, poly)).length;
        if (count > 1) overlap++;
        if (count === 0 && bands.some((band) => pointInPolygon(p, band))) gap++;
      }
    }
    assert.equal(overlap, 0, `${deg}° overlap samples`);
    assert.equal(gap, 0, `${deg}° gap samples`);
    assert.ok(polygons.every((poly) => polygonArea(poly) > 0), `${deg}° anticlockwise`);
  }
});
