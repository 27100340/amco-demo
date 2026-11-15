import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../../website/assets/app/storage/project-schema.js';
import {
  drawingKey, drawingFromParsed, addDrawing, updateDrawing, removeDrawing, packageDrawings,
  needsSectionDeclaration, packageFingerprint, projectBytes
} from '../../website/assets/app/storage/project-ops.js';
import { checkPackage } from '../../website/assets/app/importers/requirements.js';

const NOW = '2026-11-12T09:30:00.000Z';

/** A project drawing entry with sensible defaults. */
function drawing(fileId, fields) {
  return {
    fileId, name: `${fileId}.dxf`, format: 'dxf', size: 1000, slot: null, levelIndex: null, section: null,
    sectionMarks: [], readable: true, error: null, summary: '', warnings: [], added: NOW, placement: 'auto', unit: 'mm', unitSource: 'header',
    ...fields
  };
}

/** The sample house package: two plans marked A and B, both sections, both working drawings, the layout. */
function samplePackage() {
  let project = createProject({ name: 'Sample', kind: 'house', floors: 2, id: 'p1', now: NOW });
  const entries = [
    drawing('g', { slot: 'plan', levelIndex: 0, sectionMarks: ['A', 'B'] }),
    drawing('f', { slot: 'plan', levelIndex: 1, sectionMarks: ['A', 'B'] }),
    drawing('sa', { slot: 'section', section: 'A' }),
    drawing('sb', { slot: 'section', section: 'B' }),
    drawing('wa', { slot: 'working', section: 'A' }),
    drawing('wb', { slot: 'working', section: 'B' }),
    drawing('site', { slot: 'layout', name: '07-site-layout.dxf' })
  ];
  for (const d of entries) project = addDrawing(project, d).project;
  return project;
}

const gate = (project) => checkPackage(packageDrawings(project), { floors: project.floors, declaredSections: project.declaredSections });

test('drawingKey names the place a drawing fills', () => {
  assert.equal(drawingKey(drawing('a', { slot: 'plan', levelIndex: 1 })), 'plan:1');
  assert.equal(drawingKey(drawing('a', { slot: 'section', section: 'a' })), 'section:A');
  assert.equal(drawingKey(drawing('a', { slot: 'working', section: 'B' })), 'working:B');
  assert.equal(drawingKey(drawing('a', { slot: 'layout', name: 'Site Layout.DXF' })), 'layout:site layout.dxf');
  assert.equal(drawingKey(drawing('a', { slot: 'plan', levelIndex: null })), null, 'a plan without a floor fills nothing yet');
  assert.equal(drawingKey(drawing('a', { slot: null })), null);
});

test('drawingFromParsed keeps the details and drops the parsed drawing and thumbnail', () => {
  const parsed = {
    id: 'f1', name: 'plan.dxf', size: 2048, format: 'dxf', slot: 'plan', levelIndex: 0, section: null, sectionMarks: ['A'],
    readable: true, summary: 'Ground floor plan · 4 walls', warnings: ['w'], thumbnail: new Blob(['x']), doc: { entities: [] },
    extracted: { walls: [] }, kind: { kind: 'plan' }, units: { unit: 'mm', factor: 0.001, source: 'header' }
  };
  const entry = drawingFromParsed(parsed, { now: NOW });
  assert.deepEqual(entry, {
    fileId: 'f1', name: 'plan.dxf', format: 'dxf', size: 2048, slot: 'plan', levelIndex: 0, section: null, sectionMarks: ['A'],
    readable: true, error: null, summary: 'Ground floor plan · 4 walls', warnings: ['w'], added: NOW, placement: 'auto', unit: 'mm', unitSource: 'header'
  });
  const pdf = drawingFromParsed({ id: 'f2', name: 'a.pdf', size: 9, format: 'pdf', slot: null, readable: true, summary: 'PDF drawing · 1 page' }, { now: NOW });
  assert.equal(pdf.placement, 'manual');
  assert.equal(pdf.unit, null);
  const dwg = drawingFromParsed({ id: 'f3', name: 'a.dwg', size: 9, format: 'dwg', slot: null, readable: false, error: 'DWG files can\'t be read' }, { now: NOW });
  assert.equal(dwg.readable, false);
  assert.equal(dwg.error, 'DWG files can\'t be read');
});

test('re-adding a plan for the same floor replaces the old one', () => {
  let project = createProject({ name: 'x', kind: 'house', floors: 2, id: 'p1', now: NOW });
  project = addDrawing(project, drawing('old', { slot: 'plan', levelIndex: 0 })).project;
  project = addDrawing(project, drawing('first', { slot: 'plan', levelIndex: 1 })).project;
  const result = addDrawing(project, drawing('new', { slot: 'plan', levelIndex: 0, name: 'corrected.dxf' }));
  assert.deepEqual(result.replaced.map((d) => d.fileId), ['old']);
  assert.deepEqual(result.project.drawings.map((d) => d.fileId), ['first', 'new']);
  assert.equal(project.drawings.length, 2, 'the project passed in is not changed');
});

test('sections replace by label, and a working drawing never replaces a section', () => {
  let project = createProject({ name: 'x', kind: 'house', floors: 1, id: 'p1', now: NOW });
  project = addDrawing(project, drawing('sa', { slot: 'section', section: 'A' })).project;
  project = addDrawing(project, drawing('wa', { slot: 'working', section: 'A' })).project;
  project = addDrawing(project, drawing('sb', { slot: 'section', section: 'B' })).project;
  const result = addDrawing(project, drawing('sa2', { slot: 'section', section: 'a' }));
  assert.deepEqual(result.replaced.map((d) => d.fileId), ['sa']);
  assert.deepEqual(result.project.drawings.map((d) => d.fileId).sort(), ['sa2', 'sb', 'wa']);
});

