import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDrawingSet } from '../../tools/sample-drawings/drawings.mjs';
import { createDxf } from '../../tools/sample-drawings/dxf-writer.mjs';
import {
  detectFormat, sizeError, decodeDxfText, readDxfText, interpretDxf, rasterSummary, reextract,
  DWG_ERROR, MAX_FILE_BYTES
} from '../../website/assets/app/importers/interpret.js';
import { inchRoomOnLayer0, singleRoom, rect } from '../fixtures/dxf/plans.js';

const bytes = (text) => new TextEncoder().encode(text);
const sheets = new Map(buildDrawingSet().map((s) => [s.file, s]));
const sampleDoc = (file) => readDxfText(sheets.get(file).dxf).doc;

test('file type from the first bytes beats the extension', () => {
  assert.deepEqual(detectFormat(bytes('AC1032\u0000\u0000'), 'house.dwg'), { format: 'dwg', error: DWG_ERROR });
  assert.deepEqual(detectFormat(bytes('AC1027 renamed'), 'house.dxf'), { format: 'dwg', error: DWG_ERROR });
  assert.equal(detectFormat(bytes(''), 'HOUSE.DWG').error, DWG_ERROR);
  assert.equal(DWG_ERROR, 'DWG files can\'t be read in the browser. In AutoCAD use File → Save As → DXF and upload that.');
  const binary = detectFormat(bytes('AutoCAD Binary DXF\r\n\u001a\u0000'), 'plan.dxf');
  assert.equal(binary.format, 'dxf');
  assert.match(binary.error, /binary form/);
  assert.deepEqual(detectFormat(bytes('%PDF-1.7\n'), 'sheet.bin'), { format: 'pdf' });
  assert.deepEqual(detectFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), 'scan'), { format: 'image' });
  assert.deepEqual(detectFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'scan.jpeg'), { format: 'image' });
  assert.deepEqual(detectFormat(bytes('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '), 'x'), { format: 'image' });
  assert.deepEqual(detectFormat(bytes('  0\r\nSECTION\r\n'), 'Plan.DXF'), { format: 'dxf' });
  const other = detectFormat(bytes('hello'), 'notes.txt');
  assert.equal(other.format, 'other');
  assert.match(other.error, /DXF, PDF, PNG, JPG or WebP/);
});

test('files over 25 MB are refused with their size', () => {
  assert.equal(sizeError(MAX_FILE_BYTES), null);
  assert.equal(sizeError(1024), null);
  assert.match(sizeError(31.2 * 1024 * 1024), /^This file is 31\.2 MB; each drawing must be 25 MB or less\./);
});

test('DXF text decodes as UTF-8, falling back to Windows-1252 for old files', () => {
  assert.equal(decodeDxfText(bytes('Ø 9″')), 'Ø 9″');
  assert.equal(decodeDxfText(new Uint8Array([0x44, 0x49, 0x41, 0x20, 0xd8, 0x32, 0x35])), 'DIA Ø25');
});

