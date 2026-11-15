/**
 * Turns an uploaded PDF or image into a bitmap, for tracing in the plan editor and for
 * thumbnails (browser only). pdf.js is vendored and only loaded when a PDF arrives.
 */
import { createCanvas, fitScale } from './canvas.js';

/** The vendored pdf.js folder; the worker, standard fonts, ICC profile and image decoders live in it. */
const PDF_ASSETS = new URL('../../vendor/pdfjs/', import.meta.url);
const PDF_WORKER_URL = new URL('pdf.worker.min.mjs', PDF_ASSETS).href;
/**
 * Where pdf.js finds its extras (getDocument options; folder URLs need a trailing slash): the 14
 * standard fonts for PDFs that don't embed them, the WebAssembly image decoders (JPEG 2000 for
 * scanned sheets, JBIG2, colour profiles) with their JavaScript fallbacks, and the CMYK profile.
 */
export const PDF_ASSET_OPTIONS = {
  standardFontDataUrl: new URL('standard_fonts/', PDF_ASSETS).href,
  wasmUrl: new URL('wasm/', PDF_ASSETS).href,
  iccUrl: new URL('iccs/', PDF_ASSETS).href
};
const PDF_FAILED = 'This PDF couldn\'t be opened. Export the sheet as a PNG or JPG from your PDF viewer and upload that instead.';
const PDF_PASSWORD = 'This PDF is password-protected. Remove the password, or export the sheet as a PNG or JPG, and upload that instead.';
const IMAGE_FAILED = 'This image couldn\'t be read. Save it as a PNG, JPG or WebP and upload that instead.';

/**
 * True when the file is a PDF, judged by its type, its name or its first bytes.
 * @param {Blob & { name?: string }} file
 * @returns {Promise<boolean>}
 */
async function isPdf(file) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '')) return true;
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...head) === '%PDF-';
}

/**
 * Loads the vendored pdf.js and points it at the vendored worker.
 * @returns {Promise<object>} the pdf.js module
 */
async function loadPdfjs() {
  const pdfjs = await import('../../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
  return pdfjs;
}

/**
 * Renders the first page of a PDF so its longest side is `maxSize` pixels.
 * @param {Blob} file
 * @param {number} maxSize
 * @returns {Promise<{ bitmap: ImageBitmap, width: number, height: number, pages: number }>}
 */
async function rasterisePdf(file, maxSize) {
  let task = null;
  try {
    const pdfjs = await loadPdfjs();
    task = pdfjs.getDocument({ ...PDF_ASSET_OPTIONS, data: new Uint8Array(await file.arrayBuffer()) });
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: maxSize / Math.max(base.width, base.height) });
    const canvas = createCanvas(viewport.width, viewport.height);
    await page.render({ canvas, viewport }).promise;
    const bitmap = await createImageBitmap(canvas);
    return { bitmap, width: bitmap.width, height: bitmap.height, pages: pdf.numPages };
  } catch (error) {
    throw new Error(error?.name === 'PasswordException' ? PDF_PASSWORD : PDF_FAILED, { cause: error });
  } finally {
    if (task) await task.destroy();
  }
}

/**
 * Decodes an image, shrinking it so its longest side is at most `maxSize` pixels.
 * @param {Blob} file
 * @param {number} maxSize
 * @returns {Promise<{ bitmap: ImageBitmap, width: number, height: number, pages: number }>}
 */
async function rasteriseImage(file, maxSize) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (error) {
    throw new Error(IMAGE_FAILED, { cause: error });
  }
  const scale = fitScale(bitmap.width, bitmap.height, maxSize);
  if (scale < 1) {
    const full = bitmap;
    bitmap = await createImageBitmap(full, {
      resizeWidth: Math.max(1, Math.round(full.width * scale)),
      resizeHeight: Math.max(1, Math.round(full.height * scale)),
      resizeQuality: 'high'
    });
    full.close();
  }
  return { bitmap, width: bitmap.width, height: bitmap.height, pages: 1 };
}

/**
 * Turns a PDF (its first page) or an image file into a bitmap.
 * - PDF: rendered on a white background so the page's longest side is `maxSize` pixels
 *   (vector sheets are enlarged as well as shrunk); `pages` is the page count.
 * - Image (PNG, JPG, WebP, anything the browser decodes): shrunk to fit `maxSize`, never
 *   enlarged; `pages` is 1.
 * The caller owns the bitmap and should `close()` it when done.
 * @param {Blob & { name?: string }} file
 * @param {{ maxSize?: number }} [options]
 * @returns {Promise<{ bitmap: ImageBitmap, width: number, height: number, pages: number }>}
 * @throws {Error} with a plain-English message (and the original error as `cause`) when the
 *   file can't be opened, e.g. a damaged or password-protected PDF or an unsupported image
 */
export async function rasterise(file, { maxSize = 4096 } = {}) {
  const size = Number.isFinite(maxSize) && maxSize >= 1 ? maxSize : 4096;
  return (await isPdf(file)) ? rasterisePdf(file, size) : rasteriseImage(file, size);
}
