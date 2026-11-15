import test from 'node:test';
import assert from 'node:assert/strict';
import { dxfToPaths, openingSymbol, polygonPath, formatArea, gateGeometry } from '../../website/assets/app/editor/drawing.js';

const near = (p, q, tol = 1e-6) => Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol;

test('dxfToPaths groups entities by layer in plan metres', () => {
  const entities = [
    { type: 'LINE', layer: 'A-WALL', a: [0, 0], b: [1000, 0] },
    { type: 'POLY', layer: 'A-WALL', points: [[0, 0], [0, 500], [200, 500]], closed: true },
    { type: 'CIRCLE', layer: 'COL', center: [500, 500], radius: 100 },
    { type: 'INSERT', layer: 'A-DOOR', name: 'DOOR', at: [0, 0] },
    { type: 'TEXT', layer: 'ROOM', at: [100, 200], text: 'LOUNGE', height: 150, rotationDeg: 0 }
  ];
  const out = dxfToPaths(entities, 0.001, [10, 20]);
  assert.deepEqual(out.layers.map((l) => l.layer), ['A-WALL', 'COL']);
  assert.equal(out.layers[0].d, 'M10 20L11 20M10 20L10 20.5L10.2 20.5Z');
  assert.match(out.layers[1].d, /^M10\.6 20\.5L/);
  assert.match(out.layers[1].d, /Z$/);
  assert.equal(out.texts.length, 1);
  assert.ok(near(out.texts[0].at, [10.1, 20.2]));
  assert.ok(Math.abs(out.texts[0].height - 0.15) < 1e-9);
  assert.ok(near(out.bounds.min, [10, 20]));
  assert.ok(near(out.bounds.max, [11, 20.6]));
});

test('dxfToPaths samples arcs anticlockwise from start to end angle', () => {
  const out = dxfToPaths([{ type: 'ARC', layer: '0', center: [0, 0], radius: 1, startDeg: 350, endDeg: 10 }]);
  const coords = out.layers[0].d.slice(1).split('L').map((pair) => pair.split(' ').map(Number));
  assert.ok(near(coords[0], [Math.cos((350 * Math.PI) / 180), Math.sin((350 * Math.PI) / 180)], 1e-4));
  assert.ok(near(coords[coords.length - 1], [Math.cos(Math.PI / 18), Math.sin(Math.PI / 18)], 1e-4));
  assert.ok(coords.every(([x]) => x > 0.98));
});

test('dxfToPaths skips broken entities and reports no bounds when empty', () => {
  const out = dxfToPaths([{ type: 'LINE', layer: 'x', a: [Number.NaN, 0], b: [1, 1] }, null]);
  assert.deepEqual(out.layers, []);
  assert.equal(out.bounds, null);
});

test('door symbol: leaf from the hinge jamb on the left face and a quarter-circle swing', () => {
  const wall = { a: [0, 0], b: [4, 0], thickness: 0.2 };
  const sym = openingSymbol(wall, { type: 'door', at: 2, width: 0.9 });
  assert.equal(sym.cut.length, 4);
  assert.ok(near(sym.cut[0], [1.55, -0.1]));
  assert.ok(near(sym.cut[2], [2.45, 0.1]));
  const leaf = sym.lines.find(([p, q]) => near(p, [1.55, 0.1]) && near(q, [1.55, 1.0]));
  assert.ok(leaf, 'leaf line missing');
  assert.ok(near(sym.arc[0], [1.55, 1.0]));
  assert.ok(near(sym.arc[sym.arc.length - 1], [2.45, 0.1]));
});

test('window symbol: two face lines, a glass line and two jambs', () => {
  const wall = { a: [0, 0], b: [0, 4], thickness: 0.2 };
  const sym = openingSymbol(wall, { type: 'window', at: 1, width: 1 });
  assert.equal(sym.lines.length, 5);
  assert.equal(sym.arc, null);
  assert.ok(sym.lines.some(([p, q]) => near(p, [0, 0.5]) && near(q, [0, 1.5])));
});

test('gateGeometry centres the gap on the nearest boundary edge', () => {
  const boundary = [[0, 0], [10, 0], [10, 8], [0, 8]];
  const g = gateGeometry(boundary, { at: [10.02, 4], width: 3 }, 0.2);
  assert.equal(g.edge, 1);
  assert.ok(near(g.a, [10, 2.5]));
  assert.ok(near(g.b, [10, 5.5]));
  assert.equal(g.cut.length, 4);
  assert.equal(gateGeometry([], { at: [0, 0], width: 1 }, 0), null);
});

test('polygonPath and formatArea', () => {
  assert.equal(polygonPath([[0, 0], [1, 0], [1, 1]]), 'M0 0L1 0L1 1Z');
  assert.equal(polygonPath([]), '');
  assert.equal(formatArea(10, 'imperial'), '108 ft²');
  assert.equal(formatArea(10, 'metric'), '10.0 m²');
});
