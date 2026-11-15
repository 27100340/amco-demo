/**
 * Length parsing and formatting for drawings and the editor.
 * Pure module: no DOM, no three.js. All Building Model lengths are metres.
 */

/** Metres per unit. */
export const UNIT_FACTORS = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };

const NUMBER = '(\\d+(?:\\.\\d*)?|\\.\\d+)';
const METRIC_RE = new RegExp(`^${NUMBER}\\s*(mm|cm|m)$`, 'i');
const PLAIN_RE = new RegExp(`^${NUMBER}$`);
const FEET_RE = new RegExp(`^${NUMBER}\\s*'\\s*(.*)$`);
const INCH_RE = /^(?:(\d+(?:\.\d*)?|\.\d+)(?:\s+(\d+)\/(\d+))?|(\d+)\/(\d+))\s*("?)$/;
const FRACTIONS = { '½': ' 1/2', '¼': ' 1/4', '¾': ' 3/4', '⅛': ' 1/8', '⅜': ' 3/8', '⅝': ' 5/8', '⅞': ' 7/8' };

/**
 * Normalises typographic marks so the parsers only see ASCII feet/inch marks.
 * @param {string} text
 * @returns {string}
 */
function normaliseText(text) {
  return text
    .trim()
    .replace(/[′’‘`´]/g, "'")
    .replace(/[″”“]|''/g, '"')
    .replace(/[−–—]/g, '-')
    .replace(/[½¼¾⅛⅜⅝⅞]/g, (ch) => FRACTIONS[ch])
    .replace(/(^|[^a-z])(?:feet|foot|ft)(?![a-z])\.?/gi, "$1'")
    .replace(/(^|[^a-z])(?:inches|inch|in)(?![a-z])\.?/gi, '$1"')
    .trim();
}

/**
 * Parses the inch part of an imperial length ("6", "6\"", "4 1/2\"", "1/2\"").
 * @param {string} text
 * @param {boolean} needsMark when true the inch mark (") is required
 * @returns {number | null} inches
 */
function parseInches(text, needsMark) {
  const m = INCH_RE.exec(text);
  if (!m || (needsMark && m[6] !== '"')) return null;
  if (m[4] !== undefined) {
    const den = Number(m[5]);
    return den === 0 ? null : Number(m[4]) / den;
  }
  let inches = Number(m[1]);
  if (m[2] !== undefined) {
    const den = Number(m[3]);
    if (den === 0) return null;
    inches += Number(m[2]) / den;
  }
  return inches;
}

/**
 * Parses an imperial length without sign: "10'", "10'-6\"", "10' 6\"", "10'6", "9\"", "3'-0 1/2\"".
 * @param {string} text
 * @returns {number | null} metres
 */
function parseImperial(text) {
  const feet = FEET_RE.exec(text);
  if (feet) {
    const rest = feet[2].replace(/^-?\s*/, '');
    if (rest === '') return Number(feet[1]) * UNIT_FACTORS.ft;
    const inches = parseInches(rest, false);
    return inches === null ? null : Number(feet[1]) * UNIT_FACTORS.ft + inches * UNIT_FACTORS.in;
  }
  const inches = parseInches(text, true);
  return inches === null ? null : inches * UNIT_FACTORS.in;
}

/**
 * Parses a length written on a drawing or typed by a customer.
 * Accepts signed metres ("+3.350", "-0.45", "±0.000"), unit suffixes ("3.35m", "335cm",
 * "3350mm"), feet and inches ("10'", "10'-6\"", "10' 6\"", "10'6", "9\"", "4½\"", "4 1/2\"",
 * "3'-0 1/2\"", ".5\"", typographic ′ ″ marks, "10ft 6in", "10 feet 6 inches") and bare numbers, which are read in
 * `defaultUnit`. Numbers are also accepted and read in `defaultUnit`.
 * @param {string | number} text
 * @param {'mm'|'cm'|'m'|'in'|'ft'} [defaultUnit='m'] unit for bare numbers
 * @returns {number | null} metres, or null when the text is not a length
 */
export function parseLength(text, defaultUnit = 'm') {
  const factor = UNIT_FACTORS[defaultUnit];
  if (factor === undefined) return null;
  if (typeof text === 'number') return Number.isFinite(text) ? text * factor + 0 : null;
  if (typeof text !== 'string') return null;
  let body = normaliseText(text);
  let sign = 1;
  const signMatch = /^([+\-±])\s*/.exec(body);
  if (signMatch) {
    sign = signMatch[1] === '-' ? -1 : 1;
    body = body.slice(signMatch[0].length);
  }
  if (body === '') return null;
  let metres = null;
  const metric = METRIC_RE.exec(body);
  if (metric) {
    metres = Number(metric[1]) * UNIT_FACTORS[metric[2].toLowerCase()];
  } else if (PLAIN_RE.test(body)) {
    metres = Number(body) * factor;
  } else {
    metres = parseImperial(body);
  }
  if (metres === null || !Number.isFinite(metres)) return null;
  return sign * metres + 0;
}

/**
 * Formats a length for display.
 * Imperial rounds to the nearest half inch: 3.2004 -> "10′ 6″", 0.1143 -> "4½″", 3.048 -> "10′ 0″".
 * Metric gives metres to two decimals: 3.2 -> "3.20 m". Negative values get a "−" sign.
 * @param {number} metres
 * @param {'imperial'|'metric'} [system='imperial']
 * @returns {string} the formatted length, or '' when `metres` is not a finite number
 */
export function formatLength(metres, system = 'imperial') {
  if (typeof metres !== 'number' || !Number.isFinite(metres)) return '';
  if (system === 'metric') {
    const fixed = Math.abs(metres).toFixed(2);
    const negative = metres < 0 && Number(fixed) !== 0;
    return `${negative ? '−' : ''}${fixed} m`;
  }
  const halfInches = Math.round(Math.abs(metres) / UNIT_FACTORS.in * 2);
  const sign = metres < 0 && halfInches > 0 ? '−' : '';
  const feet = Math.floor(halfInches / 24);
  const remainder = halfInches - feet * 24;
  const wholeInches = Math.floor(remainder / 2);
  const half = remainder % 2 === 1 ? '½' : '';
  if (feet > 0) return `${sign}${feet}′ ${wholeInches}${half}″`;
  return wholeInches === 0 && half ? `${sign}${half}″` : `${sign}${wholeInches}${half}″`;
}
