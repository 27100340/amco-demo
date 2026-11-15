/**
 * The drawing importer's browser entry. `readDrawing` turns one uploaded file into a
 * ParsedDrawing: a DXF is parsed, classified and extracted; a PDF or image is checked and
 * thumbnailed; a DWG (or anything else) is turned away with a next step.
 *
 * ParsedDrawing:
 *   { id, name, size, format:'dxf'|'pdf'|'image'|'dwg'|'other',
 *     slot:'plan'|'section'|'working'|'layout'|null, levelIndex:number|null, section:string|null,
 *     sectionMarks:string[], readable:boolean, error?:string, summary:string, warnings:string[],
 *     thumbnail:Blob|null,
 *     DXF only: kind (classifyDrawing result), units:{ unit, factor, source }, doc, extracted,
 *     PDF only: pages }
 * `slot` is null when the customer has to say what the drawing is (every PDF and image, and a
 * DXF whose title wasn't recognised); `reextract` applies their answer.
 */
import {
  detectFormat, sizeError, decodeDxfText, readDxfText, interpretDxf, rasterSummary, UNREADABLE_SUMMARY
} from './interpret.js';
import { rasterise } from './raster.js';
import { dxfThumbnail, bitmapThumbnail, THUMBNAIL_SIZE } from './thumbnail.js';

export { checkPackage } from './requirements.js';
export { assemble } from './assemble.js';
export { rasterise } from './raster.js';
export {
  reextract, DWG_ERROR, UNREADABLE_SUMMARY, ACCEPTED_EXTENSIONS, MAX_FILE_BYTES, MAX_PROJECT_BYTES, UNIT_CHOICES
} from './interpret.js';

const OPEN_ERROR = 'This file couldn\'t be opened. Add it again; if that fails, save a fresh copy and upload that.';
const MULTI_PAGE_WARNING = 'Only the first page of this PDF is used. Upload each sheet as its own file.';
/** Bytes read to recognise a file's type. */
const HEAD_BYTES = 64;

/**
 * A new drawing id.
 * @returns {string}
 */
function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Makes a thumbnail, or null when that fails (a missing thumbnail never fails the upload).
 * @param {() => Promise<Blob | null>} make
 * @returns {Promise<Blob | null>}
 */
async function thumbnailOrNull(make) {
  try {
    return await make();
  } catch (error) {
    console.error(error);
    return null;
  }
}

/**
 * Reads a DXF file.
 * @param {File} file
 * @param {object} base the drawing so far
 * @returns {Promise<object>} ParsedDrawing
 */
async function readDxfFile(file, base) {
  const read = readDxfText(decodeDxfText(new Uint8Array(await file.arrayBuffer())));
  if (read.error) return { ...base, error: read.error };
  const thumbnail = await thumbnailOrNull(() => dxfThumbnail(read.doc));
  return { ...base, readable: true, doc: read.doc, ...interpretDxf(read.doc), thumbnail };
}

/**
 * Reads a PDF or image file: opens it (the first page of a PDF) and makes its thumbnail.
 * @param {File} file
 * @param {object} base the drawing so far
 * @returns {Promise<object>} ParsedDrawing
 */
async function readRasterFile(file, base) {
  let raster;
  try {
    raster = await rasterise(file, { maxSize: THUMBNAIL_SIZE });
  } catch (error) {
    console.error(error.cause ?? error);
    return { ...base, error: error.message };
  }
  try {
    const thumbnail = await thumbnailOrNull(() => bitmapThumbnail(raster.bitmap));
    const drawing = {
      ...base,
      readable: true,
      summary: rasterSummary(base.format, base.name, raster.pages),
      warnings: raster.pages > 1 ? [MULTI_PAGE_WARNING] : [],
      thumbnail
    };
    if (base.format === 'pdf') drawing.pages = raster.pages;
    return drawing;
  } finally {
    raster.bitmap.close();
  }
}

/**
 * Reads one uploaded drawing.
 * - The type comes from the first bytes, then the extension. A DWG gives `readable:false` and
 *   `error` = DWG_ERROR; binary DXF, empty DXF, files over 25 MB and other types give
 *   `readable:false` with a plain-English reason. Unreadable files never throw.
 * - DXF: `parseDxf` → `classifyDrawing` → `detectUnits` → the extractor for its kind; `slot`,
 *   `levelIndex`, `section` and `sectionMarks` come from the drawing; `summary` is one line
 *   such as "Ground floor plan · 23 walls · 9 doors · 8 windows · 6 rooms · sections A-A, B-B";
 *   `warnings` include units the file doesn't state. Thumbnail: the linework on white.
 * - PDF and image: opened with `rasterise` (the first page of a PDF); `slot` is null until the
 *   customer chooses it with `reextract`. Thumbnail: the page or image.
 * Thumbnails are PNG blobs at most 320 px on their longest side (null if one can't be made).
 * @param {File} file
 * @param {{ id?: string }} [options] pass `id` to keep a stored file's id when reading it again
 * @returns {Promise<object>} the ParsedDrawing described at the top of this module
 */
export async function readDrawing(file, { id = newId() } = {}) {
  const base = {
    id,
    name: String(file?.name ?? 'drawing'),
    size: Number(file?.size) || 0,
    format: 'other',
    slot: null,
    levelIndex: null,
    section: null,
    sectionMarks: [],
    readable: false,
    summary: UNREADABLE_SUMMARY,
    warnings: [],
    thumbnail: null
  };
  try {
    const { format, error } = detectFormat(new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer()), base.name);
    base.format = format;
    const reason = error ?? sizeError(base.size);
    if (reason) return { ...base, error: reason };
    return format === 'dxf' ? await readDxfFile(file, base) : await readRasterFile(file, base);
  } catch (error) {
    console.error(error);
    return { ...base, error: OPEN_ERROR };
  }
}
