/**
 * Section extraction without AI: floor levels, ceilings, slab, roof, parapet, plinth, sill and
 * lintel heights read from level-marker text ("FIRST FLOOR F.F.L. +11'-0\"", "CEILING +3.050").
 * Pure module: no DOM.
 */
import { classifyDrawing } from './classify.js';
import { textsOf, parseDrawingLength } from './text.js';

/** Pakistani defaults (m) used when a value is not marked. */
export const SECTION_DEFAULTS = { ceiling: 3.05, slab: 0.15, parapet: 1.07, plinth: 0.45, sill: 0.9, lintel: 2.1 };

/** Storey names by level index. */
export const STOREY_NAMES = { '-1': 'Basement', 0: 'Ground floor', 1: 'First floor', 2: 'Second floor', 3: 'Third floor', 4: 'Fourth floor' };

/** Marker keywords; when a text holds several, the earliest wins ("ROOF T.O.S." is a roof). */
const KEYWORDS = [
  ['roof', /\bROOF\b|\bTERRACE\s+LEVEL\b/],
  ['ffl', /(?<![A-Z])F\.?\s?F\.?\s?L\b\.?|\bFINISH(?:ED)?\s+FLOOR\b|\bFLOOR\s+LEVEL\b/],
  ['ceiling', /\bCEILING\b|\bC\.?L\.?G\b\.?/],
  ['parapet', /\bPARAPET\b/],
  ['plinth', /\bPLINTH\b/],
  ['ngl', /(?<![A-Z])N\.?\s?G\.?\s?L\b\.?|\bNATURAL\s+GROUND\b|\bGROUND\s+LEVEL\b|\bROAD\s+LEVEL\b/],
  ['sill', /\bSILL\b/],
  ['lintel', /\bLINTE?L\b|\bLINTOL\b/],
  ['slab', /\bSLAB\b|(?<![A-Z])T\.?\s?O\.?\s?S\b\.?/]
];
const STOREY_RE = /\b(BASEMENT|LOWER\s+GROUND|GROUND|FIRST|SECOND|THIRD|FOURTH|1ST|2ND|3RD|4TH)\s+FLOOR\b|\bBASEMENT\b/;
const STOREY_INDEX = { BASEMENT: -1, 'LOWER GROUND': -1, GROUND: 0, FIRST: 1, '1ST': 1, SECOND: 2, '2ND': 2, THIRD: 3, '3RD': 3, FOURTH: 4, '4TH': 4 };
const VALUE_RE = /[+\-±]?\s*\d+\s*'(?:\s*-?\s*\d+(?:\s+\d+\/\d+)?\s*"?)?|[+\-±]?\s*\d+(?:\s+\d+\/\d+)?\s*"|[+\-±]?\s*\d+(?:\.\d+)?(?:\s*(?:mm|cm|m)(?![A-Za-z]))?(?![A-Za-z\d'"])/g;
/** Same-row texts: baselines within this fraction of the text height. */
const ROW_TOLERANCE = 0.6;
/** Values within this distance (m) are the same level. */
const SAME_LEVEL = 0.005;
/** A ceiling must be at least this far (m) above its floor. */
const MIN_STOREY = 0.5;

/**
 * Upper-cases text and folds dash variants.
 * @returns {string}
 */
function fold(text) {
  return String(text).toUpperCase().replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim();
}

/**
 * The earliest marker keyword in a text.
 * @returns {{ kind: string, index: number, end: number } | null}
 */
function keywordOf(t) {
  let best = null;
  for (const [kind, pattern] of KEYWORDS) {
    const m = pattern.exec(t);
    if (m && (!best || m.index < best.index)) best = { kind, index: m.index, end: m.index + m[0].length };
  }
  return best;
}

/**
 * The first length value at or after `from` (else the last one before it).
 * @returns {number | null} metres
 */