test('unreadable DXF text gives a reason instead of throwing', () => {
  assert.match(readDxfText('not a drawing at all').error, /isn't a DXF drawing/);
  assert.match(readDxfText(createDxf().toString()).error, /nothing drawn in model space/);
  assert.ok(readDxfText(sheets.get('01-ground-floor-plan.dxf').dxf).doc);
});

test('sample sheets: slot, level, section and one-line summaries', () => {
  const expected = {
    '01-ground-floor-plan.dxf': ['plan', 0, null, /^Ground floor plan · \d+ walls · \d+ doors · \d+ windows · \d+ rooms · sections A-A, B-B$/],
    '02-first-floor-plan.dxf': ['plan', 1, null, /^First floor plan · \d+ walls · \d+ doors · \d+ windows · \d+ rooms · sections A-A, B-B$/],
    '03-section-A-A.dxf': ['section', null, 'A', /^Section A-A · 2 levels$/],
    '04-section-B-B.dxf': ['section', null, 'B', /^Section B-B · 2 levels$/],
    '05-working-drawing-A-A.dxf': ['working', null, 'A', /^Working drawing A-A · 7 doors and windows in the schedule$/],
    '06-working-drawing-B-B.dxf': ['working', null, 'B', /^Working drawing B-B · 7 doors and windows in the schedule$/],
    '07-site-layout.dxf': ['layout', null, null, /^Site layout · plot boundary · boundary wall with 1 gate · building footprint$/]
  };
  for (const [file, [slot, levelIndex, section, summary]] of Object.entries(expected)) {
    const r = interpretDxf(sampleDoc(file));
    assert.equal(r.slot, slot, file);
    assert.equal(r.levelIndex, levelIndex, file);
    assert.equal(r.section, section, file);
    assert.match(r.summary, summary, `${file}: ${r.summary}`);
    assert.deepEqual(r.units, { unit: 'mm', factor: 0.001, source: 'header' }, file);
    assert.deepEqual(r.warnings, [], `${file}: ${r.warnings.join(' | ')}`);
    assert.deepEqual(r.sectionMarks, slot === 'plan' ? ['A', 'B'] : [], file);
  }
  const ground = interpretDxf(sampleDoc('01-ground-floor-plan.dxf'));
  const doors = ground.extracted.openings.filter((o) => o.type === 'door').length;
  assert.ok(ground.summary.includes(`${ground.extracted.walls.length} walls · ${doors} doors`));
});

test('a DXF without a title waits for the customer; units it does not state are flagged', () => {
  const doc = inchRoomOnLayer0();
  const r = interpretDxf(doc);
  assert.equal(r.slot, null);
  assert.equal(r.extracted, null);
  assert.equal(r.summary, 'DXF drawing · no title found, so choose what it shows');
  assert.deepEqual(r.units, { unit: 'in', factor: 0.0254, source: 'heuristic' });
  assert.ok(r.warnings.some((w) => /suggest inches/.test(w)), r.warnings.join(' | '));

  const asPlan = reextract({ id: 'x', format: 'dxf', readable: true, doc, ...r }, { slot: 'plan', levelIndex: 1 });
  assert.equal(asPlan.id, 'x');
  assert.equal(asPlan.slot, 'plan');
  assert.equal(asPlan.levelIndex, 1);
  assert.equal(asPlan.extracted.walls.length, 4);
  assert.match(asPlan.summary, /^First floor plan · 4 walls · 0 doors · 0 windows · 1 room$/);
  assert.ok(asPlan.warnings.some((w) => /^Wall layer guessed/.test(w)));
});

test('reextract with a new unit re-reads every length and keeps the unit until changed', () => {
  const d = createDxf({ insunits: null });
  rect(d, 'A-WALL', [0, 0], [162, 138]);
  rect(d, 'A-WALL', [9, 9], [153, 129]);
  d.text('A-ANNO-TTLB', [0, -40], 12, 'GROUND FLOOR PLAN');
  const doc = readDxfText(d.toString()).doc;
  const first = { id: 'p', format: 'dxf', readable: true, doc, ...interpretDxf(doc) };
  assert.equal(first.units.unit, 'in');
  assert.ok(Math.abs(first.extracted.walls[0].thickness - 0.2286) < 1e-6);

  const asMm = reextract(first, { unit: 'mm' });
  assert.deepEqual(asMm.units, { unit: 'mm', factor: 0.001, source: 'user' });
  assert.equal(asMm.extracted.walls.length, 0, '9 mm apart is not a wall');
  assert.equal(asMm.summary, 'Ground floor plan · no walls found');
  assert.equal(first.units.unit, 'in', 'the original is not changed');

  const relabelled = reextract(asMm, { levelIndex: 2 });
  assert.equal(relabelled.units.source, 'user');
  assert.equal(relabelled.units.unit, 'mm');
  assert.equal(relabelled.levelIndex, 2);
  const back = reextract(relabelled, { unit: 'in' });
  assert.equal(back.extracted.walls.length, 4);
  assert.equal(back.levelIndex, 2, 'the chosen floor is kept');
});

test('reextract sets the slot, floor and section of a PDF or image', () => {
  const pdf = { id: 'f', name: 'sec.pdf', format: 'pdf', readable: true, slot: null, levelIndex: null, section: null, sectionMarks: [], summary: rasterSummary('pdf', 'sec.pdf', 1) };
  assert.equal(pdf.summary, 'PDF drawing · 1 page');
  const section = reextract(pdf, { slot: 'section', section: 'Section b-b', levelIndex: 1 });
  assert.equal(section.slot, 'section');
  assert.equal(section.section, 'B');
  assert.equal(section.levelIndex, null, 'only plans have a floor');
  const plan = reextract(section, { slot: 'plan', levelIndex: '0' });
  assert.equal(plan.levelIndex, 0);
  assert.equal(plan.section, null);
  assert.equal(reextract(plan, { slot: 'nonsense' }).slot, null);
  const unreadable = { id: 'u', format: 'dwg', readable: false };
  assert.equal(reextract(unreadable, { slot: 'plan' }), unreadable);
  assert.equal(rasterSummary('image', 'scan.jpeg', 1), 'JPG image');
  assert.equal(rasterSummary('pdf', 'set.pdf', 3), 'PDF drawing · 3 pages');
});

test('a wrong $INSUNITS header is checked against the wall thicknesses', () => {
  const doc = singleRoom({ insunits: 6 });
  const r = interpretDxf(doc);
  assert.deepEqual(r.units, { unit: 'mm', factor: 0.001, source: 'heuristic' });
  assert.equal(r.extracted.walls.length, 4);
  assert.match(r.summary, /^Ground floor plan · 4 walls/);
  assert.ok(r.warnings.includes('Your file says metres but the walls look like millimetres; we used millimetres. You can change this under Drawing units.'), r.warnings.join(' | '));
  assert.ok(!r.warnings.some((w) => /doesn't say which units/.test(w)));

  const chosen = reextract({ id: 'x', format: 'dxf', readable: true, doc, ...r }, { unit: 'm' });
  assert.equal(chosen.units.source, 'user');
  assert.equal(chosen.extracted.walls.length, 0, 'the customer\'s choice is respected');

  const right = interpretDxf(singleRoom({ insunits: 4 }));
  assert.equal(right.units.source, 'header');
  assert.deepEqual(right.warnings, []);
});

test('when no unit gives walls, the warning points at the Drawing units choice', () => {
  const d = createDxf({ insunits: 6 });
  rect(d, 'A-WALL', [0, 0], [4000, 3000]);
  d.text('A-ANNO-TTLB', [0, -1500], 500, 'GROUND FLOOR PLAN');
  const r = interpretDxf(readDxfText(d.toString()).doc);
  assert.equal(r.units.unit, 'm');
  assert.equal(r.extracted.walls.length, 0);
  assert.ok(r.warnings.some((w) => /metres/.test(w) && /Drawing units/.test(w)), r.warnings.join(' | '));
});

test('an empty wall layer is not blamed on the units', () => {
  const d = createDxf({ insunits: 6 });
  d.text('A-ANNO-TTLB', [0, -1500], 500, 'GROUND FLOOR PLAN');
  d.line('A-ANNO-DIMS', [0, 0], [4000, 0]);
  const r = interpretDxf(readDxfText(d.toString()).doc);
  assert.equal(r.summary, 'Ground floor plan · no walls found');
  assert.ok(!r.warnings.some((w) => /Drawing units/.test(w)), r.warnings.join(' | '));
  assert.ok(r.warnings.some((w) => /^No walls found on this plan/.test(w)));
});
