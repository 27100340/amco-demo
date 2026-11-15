import test from 'node:test';
import assert from 'node:assert/strict';
import { UNIT_FACTORS, parseLength, formatLength } from '../../website/assets/app/model/units.js';

test('unit factors', () => {
  assert.deepEqual(UNIT_FACTORS, { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 });
});

test('parseLength handles ft-in, mm, signed metres', () => {
  const cases = [
    ['3.35', 'm', 3.35],
    ['+3.350', 'm', 3.35],
    ['-0.45', 'm', -0.45],
    ['±0.000', 'm', 0],
    ['3350', 'mm', 3.35],
    ['+3350', 'mm', 3.35],
    ['3.35m', 'm', 3.35],
    ['3.35 M', 'mm', 3.35],
    ['335cm', 'm', 3.35],
    ['3350mm', 'm', 3.35],
    ['.5', 'm', 0.5],
    ["10'", 'm', 3.048],
    ['10\'-6"', 'm', 3.2004],
    ['10\' 6"', 'm', 3.2004],
    ["10'6", 'm', 3.2004],
    ['+10\'-6"', 'm', 3.2004],
    ['-1\'-6"', 'm', -0.4572],
    ['10′ 6″', 'm', 3.2004],
    ['9"', 'm', 0.2286],
    ['9', 'in', 0.2286],
    ['4½"', 'm', 0.1143],
    ['4 1/2"', 'm', 0.1143],
    ['½"', 'm', 0.0127],
    ['3\'-0 1/2"', 'm', 0.9271],
    ['3\'-0½"', 'm', 0.9271],
    ['2\'6"', 'm', 0.762],
    ['10 ft 6 in', 'm', 3.2004],
    ['10ft', 'm', 3.048],
    ['10FT', 'mm', 3.048],
    ['6in', 'm', 0.1524],
    ['9in.', 'm', 0.2286],
    ['10ft 6in', 'm', 3.2004],
    ['2ft6in', 'm', 0.762],
    ['10 feet 6 inches', 'm', 3.2004],
    ['.5"', 'm', 0.0127],
    ['.5\'', 'm', 0.1524],
    ['3\'-.5"', 'm', 0.9271],
    [12, 'ft', 3.6576]
  ];
  for (const [text, unit, expected] of cases) {
    const value = parseLength(text, unit);
    assert.ok(value !== null && Math.abs(value - expected) < 1e-9, `${text} (${unit}) -> ${value}, expected ${expected}`);
  }
  assert.ok(Object.is(parseLength('±0.000'), 0), 'zero is never negative');
});

test('parseLength returns null for text that is not a length', () => {
  for (const text of ['', '   ', 'abc', "10'x", '3..5', '1/0"', '5 kg', '--3', null, undefined, Number.NaN, {}]) {
    assert.equal(parseLength(text), null, String(text));
  }
  assert.equal(parseLength('3', 'furlong'), null);
});

test('formatLength writes feet and inches to the nearest half inch', () => {
  assert.equal(formatLength(3.2004, 'imperial'), '10′ 6″');
  assert.equal(formatLength(3.2004), '10′ 6″');
  assert.equal(formatLength(0.1143, 'imperial'), '4½″');
  assert.equal(formatLength(0.2286), '9″');
  assert.equal(formatLength(0.0127), '½″');
  assert.equal(formatLength(3.048), '10′ 0″');
  assert.equal(formatLength(0.9271), '3′ 0½″');
  assert.equal(formatLength(0.3047), '1′ 0″');
  assert.equal(formatLength(0), '0″');
  assert.equal(formatLength(-0.4572), '−1′ 6″');
});

test('formatLength writes metres to two decimals', () => {
  assert.equal(formatLength(3.2, 'metric'), '3.20 m');
  assert.equal(formatLength(0.115, 'metric'), '0.12 m');
  assert.equal(formatLength(-0.45, 'metric'), '−0.45 m');
  assert.equal(formatLength(-0.001, 'metric'), '0.00 m');
  assert.equal(formatLength(Number.NaN), '');
});

test('formatted lengths parse back', () => {
  for (const metres of [0.1143, 0.2286, 2.1336, 3.2004, 3.048]) {
    const back = parseLength(formatLength(metres));
    assert.ok(Math.abs(back - metres) < 0.0064, `${metres} -> ${formatLength(metres)} -> ${back}`);
  }
});
