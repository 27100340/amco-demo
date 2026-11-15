import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECT_FORMAT, createProject, validateProject, toExport, fromExport
} from '../../website/assets/app/storage/project-schema.js';
import { twoRoomHouse } from '../fixtures/two-room-house.js';

const NOW = '2026-11-12T09:30:00.000Z';

/** A project with drawings, a building and paint, as the page would save it. */
function filledProject() {
  const project = createProject({ name: 'Sample House', kind: 'house', floors: 2, id: 'p1', now: NOW });
  project.status = 'review';
  project.drawings = [
    { fileId: 'f1', name: '01-ground-floor-plan.dxf', format: 'dxf', size: 61312, slot: 'plan', levelIndex: 0, section: null, sectionMarks: ['A', 'B'], readable: true, error: null, summary: 'Ground floor plan · 23 walls', warnings: [], added: NOW, placement: 'auto' },
    { fileId: 'f2', name: 'section-a.pdf', format: 'pdf', size: 46489, slot: 'section', levelIndex: null, section: 'A', sectionMarks: [], readable: true, error: null, summary: 'PDF, 1 page', warnings: [], added: NOW, placement: 'manual' }
  ];
  project.declaredSections = ['A'];
  project.building = JSON.parse(JSON.stringify(twoRoomHouse));
  project.schedule = { D1: { type: 'door', width: 0.9, height: 2.1, sill: 0 } };
  project.paint = { 'west:L': { code: 'AM-5006', finish: 'matt' } };
  project.scale = { ground: 0.01 };
  return project;
}

test('createProject fills every field with a sensible start', () => {
  const p = createProject({ name: '  My House ', kind: 'office', floors: 3, id: 'abc', now: NOW });
  assert.equal(p.id, 'abc');
  assert.equal(p.name, 'My House');
  assert.equal(p.kind, 'office');
  assert.equal(p.floors, 3);
  assert.equal(p.created, NOW);
  assert.equal(p.updated, NOW);
  assert.equal(p.status, 'collecting');
  assert.equal(p.step, 'drawings');
  assert.deepEqual(p.drawings, []);
  assert.deepEqual(p.declaredSections, []);
  assert.deepEqual(p.paint, {});
  assert.equal(p.building, null);
  assert.equal(validateProject(p).ok, true);
});

test('createProject makes unique ids and keeps values in range', () => {
  const a = createProject({ name: '', kind: 'castle', floors: 9 });
  const b = createProject({ name: 'x', kind: 'shop', floors: 0 });
  assert.notEqual(a.id, b.id);
  assert.equal(a.name, 'My property');
  assert.equal(a.kind, 'house');
  assert.equal(a.floors, 4);
  assert.equal(b.floors, 1);
  assert.match(a.created, /^\d{4}-\d\d-\d\dT/);
});

test('validateProject reports each problem in plain words', () => {
  const p = filledProject();
  assert.deepEqual(validateProject(p), { ok: true, errors: [] });
  const bad = { ...p, kind: 'castle', floors: 7, status: 'done', name: '' };
  const result = validateProject(bad);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /type/i.test(e)), result.errors.join('; '));
  assert.ok(result.errors.some((e) => /floors/i.test(e)));
  assert.ok(result.errors.some((e) => /status/i.test(e)));
  assert.ok(result.errors.some((e) => /name/i.test(e)));
});

test('validateProject checks drawings, paint and the building shape', () => {
  const p = filledProject();
  p.drawings[0] = { ...p.drawings[0], slot: 'elevation' };
  p.paint = { 'west:L': { code: 'AM-5006', finish: 'satin' } };
  p.building = { schema: 'something/else' };
  const { ok, errors } = validateProject(p);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /01-ground-floor-plan\.dxf/.test(e)), errors.join('; '));
  assert.ok(errors.some((e) => /finish/i.test(e)));
  assert.ok(errors.some((e) => /building/i.test(e)));
  assert.equal(validateProject(null).ok, false);
});

test('toExport wraps a copy of the project without file blobs', () => {
  const p = filledProject();
  p.drawings[0].thumbnail = new Blob(['png']);
  const out = toExport(p, { now: NOW });
  assert.equal(out.format, PROJECT_FORMAT);
  assert.equal(out.exported, NOW);
  assert.equal(out.project.drawings[0].thumbnail, undefined);
  assert.ok(p.drawings[0].thumbnail instanceof Blob, 'the original is left alone');
  assert.doesNotThrow(() => JSON.stringify(out));
  out.project.name = 'changed';
  assert.equal(p.name, 'Sample House');
});

test('export then import gives back the same project', () => {
  const p = filledProject();
  const text = JSON.stringify(toExport(p, { now: NOW }));
  const back = fromExport(JSON.parse(text));
  assert.deepEqual(back, p);
  assert.deepEqual(fromExport(text), p, 'a JSON string is accepted too');
});

test('fromExport fills fields missing from older exports', () => {
  const p = filledProject();
  const out = toExport(p, { now: NOW });
  delete out.project.scale;
  delete out.project.declaredSections;
  delete out.project.step;
  const back = fromExport(out);
  assert.deepEqual(back.scale, {});
  assert.deepEqual(back.declaredSections, []);
  assert.equal(back.step, 'review');
});

test('fromExport refuses files that are not Amco projects', () => {
  assert.throws(() => fromExport({ format: 'something/1', project: {} }), /not an Amco project/i);
  assert.throws(() => fromExport('not json'), /not an Amco project/i);
  assert.throws(() => fromExport(null), /not an Amco project/i);
  const damaged = toExport(filledProject(), { now: NOW });
  damaged.project.floors = 12;
  assert.throws(() => fromExport(damaged), /floors/i);
});
