import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateLitres } from '../../website/assets/app/engine/estimate.js';
import { deriveSurfaces } from '../../website/assets/app/model/surfaces.js';
import { twoRoomHouse as fixture } from '../fixtures/two-room-house.js';

const paint = (ids) => Object.fromEntries(ids.map((id) => [id, { code: 'AM-5006', finish: 'matt' }]));

test('estimate: 20 m² at 11 m²/L, two coats = 3.64 L', () => {
  const surfaces = [{ id: 'w:L', room: 'lounge', label: 'Lounge, north wall', area: 20 }];
  const result = estimateLitres(surfaces, paint(['w:L']), { coverage: 11 });
  assert.equal(result.totalLitres, 3.64);
  assert.equal(result.totalArea, 20);
  assert.deepEqual(result.rows, [{ room: 'lounge', label: 'Lounge', area: 20, litres: 3.64 }]);
});

test('estimate excludes cladded and unpainted surfaces', () => {
  const surfaces = [
    { id: 'a', room: 'lounge', label: 'Lounge, north wall', area: 10 },
    { id: 'b', room: 'lounge', label: 'Lounge, south wall', area: 10 },
    { id: 'c', room: 'exterior', label: 'Outside, west-facing wall', area: 12, cladding: 'stone-cladding' }
  ];
  const result = estimateLitres(surfaces, paint(['a', 'c']), { coverage: 10 });
  assert.equal(result.totalArea, 10);
  assert.equal(result.totalLitres, 2);
  assert.equal(result.rows.length, 1);
});

test('estimate groups rows by room and honours the number of coats', () => {
  const surfaces = deriveSurfaces(fixture);
  const ids = surfaces.filter((s) => s.room !== 'exterior').map((s) => s.id);
  const two = estimateLitres(surfaces, paint(ids), { coverage: 12 });
  const one = estimateLitres(surfaces, paint(ids), { coverage: 12 }, 1);
  assert.deepEqual(two.rows.map((r) => r.label), ['Lounge', 'Bedroom']);
  assert.ok(Math.abs(two.totalLitres - one.totalLitres * 2) <= 0.01);
  const summed = two.rows.reduce((sum, r) => sum + r.area, 0);
  assert.ok(Math.abs(summed - two.totalArea) <= 0.02);
});

test('estimate without a usable product returns areas and zero litres', () => {
  const result = estimateLitres([{ id: 'a', room: 'exterior', label: 'Outside, north-facing wall', area: 5 }], paint(['a']), null);
  assert.equal(result.totalArea, 5);
  assert.equal(result.totalLitres, 0);
  assert.equal(result.rows[0].label, 'Outside walls');
});
