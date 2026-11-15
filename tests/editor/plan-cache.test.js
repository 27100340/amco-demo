import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanCache, syncRooms, levelPlan, copyData, connectedEnds } from '../../website/assets/app/editor/model-ops.js';
import { levelRooms } from '../../website/assets/app/editor/hit.js';

/** An n × n grid of 4 m rooms: 2·n·(n+1) walls (144 walls and 64 rooms for n = 8). */
function grid(n = 8, size = 4, level = 'g') {
  const walls = [];
  for (let r = 0; r <= n; r++) {
    for (let c = 0; c < n; c++) walls.push({ id: `${level}h${r}-${c}`, level, a: [c * size, r * size], b: [(c + 1) * size, r * size], thickness: 0.2286, role: 'exterior', openings: [] });
  }
  for (let c = 0; c <= n; c++) {
    for (let r = 0; r < n; r++) walls.push({ id: `${level}v${c}-${r}`, level, a: [c * size, r * size], b: [c * size, (r + 1) * size], thickness: 0.1143, role: 'partition', openings: [] });
  }
  return walls;
}

function building() {
  return {
    schema: 'amco.building/1', id: 'grid', name: 'Grid', kind: 'house', source: 'trace',
    levels: [
      { id: 'g', name: 'Ground', elevation: 0, height: 3.2, ceiling: 3.05, slab: 0.15 },
      { id: 'f', name: 'First', elevation: 3.2, height: 3.2, ceiling: 3.05, slab: 0.15 }
    ],
    walls: [...grid(8, 4, 'g'), ...grid(8, 4, 'f')],
    rooms: [], fixtures: [], views: []
  };
}

test('the plan cache returns the same plan for the same building and for an identical copy', () => {
  const b = building();
  const plans = createPlanCache();
  const first = plans.get(b, 'g');
  assert.equal(plans.get(b, 'g'), first);
  assert.equal(plans.get(copyData(b), 'g'), first);
  assert.deepEqual(first, levelPlan(b, 'g'));
});

test('editing one level leaves the other level\'s cached plan in use', () => {
  const b = building();
  const plans = createPlanCache();
  const ground = plans.get(b, 'g');
  const first = plans.get(b, 'f');
  const moved = copyData(b);
  moved.walls.find((w) => w.id === 'gh4-4').b = [20.3, 16.2];
  assert.notEqual(plans.get(moved, 'g'), ground);
  assert.equal(plans.get(moved, 'f'), first);
});

test('syncRooms can take its plans from the cache, so a change works out each plan once', () => {
  const b = building();
  const plans = createPlanCache();
  let computed = 0;
  const planFor = (id) => {
    computed += 1;
    return plans.get(b, id);
  };
  syncRooms(b, { planFor });
  assert.equal(computed, 2);
  assert.equal(b.rooms.length, 128);
  assert.equal(plans.get(b, 'g'), planFor('g'));
});

test('cached plans on a 144-wall grid: one plan per changed state, none again at commit', () => {
  const b = building();
  const plans = createPlanCache();
  syncRooms(b, { planFor: (id) => plans.get(b, id) });
  assert.equal(plans.computed, 2);
  const ends = connectedEnds(b.walls, [16, 16], 'g');
  const moveTo = (state, i) => {
    for (const { wallId, end } of ends) state.walls.find((w) => w.id === wallId)[end] = [16 + i * 0.03, 16 + i * 0.02];
  };
  for (let i = 1; i <= 10; i++) {
    const preview = copyData(b);
    moveTo(preview, i);
    levelRooms(preview, 'g', plans.get(preview, 'g'));
    plans.get(preview, 'f');
  }
  assert.equal(plans.computed, 12);
  const committed = copyData(b);
  moveTo(committed, 10);
  syncRooms(committed, { planFor: (id) => plans.get(committed, id) });
  assert.equal(plans.computed, 12);
  assert.equal(committed.rooms.length, 128);
});

/** Plan summary that does not depend on piece order or internal piece ids. */
function summary(plan) {
  const round = (n) => Math.round(n * 1e6) / 1e6;
  const faces = plan.faces.map((f) => round(f.area)).sort((x, y) => x - y);
  const byWall = new Map();
  for (const { piece, wallId } of plan.pieces) {
    const poly = plan.footprints.get(piece.id).polygon;
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      area += p[0] * q[1] - q[0] * p[1];
    }
    byWall.set(wallId, round((byWall.get(wallId) ?? 0) + area / 2));
  }
  return { pieces: plan.pieces.length, faces, footprintArea: [...byWall.entries()].sort() };
}

test('a drag preview plan built incrementally matches a full plan', () => {
  const base = building();
  syncRooms(base);
  const cases = {
    'corner drag': (b) => {
      for (const { wallId, end } of connectedEnds(b.walls, [16, 16], 'g')) b.walls.find((w) => w.id === wallId)[end] = [17.1, 15.4];
    },
    'whole wall moved sideways': (b) => {
      const wall = b.walls.find((w) => w.id === 'gv4-3');
      wall.a = [16.6, 12];
      wall.b = [16.6, 16];
    },
    'end dragged across another wall': (b) => {
      b.walls.find((w) => w.id === 'gh4-4').b = [22.5, 17.2];
    },
    'wall deleted': (b) => {
      b.walls = b.walls.filter((w) => w.id !== 'gv4-3');
    },
    'opening added': (b) => {
      b.walls.find((w) => w.id === 'gh4-4').openings.push({ id: 'd1', type: 'door', at: 2, width: 0.9, height: 2.1, sill: 0 });
    }
  };
  for (const [name, change] of Object.entries(cases)) {
    const plans = createPlanCache();
    const preview = copyData(base);
    change(preview);
    const fast = plans.preview(base, preview, 'g');
    assert.deepEqual(summary(fast), summary(levelPlan(preview, 'g')), name);
    assert.equal(plans.get(preview, 'g'), fast, `${name}: the preview plan is reused for drawing`);
  }
});

test('repeated preview moves re-node only the walls near the drag', () => {
  const base = building();
  const plans = createPlanCache();
  const ends = connectedEnds(base.walls, [16, 16], 'g');
  let previous = null;
  for (let i = 1; i <= 5; i++) {
    const preview = copyData(base);
    for (const { wallId, end } of ends) preview.walls.find((w) => w.id === wallId)[end] = [16 + i * 0.1, 16 - i * 0.05];
    const plan = plans.preview(base, preview, 'g');
    assert.notEqual(plan, previous);
    assert.deepEqual(summary(plan), summary(levelPlan(preview, 'g')));
    previous = plan;
  }
  assert.equal(plans.staticNodings, 1);
});
