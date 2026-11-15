/**
 * ASCII DXF tokenizer: splits a DXF file into group-code/value pairs.
 * Pure module: no DOM.
 */

/** Message of the error thrown for binary DXF, DWG and anything that is not ASCII DXF. */
export const NOT_ASCII_DXF = 'Not an ASCII DXF';

/** Group codes whose values are free text; their spacing is kept. */
const TEXT_CODES = new Set([1, 3]);
/** How much of the file start is checked for NUL bytes, which only binary files contain. */
const BINARY_PROBE = 512;
const CODE_RE = /^-?\d+$/;

/**
 * Splits ASCII DXF text into `{ code, value }` pairs. Codes are trimmed; values are trimmed
 * except text values (codes 1 and 3), which only lose their line ending. Handles LF, CRLF and
 * CR line endings and a leading byte-order mark. Stops at the `0 EOF` pair.
 * @param {string} text the whole file
 * @returns {{ code: number, value: string }[]}
 * @throws {Error} with message 'Not an ASCII DXF' for binary DXF, DWG or non-DXF content
 */
export function tokenize(text) {
  if (typeof text !== 'string') throw new Error(NOT_ASCII_DXF);
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (src.startsWith('AutoCAD Binary DXF') || /^AC10\d\d/.test(src) || src.slice(0, BINARY_PROBE).includes('\u0000')) {
    throw new Error(NOT_ASCII_DXF);
  }
  const lines = src.split(/\r\n|\r|\n/);
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const codeText = lines[i].trim();
    if (!CODE_RE.test(codeText)) throw new Error(NOT_ASCII_DXF);
    const code = Number(codeText);
    const raw = lines[i + 1];
    const value = TEXT_CODES.has(code) ? raw : raw.trim();
    pairs.push({ code, value });
    if (code === 0 && value === 'EOF') break;
  }
  if (pairs.length === 0 || pairs[0].code !== 0) throw new Error(NOT_ASCII_DXF);
  return pairs;
}
