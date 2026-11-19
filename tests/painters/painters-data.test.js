import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClassic } from './load-classic.js';

const { AmcoPainters: P } = loadClassic('assets/js/painters-data.js');
const CODE = /^USTAD-(LHR|KHI|ISB|FSD|MUL)-\d{3}$/;

test('tiers run Bronze to Platinum with rising thresholds', () => {
  assert.deepEqual(P.tiers.map((t) => t.id), ['bronze', 'silver', 'gold', 'platinum']);
  assert.equal(P.tiers[0].minPoints, 0);
  P.tiers.slice(1).forEach((t, i) => assert.ok(t.minPoints > P.tiers[i].minPoints));
  P.tiers.forEach((t) => assert.deepEqual(Object.keys(t.cashBack).sort(), ['drum', 'gallon', 'quarter']));
});
test('sizes give points by tin size', () => {
  assert.deepEqual(P.sizes.map((s) => [s.id, s.points]), [['quarter', 1], ['gallon', 4], ['drum', 16]]);
});
test('every painter is a well-formed sample listing with no phone number', () => {
  const tierIds = P.tiers.map((t) => t.id);
  const specIds = P.specialities.map((s) => s.id);
  const cityNames = P.cities.map((c) => c.name);
  assert.equal(P.painters.length, 8);
  assert.equal(new Set(P.painters.map((p) => p.id)).size, 8);
  for (const p of P.painters) {
    assert.match(p.code, CODE); assert.equal(p.id, p.code);
    assert.equal(P.cities.find((c) => c.name === p.city).code, p.code.split('-')[1]);
    assert.ok(cityNames.includes(p.city) && tierIds.includes(p.tier));
    assert.ok(p.specialities.length && p.specialities.every((s) => specIds.includes(s)));
    assert.ok(Number.isInteger(p.years) && Number.isInteger(p.jobs) && p.areas.length);
    assert.equal(p.sample, true); assert.equal(p.photo, null);
    assert.ok(!('phone' in p) && !('whatsapp' in p));
  }
  assert.deepEqual([...new Set(P.painters.map((p) => p.tier))].sort(), [...tierIds].sort());
});
