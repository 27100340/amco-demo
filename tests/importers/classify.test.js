import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYER_ALIASES, layerRole, isPartialWallLayer, normaliseSectionLabel, classifyDrawing
} from '../../website/assets/app/importers/extract/classify.js';

const text = (value, height = 250, layer = 'A-ANNO-TTLB', at = [0, 0]) => ({ type: 'TEXT', layer, at, text: value, height, rotationDeg: 0 });
const doc = (...entities) => ({ version: 'AC1009', insunits: 4, layers: [], entities, extents: { min: [0, 0], max: [0, 0] }, warnings: [] });

test('layer roles for every alias in the spec', () => {
  const cases = {
    wall: ['A-WALL', 'A-WALL-EXTR', 'A-WALL-PRHT', 'WALL', 'WALLS 9IN', 'a-wall'],
    door: ['A-DOOR', 'A-DOOR-IDEN', 'DOOR', 'DOORS'],
    window: ['A-GLAZ', 'A-GLAZ-IDEN', 'A-WIND', 'WINDOW', 'WINDOWS'],
    room: ['A-AREA-IDEN', 'A-ANNO-ROOM', 'ROOM', 'ROOM NAMES'],
    section: ['A-ANNO-SECT', 'A-SECT', 'A-SECT-MARK', 'SECTION', 'SECTIONS'],
    level: ['A-ANNO-LEVL', 'LEVEL', 'LEVELS'],
    boundary: ['C-PROP', 'C-PROP-LINE', 'PLOT', 'PLOT LINE', 'BOUNDARY', 'BOUNDARY WALL'],
    gate: ['GATE', 'GATES', 'A-SITE-GATE'],
    lawn: ['L-PLNT', 'L-PLNT-TURF', 'LAWN'],
    paving: ['A-SITE-PAVE', 'PAVING'],
    road: ['C-ROAD', 'ROAD'],
    footprint: ['A-SITE-BLDG', 'FOOTPRINT'],
    site: ['A-SITE', 'A-SITE-WALL', 'A-SITE-FENC']
  };
  for (const [role, names] of Object.entries(cases)) {
    for (const name of names) assert.equal(layerRole(name), role, `${name} should be ${role}`);
  }
  for (const name of ['0', 'A-FURN', 'A-ANNO-DIMS', 'A-FLOR-STRS', 'DEFPOINTS', '', null, undefined]) {
    assert.equal(layerRole(name), null, `${name} has no role`);
  }
});

test('layer names with underscores, spaces or digits as separators', () => {
  const cases = {
    wall: ['WALL_EXT', 'A_WALL', 'WALLS_9IN', 'WALL1', 'A_WALL_EXTR', 'WALL-9', 'Wall_4.5in'],
    door: ['A_DOOR', 'DOOR_1', 'DOORS2', 'Door Frames'],
    window: ['A_GLAZ', 'A_WIND', 'WINDOW_1', 'WINDOWS2'],
    room: ['A_AREA_IDEN', 'A_ANNO_ROOM', 'ROOM_NAMES', 'ROOMS1'],
    section: ['A_ANNO_SECT', 'A_SECT', 'SECTION_MARKS'],
    level: ['A_ANNO_LEVL', 'LEVEL_1'],
    boundary: ['C_PROP', 'PLOT_LINE', 'BOUNDARY_1'],
    gate: ['GATE_1', 'A_SITE_GATE'],
    lawn: ['L_PLNT', 'LAWN_1'],
    paving: ['A_SITE_PAVE'],
    road: ['C_ROAD', 'ROAD_1'],
    footprint: ['A_SITE_BLDG'],
    site: ['A_SITE', 'A_SITE_WALL']
  };
  for (const [role, names] of Object.entries(cases)) {
    for (const name of names) assert.equal(layerRole(name), role, `${name} should be ${role}`);
  }
  for (const name of ['WALLPAPER', 'DOORWAY', 'WINDOWSILL', 'ROOMSERVICE', 'A-WALL-PATT', 'A_WALL_HATCH', 'WALL-HATCH']) {
    assert.equal(layerRole(name), null, `${name} has no role`);
  }
  assert.equal(isPartialWallLayer('A_WALL_PRHT'), true);
  assert.equal(isPartialWallLayer('WALL_LOW_1'), true);
  assert.ok(Array.isArray(LAYER_ALIASES) && LAYER_ALIASES.every(([role, re]) => (role === null || typeof role === 'string') && re instanceof RegExp));
});

test('partial-height wall layers are recognised', () => {
  assert.equal(isPartialWallLayer('A-WALL-PRHT'), true);
  assert.equal(isPartialWallLayer('WALL-PARAPET'), true);
  assert.equal(isPartialWallLayer('A-WALL-RAIL'), true);
  assert.equal(isPartialWallLayer('A-WALL'), false);
  assert.equal(isPartialWallLayer('A-WALL-EXTR'), false);
});

