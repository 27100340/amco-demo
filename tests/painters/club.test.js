import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClassic } from './load-classic.js';
import { tierForPoints, parseTins, calculate } from '../../website/assets/app/painters/club.js';

const { AmcoPainters: P } = loadClassic('assets/js/painters-data.js');

test('tierForPoints uses the threshold inclusively', () => {
  assert.equal(tierForPoints(0, P.tiers).id, 'bronze');
  assert.equal(tierForPoints(599, P.tiers).id, 'bronze');
  assert.equal(tierForPoints(600, P.tiers).id, 'silver');
  assert.equal(tierForPoints(5000, P.tiers).id, 'platinum');
});
test('parseTins accepts whole numbers 1 to 500 only', () => {
  assert.equal(parseTins(' 12 '), 12);
  for (const bad of ['', '0', '-3', '2.5', 'ten', '501', '99999']) assert.equal(parseTins(bad), null, bad);
});
test('calculate: 12 drums a month is Gold with yearly cash-back', () => {
  const r = calculate(12, 'drum', P);
  assert.equal(r.pointsPerYear, 2304); assert.equal(r.tier.id, 'gold');
  assert.equal(r.cashBackPerYear, 12 * 12 * 240);
  assert.deepEqual([r.next.tier.id, r.next.pointsShort], ['platinum', 2696]);
});
test('calculate: Platinum has no next tier; bad input gives null', () => {
  assert.equal(calculate(30, 'drum', P).next, null);
  assert.equal(calculate(0, 'drum', P), null);
  assert.equal(calculate(Number.NaN, 'drum', P), null);
  assert.equal(calculate(5, 'barrel', P), null);
});
