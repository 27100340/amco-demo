/**
 * Small PNG thumbnails of uploaded drawings for the file cards (browser only): DXF linework is
 * drawn from its path data onto a canvas; PDF pages and images are scaled down.
 */
import { dxfToPaths } from '../editor/drawing.js';
import { layerRole } from './extract/classify.js';
import { createCanvas, canvasToBlob, fitScale } from './canvas.js';

/** Longest side of a thumbnail, in pixels. */
export const THUMBNAIL_SIZE = 320;
/** Blank border around DXF linework, in pixels. */
const PADDING = 8;
/** Thumbnail colours (the site's paper, ink and soft-ink tokens). */
const PAPER = '#ffffff';
const INK = '#1d2023';
const INK_SOFT = '#5f656b';
/** Stroke widths in pixels: walls heavy, doors and windows medium, everything else fine. */
const STROKES = { wall: 1.6, door: 0.9, window: 0.9 };
const FINE_STROKE = 0.7;
/** Share of points trimmed from each end when looking for stray far-away entities. */
const OUTLIER_SHARE = 0.01;
/** Full extents this many times wider (or taller) than the trimmed ones mean strays are present. */
const OUTLIER_RATIO = 4;

/**
 * Points that bound an entity, for the thumbnail frame.
 * @param {object} entity
 * @returns {[number, number][]}
 */
function framePoints(entity) {
  switch (entity.type) {
    case 'LINE':
      return [entity.a, entity.b];
    case 'POLY':
      return entity.points ?? [];
    case 'ARC':
    case 'CIRCLE': {
      const [x, y] = entity.center;
      return [[x - entity.radius, y - entity.radius], [x + entity.radius, y + entity.radius]];
    }
    default:
      return [];
  }
}

/**
 * The value at a share of a sorted list.
 * @param {number[]} sorted
 * @param {number} share 0…1
 * @returns {number}
 */
function quantile(sorted, share) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(share * (sorted.length - 1))))];
}

/**
 * The area worth showing: every line, unless a few stray entities far from the drawing would
 * shrink it to a dot, in which case the middle 98% of the points (with a margin).
 * @param {object[]} entities
 * @returns {{ min: [number, number], max: [number, number] } | null}
 */
function frameOf(entities) {
  const xs = [];
  const ys = [];
  for (const entity of entities) {
    for (const p of framePoints(entity)) {
      if (Number.isFinite(p?.[0]) && Number.isFinite(p?.[1])) {
        xs.push(p[0]);
        ys.push(p[1]);
      }
    }
  }
  if (xs.length === 0) return null;
  xs.sort((p, q) => p - q);
  ys.sort((p, q) => p - q);
  const full = { min: [xs[0], ys[0]], max: [xs[xs.length - 1], ys[ys.length - 1]] };
  const trimmed = {
    min: [quantile(xs, OUTLIER_SHARE), quantile(ys, OUTLIER_SHARE)],
    max: [quantile(xs, 1 - OUTLIER_SHARE), quantile(ys, 1 - OUTLIER_SHARE)]
  };
  const span = (box, k) => box.max[k] - box.min[k];
  const strays = [0, 1].some((k) => span(trimmed, k) > 0 && span(full, k) > OUTLIER_RATIO * span(trimmed, k));
  if (!strays) return full;
  const margin = 0.05 * Math.max(span(trimmed, 0), span(trimmed, 1));
  return { min: [trimmed.min[0] - margin, trimmed.min[1] - margin], max: [trimmed.max[0] + margin, trimmed.max[1] + margin] };
}

/**
 * A PNG thumbnail of a DXF drawing's linework (text is left out), longest side `size` pixels.
 * @param {import('./dxf/reader.js').DxfDoc} doc
 * @param {number} [size]
 * @returns {Promise<Blob | null>} null when the drawing has no linework
 */
export async function dxfThumbnail(doc, size = THUMBNAIL_SIZE) {
  const entities = doc?.entities ?? [];
  const frame = frameOf(entities);
  if (!frame) return null;
  const width = frame.max[0] - frame.min[0];
  const height = frame.max[1] - frame.min[1];
  if (!(Math.max(width, height) > 0)) return null;
  const scale = (size - 2 * PADDING) / Math.max(width, height);
  const canvas = createCanvas(width * scale + 2 * PADDING, height * scale + 2 * PADDING);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, -scale, PADDING - frame.min[0] * scale, PADDING + frame.max[1] * scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const layers = dxfToPaths(entities).layers
    .map((entry) => ({ ...entry, stroke: STROKES[layerRole(entry.layer)] ?? null }))
    .sort((p, q) => (p.stroke ?? 0) - (q.stroke ?? 0));
  for (const { d, stroke } of layers) {
    ctx.strokeStyle = stroke ? INK : INK_SOFT;
    ctx.lineWidth = (stroke ?? FINE_STROKE) / scale;
    ctx.stroke(new Path2D(d));
  }
  return canvasToBlob(canvas);
}

/**
 * A PNG thumbnail of a bitmap (a rasterised PDF page or an image) on white, longest side at
 * most `size` pixels.
 * @param {ImageBitmap | HTMLCanvasElement} bitmap
 * @param {number} [size]
 * @returns {Promise<Blob>}
 */
export async function bitmapThumbnail(bitmap, size = THUMBNAIL_SIZE) {
  const scale = fitScale(bitmap.width, bitmap.height, size);
  const canvas = createCanvas(bitmap.width * scale, bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas);
}
