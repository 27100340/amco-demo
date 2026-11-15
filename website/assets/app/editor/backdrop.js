/**
 * Prepares backdrops for the plan editor (browser only): DXF linework becomes path data once per
 * level, and bitmaps of any common kind become an image URL with a pixel size.
 */
import { dxfToPaths } from './drawing.js';

/** Width (m) a bitmap is shown at before its scale is set, so it is visible and roughly sized. */
export const UNSCALED_WIDTH = 20;

/**
 * Loads an image URL to read its pixel size.
 * @param {string} href
 * @returns {Promise<{ width: number, height: number }>}
 */
function imageSize(href) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('The drawing image could not be read.'));
    img.src = href;
  });
}

/**
 * Turns a canvas into an object URL.
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<string>}
 */
function canvasUrl(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('The drawing could not be copied.'))), 'image/png');
  });
}

/**
 * Resolves a bitmap source into an image URL and its pixel size. Accepts an image URL string,
 * an `HTMLImageElement`, an `HTMLCanvasElement`, an `ImageBitmap`, a `Blob`, or an object
 * `{ href|url, width, height }`.
 * @param {unknown} source
 * @returns {Promise<{ href: string, width: number, height: number, revoke: () => void }>}
 */
export async function loadBitmap(source) {
  const none = () => {};
  if (typeof source === 'string') return { href: source, ...(await imageSize(source)), revoke: none };
  if (source && typeof source === 'object' && !(source instanceof Blob) && (source.href || source.url)
    && Number.isFinite(source.width) && Number.isFinite(source.height)) {
    return { href: source.href ?? source.url, width: source.width, height: source.height, revoke: none };
  }
  if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
    if (!source.complete) await source.decode();
    return { href: source.currentSrc || source.src, width: source.naturalWidth, height: source.naturalHeight, revoke: none };
  }
  if (source instanceof Blob) {
    const href = URL.createObjectURL(source);
    return { href, ...(await imageSize(href)), revoke: () => URL.revokeObjectURL(href) };
  }
  let canvas = null;
  if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
    canvas = source;
  } else if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext('2d').drawImage(source, 0, 0);
  }
  if (!canvas) throw new Error('This kind of drawing image is not supported.');
  const href = await canvasUrl(canvas);
  return { href, width: canvas.width, height: canvas.height, revoke: () => URL.revokeObjectURL(href) };
}

/**
 * Prepares every backdrop. DXF paths are computed straight away; bitmaps load in the background
 * and `onReady(levelId)` is called as each one becomes available.
 * @param {Object<string, object> | undefined} backdrops caller's backdrops by level id or 'site'
 * @param {{ onReady: (levelId: string) => void, onError: (levelId: string, error: Error) => void }} handlers
 * @returns {{ get(levelId: string, metresPerPixel: number | null): object | null, revokeAll(): void }}
 */
export function prepareBackdrops(backdrops, { onReady, onError }) {
  const ready = new Map();
  const revokers = [];
  let destroyed = false;
  for (const [levelId, backdrop] of Object.entries(backdrops ?? {})) {
    if (!backdrop) continue;
    if (backdrop.kind === 'dxf') {
      ready.set(levelId, { kind: 'dxf', paths: dxfToPaths(backdrop.entities, backdrop.factor ?? 1, backdrop.offset ?? [0, 0]) });
    } else if (backdrop.kind === 'bitmap') {
      loadBitmap(backdrop.bitmap)
        .then((image) => {
          if (destroyed) {
            image.revoke();
            return;
          }
          revokers.push(image.revoke);
          ready.set(levelId, { kind: 'bitmap', href: image.href, width: image.width, height: image.height, offset: backdrop.offset ?? [0, 0] });
          onReady(levelId);
        })
        .catch((error) => {
          console.error(error);
          if (!destroyed) onError(levelId, error);
        });
    }
  }
  return {
    get(levelId, metresPerPixel) {
      const item = ready.get(levelId);
      if (!item) return null;
      if (item.kind === 'dxf') return item;
      const mpp = metresPerPixel > 0 ? metresPerPixel : UNSCALED_WIDTH / Math.max(1, item.width);
      return { ...item, metresPerPixel: mpp, scaled: metresPerPixel > 0 };
    },
    revokeAll() {
      destroyed = true;
      revokers.forEach((revoke) => revoke());
    }
  };
}
