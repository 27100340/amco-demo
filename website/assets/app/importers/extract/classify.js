/**
 * Drawing classification without AI: layer roles from an alias table (AIA/NCS names and common
 * Pakistani variants), section labels, and the drawing kind from its title text.
 * Pure module: no DOM.
 */

/**
 * Layer-name aliases, checked in order against the upper-cased layer name; the first match wins.
 * Parts of a name may be joined by '-', '_' or a space ("A-WALL", "A_WALL", "A WALL"), and a
 * keyword may be followed by anything but a letter ("WALL1", "WALL_EXT", "WALLS 9IN" are walls;
 * "WALLPAPER" is not). Hatch and pattern layers ("A-WALL-PATT", "WALL_HATCH") hold fill
 * linework, so they come first with no role. Adding an alias is a one-line change.
 * @type {[string | null, RegExp][]}
 */
export const LAYER_ALIASES = [
  [null, /[-_ ](?:PATT|HATCH|HTCH)/],
  ['wall', /^(?:A[-_ ])?WALLS?(?![A-Z])/],
  ['door', /^(?:A[-_ ])?DOORS?(?![A-Z])/],
  ['window', /^A[-_ ]GLAZ|^(?:A[-_ ])?WIND(?:OW)?S?(?![A-Z])/],
  ['room', /^A[-_ ]AREA[-_ ]IDEN|^A[-_ ]ANNO[-_ ]ROOM|^ROOMS?(?![A-Z])/],
  ['section', /^A[-_ ]ANNO[-_ ]SECT|^A[-_ ]SECT|^SECTIONS?(?![A-Z])/],
  ['level', /^A[-_ ]ANNO[-_ ]LEVL|^LEVELS?(?![A-Z])/],
  ['gate', /^(?:A[-_ ]SITE[-_ ])?GATES?(?![A-Z])/],
  ['paving', /^A[-_ ]SITE[-_ ]PAVE|^PAVING(?![A-Z])/],
  ['footprint', /^A[-_ ]SITE[-_ ]BLDG|^FOOTPRINT(?![A-Z])/],
  ['lawn', /^L[-_ ]PLNT|^LAWNS?(?![A-Z])/],
  ['road', /^C[-_ ]ROAD|^ROADS?(?![A-Z])/],
  ['boundary', /^C[-_ ]PROP|^PLOTS?(?![A-Z])|^BOUNDARY(?![A-Z])/],
  ['site', /^A[-_ ]SITE(?![A-Z])/]
];

/** Wall layers whose walls are low (parapets, balcony railings, partial-height walls). */
const PARTIAL_WALL_RE = /PRHT|PARAPET|RAIL|(?<![A-Z])LOW(?![A-Z])|HALF/;

/** Words naming a storey before "PLAN", with the level index they stand for. */
const PLAN_LEVELS = [
  [/^(?:BASEMENT|LOWER\s*GROUND)/, -1, 'Basement'],
  [/^(?:GROUND|G\.?\s?F\.?$)/, 0, 'Ground floor'],
  [/^(?:FIRST|1ST|F\.?\s?F\.?$)/, 1, 'First floor'],
  [/^(?:SECOND|2ND|S\.?\s?F\.?$)/, 2, 'Second floor'],
  [/^(?:THIRD|3RD)/, 3, 'Third floor'],
  [/^(?:FOURTH|4TH)/, 4, 'Fourth floor'],
  [/^(?:ROOF|TERRACE|MUMTY)/, null, 'Roof']
];
const FLOOR_PLAN_RE = /(?<![A-Z])(BASEMENT|LOWER\s+GROUND|GROUND|FIRST|SECOND|THIRD|FOURTH|1ST|2ND|3RD|4TH|G\.?\s?F\.?|F\.?\s?F\.?|S\.?\s?F\.?|ROOF|TERRACE|MUMTY)[\s.-]*(?:FLOOR[\s-]*)?PLAN\b/;
const WORKING_RE = /WORKING\s+DRAWING|(?<![A-Z])W\.\s?D\.?(?![A-Z])|\bSCHEDULE\b/;
const SECTION_RE = /(?<![A-Z])SEC(?:TION|T)?(?![A-Z])/;
const LAYOUT_RE = /\bSITE\s+(?:LAYOUT|PLAN)\b|\bLAYOUT\s+PLAN\b|\bPLOT\s+PLAN\b|\bLOCATION\s+PLAN\b|\bFURNITURE\s+LAYOUT\b/;
/** Tie-break when two titles have the same height: higher wins. */
const KIND_PRIORITY = { working: 4, section: 3, plan: 2, layout: 1 };

/**
 * The role of a layer from its name, via LAYER_ALIASES.
 * @param {string} layerName
 * @returns {'wall'|'door'|'window'|'room'|'section'|'level'|'boundary'|'gate'|'lawn'|'paving'|'road'|'footprint'|'site'|null}
 */
export function layerRole(layerName) {
  if (typeof layerName !== 'string' || layerName === '') return null;
  const name = layerName.trim().toUpperCase();
  const alias = LAYER_ALIASES.find(([, pattern]) => pattern.test(name));
  return alias ? alias[0] : null;
}

/**
 * True for wall layers that hold low walls (parapets, railings): `A-WALL-PRHT`, `WALL-PARAPET`.
 * @param {string} layerName
 * @returns {boolean}
 */
