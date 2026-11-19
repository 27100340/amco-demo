import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClassic } from './load-classic.js';
import {
  ALL, normaliseCode, orderPainters, filterPainters, readParams,
  enquiryMessage, noMatchMessage, initials, shareLink, painterLabel, tidyRef
} from '../../website/assets/app/painters/directory.js';

const { AmcoPainters: P } = loadClassic('assets/js/painters-data.js');

test('normaliseCode upper-cases good codes and rejects junk', () => {
  assert.equal(normaliseCode(' ustad-lhr-014 '), 'USTAD-LHR-014');
  for (const bad of ['', 'USTAD-LHR-14', '<img src=x onerror=alert(1)>', 'USTAD-LHR-014x']) assert.equal(normaliseCode(bad), null);
});
test('orderPainters puts higher tiers first, then more jobs', () => {
  const ordered = orderPainters(P.painters, P.tiers);
  const rank = (p) => P.tiers.findIndex((t) => t.id === p.tier);
  ordered.slice(1).forEach((p, i) => {
    const prev = ordered[i];
    assert.ok(rank(prev) > rank(p) || (rank(prev) === rank(p) && prev.jobs >= p.jobs));
  });
  assert.notEqual(ordered, P.painters);
});
test('filterPainters combines city and speciality, and can come back empty', () => {
  assert.equal(filterPainters(P.painters, { city: ALL, speciality: ALL }).length, 8);
  assert.ok(filterPainters(P.painters, { city: 'Lahore', speciality: ALL }).every((p) => p.city === 'Lahore'));
  assert.deepEqual(filterPainters(P.painters, { city: 'Nowhere', speciality: 'texture' }), []);
});
test('readParams finds the painter and keeps a well-formed ref', () => {
  const r = readParams('?painter=ustad-khi-007&ref=USTAD-MUL-999', P.painters);
  assert.equal(r.painter.id, 'USTAD-KHI-007'); assert.equal(r.ref, 'USTAD-MUL-999');
  assert.deepEqual(readParams('?painter=nope&ref=%3Cscript%3E', P.painters), { painter: null, ref: null });
  assert.deepEqual(readParams('', P.painters), { painter: null, ref: null });
});
test('messages name the painter and code; no-match names what was looked for', () => {
  const p = P.painters[0];
  assert.ok(enquiryMessage(p).includes(`${p.name} (${p.code})`) && enquiryMessage(p).includes(p.city));
  assert.equal(noMatchMessage('Multan', 'Texture'), 'Assalam o alaikum, I am looking for an Amco painter for texture work in Multan.');
  assert.equal(noMatchMessage(ALL, ALL), 'Assalam o alaikum, I am looking for an Amco painter.');
  assert.equal(initials('Akram B.'), 'AB');
  assert.equal(shareLink('USTAD-LHR-014', 'https://amco.pk/'), 'https://amco.pk/painters.html?ref=USTAD-LHR-014');
  assert.equal(painterLabel(p), `${p.name} (${p.code})`);
});
test('tidyRef upper-cases a typed referral code', () => {
  assert.equal(tidyRef(' ustad-lhr-014 '), 'USTAD-LHR-014');
  assert.equal(tidyRef(' akram '), 'AKRAM');
  assert.equal(tidyRef(''), '');
});