test('section label variants', () => {
  assert.equal(normaliseSectionLabel('SECTION A-A'), 'A');
  assert.equal(normaliseSectionLabel('SEC. A-A'), 'A');
  assert.equal(normaliseSectionLabel('Section a–a'), 'A', 'en dash and lower case');
  assert.equal(normaliseSectionLabel('Section a-a'), 'A');
  assert.equal(normaliseSectionLabel('SECTION 1-1'), '1');
  assert.equal(normaliseSectionLabel('B - B'), 'B');
  assert.equal(normaliseSectionLabel('W.D. B-B'), 'B');
  assert.equal(normaliseSectionLabel('SECTION ON X—X'), 'X', 'em dash');
  assert.equal(normaliseSectionLabel('SECTION C'), 'C');
  assert.equal(normaliseSectionLabel('SEC.A-A'), 'A', 'no space after the full stop');
  assert.equal(normaliseSectionLabel('SECTION AA'), 'A', 'no dash');
  assert.equal(normaliseSectionLabel('SECTION BB'), 'B');
  assert.equal(normaliseSectionLabel('SECTION "A-A"'), 'A', 'quoted');
  assert.equal(normaliseSectionLabel('SEC. “A”-“A”'), 'A', 'curly quotes');
  assert.equal(normaliseSectionLabel("SECTION 'B-B'"), 'B');
  assert.equal(normaliseSectionLabel('SECTION AB'), null, 'two different letters');
  assert.equal(normaliseSectionLabel('SECTIONAL ELEVATION'), null);
  assert.equal(normaliseSectionLabel('AA'), null, 'a pair alone without "section" is not enough');
  assert.equal(normaliseSectionLabel('LOUNGE'), null);
  assert.equal(normaliseSectionLabel('10\'-10"'), null, 'a feet-inches length is not a section');
  assert.equal(normaliseSectionLabel('CROSS SECTION'), null);
  assert.equal(normaliseSectionLabel(''), null);
  assert.equal(normaliseSectionLabel(undefined), null);
});

test('floor plan titles give the level', () => {
  const cases = [
    ['GROUND FLOOR PLAN', 0, 'Ground floor'],
    ['FIRST FLOOR PLAN', 1, 'First floor'],
    ['SECOND FLOOR PLAN', 2, 'Second floor'],
    ['THIRD FLOOR PLAN', 3, 'Third floor'],
    ['BASEMENT PLAN', -1, 'Basement'],
    ['Ground Floor Plan', 0, 'Ground floor'],
    ['G.F. PLAN', 0, 'Ground floor'],
    ['1ST FLOOR PLAN', 1, 'First floor'],
    ['FIRST-FLOOR PLAN', 1, 'First floor']
  ];
  for (const [title, levelIndex, levelName] of cases) {
    const result = classifyDrawing(doc(text(title)));
    assert.deepEqual(result, { kind: 'plan', levelIndex, levelName, section: null, title }, title);
  }
});

test('section titles give the label', () => {
  const cases = [
    ['SECTION A-A', 'A'], ['SEC. A-A', 'A'], ['Section a–a', 'A'], ['SECTION 1-1', '1'], ['CROSS SECTION B-B', 'B'],
    ['SEC.A-A', 'A'], ['SECTION AA', 'A'], ['SECTION "A-A"', 'A'], ['Section “B-B”', 'B']
  ];
  for (const [title, section] of cases) {
    assert.deepEqual(classifyDrawing(doc(text(title))), { kind: 'section', levelIndex: null, levelName: null, section, title }, title);
  }
});

test('working drawing titles give the label', () => {
  for (const title of ['WORKING DRAWING SECTION B-B', 'W.D. B-B', 'DOOR & WINDOW SCHEDULE - SECTION B-B', 'Working drawing (section b-b)', 'WORKING DRAWING SEC.B-B', 'WORKING DRAWING SECTION BB', 'WORKING DRAWING SECTION "B-B"']) {
    assert.deepEqual(classifyDrawing(doc(text(title))), { kind: 'working', levelIndex: null, levelName: null, section: 'B', title }, title);
  }
});

test('a working drawing without a label on its title takes it from another section text', () => {
  const result = classifyDrawing(doc(text('WORKING DRAWING', 500), text('SECTION A-A', 300), text('FRONT ELEVATION', 300)));
  assert.equal(result.kind, 'working');
  assert.equal(result.section, 'A');
});

test('layout titles', () => {
  for (const title of ['SITE LAYOUT', 'SITE PLAN', 'LAYOUT PLAN', 'Site Layout Plan']) {
    assert.equal(classifyDrawing(doc(text(title))).kind, 'layout', title);
  }
});

test('the largest title wins; a plan with section marks stays a plan', () => {
  const working = classifyDrawing(doc(text('SECTION A-A', 300), text('WORKING DRAWING SECTION A-A', 500), text('DOOR & WINDOW SCHEDULE', 250)));
  assert.equal(working.kind, 'working');
  assert.equal(working.title, 'WORKING DRAWING SECTION A-A');

  const plan = classifyDrawing(doc(text('A', 300, 'A-ANNO-SECT'), text('B', 300, 'A-ANNO-SECT'), text('GROUND FLOOR PLAN', 500), text('LOUNGE', 200, 'A-AREA-IDEN')));
  assert.equal(plan.kind, 'plan');
  assert.equal(plan.levelIndex, 0);

  const section = classifyDrawing(doc(text('GROUND FLOOR F.F.L. ±0\'-0"', 200), text('SECTION B-B', 500)));
  assert.equal(section.kind, 'section');
  assert.equal(section.section, 'B');
});

test('a drawing without a recognised title is unknown', () => {
  assert.deepEqual(classifyDrawing(doc(text('LOUNGE'), text('KITCHEN'))), { kind: 'unknown', levelIndex: null, levelName: null, section: null, title: null });
  assert.equal(classifyDrawing(doc()).kind, 'unknown');
});
