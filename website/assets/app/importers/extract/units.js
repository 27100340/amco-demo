/**
 * Drawing units: from the $INSUNITS header, or guessed from wall thicknesses. Pakistani walls are
 * 9″ (230 mm) and 4½″ (115 mm), so the most common wall-pair spacing tells the unit.
 * Pure module: no DOM.
 */
import { UNIT_FACTORS } from '../../model/units.js';
import { layerRole } from './classify.js';
import { collectSegments, rawSpacings } from './walls.js';

/** $INSUNITS codes this reader understands. */
export const INSUNITS_CODES = { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' };

/** Units tried by the heuristic, in tie-break order. */
const CANDIDATE_UNITS = ['mm', 'm', 'in', 'ft', 'cm'];
/** Wall thicknesses (m) with their weight: brick sizes count double. */
const WALL_THICKNESSES = [[0.1143, 2], [0.2286, 2], [0.3429, 1], [0.1, 1], [0.2, 1]];
const MATCH = 0.06;
/** Widest spacing (drawing units) that can be a wall in any candidate unit: 13½″ in millimetres. */
const MAX_RAW_SPACING = (Math.max(...WALL_THICKNESSES.map(([t]) => t)) * (1 + MATCH)) / Math.min(...CANDIDATE_UNITS.map((u) => UNIT_FACTORS[u]));

/**
 * Detects the drawing units.
 * 1. `$INSUNITS` 1, 2, 4, 5 or 6 (in, ft, mm, cm, m) → source 'header'.
 * 2. Otherwise each unit is scored by how many wall spacings become a common wall thickness
 *    (4½″, 9″, 13½″, 100 or 200 mm) in it → source 'heuristic'. Spacings come from
 *    `wallSpacings` or are measured between parallel lines on the wall layers (all layers when
 *    there is no wall layer).
 * 3. Otherwise millimetres → source 'default'.
 * @param {import('../dxf/reader.js').DxfDoc} doc
 * @param {number[]} [wallSpacings] wall-pair spacings in drawing units
 * @returns {{ unit: 'mm'|'cm'|'m'|'in'|'ft', factor: number, source: 'header'|'heuristic'|'default' }}
 */
export function detectUnits(doc, wallSpacings) {
  const header = INSUNITS_CODES[doc?.insunits];
  if (header) return { unit: header, factor: UNIT_FACTORS[header], source: 'header' };
  const spacings = Array.isArray(wallSpacings) ? wallSpacings : measuredSpacings(doc);
  let best = null;
  for (const unit of CANDIDATE_UNITS) {
    const factor = UNIT_FACTORS[unit];
    let score = 0;
    for (const s of spacings) {
      const metres = s * factor;
      const match = WALL_THICKNESSES.find(([t]) => Math.abs(metres - t) <= t * MATCH);
      if (match) score += match[1];
    }
    if (score > 0 && (!best || score > best.score)) best = { unit, score };
  }
  if (best) return { unit: best.unit, factor: UNIT_FACTORS[best.unit], source: 'heuristic' };
  return { unit: 'mm', factor: UNIT_FACTORS.mm, source: 'default' };
}

/**
 * Parallel-line spacings on the wall layers, or on every layer when none is a wall layer.
 * @param {import('../dxf/reader.js').DxfDoc} doc
 * @returns {number[]}
 */
function measuredSpacings(doc) {
  const entities = doc?.entities ?? [];
  const hasWallLayer = entities.some((e) => layerRole(e.layer) === 'wall');
  const segments = collectSegments(entities, 1, (e) => (!hasWallLayer || layerRole(e.layer) === 'wall' ? 'all' : null));
  return rawSpacings(segments, MAX_RAW_SPACING);
}
