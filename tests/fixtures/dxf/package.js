/**
 * A small single-storey drawing package (plan, section, working drawing, site layout) as the
 * upload page would pass it to `assemble`: parsed documents plus their extracted results.
 */
import { createDxf } from '../../../tools/sample-drawings/dxf-writer.mjs';
import { parseDxf } from '../../../website/assets/app/importers/dxf/reader.js';
import { extractPlan } from '../../../website/assets/app/importers/extract/plan.js';
import { extractSection } from '../../../website/assets/app/importers/extract/section.js';
import { extractSchedule } from '../../../website/assets/app/importers/extract/schedule.js';
import { extractLayout } from '../../../website/assets/app/importers/extract/layout.js';
import { roomWithOpenings, rect } from './plans.js';

const MM = { unit: 'mm', factor: 0.001, source: 'header' };

/** Section with ground floor ±0.000, ceiling +3.050, roof +3.350, parapet +4.350, sill and lintel. */
export function sectionDoc() {
  const d = createDxf();
  for (const [text, y] of [['GROUND FLOOR F.F.L. ±0.000', 0], ['CEILING +3.050', 3050], ['ROOF +3.350', 3350], ['PARAPET +4.350', 4350], ['SILL +0.900', 900], ['LINTEL +2.100', 2100]]) {
    d.text('A-ANNO-LEVL', [6000, y], 200, text);
  }
  d.text('A-ANNO-TTLB', [0, -2000], 500, 'SECTION A-A');
  return parseDxf(d.toString());
}

/** Working drawing whose schedule makes D1 1050 wide (the plan measures 900) and W1 1500 × 1200. */
export function workingDoc() {
  const d = createDxf();
  d.text('A-ANNO-SCHD', [0, 0], 200, 'D1 DOOR 1050 x 2100 TEAK');
  d.text('A-ANNO-SCHD', [0, -400], 200, 'W1 WINDOW 1500 x 1200 SILL 900 ALUMINIUM');
  d.text('A-ANNO-TTLB', [0, 2000], 500, 'WORKING DRAWING SECTION A-A');
  return parseDxf(d.toString());
}

/**
 * Site layout: 10 × 20 m plot; footprint matching the plan's outer walls (4460 × 3460) with its
 * corner at (2000, 5000), so the plan must move by (2, 5) m.
 * @param {{ wallHeight?: boolean }} [options]
 */
export function layoutDoc({ wallHeight = true } = {}) {
  const d = createDxf();
  d.poly('C-PROP', [[0, 0], [10000, 0], [10000, 20000], [0, 20000]], true);
  const h = 115;
  const w = (a, b) => d.line('A-SITE-WALL', a, b);
  w([-h, -h], [2000, -h]); w([5600, -h], [10000 + h, -h]);
  w([h, h], [2000, h]); w([5600, h], [10000 - h, h]);
  w([2000, -h], [2000, h]); w([5600, -h], [5600, h]);
  w([10000 + h, -h], [10000 + h, 20000 + h]); w([10000 - h, h], [10000 - h, 20000 - h]);
  w([10000 + h, 20000 + h], [-h, 20000 + h]); w([10000 - h, 20000 - h], [h, 20000 - h]);
  w([-h, 20000 + h], [-h, -h]); w([h, 20000 - h], [h, h]);
  d.text('A-SITE-GATE', [3800, -700], 250, 'GATE');
  rect(d, 'A-SITE-BLDG', [2000, 5000], [6460, 8460]);
  rect(d, 'L-PLNT', [6500, 500], [9500, 4500]);
  d.text('A-ANNO-NOTE', [5000, -5000], 400, '30\'-0" WIDE ROAD');
  if (wallHeight) d.text('A-ANNO-NOTE', [12000, 10000], 200, 'BOUNDARY WALL 7\'-0" HIGH');
  d.text('A-ANNO-TTLB', [0, -14000], 500, 'SITE LAYOUT');
  return parseDxf(d.toString());
}

/**
 * Parsed drawings for `assemble`.
 * @param {{ section?: boolean, working?: boolean, layout?: boolean, wallHeight?: boolean }} [options]
 * @returns {object[]}
 */
export function smallPackage({ section = true, working = true, layout = true, wallHeight = true } = {}) {
  const plan = roomWithOpenings();
  const out = [{ id: 'gf', name: 'ground.dxf', slot: 'plan', levelIndex: 0, section: null, doc: plan, extracted: extractPlan(plan, MM), units: MM }];
  if (section) {
    const doc = sectionDoc();
    out.push({ id: 'sa', name: 'section-a.dxf', slot: 'section', levelIndex: null, section: 'A', doc, extracted: extractSection(doc, MM), units: MM });
  }
  if (working) {
    const doc = workingDoc();
    out.push({ id: 'wa', name: 'working-a.dxf', slot: 'working', levelIndex: null, section: 'A', doc, extracted: extractSchedule(doc, MM), units: MM });
  }
  if (layout) {
    const doc = layoutDoc({ wallHeight });
    out.push({ id: 'site', name: 'site.dxf', slot: 'layout', levelIndex: null, section: null, doc, extracted: extractLayout(doc, MM), units: MM });
  }
  return out;
}
