import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../../website/assets/app/importers/dxf/tokenizer.js';
import { parseDxf } from '../../website/assets/app/importers/dxf/reader.js';
import { createDxf } from '../../tools/sample-drawings/dxf-writer.mjs';

const dxf = (...lines) => lines.flat().join('\n');
const section = (name, ...body) => ['0', 'SECTION', '2', name, ...body.flat(), '0', 'ENDSEC'];
const near = (actual, expected, tol = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);
};
const nearPoint = (actual, expected, tol = 1e-9) => {
  near(actual[0], expected[0], tol);
  near(actual[1], expected[1], tol);
};

const R12 = dxf(
  section('HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4'),
  section('TABLES',
    '0', 'TABLE', '2', 'LAYER', '70', '2',
    '0', 'LAYER', '2', 'A-WALL', '70', '0', '62', '7', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'A-AREA-IDEN', '70', '0', '62', '3', '6', 'CONTINUOUS',
    '0', 'ENDTAB'),
  section('ENTITIES',
    '0', 'LINE', '8', 'A-WALL', '10', '0', '20', '0', '30', '0', '11', '4000', '21', '0', '31', '0',
    '0', 'TEXT', '8', 'A-AREA-IDEN', '10', '100', '20', '200', '30', '0', '40', '250', '1', 'LOUNGE', '50', '0',
    '0', 'TEXT', '8', 'A-AREA-IDEN', '10', '0', '20', '0', '30', '0', '40', '100', '1', 'FFL %%p0.000', '72', '1', '11', '500', '21', '600', '31', '0',
    '0', 'POLYLINE', '8', 'A-WALL', '66', '1', '10', '0', '20', '0', '30', '0', '70', '1',
    '0', 'VERTEX', '8', 'A-WALL', '10', '0', '20', '0', '30', '0',
    '0', 'VERTEX', '8', 'A-WALL', '10', '1000', '20', '0', '30', '0',
    '0', 'VERTEX', '8', 'A-WALL', '10', '1000', '20', '500', '30', '0',
    '0', 'SEQEND', '8', 'A-WALL'),
  '0', 'EOF'
);

test('tokenize splits code/value pairs, trims codes and handles CRLF', () => {
  const pairs = tokenize('  0\r\nSECTION\r\n  2\r\nHEADER\r\n  0\r\nENDSEC\r\n  0\r\nEOF\r\n');
  assert.deepEqual(pairs, [
    { code: 0, value: 'SECTION' },
    { code: 2, value: 'HEADER' },
    { code: 0, value: 'ENDSEC' },
    { code: 0, value: 'EOF' }
  ]);
});

test('R12: LINE, TEXT and POLYLINE with VERTEX/SEQEND', () => {
  const doc = parseDxf(R12);
  assert.equal(doc.version, 'AC1009');
  assert.equal(doc.insunits, 4);
  assert.deepEqual(doc.layers, ['A-WALL', 'A-AREA-IDEN']);
  assert.equal(doc.entities.length, 4);
  const [line, text, aligned, poly] = doc.entities;
  assert.deepEqual(line, { type: 'LINE', layer: 'A-WALL', a: [0, 0], b: [4000, 0] });
  assert.deepEqual(text, { type: 'TEXT', layer: 'A-AREA-IDEN', at: [100, 200], text: 'LOUNGE', height: 250, rotationDeg: 0 });
  assert.equal(aligned.text, 'FFL ±0.000', '%%p decodes to ±');
  assert.deepEqual(aligned.at, [500, 600], 'justified text sits at its alignment point');
  assert.deepEqual(poly, { type: 'POLY', layer: 'A-WALL', points: [[0, 0], [1000, 0], [1000, 500]], closed: true });
  assert.deepEqual(doc.extents, { min: [0, 0], max: [4000, 600] });
});

test('CRLF line endings parse the same as LF', () => {
  const doc = parseDxf(R12.replace(/\n/g, '\r\n'));
  assert.equal(doc.entities.length, 4);
  assert.equal(doc.insunits, 4);
});

test('R2000: LWPOLYLINE closed flag, bulges ignored with a warning', () => {
  const doc = parseDxf(dxf(
    section('HEADER', '9', '$ACADVER', '1', 'AC1015'),
    section('ENTITIES',
      '0', 'LWPOLYLINE', '5', '2A', '100', 'AcDbEntity', '8', 'A-WALL', '100', 'AcDbPolyline', '90', '4', '70', '1',
      '10', '0', '20', '0', '10', '3000', '20', '0', '42', '0.5', '10', '3000', '20', '2000', '10', '0', '20', '2000',
      '0', 'LWPOLYLINE', '8', 'A-WALL', '90', '2', '70', '0', '10', '5', '20', '5', '10', '9', '20', '5'),
    '0', 'EOF'
  ));
  assert.equal(doc.version, 'AC1015');
  assert.equal(doc.insunits, null);
  assert.deepEqual(doc.entities[0], { type: 'POLY', layer: 'A-WALL', points: [[0, 0], [3000, 0], [3000, 2000], [0, 2000]], closed: true });
  assert.equal(doc.entities[1].closed, false);
  assert.ok(doc.warnings.some((w) => /curved polyline/i.test(w)));
});