export function isPartialWallLayer(layerName) {
  return typeof layerName === 'string' && PARTIAL_WALL_RE.test(layerName.toUpperCase());
}

/**
 * Upper-cases and folds every dash variant to '-'.
 * @param {string} text
 * @returns {string}
 */
function fold(text) {
  return String(text).toUpperCase().replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim();
}

/** Quote marks that may wrap a section label ("A-A", “A”-“A”, 'B-B'). */
const QUOTE = String.raw`["'“”‘’]?`;
/** After "SEC"/"SECTION": an optional full stop, "ON" or "AT", then a pair with or without a dash. */
const SECTION_PAIR_RE = new RegExp(String.raw`(?<![A-Z])SEC(?:TIONS?|T)?(?![A-Z])\.?\s*(?:(?:ON|AT)\s+)?${QUOTE}([A-Z]|\d{1,2})${QUOTE}\s?-?\s?${QUOTE}\1${QUOTE}(?![A-Z0-9])`);
const PAIR_RE = /(?<![A-Z0-9'".])([A-Z]|\d{1,2})\s?-\s?\1(?![A-Z0-9'".\/])/;
const SINGLE_RE = /(?<![A-Z])SEC(?:TION|T)?\.?\s+(?:ON\s+)?([A-Z]|\d{1,2})(?![A-Z0-9'".])/;

/**
 * Reads a section label from text: "SECTION A-A", "SEC. A-A", "SEC.A-A", "Section a–a",
 * "SECTION AA", 'SECTION "A-A"' and "W.D. B-B" give 'A'/'B'; "SECTION 1-1" gives '1';
 * "SECTION C" gives 'C'. A pair without a dash or in quotes only counts after "SEC"/"SECTION".
 * @param {string} text
 * @returns {string | null} the label, upper case, or null when there is none
 */
export function normaliseSectionLabel(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const t = fold(text);
  const match = SECTION_PAIR_RE.exec(t) ?? PAIR_RE.exec(t) ?? SINGLE_RE.exec(t);
  return match ? match[1] : null;
}

/**
 * The storey a floor-plan title names.
 * @param {string} word the captured storey word, upper case
 * @returns {{ levelIndex: number | null, levelName: string }}
 */
function planLevel(word) {
  const compact = word.replace(/\s+/g, ' ').trim();
  const found = PLAN_LEVELS.find(([pattern]) => pattern.test(compact));
  return found ? { levelIndex: found[1], levelName: found[2] } : { levelIndex: null, levelName: null };
}

/**
 * Title candidates found in one text.
 * @param {{ text: string, height: number }} entity
 * @returns {{ kind: string, height: number, title: string, levelIndex?: number | null, levelName?: string | null, section?: string | null }[]}
 */
function titleCandidates(entity) {
  const t = fold(entity.text);
  const height = Number.isFinite(entity.height) ? entity.height : 0;
  const base = { height, title: entity.text.trim() };
  if (WORKING_RE.test(t)) return [{ ...base, kind: 'working', section: normaliseSectionLabel(t) }];
  const plan = FLOOR_PLAN_RE.exec(t);
  if (plan) return [{ ...base, kind: 'plan', ...planLevel(plan[1]) }];
  if (SECTION_RE.test(t)) return [{ ...base, kind: 'section', section: normaliseSectionLabel(t) }];
  if (LAYOUT_RE.test(t)) return [{ ...base, kind: 'layout' }];
  return [];
}

/**
 * The most common section label among the texts that mention a section.
 * @param {{ text: string, height: number }[]} texts
 * @returns {string | null}
 */
function labelFromOtherTexts(texts) {
  const counts = new Map();
  for (const entity of texts) {
    const t = fold(entity.text);
    if (!SECTION_RE.test(t) && !WORKING_RE.test(t)) continue;
    const label = normaliseSectionLabel(t);
    if (label) counts.set(label, (counts.get(label) ?? 0) + Math.max(1, entity.height || 0));
  }
  let best = null;
  for (const [label, weight] of counts) {
    if (!best || weight > best.weight) best = { label, weight };
  }
  return best ? best.label : null;
}

/**
 * Works out what a drawing is from its title text. Every text is matched against title
 * patterns (floor plans by storey, sections and working drawings by label, site layouts);
 * the largest matching text wins, ties going to working drawing, then section, plan, layout.
 * @param {import('../dxf/reader.js').DxfDoc} doc
 * @returns {{ kind: 'plan'|'section'|'working'|'layout'|'unknown', levelIndex: number | null, levelName: string | null, section: string | null, title: string | null }}
 */
export function classifyDrawing(doc) {
  const texts = (doc?.entities ?? []).filter((e) => e.type === 'TEXT' && typeof e.text === 'string');
  const candidates = texts.flatMap(titleCandidates);
  candidates.sort((x, y) => (y.height - x.height) || (KIND_PRIORITY[y.kind] - KIND_PRIORITY[x.kind]));
  const best = candidates[0];
  const result = { kind: 'unknown', levelIndex: null, levelName: null, section: null, title: null };
  if (!best) return result;
  result.kind = best.kind;
  result.title = best.title;
  if (best.kind === 'plan') {
    result.levelIndex = best.levelIndex;
    result.levelName = best.levelName;
  }
  if (best.kind === 'section' || best.kind === 'working') {
    result.section = best.section ?? labelFromOtherTexts(texts);
  }
  return result;
}
