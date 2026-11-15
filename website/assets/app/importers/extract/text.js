/**
 * Text helpers shared by the extractors: door/window tags, dimension-like strings, room names
 * and lengths written on drawings.
 * Pure module: no DOM.
 */
import { parseLength } from '../../model/units.js';

/** A door, window or ventilator tag: D1, W12, V1, D2A. */
export const TAG_RE = /^[DWV]\d{1,3}[A-Z]?$/;
const LENGTH_HINT_RE = /\d\s*['′’]|\d\s*["″”]|\d\s*(?:mm|cm|m)\b/i;
const SIZE_RE = /\d\s*['′"″]?\s*[xX×]\s*\d/;
const NUMBER_ONLY_RE = /^[+\-±]?\s*\d+(?:[.,]\d+)?\s*(?:%|SFT|SQ\.?\s*FT\.?|M2|M²)?$/i;
const AREA_RE = /\b(?:SFT|SQ\.?\s*FT|SQ\.?\s*M|M2|M²|AREA)\b/i;

/**
 * All TEXT entities of a document.
 * @param {import('../dxf/reader.js').DxfDoc} doc
 * @returns {object[]}
 */
export function textsOf(doc) {
  return (doc?.entities ?? []).filter((e) => e.type === 'TEXT' && typeof e.text === 'string' && e.text.trim() !== '');
}

/**
 * The tag a text holds ('D1'), or null.
 * @param {string} text
 * @returns {string | null}
 */
export function tagOf(text) {
  const t = String(text).trim().toUpperCase().replace(/\s+/g, '');
  return TAG_RE.test(t) ? t : null;
}

/**
 * True for dimension strings, sizes, areas and bare numbers ("12'-6\"", "14' x 12'", "3350", "180 SFT").
 * @param {string} text
 * @returns {boolean}
 */
export function isDimensionLike(text) {
  const t = String(text).trim();
  return LENGTH_HINT_RE.test(t) || SIZE_RE.test(t) || NUMBER_ONLY_RE.test(t) || AREA_RE.test(t);
}

/**
 * True when a text could be a room name: has letters, is not a tag, a dimension or a level marker.
 * @param {string} text
 * @returns {boolean}
 */
export function isNameLike(text) {
  const t = String(text).trim();
  if (t.length === 0 || t.length > 40 || !/[A-Za-z]{2}/.test(t)) return false;
  if (tagOf(t) || isDimensionLike(t)) return false;
  return !/\b(?:F\.?F\.?L|LEVEL|SCALE|NORTH|PLAN|SECTION)\b/i.test(t);
}

/**
 * A room name for display: ALL-CAPS names become Title Case ("DRAWING ROOM" → "Drawing Room"),
 * keeping two-letter words such as "TV" and anything already in mixed case as written.
 * @param {string} name
 * @returns {string}
 */
export function displayName(name) {
  const t = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (t === '' || t !== t.toUpperCase()) return t;
  return t.split(' ').map((word) => {
    if (word.length <= 2 || !/[A-Z]/.test(word)) return word;
    return word.charAt(0) + word.slice(1).toLowerCase();
  }).join(' ');
}

/**
 * Parses a length written on a drawing: feet-inches ("10'-6\"", "+11'-0\""), metric with units
 * ("3.35m", "900 mm"), or a bare number read as metres when it has a decimal point and as
 * millimetres when it is a whole number of 100 or more ("+3.350" → 3.35, "+3350" → 3.35).
 * @param {string} text
 * @returns {number | null} metres
 */
export function parseDrawingLength(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim().replace(/,/g, '');
  if (t === '') return null;
  if (/['′’"″”]/.test(t) || /\b(?:mm|cm|m|ft|in)\b/i.test(t)) return parseLength(t, 'mm');
  const body = t.replace(/^[+\-±]\s*/, '');
  if (!/^\d+(?:\.\d+)?$/.test(body)) return null;
  if (body.includes('.')) return parseLength(t, 'm');
  const n = Number(body);
  return parseLength(t, n >= 100 || n === 0 ? 'mm' : 'cm');
}