test('MTEXT: \\P line breaks and formatting codes stripped, one TEXT per line', () => {
  const doc = parseDxf(dxf(
    section('ENTITIES',
      '0', 'MTEXT', '8', 'A-AREA-IDEN', '10', '0', '20', '1000', '40', '200', '71', '1',
      '3', '{\\fArial|b0|i0|c0|p34;MAS',
      '1', 'TER}\\PBED\\~ROOM \\H1.5x;\\C1;14\'-0" x 12\'-0"\\P\\S1/2;'),
    '0', 'EOF'
  ));
  const texts = doc.entities.map((e) => e.text);
  assert.deepEqual(texts, ['MASTER', 'BED ROOM 14\'-0" x 12\'-0"', '1/2']);
  for (const e of doc.entities) {
    assert.equal(e.type, 'TEXT');
    assert.equal(e.height, 200);
    assert.equal(e.layer, 'A-AREA-IDEN');
  }
  assert.ok(doc.entities[1].at[1] < doc.entities[0].at[1], 'later lines sit lower');
});

test('BLOCK + INSERT with rotation 90 and scale 2 is expanded; INSERT and attributes kept', () => {
  const doc = parseDxf(dxf(
    section('BLOCKS',
      '0', 'BLOCK', '8', '0', '2', 'DOOR90', '70', '2', '10', '0', '20', '0', '30', '0',
      '0', 'LINE', '8', '0', '10', '0', '20', '0', '30', '0', '11', '100', '21', '0', '31', '0',
      '0', 'ARC', '8', '0', '10', '50', '20', '0', '30', '0', '40', '50', '50', '0', '51', '90',
      '0', 'ATTDEF', '8', '0', '10', '0', '20', '0', '40', '10', '1', '', '2', 'TAG', '3', 'Tag', '70', '0',
      '0', 'TEXT', '8', 'NOTES', '10', '10', '20', '0', '40', '5', '1', 'HINGE', '50', '0',
      '0', 'ENDBLK', '8', '0'),
    section('ENTITIES',
      '0', 'INSERT', '8', 'A-DOOR', '66', '1', '2', 'DOOR90', '10', '1000', '20', '500', '30', '0',
      '41', '2', '42', '2', '50', '90',
      '0', 'ATTRIB', '8', 'A-DOOR', '10', '1000', '20', '450', '40', '20', '1', 'D1', '2', 'TAG', '70', '0',
      '0', 'SEQEND', '8', 'A-DOOR',
      '0', 'CIRCLE', '8', 'A-COLS', '10', '5', '20', '6', '40', '7',
      '0', 'SPLINE', '8', 'A-WALL', '70', '8', '10', '1', '20', '2',
      '0', 'HATCH', '8', 'A-WALL', '2', 'SOLID'),
    '0', 'EOF'
  ));
  const insert = doc.entities.find((e) => e.type === 'INSERT');
  assert.equal(insert.name, 'DOOR90');
  assert.equal(insert.layer, 'A-DOOR');
  assert.deepEqual(insert.at, [1000, 500]);
  assert.equal(insert.rotationDeg, 90);
  assert.deepEqual(insert.scale, [2, 2]);
  assert.deepEqual(insert.attributes, { TAG: 'D1' });

  const line = doc.entities.find((e) => e.type === 'LINE');
  assert.equal(line.layer, 'A-DOOR', 'layer 0 inside a block takes the insert layer');
  nearPoint(line.a, [1000, 500]);
  nearPoint(line.b, [1000, 700]);

  const arc = doc.entities.find((e) => e.type === 'ARC');
  nearPoint(arc.center, [1000, 600]);
  near(arc.radius, 100);
  near(arc.startDeg, 90);
  near(arc.endDeg, 180);

  const note = doc.entities.find((e) => e.type === 'TEXT' && e.text === 'HINGE');
  assert.equal(note.layer, 'NOTES', 'named layers inside a block are kept');
  nearPoint(note.at, [1000, 520]);
  near(note.height, 10);
  near(note.rotationDeg, 90);

  const tag = doc.entities.find((e) => e.type === 'TEXT' && e.text === 'D1');
  assert.ok(tag, 'visible attributes are also emitted as text');
  assert.ok(!doc.entities.some((e) => e.type === 'TEXT' && e.text === ''), 'ATTDEF templates are not drawn');

  assert.deepEqual(doc.entities.find((e) => e.type === 'CIRCLE'), { type: 'CIRCLE', layer: 'A-COLS', center: [5, 6], radius: 7 });
  assert.ok(!doc.entities.some((e) => e.type === 'SPLINE' || e.type === 'HATCH'), 'unknown entities are skipped');
});

