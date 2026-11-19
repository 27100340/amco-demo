import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClassic } from './load-classic.js';
import { cardHtml, emptyHtml, tiersTableHtml, calcResultHtml, earnTableHtml } from '../../website/assets/app/painters/render.js';
import { calculate } from '../../website/assets/app/painters/club.js';

const { AmcoPainters: P } = loadClassic('assets/js/painters-data.js');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const opts = { escape: esc, whatsappHref: 'https://wa.me/x?text=y' };

test('a sample card is marked, carries its tier and both actions', () => {
  const p = P.painters[0];
  const html = cardHtml(p, P, opts);
  assert.match(html, /data-placeholder="sample painter"/);
  assert.match(html, /Sample listing/);
  assert.match(html, new RegExp(`data-tier="${p.tier}"`));
  assert.match(html, new RegExp(`data-book="${p.id}"`));
  assert.match(html, /href="https:\/\/wa\.me\/x\?text=y"/);
  assert.ok(!/tel:/.test(html));
});
test('card text is escaped', () => {
  const html = cardHtml({ ...P.painters[0], name: '<b>X</b>', areas: ['<i>'] }, P, opts);
  assert.ok(!html.includes('<b>X</b>') && !html.includes('<i>'));
});
test('emptyHtml offers the WhatsApp ask', () => {
  assert.match(emptyHtml('msg', opts), /Ask Amco on WhatsApp/);
});
test('tiers table shows each tier, cash-back in rupees and inherited rewards', () => {
  const html = tiersTableHtml(P, { escape: esc, formatPkr: (n) => `Rs ${n}` });
  for (const t of P.tiers) assert.ok(html.includes(t.name));
  assert.match(html, /Rs 240/);
  assert.match(html, /Everything in Silver, plus/);
});
test('earn table lists each tin size with its points', () => {
  const html = earnTableHtml(P, { escape: esc });
  for (const s of P.sizes) assert.ok(html.includes(s.label));
  assert.match(html, />16</);
});
test('calculator result names tier, next tier, or asks for a number', () => {
  const fmt = { escape: esc, formatPkr: (n) => `Rs ${n}` };
  const html = calcResultHtml(calculate(12, 'drum', P), 'Drum', fmt);
  assert.match(html, /2,?304 points/); assert.match(html, /Gold/); assert.match(html, /Platinum/);
  assert.match(calcResultHtml(null, 'Drum', fmt), /whole number from 1 to 500/);
  assert.ok(!/NaN|Infinity|undefined/.test(html));
});
