import test from 'node:test';
import assert from 'node:assert/strict';
import { detectUnits, INSUNITS_CODES } from '../../website/assets/app/importers/extract/units.js';

const doc = (insunits, entities = []) => ({ version: null, insunits, layers: [], entities, extents: { min: [0, 0], max: [0, 0] }, warnings: [] });
const line = (layer, a, b) => ({ type: 'LINE', layer, a, b });

/** Two parallel 9″ wall lines and a 4½″ partition, drawn in the given unit (metres per unit). */
function wallsIn(factor, layer = '0') {
  const u = (m) => m / factor;
  return [
    line(layer, [0, 0], [u(4), 0]),
    line(layer, [0, u(0.2286)], [u(4), u(0.2286)]),
    line(layer, [u(2), u(0.2286)], [u(2), u(3)]),
    line(layer, [u(2.1143), u(0.2286)], [u(2.1143), u(3)])
  ];
}

test('units from the $INSUNITS header', () => {
  assert.deepEqual(detectUnits(doc(4)), { unit: 'mm', factor: 0.001, source: 'header' });
  assert.deepEqual(detectUnits(doc(6)), { unit: 'm', factor: 1, source: 'header' });
  assert.deepEqual(detectUnits(doc(1)), { unit: 'in', factor: 0.0254, source: 'header' });
  assert.deepEqual(detectUnits(doc(2)), { unit: 'ft', factor: 0.3048, source: 'header' });
  assert.deepEqual(detectUnits(doc(5)), { unit: 'cm', factor: 0.01, source: 'header' });
  assert.equal(INSUNITS_CODES[4], 'mm');
});

test('units from the most common wall spacing', () => {
  assert.equal(detectUnits(doc(null), [230, 230, 115]).unit, 'mm');
  assert.equal(detectUnits(doc(null), [0.23, 0.23, 0.115]).unit, 'm');
  assert.equal(detectUnits(doc(null), [9, 9, 4.5]).unit, 'in');
  assert.equal(detectUnits(doc(null), [0.75, 0.75, 0.375]).unit, 'ft');
  assert.equal(detectUnits(doc(null), [23, 11.5]).unit, 'cm');
  assert.deepEqual(detectUnits(doc(null), [228.6]), { unit: 'mm', factor: 0.001, source: 'heuristic' });
});

test('unitless or unknown header codes fall back to the heuristic', () => {
  assert.equal(detectUnits(doc(0), [9, 9]).source, 'heuristic');
  assert.equal(detectUnits(doc(0), [9, 9]).unit, 'in');
  assert.equal(detectUnits(doc(3), [0.75]).unit, 'ft');
});

test('wall spacings are measured from the drawing when not given', () => {
  assert.deepEqual(detectUnits(doc(null, wallsIn(0.0254))), { unit: 'in', factor: 0.0254, source: 'heuristic' });
  assert.equal(detectUnits(doc(null, wallsIn(0.001, 'A-WALL'))).unit, 'mm');
  assert.equal(detectUnits(doc(null, wallsIn(0.3048))).unit, 'ft');
  assert.equal(detectUnits(doc(null, wallsIn(1))).unit, 'm');
});

test('no header and nothing wall-like gives the mm default', () => {
  assert.deepEqual(detectUnits(doc(null)), { unit: 'mm', factor: 0.001, source: 'default' });
  assert.deepEqual(detectUnits(doc(null, [line('0', [0, 0], [10, 0])])), { unit: 'mm', factor: 0.001, source: 'default' });
  assert.deepEqual(detectUnits(null), { unit: 'mm', factor: 0.001, source: 'default' });
});
