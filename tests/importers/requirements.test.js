import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPackage } from '../../website/assets/app/importers/requirements.js';

const plan = (levelIndex, sectionMarks = ['A', 'B'], extra = {}) => ({
  id: `p${levelIndex}`, name: `plan-${levelIndex}.dxf`, format: 'dxf', slot: 'plan', levelIndex, sectionMarks, readable: true, ...extra
});
const section = (label, extra = {}) => ({ id: `s${label}`, name: `section-${label}.dxf`, format: 'dxf', slot: 'section', section: label, readable: true, ...extra });
const working = (label, extra = {}) => ({ id: `w${label}`, name: `working-${label}.dxf`, format: 'dxf', slot: 'working', section: label, readable: true, ...extra });
const layout = (extra = {}) => ({ id: 'l', name: 'site-layout.dxf', format: 'dxf', slot: 'layout', readable: true, ...extra });
const item = (result, key) => result.items.find((i) => i.key === key);

const complete = () => [plan(0), plan(1, []), section('A'), section('B'), working('A'), working('B'), layout()];

test('a complete package is complete', () => {
  const result = checkPackage(complete(), { floors: 2 });
  assert.equal(result.complete, true);
  assert.deepEqual(result.required, { floors: [0, 1], sections: ['A', 'B'] });
  assert.deepEqual(result.items.map((i) => i.key), ['plans', 'sections', 'working', 'layouts']);
  assert.deepEqual(result.items.map((i) => i.label), ['Floor plans', 'Section drawings', 'Working drawings', 'Layouts']);
  for (const i of result.items) {
    assert.equal(i.satisfied, true, i.key);
    assert.deepEqual(i.missing, []);
  }
  assert.deepEqual(item(result, 'plans').files, ['plan-0.dxf', 'plan-1.dxf']);
});

test('missing first floor plan when there are two floors', () => {
  const result = checkPackage(complete().filter((d) => d.id !== 'p1'), { floors: 2 });
  assert.equal(result.complete, false);
  assert.deepEqual(item(result, 'plans').missing, ['First floor plan']);
  assert.equal(item(result, 'plans').satisfied, false);
});

test('a section marked on the plan but not uploaded', () => {
  const result = checkPackage(complete().filter((d) => d.id !== 'sB'), { floors: 2 });
  assert.deepEqual(item(result, 'sections').missing, ['Section B-B']);
  assert.match(item(result, 'sections').details[0], /Section B-B is marked on your ground floor plan but no section drawing for B-B was uploaded/);
  assert.equal(result.complete, false);
});

test('a working drawing missing for a section', () => {
  const result = checkPackage(complete().filter((d) => d.id !== 'wA'), { floors: 2 });
  assert.deepEqual(item(result, 'working').missing, ['Working drawing for section A-A']);
  assert.equal(item(result, 'sections').satisfied, true);
});

test('no layout', () => {
  const result = checkPackage(complete().filter((d) => d.slot !== 'layout'), { floors: 2 });
  assert.deepEqual(item(result, 'layouts').missing, ['Site layout']);
});

test('PDF-only plans use the declared sections', () => {
  const drawings = [
    plan(0, undefined, { format: 'pdf', sectionMarks: undefined }),
    section('A', { format: 'pdf' }), working('A', { format: 'image' }), layout({ format: 'pdf' })
  ];
  const result = checkPackage(drawings, { floors: 1, declaredSections: ['A'] });
  assert.deepEqual(result.required.sections, ['A']);
  assert.equal(result.complete, true);
});

test('PDF-only plans with no declared sections ask which sections are marked', () => {
  const drawings = [plan(0, undefined, { format: 'pdf', sectionMarks: undefined }), section('A', { format: 'pdf' }), working('A'), layout()];
  const result = checkPackage(drawings, { floors: 1 });
  const sections = item(result, 'sections');
  assert.equal(sections.satisfied, false);
  assert.deepEqual(sections.missing, ['Tell us which sections are marked on your plan']);
  assert.equal(item(result, 'working').satisfied, false);
  assert.equal(result.complete, false);
});

test('duplicate section drawings count once', () => {
  const twice = [plan(0), plan(1, []), section('A'), section('A', { id: 'sA2', name: 'section-A-corrected.dxf' }), working('A'), working('B'), layout()];
  const result = checkPackage(twice, { floors: 2 });
  assert.deepEqual(item(result, 'sections').missing, ['Section B-B'], 'a second A does not stand in for B');
  assert.equal(item(result, 'sections').satisfied, false);
  assert.deepEqual(item(result, 'sections').files, ['section-A.dxf', 'section-A-corrected.dxf']);

  const replaced = checkPackage([...twice, section('B')], { floors: 2 });
  const single = checkPackage(complete(), { floors: 2 });
  assert.equal(replaced.complete, true);
  assert.deepEqual(replaced.required, single.required);
  assert.deepEqual(item(replaced, 'sections').missing, item(single, 'sections').missing);
});

test('an unreadable DXF in a slot does not satisfy it', () => {
  const drawings = complete().map((d) => (d.id === 'sB' ? { ...d, readable: false, error: 'Not an ASCII DXF' } : d));
  const result = checkPackage(drawings, { floors: 2 });
  assert.deepEqual(item(result, 'sections').missing, ['Section B-B']);
  assert.ok(!item(result, 'sections').files.includes('section-B.dxf'));
});

test('section labels are compared without case or "SECTION" wording', () => {
  const drawings = [plan(0, ['a']), section('SECTION A-A'), working('a'), layout()];
  const result = checkPackage(drawings, { floors: 1 });
  assert.equal(result.complete, true);
  assert.deepEqual(result.required.sections, ['A']);
});

test('without any section marks at least one section drawing is needed', () => {
  const result = checkPackage([plan(0, []), working('A'), layout()], { floors: 1 });
  assert.deepEqual(item(result, 'sections').missing, ['At least one section drawing']);
  const ok = checkPackage([plan(0, []), section('A'), working('A'), layout()], { floors: 1 });
  assert.equal(ok.complete, true);
  assert.deepEqual(ok.required.sections, []);
});