test('nested blocks compose their transforms', () => {
  const doc = parseDxf(dxf(
    section('BLOCKS',
      '0', 'BLOCK', '2', 'LEAF', '10', '0', '20', '0',
      '0', 'LINE', '8', '0', '10', '0', '20', '0', '11', '10', '21', '0',
      '0', 'ENDBLK',
      '0', 'BLOCK', '2', 'PAIR', '10', '0', '20', '0',
      '0', 'INSERT', '8', '0', '2', 'LEAF', '10', '100', '20', '0', '50', '90',
      '0', 'ENDBLK'),
    section('ENTITIES', '0', 'INSERT', '8', 'A-DOOR', '2', 'PAIR', '10', '0', '20', '1000'),
    '0', 'EOF'
  ));
  const line = doc.entities.find((e) => e.type === 'LINE');
  nearPoint(line.a, [100, 1000]);
  nearPoint(line.b, [100, 1010]);
  assert.equal(line.layer, 'A-DOOR');
  assert.equal(doc.entities.filter((e) => e.type === 'INSERT').length, 2);
});

test('paper-space entities are left out and DIMENSION gives its text', () => {
  const doc = parseDxf(dxf(
    section('ENTITIES',
      '0', 'LINE', '8', 'TITLE', '67', '1', '10', '0', '20', '0', '11', '1', '21', '1',
      '0', 'TEXT', '8', 'A-ANNO', '10', '0', '20', '0', '40', '100', '1', 'X',
      '0', 'DIMENSION', '8', 'A-ANNO-DIMS', '2', '*D1', '10', '0', '20', '0', '11', '2000', '21', '300', '42', '4000', '1', '<> mm'),
    '0', 'EOF'
  ));
  assert.equal(doc.entities.length, 2);
  const dim = doc.entities[1];
  assert.equal(dim.type, 'TEXT');
  assert.equal(dim.text, '4000 mm');
  assert.deepEqual(dim.at, [2000, 300]);
  assert.equal(dim.height, 100, 'dimension text without a style takes the usual text height');
});

test('unicode escapes decode', () => {
  const doc = parseDxf(dxf(section('ENTITIES', '0', 'TEXT', '8', '0', '10', '0', '20', '0', '40', '1', '1', 'A\\U+2013A 9\\U+2033'), '0', 'EOF'));
  assert.equal(doc.entities[0].text, 'A–A 9″');
});

test('binary DXF, DWG and non-DXF files are rejected', () => {
  assert.throws(() => parseDxf('AC1015\u0000\u0000binary dwg data'), { message: 'Not an ASCII DXF' });
  assert.throws(() => parseDxf('AutoCAD Binary DXF\r\n\u001a\u0000'), { message: 'Not an ASCII DXF' });
  assert.throws(() => parseDxf('%PDF-1.7\n1 0 obj'), { message: 'Not an ASCII DXF' });
  assert.throws(() => parseDxf(''), { message: 'Not an ASCII DXF' });
});

test('empty model space gives empty extents', () => {
  const doc = parseDxf(dxf(section('ENTITIES'), '0', 'EOF'));
  assert.deepEqual(doc.entities, []);
  assert.deepEqual(doc.extents, { min: [0, 0], max: [0, 0] });
});

test('large files: the writer and a 140,000-entity block insert do not overflow the stack', () => {
  const d = createDxf();
  for (let i = 0; i < 12000; i++) d.line('A-WALL', [i, 0], [i, 10]);
  assert.equal(parseDxf(d.toString()).entities.length, 12000);

  const lines = [];
  for (let i = 0; i < 1000; i++) lines.push('0', 'LINE', '8', '0', '10', String(i), '20', '0', '11', String(i), '21', '5');
  const text = ['0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '8', '0', '2', 'ROW', '70', '0', '10', '0', '20', '0', ...lines, '0', 'ENDBLK',
    '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', '0', 'INSERT', '8', 'A-WALL', '2', 'ROW', '10', '0', '20', '0', '70', '1', '71', '140', '45', '10',
    '0', 'ENDSEC', '0', 'EOF'].join('\n');
  const doc = parseDxf(text);
  assert.equal(doc.entities.filter((e) => e.type === 'LINE').length, 140000);
  assert.equal(doc.entities[1].layer, 'A-WALL', 'layer 0 inside the block takes the insert\'s layer');
});
