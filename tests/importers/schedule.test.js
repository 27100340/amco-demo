import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSchedule } from '../../website/assets/app/importers/extract/schedule.js';
import { createDxf } from '../../tools/sample-drawings/dxf-writer.mjs';
import { parse } from '../fixtures/dxf/plans.js';

const near = (actual, expected, tol = 1e-6, label = '') => {
  assert.ok(actual !== null && Math.abs(actual - expected) <= tol, `${label} expected ${expected}, got ${actual}`);
};
const FT = 0.3048;

test('free-text schedule rows in mm and ft-in', () => {
  const d = createDxf();
  d.text('A-ANNO-SCHD', [0, 0], 200, 'D1  DOOR  1050 x 2100  TEAK');
  d.text('A-ANNO-SCHD', [0, -400], 200, 'W1 WINDOW 1500X1200 SILL 900 ALUMINIUM');
  d.text('A-ANNO-SCHD', [0, -800], 200, 'V1 VENTILATOR 600 x 450 SILL 1800');
  d.text('A-ANNO-SCHD', [0, -1200], 200, 'D2 3\'-0" x 7\'-0"');
  d.text('A-ANNO-TTLB', [0, 2000], 500, 'WORKING DRAWING SECTION A-A');
  const result = extractSchedule(parse(d), { factor: 0.001 });
  assert.equal(result.section, 'A');
  assert.deepEqual(Object.keys(result.entries).sort(), ['D1', 'D2', 'V1', 'W1']);
  assert.deepEqual(result.entries.D1, { type: 'door', width: 1.05, height: 2.1, sill: null, material: 'TEAK' });
  const w1 = result.entries.W1;
  assert.equal(w1.type, 'window');
  near(w1.width, 1.5);
  near(w1.height, 1.2);
  near(w1.sill, 0.9);
  assert.equal(w1.material, 'ALUMINIUM');
  const v1 = result.entries.V1;
  assert.equal(v1.type, 'ventilator');
  near(v1.width, 0.6);
  near(v1.height, 0.45);
  near(v1.sill, 1.8);
  assert.equal(v1.material, null);
  const d2 = result.entries.D2;
  assert.equal(d2.type, 'door', 'type from the tag letter');
  near(d2.width, 3 * FT);
  near(d2.height, 7 * FT);
  assert.deepEqual(result.warnings, []);
});

test('table cells are grouped into rows by baseline and read by column; the header row is ignored', () => {
  const d = createDxf();
  const cols = [0, 1200, 4000, 7500, 9500, 12500];
  const header = ['TAG', 'TYPE', 'SIZE (W x H)', 'SILL', 'MATERIAL', 'QTY'];
  header.forEach((h, i) => d.text('A-ANNO-SCHD', [cols[i], 0], 200, h));
  const rows = [
    ['D1', 'MAIN DOOR', '3\'-6" x 7\'-0"', '-', 'TEAK WOOD', '2'],
    ['W2', 'WINDOW', '4\'-0" x 4\'-0"', '3\'-0"', 'ALUMINIUM', '5'],
    ['V1', 'VENTILATOR', '2\'-0" x 1\'-6"', '5\'-6"', 'ALUMINIUM', '4']
  ];
  rows.forEach((row, r) => row.forEach((cell, i) => {
    const wobble = i === 3 ? 60 : 0;
    d.text('A-ANNO-SCHD', [cols[i], -500 * (r + 1) + wobble], 200, cell);
  }));
  d.text('A-ELEV-IDEN', [20000, 5000], 200, 'W2');
  d.text('A-ANNO-TTLB', [0, 2000], 500, 'WORKING DRAWING SECTION B-B');
  const result = extractSchedule(parse(d), { factor: 0.001 });
  assert.equal(result.section, 'B');
  assert.deepEqual(Object.keys(result.entries).sort(), ['D1', 'V1', 'W2']);
  const d1 = result.entries.D1;
  assert.equal(d1.type, 'door');
  near(d1.width, 3.5 * FT);
  near(d1.height, 7 * FT);
  assert.equal(d1.sill, null);
  assert.equal(d1.material, 'TEAK WOOD');
  const w2 = result.entries.W2;
  near(w2.sill, 3 * FT, 1e-6, 'sill from the SILL column');
  near(w2.width, 4 * FT);
  assert.equal(w2.material, 'ALUMINIUM');
  near(result.entries.V1.sill, 5.5 * FT);
  assert.equal(result.entries.V1.type, 'ventilator');
});

test('a schedule beside a section: level markers on the same baseline are not read into the rows', () => {
  const d = createDxf();
  const cols = [15000, 16100, 19000, 22000, 23400];
  ['MARK', 'TYPE', 'SIZE (W x H)', 'SILL', 'MATERIAL'].forEach((h, i) => d.text('A-ANNO-SCHD', [cols[i], 8000], 180, h));
  [['D2', 'INTERNAL DOOR', '3\'-0" x 7\'-0"', '-', 'DEODAR WOOD', 6732], ['V1', 'VENTILATOR', '2\'-0" x 1\'-6"', '5\'-6"', 'ALUMINIUM', 3482]]
    .forEach(([...row]) => {
      const y = row.pop();
      row.forEach((cell, i) => d.text('A-ANNO-SCHD', [cols[i], y], 180, cell));
    });
  d.text('A-ANNO-LEVL', [10000, 6826], 200, 'ROOF T.O.S. +22\'-0"');
  d.text('A-ANNO-LEVL', [10000, 3473], 200, 'FIRST FLOOR F.F.L. +11\'-0"');
  d.text('A-ANNO-DIMS', [-4750, 6629], 180, '6"');
  d.text('A-ANNO-LEVL', [10000, -2000], 200, 'GROUND FLOOR F.F.L. ±0\'-0"');
  d.text('A-ANNO-SCHD', [15000, -2000], 180, 'W3 WINDOW 2\'-0" x 3\'-0" SILL 4\'-0" ALUMINIUM');
  d.text('A-ANNO-TTLB', [0, 12000], 500, 'WORKING DRAWING SECTION B-B');
  const result = extractSchedule(parse(d), { factor: 0.001 });
  assert.deepEqual(Object.keys(result.entries).sort(), ['D2', 'V1', 'W3']);
  near(result.entries.D2.width, 3 * FT);
  assert.equal(result.entries.D2.material, 'DEODAR WOOD');
  near(result.entries.V1.sill, 5.5 * FT);
  near(result.entries.W3.sill, 4 * FT, 1e-6, 'free-text row read from its tag on');
  assert.deepEqual(result.warnings, []);
});

test('a tag repeated with a different size keeps the first and warns', () => {
  const d = createDxf();
  d.text('A-ANNO-SCHD', [0, 0], 200, 'D1 DOOR 1050 x 2100');
  d.text('A-ANNO-SCHD', [0, -400], 200, 'D1 DOOR 1050 x 2100');
  d.text('A-ANNO-SCHD', [0, -800], 200, 'D1 DOOR 900 x 2100');
  const result = extractSchedule(parse(d), { factor: 0.001 });
  near(result.entries.D1.width, 1.05);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /D1/);
});

test('a drawing without schedule rows gives no entries and a warning', () => {
  const d = createDxf();
  d.text('A-ANNO-TTLB', [0, 0], 500, 'WORKING DRAWING SECTION A-A');
  const result = extractSchedule(parse(d), { factor: 0.001 });
  assert.deepEqual(result.entries, {});
  assert.ok(result.warnings.some((w) => /no door or window schedule/i.test(w)));
});
