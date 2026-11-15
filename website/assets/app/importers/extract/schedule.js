/**
 * Door and window schedule extraction without AI: schedule text is grouped into rows by
 * baseline and each row is read for a tag, a type, a "W x H" size, a sill height and a material.
 * Works for free-text rows ("W1 WINDOW 1500X1200 SILL 900 ALUMINIUM") and for tables whose
 * cells are separate texts under a header row (TAG | TYPE | SIZE | SILL | MATERIAL).
 * Pure module: no DOM.
 */
import { classifyDrawing } from './classify.js';
import { textsOf, tagOf, parseDrawingLength } from './text.js';

/** Same-row texts: baselines within this fraction of the text height. */
const ROW_TOLERANCE = 0.6;
/** Cells farther apart than this many text heights start a new row. */
const CELL_GAP = 30;
const FTIN = String.raw`\d+\s*['′](?:\s*-?\s*\d+(?:\s+\d+\/\d+)?\s*["″]?)?|\d+(?:\s+\d+\/\d+)?\s*["″]`;
const METRIC = String.raw`\d+(?:\.\d+)?(?:\s*(?:mm|cm|m)(?![A-Za-z]))?`;
const IMPERIAL_SIZE_RE = new RegExp(`(${FTIN})(?:\\s*W\\b)?\\s*[xX×]\\s*(${FTIN})(?:\\s*H\\b)?`);
const METRIC_SIZE_RE = new RegExp(`(?<![\\d.])(${METRIC})(?:\\s*W\\b)?\\s*[xX×]\\s*(${METRIC})(?![\\d.])(?:\\s*H\\b)?`, 'i');
const SILL_RE = new RegExp(`SILL\\s*(?:HT\\.?|HEIGHT|LEVEL|LVL\\.?|@)?\\s*[:=]?\\s*([+]?\\s*(?:${FTIN}|${METRIC}))`, 'i');
const TYPE_RE = /\b(?:(?:MAIN|INTERNAL|EXTERNAL|ENTRANCE|FRONT|BACK|BATH(?:ROOM)?|TOILET|KITCHEN|SLIDING|FRENCH|DOUBLE|SINGLE|GLAZED|FLUSH|PANEL(?:LED)?|CASEMENT|FIXED|HIGH\s+LEVEL)\s+)*(DOOR|WINDOW|VENTILATOR|VENT|OPENING|ARCH(?:WAY)?)S?\b/i;
const QTY_RE = /\bQTY\.?\s*[:=]?\s*\d+\b|\b\d+\s*NOS?\b\.?/gi;
const HEADER_COLUMNS = [
  ['tag', /^(?:TAG|MARK|REF\.?|NO\.?|CODE|SYMBOL)$/],
  ['type', /^(?:TYPE|DESCRIPTION|ITEM|NAME)/],
  ['size', /^SIZE/],
  ['width', /^WIDTH/],
  ['height', /^HEIGHT/],
  ['sill', /^SILL/],
  ['material', /^(?:MATERIAL|FRAME|SHUTTER|SPEC)/],
  ['qty', /^(?:QTY|NOS|QUANTITY|NUMBER)/],
  ['remarks', /^REMARK/]
];

/**
 * The schedule type a word names.
 * @param {string} word
 * @returns {'door'|'window'|'ventilator'|'opening'}
 */
function typeFromWord(word) {
  const w = word.toUpperCase();
  if (w.startsWith('DOOR')) return 'door';
  if (w.startsWith('WINDOW')) return 'window';
  if (w.startsWith('VENT')) return 'ventilator';
  return 'opening';
}

/**
 * The type a tag letter stands for: D door, W window, V ventilator.
 * @returns {'door'|'window'|'ventilator'|'opening'}
 */
function typeFromTag(tag) {
  return { D: 'door', W: 'window', V: 'ventilator' }[tag[0]] ?? 'opening';
}

/**
 * Parses a length in a schedule cell: feet-inches, metric with units, or a bare number
 * (decimal → metres, whole number ≥ 100 → millimetres).
 * @returns {number | null}
 */
function cellLength(text) {
  return parseDrawingLength(String(text).replace(/\s+/g, ' ').trim());
}