function valueOf(t, from = 0) {
  const matches = [...t.matchAll(VALUE_RE)]
    .map((m) => ({ index: m.index, value: parseDrawingLength(m[0].replace(/\s+/g, ' ').trim()) }))
    .filter((m) => m.value !== null);
  const after = matches.find((m) => m.index >= from);
  if (after) return after.value;
  return matches.length > 0 ? matches[matches.length - 1].value : null;
}

/**
 * The storey index a text names ("FIRST FLOOR" → 1), or null.
 * @returns {number | null}
 */
function storeyOf(t) {
  const m = STOREY_RE.exec(t);
  if (!m) return null;
  const word = (m[1] ?? 'BASEMENT').replace(/\s+/g, ' ');
  return STOREY_INDEX[word] ?? null;
}

/**
 * Reads level markers from horizontal texts, pairing keyword-only and value-only texts that sit
 * on the same row.
 * @returns {{ kind: string, value: number, storey: number | null }[]}
 */
function readMarkers(doc, factor) {
  const items = textsOf(doc)
    .filter((e) => Math.abs((((e.rotationDeg ?? 0) + 180) % 360) - 180) <= 5)
    .map((e) => {
      const t = fold(e.text);
      const kw = keywordOf(t);
      return {
        kw,
        value: valueOf(t, kw ? kw.end : 0),
        storey: storeyOf(t),
        x: e.at[0] * factor,
        y: e.at[1] * factor,
        h: Math.max(e.height * factor, 1e-6)
      };
    });
  const sameRow = (p, q) => Math.abs(p.y - q.y) <= ROW_TOLERANCE * Math.max(p.h, q.h) && Math.abs(p.x - q.x) <= 40 * Math.max(p.h, q.h);
  const markers = [];
  const used = new Set();
  items.forEach((item, i) => {
    if (!item.kw) return;
    let { value, storey } = item;
    if (value === null) {
      let best = null;
      items.forEach((other, j) => {
        if (j === i || used.has(j) || other.kw || other.value === null || !sameRow(item, other)) return;
        const d = Math.abs(other.x - item.x);
        if (!best || d < best.d) best = { j, d };
      });
      if (!best) return;
      used.add(best.j);
      value = items[best.j].value;
    }
    if (storey === null) {
      const named = items.find((other, j) => j !== i && other.storey !== null && sameRow(item, other));
      if (named) storey = named.storey;
    }
    markers.push({ kind: item.kw.kind, value, storey });
  });
  return markers;
}

/**
 * Most common value (rounded to 5 mm), or null.
 * @returns {number | null}
 */
function commonValue(values) {
  if (values.length === 0) return null;
  const counts = new Map();
  for (const v of values) {
    const key = Math.round(v / SAME_LEVEL);
    if (!counts.has(key)) counts.set(key, { v, n: 0 });
    counts.get(key).n += 1;
  }
  return [...counts.values()].sort((x, y) => y.n - x.n)[0].v;
}

/**
 * Extracts floor levels and heights from a section (or working drawing) by reading level-marker
 * text: FFL / F.F.L / FINISH FLOOR, CEILING / CLG, SLAB / T.O.S, ROOF, PARAPET, PLINTH, N.G.L,
 * SILL and LINTEL, each followed by a value in m (±0.000, +3.350), mm (+3350) or ft-in (+10'-6").
 * Storeys are named from the same text or the same row, otherwise numbered from the ground up.
 * `ceiling` is the clear height above the floor; `slab` the depth from the ceiling to the next
 * floor (or to the roof top for the top storey). A missing ceiling uses 3.05 m and is reported in
 * `warnings` and `defaultsUsed`; other missing values are null. FFL values are as drawn.
 * @param {import('../dxf/reader.js').DxfDoc} doc
 * @param {{ factor?: number }} [options] metres per drawing unit (for row grouping)
 * @returns {{ section: string | null, levels: { index: number, name: string, ffl: number, ceiling: number | null, slab: number | null }[],
 *   parapet: number | null, plinth: number | null, sill: number | null, lintel: number | null, warnings: string[], defaultsUsed: string[] }}
 */
