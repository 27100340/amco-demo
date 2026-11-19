import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClassic } from './load-classic.js';
import { cardHtml, emptyHtml } from '../../website/assets/app/painters/render.js';

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