/**
 * Reads "W x H" from text.
 * @returns {{ width: number, height: number, match: string } | null}
 */
function parseSize(text) {
  for (const re of [IMPERIAL_SIZE_RE, METRIC_SIZE_RE]) {
    const m = re.exec(text);
    if (!m) continue;
    const width = cellLength(m[1]);
    const height = cellLength(m[2]);
    if (width && height) return { width, height, match: m[0] };
  }
  return null;
}

/**
 * Groups horizontal texts into rows (baselines within 0.6 × text height), split where cells
 * are far apart, top row first, cells left to right.
 * @returns {{ y: number, h: number, cells: { x: number, text: string }[] }[]}
 */
function groupRows(doc, factor) {
  const texts = textsOf(doc)
    .filter((e) => Math.abs((((e.rotationDeg ?? 0) + 180) % 360) - 180) <= 5)
    .map((e) => ({ x: e.at[0] * factor, y: e.at[1] * factor, h: Math.max(e.height * factor, 1e-6), text: e.text.trim() }))
    .sort((p, q) => q.y - p.y || p.x - q.x);
  const bands = [];
  for (const t of texts) {
    const band = bands.find((b) => Math.abs(b.y - t.y) <= ROW_TOLERANCE * Math.max(b.h, t.h));
    if (band) band.cells.push(t);
    else bands.push({ y: t.y, h: t.h, cells: [t] });
  }
  const rows = [];
  for (const band of bands) {
    band.cells.sort((p, q) => p.x - q.x);
    let row = null;
    for (const cell of band.cells) {
      if (row && cell.x - row.cells[row.cells.length - 1].x <= CELL_GAP * Math.max(row.h, cell.h)) {
        row.cells.push(cell);
      } else {
        row = { y: band.y, h: band.h, cells: [cell] };
        rows.push(row);
      }
    }
  }
  return rows.sort((p, q) => q.y - p.y || p.cells[0].x - q.cells[0].x);
}

/**
 * Column positions when a row is a schedule header, else null.
 * @returns {{ x: number, col: string }[] | null}
 */
function headerColumns(row) {
  const cols = row.cells.map((cell) => {
    const t = cell.text.toUpperCase().trim();
    const found = HEADER_COLUMNS.find(([, re]) => re.test(t));
    return found ? { x: cell.x, col: found[0] } : null;
  });
  const named = cols.filter(Boolean);
  const names = new Set(named.map((c) => c.col));
  const isHeader = (names.has('size') || names.has('width') || names.has('sill')) && (names.has('tag') || names.has('type'));
  return isHeader && !row.cells.some((c) => tagOf(c.text)) ? named : null;
}

/**
 * Cleans a material string; null when nothing is left.
 * @returns {string | null}
 */
function cleanMaterial(text) {
  const t = String(text).replace(/[()[\],;|]/g, ' ').replace(/\s-\s|^-|-$/g, ' ').replace(/\s+/g, ' ').trim();
  return /[A-Za-z]{2}/.test(t) ? t : null;
}

/**
 * Reads a table row by column.
 * @returns {{ tag: string, entry: object } | null}
 */
function readColumns(row, header) {
  const byCol = {};
  for (const cell of row.cells) {
    let best = null;
    for (const h of header) {
      const d = Math.abs(cell.x - h.x);
      if (!best || d < best.d) best = { col: h.col, d };
    }
    (byCol[best.col] ??= []).push(cell.text);
  }
  const join = (col) => (byCol[col] ?? []).join(' ').trim();
  const tag = tagOf(join('tag')) ?? row.cells.map((c) => tagOf(c.text)).find(Boolean);
  if (!tag) return null;
  const size = parseSize(join('size')) ?? (byCol.width && byCol.height
    ? { width: cellLength(join('width')), height: cellLength(join('height')) }
    : parseSize(row.cells.map((c) => c.text).join('  ')));
  if (!size || !size.width || !size.height) return null;
  const typeMatch = TYPE_RE.exec(join('type'));
  const type = typeMatch ? typeFromWord(typeMatch[1]) : typeFromTag(tag);
  const sillText = join('sill');
  const sill = type === 'door' || sillText === '' ? null : cellLength(sillText.replace(/^SILL\s*/i, ''));
  return { tag, entry: { type, width: size.width, height: size.height, sill, material: cleanMaterial(join('material')) } };
}

