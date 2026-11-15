import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { splitFixtures } from '../../website/assets/app/engine/compile/building.js';
import { createKitBuilder, registerKit } from '../../website/assets/app/engine/kits/index.js';
import { runSliced } from '../../website/assets/app/engine/load-scheduler.js';

const square = (x, y, size = 4) => [[x, y], [x + size, y], [x + size, y + size], [x, y + size]];
const ROOMS = new Map([
  ['lounge', { id: 'lounge', level: 'g', use: 'lounge', polygon: square(0, 0) }],
  ['porch', { id: 'porch', level: 'g', use: 'porch', polygon: square(4, 0) }],
  ['bedroom', { id: 'bedroom', level: 'f', use: 'bedroom', polygon: square(0, 0) }]
]);
const FIXTURES = [
  { kit: 'sofa.3-seat', level: 'g', at: [1, 1] },
  { kit: 'car.sedan', level: 'g', at: [5, 1] },
  { kit: 'tree.ornamental', level: 'g', at: [-3, -3] },
  { kit: 'bed.king', level: 'f', at: [2, 2] },
  { kit: 'tank.water', level: 'f', at: [2, 3] },
  { kit: 'stair.dogleg', level: 'g', at: [3, 3] }
];

test('without an opening view every fixture is built at once', () => {
  const { now, later } = splitFixtures(FIXTURES, ROOMS, null);
  assert.equal(now.length, FIXTURES.length);
  assert.equal(later.length, 0);
});

test('the exterior opening view leaves furniture in enclosed rooms for later', () => {
  const { now, later } = splitFixtures(FIXTURES, ROOMS, { mode: 'exterior' });
  assert.deepEqual(now.map((f) => f.kit), ['car.sedan', 'tree.ornamental', 'tank.water']);
  assert.deepEqual(later.map((f) => f.kit), ['sofa.3-seat', 'bed.king', 'stair.dogleg']);
});

test('a room opening view also builds that room at once', () => {
  const { now, later } = splitFixtures(FIXTURES, ROOMS, { mode: 'room', room: 'bedroom' });
  assert.ok(now.some((f) => f.kit === 'bed.king'));
  assert.ok(later.some((f) => f.kit === 'sofa.3-seat'));
});

test('the kit builder builds each kit and parameter set once and hands out copies', () => {
  let builds = 0;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial();
  registerKit('test.counted', {
    build: (params) => {
      builds += 1;
      const group = new THREE.Group();
      group.add(new THREE.Mesh(geometry, material));
      group.userData.width = params.w;
      return group;
    }
  });
  const build = createKitBuilder({ THREE });
  const a = build('test.counted', { w: 1 });
  const b = build('test.counted', { w: 1 });
  const c = build('test.counted', { w: 2 });
  assert.equal(builds, 2);
  assert.notEqual(a, b);
  assert.equal(a.children[0].geometry, b.children[0].geometry);
  assert.equal(a.children[0].material, b.children[0].material);
  a.position.set(5, 0, 0);
  a.visible = false;
  const d = build('test.counted', { w: 1 });
  assert.equal(d.position.x, 0);
  assert.equal(d.visible, true);
  assert.equal(c.userData.width, 2);
});

test('runSliced yields between slices and stops when cancelled', async () => {
  let clock = 0;
  let yields = 0;
  const seen = [];
  const done = await runSliced([1, 2, 3, 4, 5], (item) => {
    seen.push(item);
    clock += 5;
  }, { budgetMs: 10, now: () => clock, yieldTo: async () => { yields += 1; } });
  assert.equal(done, true);
  assert.deepEqual(seen, [1, 2, 3, 4, 5]);
  assert.equal(yields, 2);
  const partial = [];
  const finished = await runSliced([1, 2, 3, 4], (item) => partial.push(item), { cancelled: () => partial.length >= 2, budgetMs: 0, yieldTo: async () => {} });
  assert.equal(finished, false);
  assert.deepEqual(partial, [1, 2]);
});
