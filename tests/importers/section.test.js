import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSection } from '../../website/assets/app/importers/extract/section.js';
import { createDxf } from '../../tools/sample-drawings/dxf-writer.mjs';
import { parse } from '../fixtures/dxf/plans.js';

const near = (actual, expected, tol = 1e-6, label = '') => {
  assert.ok(actual !== null && Math.abs(actual - expected) <= tol, `${label} expected ${expected}, got ${actual}`);
};
const FT = 0.3048;
const IN = 0.0254;

/** A section sheet with level marker texts at their elevation (metres → mm on the y axis). */
function sectionDoc(markers, title = 'SECTION A-A') {
  const d = createDxf();
  d.line('A-SECT-MCUT', [0, 0], [12000, 0]);
  for (const [text, elevation, extra = {}] of markers) {
    d.text(extra.layer ?? 'A-ANNO-LEVL', [extra.x ?? 13000, elevation * 1000], 200, text, extra.rotation ?? 0);
  }
  d.text('A-ANNO-TTLB', [0, -3000], 500, title);
  return parse(d);
}

test('metric level markers give both storeys, slab, parapet, plinth, sill and lintel', () => {
  const result = extractSection(sectionDoc([
    ['GROUND FLOOR FFL ±0.000', 0],
    ['CEILING +3.050', 3.05],
    ['FIRST FLOOR FFL +3.350', 3.35],
    ['CEILING +6.400', 6.4],
    ['ROOF +6.750', 6.75],
    ['PARAPET +7.750', 7.75],
    ['PLINTH +0.450', 0.45, { x: -2000 }],
    ['SILL +0.900', 0.9, { x: -2000 }],
    ['LINTEL +2.100', 2.1, { x: -2000 }]
  ]), { factor: 0.001 });
  assert.equal(result.section, 'A');
  assert.equal(result.levels.length, 2);
  const [g, f] = result.levels;
  assert.equal(g.index, 0);
  assert.equal(g.name, 'Ground floor');
  near(g.ffl, 0);
  near(g.ceiling, 3.05);
  near(g.slab, 0.3);
  assert.equal(f.index, 1);
  assert.equal(f.name, 'First floor');
  near(f.ffl, 3.35);
  near(f.ceiling, 3.05);
  near(f.slab, 0.35, 1e-6, 'top slab from the roof marker');
  near(result.parapet, 1.0, 1e-6, 'parapet above the roof slab top');
  near(result.plinth, 0.45);
  near(result.sill, 0.9);
  near(result.lintel, 2.1);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.defaultsUsed, []);
});

test('feet-and-inches markers are converted', () => {
  const result = extractSection(sectionDoc([
    ['GROUND FLOOR F.F.L. ±0\'-0"', 0],
    ['CEILING +10\'-6"', 10.5 * FT],
    ['FIRST FLOOR F.F.L. +11\'-0"', 11 * FT],
    ['CEILING +21\'-6"', 21.5 * FT],
    ['ROOF T.O.S. +22\'-0"', 22 * FT],
    ['PARAPET +25\'-6"', 25.5 * FT],
    ['N.G.L. -1\'-6"', -1.5 * FT],
    ['PLINTH LEVEL ±0\'-0"', 0, { x: -2000 }],
    ['SILL LEVEL +3\'-0"', 3 * FT, { x: -2000 }],
    ['LINTEL LEVEL +7\'-0"', 7 * FT, { x: -2000 }]
  ], 'SECTION B-B'), { factor: 0.001 });
  assert.equal(result.section, 'B');
  const [g, f] = result.levels;
  near(g.ffl, 0);
  near(f.ffl, 11 * FT);
  near(g.ceiling, 10.5 * FT);
  near(f.ceiling, 10.5 * FT);
  near(g.slab, 6 * IN);
  near(f.slab, 6 * IN);
  near(result.parapet, 3.5 * FT);
  near(result.plinth, 1.5 * FT, 1e-6, 'plinth from the natural ground level');
  near(result.sill, 3 * FT);
  near(result.lintel, 7 * FT);
});

test('a missing ceiling uses the default and says so', () => {
  const result = extractSection(sectionDoc([
    ['GROUND FLOOR FFL ±0.000', 0],
    ['CEILING +3.050', 3.05],
    ['FIRST FLOOR FFL +3.350', 3.35]
  ]), { factor: 0.001 });
  assert.equal(result.levels.length, 2);
  near(result.levels[1].ceiling, 3.05);
  assert.equal(result.levels[1].slab, null);
  assert.equal(result.parapet, null);
  assert.equal(result.plinth, null);
  assert.ok(result.warnings.some((w) => /ceiling/i.test(w) && /first floor/i.test(w)), result.warnings.join(' | '));
  assert.ok(result.defaultsUsed.some((d) => /first floor ceiling/i.test(d)));
});

test('a marker word and its value can be separate texts on the same row; rotated dimensions are ignored', () => {
  const result = extractSection(sectionDoc([
    ['F.F.L.', 0, { x: 12500 }],
    ['±0.000', 0, { x: 13500 }],
    ['FINISHED FLOOR LEVEL', 3.35, { x: 12500 }],
    ['+3350', 3.35, { x: 14500 }],
    ['CLG. +3.050', 3.05],
    ['CEILING +2.000', 2.0, { rotation: 90, x: -500 }]
  ]), { factor: 0.001 });
  assert.equal(result.levels.length, 2);
  near(result.levels[0].ffl, 0);
  near(result.levels[1].ffl, 3.35, 1e-6, 'whole numbers of 100 or more are millimetres');
  near(result.levels[0].ceiling, 3.05);
  assert.equal(result.levels[0].name, 'Ground floor', 'storeys without names are numbered from the ground');
  assert.equal(result.levels[1].name, 'First floor');
});

test('a section without level markers gives no levels and a warning', () => {
  const result = extractSection(sectionDoc([]), { factor: 0.001 });
  assert.deepEqual(result.levels, []);
  assert.ok(result.warnings.some((w) => /no floor levels/i.test(w)));
});
