import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const site = read('website/assets/js/site.js');
const index = read('website/index.html');
const dealers = read('website/dealers.html');
const readme = read('README.md');

test('the header nav lists the painters page', () => {
  assert.match(site, /\{ id: 'painters', href: 'painters\.html', label: 'Painters' \}/);
});
test('no page or the shared chrome still sends painters to dealers.html#painters', () => {
  for (const [name, text] of [['site.js', site], ['index.html', index]]) assert.ok(!text.includes('dealers.html#painters'), name);
});
test('dealers.html is a teaser that links to the painters page', () => {
  assert.ok(!dealers.includes('data-whatsapp-form'));
  assert.ok(!dealers.includes('Points on every drum you scan'));
  assert.match(dealers, /href="painters\.html#club"/);
});
test('the home trust band links to the painters page', () => {
  assert.match(index, /data-placeholder="Ustad Club size"[^]*?href="painters\.html"/);
});
test('README lists the painter placeholders', () => {
  assert.match(readme, /painters-data\.js/);
  assert.match(readme, /\| `painters\.html` \|/);
});
