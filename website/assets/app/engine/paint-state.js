/**
 * Paint state helpers: which shade and finish each surface carries.
 * State shape: `{ [surfaceId]: { code: 'AM-5006', finish: 'matt'|'silk'|'gloss' } }`.
 * Pure module: no DOM, no three.js. Every function returns new objects and never mutates its input.
 */
import { resolveSelector } from '../model/surfaces.js';

/** Allowed paint finishes. */
export const FINISHES = ['matt', 'silk', 'gloss'];

/** Selector kinds from least to most specific; later kinds win when building defaults. */
const SELECTOR_ORDER = ['*', 'site', 'exterior', 'room:', 'group:'];

/**
 * Rank of a default-paint selector: broad selectors first so specific ones override them.
 * @param {string} selector
 * @returns {number}
 */
function selectorRank(selector) {
  const index = SELECTOR_ORDER.findIndex((kind) => (kind.endsWith(':') ? selector.startsWith(kind) : selector === kind));
  return index === -1 ? SELECTOR_ORDER.length : index;
}

/**
 * A valid finish, falling back to `fallback` (or matt).
 * @param {unknown} finish
 * @param {string} [fallback]
 * @returns {'matt'|'silk'|'gloss'}
 */
function cleanFinish(finish, fallback) {
  if (FINISHES.includes(finish)) return finish;
  return FINISHES.includes(fallback) ? fallback : 'matt';
}

/**
 * Paints surfaces with a shade. Surfaces keep their current finish when `finish` is omitted
 * (new surfaces get matt).
 * @param {Object<string, { code: string, finish: string }>} state current paint state
 * @param {string[]} surfaceIds surfaces to paint
 * @param {string} code shade code such as 'AM-5006'
 * @param {'matt'|'silk'|'gloss'} [finish] finish to apply
 * @returns {Object<string, { code: string, finish: string }>} a new paint state
 */
export function applyPaint(state, surfaceIds, code, finish) {
  const next = { ...(state || {}) };
  for (const id of surfaceIds || []) {
    const current = next[id];
    next[id] = { code, finish: cleanFinish(finish, current && current.finish) };
  }
  return next;
}

/**
 * Changes only the finish of surfaces that are already painted.
 * @param {Object<string, { code: string, finish: string }>} state current paint state
 * @param {string[]} surfaceIds surfaces to change
 * @param {'matt'|'silk'|'gloss'} finish new finish
 * @returns {Object<string, { code: string, finish: string }>} a new paint state
 */
export function applyFinish(state, surfaceIds, finish) {
  const next = { ...(state || {}) };
  for (const id of surfaceIds || []) {
    if (next[id]) next[id] = { code: next[id].code, finish: cleanFinish(finish, next[id].finish) };
  }
  return next;
}

/**
 * The paint a building starts with, from `building.defaults.paint` (selector -> shade code) and
 * `building.defaults.finish`. Broad selectors are applied first (`*`, `site`, `exterior`, `room:`,
 * `group:`, then surface ids), so specific ones override them. Surfaces with cladding stay unpainted.
 * @param {import('../model/schema.js').Building} building
 * @param {import('../model/schema.js').Surface[]} surfaces paintable surfaces
 * @returns {Object<string, { code: string, finish: string }>} the default paint state
 */
export function defaultPaintState(building, surfaces) {
  const defaults = (building && building.defaults) || {};
  const finish = cleanFinish(defaults.finish);
  const paintable = (surfaces || []).filter((s) => !s.cladding);
  const selectors = Object.keys(defaults.paint || {}).sort((x, y) => selectorRank(x) - selectorRank(y));
  let state = {};
  for (const selector of selectors) {
    const ids = resolveSelector(building, paintable, selector);
    state = applyPaint(state, ids, defaults.paint[selector], finish);
  }
  return state;
}

/**
 * The surfaces a paint action reaches.
 * - `surface`: every piece of the selected surface's group (one wall side facing one room);
 * - `room`: the walls of the selected surface's room (its ceiling only when the ceiling itself is
 *   selected); an outside wall selects every outside wall; a boundary wall selects both its sides;
 * - `exterior`: every surface outside the rooms;
 * - `all`: everything.
 * @param {import('../model/schema.js').Surface[]} surfaces paintable surfaces
 * @param {string|null} selectedId the selected surface id, needed for `surface` and `room`
 * @param {'surface'|'room'|'exterior'|'all'} scope
 * @returns {string[]} surface ids, in surface order
 */
export function scopeSurfaceIds(surfaces, selectedId, scope) {
  const list = surfaces || [];
  const ids = (keep) => list.filter(keep).map((s) => s.id);
  if (scope === 'all') return ids(() => true);
  if (scope === 'exterior') return ids((s) => s.room === 'exterior');
  const selected = list.find((s) => s.id === selectedId);
  if (!selected) return [];
  if (scope === 'room') {
    if (selected.side === 'C') return ids((s) => s.room === selected.room && s.side === 'C');
    return ids((s) => s.room === selected.room && s.side !== 'C');
  }
  const group = selected.group || selected.id;
  return ids((s) => (s.group || s.id) === group);
}

/**
 * One row per paint group (every piece of one wall side facing one room), area summed. Rows with
 * the same label are numbered "(2)", "(3)" so no two rows read the same.
 * @param {import('../model/schema.js').Surface[]} surfaces paintable surfaces
 * @param {Object<string, { code: string, finish: string }>} state paint state
 * @returns {{ group: string, label: string, room: string, level: string|null, area: number, surfaceIds: string[], code: string|null, finish: string|null }[]}
 */
export function paintGroups(surfaces, state) {
  const rows = new Map();
  for (const surface of surfaces || []) {
    const key = surface.group || surface.id;
    if (!rows.has(key)) {
      rows.set(key, { group: key, label: surface.label, room: surface.room, level: surface.level ?? null, area: 0, surfaceIds: [], code: null, finish: null });
    }
    const row = rows.get(key);
    row.area += surface.area || 0;
    row.surfaceIds.push(surface.id);
    const paint = state && state[surface.id];
    if (paint && !row.code) {
      row.code = paint.code;
      row.finish = paint.finish;
    }
  }
  const seen = new Map();
  return [...rows.values()].map((row) => {
    const count = (seen.get(row.label) || 0) + 1;
    seen.set(row.label, count);
    return { ...row, area: Math.round(row.area * 100) / 100, label: count > 1 ? `${row.label} (${count})` : row.label };
  });
}
