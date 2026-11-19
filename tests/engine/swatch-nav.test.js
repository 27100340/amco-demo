import test from 'node:test';
import assert from 'node:assert/strict';
import { nextSwatchIndex, tabStopIndex } from '../../website/assets/app/ui/swatch-nav.js';

test('arrows move one swatch across and one row up or down, clamped to the grid', () => {
  assert.equal(nextSwatchIndex('ArrowRight', 3, 20, 6), 4);
  assert.equal(nextSwatchIndex('ArrowLeft', 3, 20, 6), 2);
  assert.equal(nextSwatchIndex('ArrowDown', 3, 20, 6), 9);
  assert.equal(nextSwatchIndex('ArrowUp', 8, 20, 6), 2);
  assert.equal(nextSwatchIndex('ArrowLeft', 0, 20, 6), 0);
  assert.equal(nextSwatchIndex('ArrowRight', 19, 20, 6), 19);
  assert.equal(nextSwatchIndex('ArrowDown', 17, 20, 6), 19);
  assert.equal(nextSwatchIndex('ArrowUp', 2, 20, 6), 0);
});
test('Home and End jump to the ends; other keys do not move focus', () => {
  assert.equal(nextSwatchIndex('Home', 7, 20, 6), 0);
  assert.equal(nextSwatchIndex('End', 7, 20, 6), 19);
  for (const key of ['Enter', ' ', 'Tab', 'a']) assert.equal(nextSwatchIndex(key, 7, 20, 6), null);
  assert.equal(nextSwatchIndex('ArrowRight', 0, 0, 6), null);
});
test('the tab stop is the selected swatch when listed, else the first, else none', () => {
  assert.equal(tabStopIndex(['a', 'b', 'c'], 'b'), 1);
  assert.equal(tabStopIndex(['a', 'b', 'c'], 'z'), 0);
  assert.equal(tabStopIndex(['a', 'b', 'c'], null), 0);
  assert.equal(tabStopIndex([], 'a'), -1);
});