test('layouts with different names both stay; the same name replaces', () => {
  let project = createProject({ name: 'x', kind: 'house', floors: 1, id: 'p1', now: NOW });
  project = addDrawing(project, drawing('l1', { slot: 'layout', name: 'site-layout.dxf' })).project;
  project = addDrawing(project, drawing('l2', { slot: 'layout', name: 'furniture-layout.dxf' })).project;
  assert.equal(project.drawings.length, 2);
  const result = addDrawing(project, drawing('l3', { slot: 'layout', name: 'Site-Layout.dxf' }));
  assert.deepEqual(result.replaced.map((d) => d.fileId), ['l1']);
});

test('an unreadable file is replaced by the next file with the same name', () => {
  let project = createProject({ name: 'x', kind: 'house', floors: 1, id: 'p1', now: NOW });
  project = addDrawing(project, drawing('bad', { readable: false, error: 'binary', name: 'plan.dxf' })).project;
  const result = addDrawing(project, drawing('good', { name: 'plan.dxf', slot: 'plan', levelIndex: 0 }));
  assert.deepEqual(result.replaced.map((d) => d.fileId), ['bad']);
});

test('drawings still waiting for details never replace anything', () => {
  let project = createProject({ name: 'x', kind: 'house', floors: 1, id: 'p1', now: NOW });
  project = addDrawing(project, drawing('a', { format: 'pdf', name: 'a.pdf', slot: null, placement: 'manual' })).project;
  const result = addDrawing(project, drawing('b', { format: 'pdf', name: 'b.pdf', slot: null, placement: 'manual' }));
  assert.deepEqual(result.replaced, []);
  assert.equal(result.project.drawings.length, 2);
});

test('updateDrawing applies the customer\'s answer and replaces a clash', () => {
  let project = createProject({ name: 'x', kind: 'house', floors: 2, id: 'p1', now: NOW });
  project = addDrawing(project, drawing('dxf', { slot: 'plan', levelIndex: 0 })).project;
  project = addDrawing(project, drawing('scan', { format: 'pdf', name: 'scan.pdf', slot: null, placement: 'manual' })).project;
  const first = updateDrawing(project, 'scan', { slot: 'plan', levelIndex: 1 });
  assert.deepEqual(first.replaced, []);
  assert.equal(first.project.drawings.find((d) => d.fileId === 'scan').levelIndex, 1);
  const clash = updateDrawing(first.project, 'scan', { levelIndex: 0 });
  assert.deepEqual(clash.replaced.map((d) => d.fileId), ['dxf']);
  assert.deepEqual(clash.project.drawings.map((d) => d.fileId), ['scan']);
});

test('the sample package passes the gate, and removing section B-B closes it', () => {
  const project = samplePackage();
  assert.equal(gate(project).complete, true);
  const without = removeDrawing(project, 'sb');
  assert.deepEqual(without.removed.map((d) => d.fileId), ['sb']);
  const result = gate(without.project);
  assert.equal(result.complete, false);
  const sections = result.items.find((i) => i.key === 'sections');
  assert.deepEqual(sections.missing, ['Section B-B']);
});

test('re-uploading a corrected section keeps the gate counting it once', () => {
  const project = addDrawing(samplePackage(), drawing('sb2', { slot: 'section', section: 'B', name: 'section-b-fixed.dxf' })).project;
  assert.equal(project.drawings.filter((d) => d.slot === 'section').length, 2);
  assert.equal(gate(project).complete, true);
});

test('packageDrawings leaves out drawings that have no slot yet', () => {
  let project = createProject({ name: 'x', kind: 'house', floors: 1, id: 'p1', now: NOW });
  project = addDrawing(project, drawing('scan', { format: 'image', name: 'scan.jpg', slot: null })).project;
  assert.deepEqual(packageDrawings(project), []);
  project = updateDrawing(project, 'scan', { slot: 'plan', levelIndex: 0 }).project;
  assert.deepEqual(packageDrawings(project), [{ id: 'scan', name: 'scan.jpg', format: 'image', slot: 'plan', levelIndex: 0, section: null, sectionMarks: [], readable: true }]);
});

test('PDF or image plans ask which sections are marked', () => {
  let project = createProject({ name: 'x', kind: 'house', floors: 1, id: 'p1', now: NOW });
  assert.equal(needsSectionDeclaration(project), false);
  project = addDrawing(project, drawing('g', { slot: 'plan', levelIndex: 0 })).project;
  assert.equal(needsSectionDeclaration(project), false);
  project = addDrawing(project, drawing('f', { format: 'pdf', slot: 'plan', levelIndex: 1, name: 'first.pdf' })).project;
  assert.equal(needsSectionDeclaration(project), true);
});

test('the package fingerprint changes with the package, not with order or wording', () => {
  const project = samplePackage();
  const reordered = { ...project, drawings: [...project.drawings].reverse().map((d) => ({ ...d, summary: 'changed' })) };
  assert.equal(packageFingerprint(reordered), packageFingerprint(project));
  assert.notEqual(packageFingerprint(removeDrawing(project, 'sb').project), packageFingerprint(project));
  assert.notEqual(packageFingerprint({ ...project, floors: 1 }), packageFingerprint(project));
  assert.notEqual(packageFingerprint({ ...project, units: { g: 'in' } }), packageFingerprint(project));
});

test('projectBytes adds up the drawings', () => {
  assert.equal(projectBytes(samplePackage()), 7000);
});