/**
 * Reads a free-text row.
 * @returns {{ tag: string, entry: object } | null}
 */
function readText(text) {
  const first = text.trim().split(/\s+/)[0];
  const tag = tagOf(first);
  if (!tag) return null;
  const size = parseSize(text);
  if (!size) return null;
  let rest = text.replace(first, ' ').replace(size.match, ' ');
  const typeMatch = TYPE_RE.exec(rest);
  const type = typeMatch ? typeFromWord(typeMatch[1]) : typeFromTag(tag);
  if (typeMatch) rest = rest.replace(typeMatch[0], ' ');
  const sillMatch = SILL_RE.exec(rest);
  const sill = sillMatch && type !== 'door' ? cellLength(sillMatch[1]) : null;
  if (sillMatch) rest = rest.replace(sillMatch[0], ' ');
  for (;;) {
    const again = parseSize(rest);
    if (!again) break;
    rest = rest.replace(again.match, ' ');
  }
  rest = rest.replace(QTY_RE, ' ').replace(/(?<![A-Za-z])\d+(?:\.\d+)?(?![A-Za-z])/g, ' ');
  return { tag, entry: { type, width: size.width, height: size.height, sill, material: cleanMaterial(rest) } };
}

/**
 * The free text of a row from its first tag cell on, so texts that only share the baseline
 * (level markers of a section drawn beside the schedule) are left out.
 * @param {{ text: string }[]} cells left to right
 * @returns {string}
 */
function rowTextFromTag(cells) {
  const start = cells.findIndex((c) => tagOf(c.text.split(/\s+/)[0]));
  return cells.slice(Math.max(0, start)).map((c) => c.text).join('  ');
}

/**
 * True when two entries describe the same size.
 * @returns {boolean}
 */
function sameSize(p, q) {
  const close = (x, y) => (x === null && y === null) || (x !== null && y !== null && Math.abs(x - y) <= 0.005);
  return close(p.width, q.width) && close(p.height, q.height) && close(p.sill, q.sill);
}

/**
 * Extracts the door and window schedule from a working drawing. Rows are grouped by baseline
 * (within 0.6 × text height); a header row (TAG/TYPE/SIZE/SILL/MATERIAL) switches to reading
 * the rows below it by column, using only the cells under the header; header rows themselves
 * are ignored. A free-text row is read from its tag on. Each row needs a D/W/V tag
 * and a "W x H" size in mm, m or ft-in; the sill and material are optional. When a tag appears
 * twice with different sizes, the first wins and a warning is recorded.
 * @param {import('../dxf/reader.js').DxfDoc} doc
 * @param {{ factor?: number }} [options] metres per drawing unit (for row grouping)
 * @returns {{ section: string | null, entries: Object<string, { type: 'door'|'window'|'ventilator'|'opening', width: number, height: number, sill: number | null, material: string | null }>, warnings: string[] }}
 */
export function extractSchedule(doc, { factor = 0.001 } = {}) {
  const warnings = [];
  const entries = {};
  let header = null;
  for (const row of groupRows(doc, factor)) {
    const columns = headerColumns(row);
    if (columns) {
      header = { columns, minX: Math.min(...columns.map((c) => c.x)) - 5 * row.h, maxX: Math.max(...columns.map((c) => c.x)) + CELL_GAP * row.h };
      continue;
    }
    const tableCells = header ? row.cells.filter((c) => c.x >= header.minX && c.x <= header.maxX) : [];
    const read = (tableCells.length > 0 ? readColumns({ ...row, cells: tableCells }, header.columns) : null)
      ?? readText(rowTextFromTag(row.cells));
    if (!read) continue;
    const existing = entries[read.tag];
    if (!existing) {
      entries[read.tag] = read.entry;
    } else if (!sameSize(existing, read.entry)) {
      warnings.push(`The schedule lists ${read.tag} more than once with different sizes; the first one was used.`);
    }
  }
  if (Object.keys(entries).length === 0) warnings.push('No door or window schedule rows were found on this drawing.');
  return { section: classifyDrawing(doc).section, entries, warnings };
}
