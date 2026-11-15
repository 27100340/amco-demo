import test from 'node:test';
import assert from 'node:assert/strict';
import { snapPoint } from '../../website/assets/app/editor/snap.js';

const walls = [
  { a: [0, 0], b: [4, 0] },
  { a: [4, 0], b: [4, 3] }
];
const close = (actual, expected, tol = 1e-9) => {
  assert.ok(Math.abs(actual[0] - expected[0]) <= tol && Math.abs(actual[1] - expected[1]) <= tol,
    `expected [${expected}], got [${actual}]`);
};

test('an endpoint within tolerance wins over ortho', () => {
  const r = snapPoint([3.93, 2.95], { walls, ortho: true, from: [1, 2], tolerance: 0.1 });
  assert.equal(r.kind, 'endpoint');
  assert.deepEqual(r.point, [4, 3]);
});

test('an endpoint outside tolerance is ignored', () => {
  const r = snapPoint([3.7, 2.6], { walls: [{ a: [0, 0], b: [4, 0] }], ortho: false, tolerance: 0.1 });
  assert.equal(r.kind, 'free');
  assert.deepEqual(r.point, [3.7, 2.6]);
});

test('the nearest endpoint wins when several are within tolerance', () => {
  const r = snapPoint([0.06, 0], { walls: [{ a: [0, 0], b: [0.1, 0] }], ortho: false, tolerance: 0.1 });
  assert.equal(r.kind, 'endpoint');
  assert.deepEqual(r.point, [0.1, 0]);
});

test('ortho locks to 0, 90, 180 and 270 degrees from `from`', () => {
  const from = [10, 10];
  const cases = [
    [[13, 10.4], [13, 10]],
    [[10.3, 14], [10, 14]],
    [[6, 9.2], [6, 10]],
    [[9.5, 5], [10, 5]]
  ];
  for (const [pt, expected] of cases) {
    const r = snapPoint(pt, { walls: [], ortho: true, from, tolerance: 0.1 });
    assert.equal(r.kind, 'ortho');
    close(r.point, expected);
  }
});

test('free when ortho is off and nothing is near', () => {
  const r = snapPoint([13, 10.4], { walls: [], ortho: false, from: [10, 10], tolerance: 0.1 });
  assert.equal(r.kind, 'free');
  assert.deepEqual(r.point, [13, 10.4]);
});

test('ortho without a `from` point is free', () => {
  const r = snapPoint([13, 10.4], { walls: [], ortho: true, tolerance: 0.1 });
  assert.equal(r.kind, 'free');
});

test('snaps onto a wall centreline when ortho is off', () => {
  const r = snapPoint([2, 0.07], { walls, ortho: false, tolerance: 0.1 });
  assert.equal(r.kind, 'wall');
  close(r.point, [2, 0]);
});

test('with ortho on, a wall near the locked point gives the exact crossing', () => {
  const r = snapPoint([2.1, 0.06], { walls, ortho: true, from: [2, 2], tolerance: 0.1 });
  assert.equal(r.kind, 'wall');
  close(r.point, [2, 0]);
});

test('with ortho on, a wall parallel to the locked direction does not break ortho', () => {
  const r = snapPoint([2, 0.05], { walls, ortho: true, from: [0, 0.05], tolerance: 0.1 });
  assert.equal(r.kind, 'ortho');
  close(r.point, [2, 0.05]);
});

test('extra points snap like endpoints', () => {
  const r = snapPoint([5.04, 5.02], { walls: [], points: [[5, 5]], ortho: false, tolerance: 0.1 });
  assert.equal(r.kind, 'endpoint');
  assert.deepEqual(r.point, [5, 5]);
});

test('the returned point is a fresh array', () => {
  const r = snapPoint([0.01, 0], { walls, ortho: false, tolerance: 0.1 });
  r.point[0] = 99;
  assert.deepEqual(walls[0].a, [0, 0]);
});
