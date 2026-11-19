import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../website/painters.html', import.meta.url), 'utf8');

test('painters.html loads its scripts in order and has the anchors', () => {
  const order = ['assets/js/shades.js', 'assets/js/painters-data.js', 'assets/js/site.js', 'assets/js/whatsapp-forms.js', 'assets/app/ui/painters-page.js'];
  const at = order.map((src) => html.indexOf(`src="${src}"`));
  assert.ok(at.every((i) => i > 0)); assert.deepEqual([...at].sort((a, b) => a - b), at);
  for (const id of ['directory', 'book', 'painter-list', 'painter-city', 'painter-speciality', 'book-painter', 'book-ref']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /data-page="painters"/);
  assert.match(html, /data-placeholder="sample painters"/);
});
