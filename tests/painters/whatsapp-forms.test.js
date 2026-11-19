import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClassic } from './load-classic.js';

const win = loadClassic('assets/js/whatsapp-forms.js', {
  document: { querySelectorAll: () => [] },
  window: { Amco: { whatsappLink: () => '' } }
});
const { ruleProblem, readableDate } = win.AmcoForms;

test('phone rule wants 10 to 13 digits', () => {
  assert.equal(ruleProblem('0300 1234567', 'phone', '2026-11-19'), '');
  assert.match(ruleProblem('12345', 'phone', '2026-11-19'), /phone number/);
  assert.match(ruleProblem('0300-abc', 'phone', '2026-11-19'), /phone number/);
});
test('years rule wants a whole number up to 70', () => {
  assert.equal(ruleProblem('8', 'years', '2026-11-19'), '');
  assert.match(ruleProblem('71', 'years', '2026-11-19'), /years/);
  assert.match(ruleProblem('2.5', 'years', '2026-11-19'), /years/);
});
test('date rule refuses the past; readableDate spells the month', () => {
  assert.equal(ruleProblem('2026-11-19', 'date', '2026-11-19'), '');
  assert.match(ruleProblem('2026-11-18', 'date', '2026-11-19'), /today or a later date/);
  assert.equal(readableDate('2026-11-15'), '15 November 2026');
});
