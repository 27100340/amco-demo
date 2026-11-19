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
test('painters.html has the club, calculator, referral, join and FAQ sections', () => {
  for (const id of ['club', 'club-tiers', 'club-earn', 'calculator', 'calc-form', 'calc-tins', 'calc-size', 'calc-result', 'referral', 'join', 'faq']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.equal(html.match(/data-whatsapp-form/g).length, 2);
  assert.match(html, /data-placeholder="reward values"/);
  assert.match(html, /id="club-years"[^>]*data-rule="years"/);
});
test('only the calculator headline is a live region; the points link has no static new-tab target', () => {
  assert.ok(!/id="calc-result"[^>]*role="status"/.test(html));
  assert.match(html, /id="calc-status"[^>]*role="status"|role="status"[^>]*id="calc-status"/);
  assert.ok(!/data-points-link[^>]*target=/.test(html));
});
