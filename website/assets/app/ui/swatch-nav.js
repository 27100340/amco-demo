/**
 * Keyboard movement over a grid of swatches that has one tab stop (roving tabindex).
 * Pure, so it can be tested without a DOM.
 */

/**
 * Where the focus goes after an arrow, Home or End key.
 * @param {string} key a KeyboardEvent key
 * @param {number} index the focused swatch
 * @param {number} count how many swatches there are
 * @param {number} columns swatches per row
 * @returns {number | null} the new index, or null when the key does not move focus
 */
export function nextSwatchIndex(key, index, count, columns) {
  if (count <= 0) return null;
  const last = count - 1;
  const step = {
    ArrowRight: 1, ArrowLeft: -1, ArrowDown: Math.max(1, columns), ArrowUp: -Math.max(1, columns)
  }[key];
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  if (step === undefined) return null;
  return Math.min(last, Math.max(0, index + step));
}

/**
 * Which swatch holds the tab stop: the selected one if it is listed, otherwise the first.
 * @param {string[]} codes the swatch codes in display order
 * @param {string | null} selected the chosen code
 * @returns {number} an index, or -1 when there are no swatches
 */
export function tabStopIndex(codes, selected) {
  if (!codes.length) return -1;
  const at = selected ? codes.indexOf(selected) : -1;
  return at >= 0 ? at : 0;
}