export function extractSection(doc, { factor = 0.001 } = {}) {
  const warnings = [];
  const defaultsUsed = [];
  const markers = readMarkers(doc, factor);
  const of = (kind) => markers.filter((m) => m.kind === kind);

  const floors = [];
  for (const m of of('ffl').sort((x, y) => x.value - y.value)) {
    const same = floors.find((f) => Math.abs(f.ffl - m.value) <= SAME_LEVEL);
    if (same) same.storey = same.storey ?? m.storey;
    else floors.push({ ffl: m.value, storey: m.storey });
  }
  const anchor = floors.findIndex((f) => f.storey !== null);
  const levels = floors.map((f, i) => {
    const index = f.storey ?? (anchor === -1 ? i : floors[anchor].storey + (i - anchor));
    return { index, name: STOREY_NAMES[index] ?? `Level ${index}`, ffl: f.ffl, ceiling: null, slab: null };
  });
  if (levels.length === 0) {
    warnings.push('No floor levels (F.F.L.) found on this section.');
  }

  const ceilings = of('ceiling').map((m) => m.value).sort((x, y) => x - y);
  const top = levels[levels.length - 1];
  const roofs = [...of('roof'), ...of('slab')].map((m) => m.value).filter((v) => top && v > top.ffl + MIN_STOREY).sort((x, y) => x - y);
  levels.forEach((level, i) => {
    const next = levels[i + 1];
    const ceiling = ceilings.find((c) => c > level.ffl + MIN_STOREY && (!next || c <= next.ffl + SAME_LEVEL));
    if (ceiling !== undefined) {
      level.ceiling = ceiling - level.ffl;
    } else {
      level.ceiling = SECTION_DEFAULTS.ceiling;
      warnings.push(`The ${level.name.toLowerCase()} ceiling height isn't marked on this section; ${SECTION_DEFAULTS.ceiling.toFixed(2)} m was used.`);
      defaultsUsed.push(`${level.name} ceiling height ${SECTION_DEFAULTS.ceiling.toFixed(2)} m`);
    }
    const above = next ? next.ffl : roofs[0];
    const slab = above === undefined ? null : above - (level.ffl + level.ceiling);
    level.slab = slab !== null && slab > 0 ? slab : null;
  });

  const roofTop = roofs[0] ?? (top && top.slab !== null ? top.ffl + top.ceiling + top.slab : null);
  let parapet = null;
  const parapetMark = commonValue(of('parapet').map((m) => m.value));
  if (parapetMark !== null) {
    if (roofTop !== null && parapetMark > roofTop) parapet = parapetMark - roofTop;
    else if (parapetMark <= 2) parapet = parapetMark;
    else if (top) {
      const estimate = top.ffl + top.ceiling + (levels[levels.length - 2]?.slab ?? SECTION_DEFAULTS.slab);
      parapet = parapetMark > estimate ? parapetMark - estimate : null;
      warnings.push('The roof level isn\'t marked on this section; the parapet height was measured from an estimated roof top.');
    }
  }

  const ground = levels.find((l) => l.index === 0) ?? levels[0];
  const ngl = commonValue(of('ngl').map((m) => m.value));
  const plinthMark = commonValue(of('plinth').map((m) => m.value));
  let plinth = null;
  if (ngl !== null) {
    const plinthTop = plinthMark !== null && plinthMark > ngl ? plinthMark : ground?.ffl;
    if (plinthTop !== undefined && plinthTop > ngl) plinth = plinthTop - ngl;
  } else if (plinthMark !== null) {
    plinth = Math.abs(plinthMark);
  }

  const relative = (values) => commonValue(values.map((v) => {
    const base = [...levels].reverse().find((l) => l.ffl <= v + SAME_LEVEL);
    return base ? v - base.ffl : v;
  }).filter((v) => v > 0));

  return {
    section: classifyDrawing(doc).section,
    levels,
    parapet,
    plinth,
    sill: relative(of('sill').map((m) => m.value)),
    lintel: relative(of('lintel').map((m) => m.value)),
    warnings,
    defaultsUsed
  };
}
