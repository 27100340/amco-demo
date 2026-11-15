/**
 * Canvas helpers shared by the rasteriser and the thumbnails (browser only).
 */

/**
 * A 2D canvas of the given pixel size (at least 1 × 1).
 * @param {number} width
 * @param {number} height
 * @returns {HTMLCanvasElement}
 */
export function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/**
 * Encodes a canvas as a PNG blob.
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Blob>}
 */
export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The picture of this drawing could not be made.'))), 'image/png');
  });
}

/**
 * The scale that fits `width × height` inside a `max × max` square without enlarging it.
 * @param {number} width
 * @param {number} height
 * @param {number} max
 * @returns {number} at most 1
 */
export function fitScale(width, height, max) {
  const longest = Math.max(width, height);
  return longest > max ? max / longest : 1;
}
