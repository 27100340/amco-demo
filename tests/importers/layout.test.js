import test from 'node:test';
import assert from 'node:assert/strict';
import { extractLayout } from '../../website/assets/app/importers/extract/layout.js';
import { createDxf } from '../../tools/sample-drawings/dxf-writer.mjs';
import { parse, rect } from '../fixtures/dxf/plans.js';

const near = (actual, expected, tol = 1e-6, label = '') => {
  assert.ok(actual !== null && Math.abs(actual - expected) <= tol, `${label} expected ${expected}, got ${actual}`);
};
const nearPoints = (actual, expected, tol = 1e-6) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((p, i) => {
    near(p[0], expected[i][0], tol, `x${i}`);
    near(p[1], expected[i][1], tol, `y${i}`);
  });
};

/** A 10 × 20 m plot with a 230 mm boundary wall centred on the plot line and a 3.6 m gate. */
function layoutDoc({ gateText = 'GATE', roadPolygon = true, roadText = 'ROAD' } = {}) {
  const d = createDxf();
  d.poly('C-PROP', [[0, 0], [10000, 0], [10000, 20000], [0, 20000]], true);
  const h = 115;
  const w = (a, b) => d.line('A-SITE-WALL', a, b);
  w([-h, -h], [2000, -h]); w([5600, -h], [10000 + h, -h]);
  w([h, h], [2000, h]); w([5600, h], [10000 - h, h]);
  w([2000, -h], [2000, h]); w([5600, -h], [5600, h]);
  w([10000 + h, -h], [10000 + h, 20000 + h]); w([10000 - h, h], [10000 - h, 20000 - h]);
  w([10000 + h, 20000 + h], [-h, 20000 + h]); w([10000 - h, 20000 - h], [h, 20000 - h]);
  w([-h, 20000 + h], [-h, -h]); w([h, 20000 - h], [h, h]);
  if (gateText) d.text('A-SITE-GATE', [3800, -700], 250, gateText, 0, { h: 'center', v: 'middle' });
  rect(d, 'L-PLNT', [6000, 500], [9500, 4000]);
  rect(d, 'A-SITE-PAVE', [2000, 0], [5600, 5000]);
  if (roadPolygon) rect(d, 'C-ROAD', [-3000, -10000], [13000, -1000]);
  if (roadText) d.text('A-ANNO-NOTE', [5000, -5000], 400, roadText, 0, { h: 'center', v: 'middle' });
  rect(d, 'A-SITE-BLDG', [1000, 5000], [9000, 18000]);
  d.text('A-ANNO-NOTE', [12000, 10000], 200, 'BOUNDARY WALL 9" THICK, 7\'-0" HIGH');
  d.text('A-ANNO-TTLB', [0, -14000], 500, 'SITE LAYOUT');
  return parse(d);
}

test('plot boundary, boundary wall, gate, lawn, paving, road and footprint', () => {
  const site = extractLayout(layoutDoc(), { factor: 0.001 });
  nearPoints(site.boundary, [[0, 0], [10, 0], [10, 20], [0, 20]]);
  near(site.boundaryWall.thickness, 0.23);
  near(site.boundaryWall.height, 7 * 0.3048);
  assert.equal(site.boundaryWall.gates.length, 1);
  const gate = site.boundaryWall.gates[0];
  near(gate.width, 3.6);
  near(gate.at[0], 3.8);
  near(gate.at[1], 0);
  const materials = site.ground.map((g) => g.material).sort();
  assert.deepEqual(materials, ['lawn', 'paving', 'road']);
  nearPoints(site.ground.find((g) => g.material === 'lawn').polygon, [[6, 0.5], [9.5, 0.5], [9.5, 4], [6, 4]]);
  nearPoints(site.footprint, [[1, 5], [9, 5], [9, 18], [1, 18]]);
  assert.deepEqual(site.street, { side: 'south', width: 9 });
  assert.deepEqual(site.warnings, []);
});

test('road width from the road text when there is no road polygon', () => {
  const site = extractLayout(layoutDoc({ roadPolygon: false, roadText: '30\'-0" WIDE ROAD' }), { factor: 0.001 });
  assert.equal(site.street.side, 'south');
  near(site.street.width, 30 * 0.3048);
});

test('an unlabelled gap in the boundary wall is still a gate', () => {
  const site = extractLayout(layoutDoc({ gateText: null }), { factor: 0.001 });
  assert.equal(site.boundaryWall.gates.length, 1);
  near(site.boundaryWall.gates[0].width, 3.6);
});

test('no boundary gives nulls and a warning', () => {
  const d = createDxf();
  d.text('A-ANNO-TTLB', [0, 0], 500, 'SITE LAYOUT');
  const site = extractLayout(parse(d), { factor: 0.001 });
  assert.equal(site.boundary, null);
  assert.equal(site.boundaryWall, null);
  assert.equal(site.footprint, null);
  assert.equal(site.street, null);
  assert.deepEqual(site.ground, []);
  assert.ok(site.warnings.some((w) => /plot boundary/i.test(w)));
});

test('a plot boundary drawn as loose lines is chained, quickly even among thousands of other lines', () => {
  const d = createDxf();
  let s = 3;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < 20000; i++) {
    const x = 20000 + rnd() * 30000;
    const y = rnd() * 20000;
    d.line('C-PROP', [x, y], [x + rnd() * 900, y + rnd() * 900]);
  }
  // The plot outline: four lines out of order, two of them drawn backwards.
  d.line('C-PROP', [10000, 20000], [10000, 0]);
  d.line('C-PROP', [0, 0], [10000, 0]);
  d.line('C-PROP', [0, 20000], [10000, 20000]);
  d.line('C-PROP', [0, 20000], [0, 0]);
  d.text('A-ANNO-TTLB', [0, -14000], 500, 'SITE LAYOUT');
  const doc = parse(d);
  const started = performance.now();
  const site = extractLayout(doc, { factor: 0.001 });
  const ms = performance.now() - started;
  assert.ok(site.boundary, 'boundary found');
  const xs = site.boundary.map((p) => p[0]);
  const ys = site.boundary.map((p) => p[1]);
  assert.equal(site.boundary.length, 4);
  near(Math.min(...xs), 0); near(Math.max(...xs), 10);
  near(Math.min(...ys), 0); near(Math.max(...ys), 20);
  assert.ok(ms < 5000, `took ${Math.round(ms)} ms (comparing every line end with every other took minutes)`);
});
