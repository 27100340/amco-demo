/**
 * The drawings of the open project in this tab: what `readDrawing` made of each file (kept in
 * memory, read again from the store after a reload), thumbnails, plan bitmaps for tracing and
 * large previews. Also builds the 3D model from them and prepares the editor's backdrops.
 */
import { readDrawing, reextract, rasterise, assemble } from '../importers/index.js';
import { dxfToPaths } from '../editor/drawing.js';
import { esc } from '../editor/dom.js';
import { floorName } from './upload-slots.js';

/** Store id of a drawing's thumbnail. */
const THUMB = ':thumb';
/** Longest side (px) of a scanned plan used for tracing. */
const TRACE_SIZE = 4096;
/** Longest side (px) of an enlarged PDF or picture. */
const PREVIEW_SIZE = 2000;
/** CAD linework further than this (m) from the walls is left out of a plan's backdrop (title blocks, sheet borders). */
const PLAN_MARGIN = 4;
/** The same for the site layout, measured from the plot boundary. */
const SITE_MARGIN = 10;

/**
 * The level a plan of floor `index` builds.
 * @param {object} building
 * @param {number} index 0 ground, 1 first…
 * @returns {object|null}
 */
function levelForIndex(building, index) {
  if (!building || !Number.isInteger(index)) return null;
  const byName = building.levels.find((l) => l.name === floorName(index));
  if (byName) return byName;
  const sorted = [...building.levels].sort((a, b) => a.elevation - b.elevation);
  return sorted[index] ?? null;
}

/**
 * An SVG of a DXF drawing's linework and text, for the enlarged view.
 * @param {object} doc DxfDoc
 * @param {string} label accessible name
 * @returns {string|null}
 */
function dxfSvg(doc, label) {
  const { layers, texts, bounds } = dxfToPaths(doc?.entities ?? []);
  if (!bounds) return null;
  const w = bounds.max[0] - bounds.min[0];
  const h = bounds.max[1] - bounds.min[1];
  const m = Math.max(w, h) * 0.03;
  const box = [bounds.min[0] - m, -(bounds.max[1] + m), w + 2 * m, h + 2 * m].map((v) => +v.toFixed(3)).join(' ');
  const paths = layers.map((l) => `<path d="${l.d}"/>`).join('');
  const words = texts.map((t) => `<text transform="translate(${+t.at[0].toFixed(3)} ${+(-t.at[1]).toFixed(3)}) rotate(${-t.rotationDeg})" font-size="${+t.height.toFixed(3)}">${esc(t.text)}</text>`).join('');
  return `<svg class="mp-dxf" viewBox="${box}" role="img" aria-label="${esc(label)}"><g class="mp-dxf-lines" transform="scale(1 -1)">${paths}</g><g class="mp-dxf-text">${words}</g></svg>`;
}

/**
 * Bounding box of points, grown by a margin.
 * @param {[number, number][]} points
 * @param {number} margin
 * @returns {{ min: [number, number], max: [number, number] }|null}
 */
function areaOf(points, margin) {
  if (!points.length) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { min: [Math.min(...xs) - margin, Math.min(...ys) - margin], max: [Math.max(...xs) + margin, Math.max(...ys) + margin] };
}

/**
 * Keeps the CAD entities that lie wholly inside an area (in plan metres), so the editor shows
 * and fits the building rather than the whole drawing sheet. Without an area, keeps everything.
 * @param {object[]} entities Track C entity shapes, in drawing units
 * @param {number} factor metres per drawing unit
 * @param {[number, number]} offset metres added after scaling
 * @param {{ min: [number, number], max: [number, number] }|null} area
 * @returns {object[]}
 */
function entitiesWithin(entities, factor, offset, area) {
  if (!area) return entities;
  const inside = (p) => {
    const x = p[0] * factor + offset[0];
    const y = p[1] * factor + offset[1];
    return x >= area.min[0] && x <= area.max[0] && y >= area.min[1] && y <= area.max[1];
  };
  return entities.filter((e) => {
    const points = [e.a, e.b, e.at, ...(e.points ?? [])].filter(Array.isArray);
    if (Array.isArray(e.center) && Number.isFinite(e.radius)) {
      points.push([e.center[0] - e.radius, e.center[1] - e.radius], [e.center[0] + e.radius, e.center[1] + e.radius]);
    }
    return points.length > 0 && points.every(inside);
  });
}

/**
 * Creates the session for one tab.
 * @param {object} store the ProjectStore
 * @returns {object} session API (see the methods below)
 */
export function createDrawingSession(store) {
  let projectId = null;
  const parsed = new Map();
  const thumbs = new Map();
  const bitmaps = new Map();
  const previews = new Map();

  const setThumb = (id, blob) => {
    if (thumbs.has(id)) URL.revokeObjectURL(thumbs.get(id));
    thumbs.set(id, URL.createObjectURL(blob));
  };

  const dropBitmap = (id) => {
    const pending = bitmaps.get(id);
    bitmaps.delete(id);
    if (pending) pending.then((b) => b?.close()).catch(() => {});
  };

  const forget = (id) => {
    parsed.delete(id);
    previews.delete(id);
    dropBitmap(id);
    if (thumbs.has(id)) URL.revokeObjectURL(thumbs.get(id));
    thumbs.delete(id);
  };

  /**
   * The stored file of a drawing as a File, or null when it isn't in this browser.
   * @returns {Promise<File|null>}
   */
  const fileOf = async (project, d) => {
    const stored = await store.getFile(project.id, d.fileId);
    if (!stored) return null;
    return new File([stored.blob], stored.meta?.name ?? d.name, { type: stored.meta?.type ?? stored.blob.type ?? '' });
  };

  return {
    /** Thumbnail object URLs by file id (for rendering). */
    thumbs,
    /**
     * Switches to a project, letting go of everything held for the previous one.
     * @param {string|null} id
     */
    use(id) {
      if (id === projectId) return;
      for (const key of [...new Set([...parsed.keys(), ...thumbs.keys(), ...bitmaps.keys()])]) forget(key);
      projectId = id;
    },
    /**
     * Reads a new file.
     * @param {File} file
     * @param {string} id file id to use
     * @returns {Promise<object>} the ParsedDrawing
     */
    async read(file, id) {
      const drawing = await readDrawing(file, { id });
      parsed.set(id, drawing);
      if (drawing.thumbnail) setThumb(id, drawing.thumbnail);
      return drawing;
    },
    /**
     * Saves a file and its thumbnail in the store.
     * @param {string} pid project id
     * @param {object} drawing ParsedDrawing
     * @param {File} file
     * @returns {Promise<void>} rejects with the store's error (code 'QUOTA' when out of space)
     */
    async keep(pid, drawing, file) {
      await store.putFile(pid, drawing.id, file, { name: file.name, type: file.type, size: file.size });
      if (drawing.thumbnail) await store.putFile(pid, `${drawing.id}${THUMB}`, drawing.thumbnail, { kind: 'thumbnail' });
    },
    /**
     * Removes a drawing's file and thumbnail from the store and from memory.
     * @param {string} pid project id
     * @param {string} id file id
     * @returns {Promise<void>}
     */
    async discard(pid, id) {
      forget(id);
      await store.removeFile(pid, id);
      await store.removeFile(pid, `${id}${THUMB}`);
    },
    /**
     * Applies the customer's answer (slot, floor, section or drawing units) to a drawing read
     * in this tab.
     * @param {string} id
     * @param {object} changes for `reextract`
     * @returns {object|null} the updated ParsedDrawing, or null when it isn't in memory
     */
    apply(id, changes) {
      const drawing = parsed.get(id);
      if (!drawing) return null;
      const next = reextract(drawing, changes);
      parsed.set(id, next);
      previews.delete(id);
      return next;
    },
    /**
     * The ParsedDrawing of a project drawing: from memory, else read again from the store with
     * the customer's choices applied.
     * @param {object} project
     * @param {object} d project drawing
     * @returns {Promise<object|null>} null when the file isn't in this browser
     */
    async parsedFor(project, d) {
      if (parsed.has(d.fileId)) return parsed.get(d.fileId);
      const file = await fileOf(project, d);
      if (!file) return null;
      let drawing = await readDrawing(file, { id: d.fileId });
      const changes = {};
      if (d.placement === 'manual') Object.assign(changes, { slot: d.slot, levelIndex: d.levelIndex, section: d.section });
      if (project.units?.[d.fileId]) changes.unit = project.units[d.fileId];
      if (Object.keys(changes).length) drawing = reextract(drawing, changes);
      parsed.set(d.fileId, drawing);
      if (drawing.thumbnail && !thumbs.has(d.fileId)) setThumb(d.fileId, drawing.thumbnail);
      return drawing;
    },
    /**
     * Loads the stored thumbnails this tab doesn't have yet.
     * @param {object} project
     * @returns {Promise<boolean>} true when any were added
     */
    async loadThumbs(project) {
      let added = false;
      for (const d of project.drawings) {
        if (thumbs.has(d.fileId) || !d.readable) continue;
        const stored = await store.getFile(project.id, `${d.fileId}${THUMB}`);
        if (stored && projectId === project.id) {
          setThumb(d.fileId, stored.blob);
          added = true;
        }
      }
      return added;
    },
    /**
     * The bitmap of a PDF or picture plan, for tracing over.
     * @param {object} project
     * @param {object} d project drawing
     * @returns {Promise<ImageBitmap|null>}
     */
    bitmap(project, d) {
      if (!bitmaps.has(d.fileId)) {
        bitmaps.set(d.fileId, (async () => {
          const file = await fileOf(project, d);
          return file ? (await rasterise(file, { maxSize: TRACE_SIZE })).bitmap : null;
        })());
      }
      return bitmaps.get(d.fileId);
    },
    /**
     * A large view of a drawing: an SVG (DXF, with its text) or an image URL (PDF, picture).
     * @param {object} project
     * @param {object} d project drawing
     * @returns {Promise<{ svg?: string, url?: string }|null>}
     */
    preview(project, d) {
      if (!previews.has(d.fileId)) {
        previews.set(d.fileId, (async () => {
          if (d.format === 'dxf') {
            const drawing = await this.parsedFor(project, d);
            const svg = drawing?.doc ? dxfSvg(drawing.doc, d.name) : null;
            return svg ? { svg } : null;
          }
          const file = await fileOf(project, d);
          if (!file) return null;
          const raster = await rasterise(file, { maxSize: PREVIEW_SIZE });
          const canvas = document.createElement('canvas');
          canvas.width = raster.width;
          canvas.height = raster.height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(raster.bitmap, 0, 0);
          raster.bitmap.close();
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
          return blob ? { url: URL.createObjectURL(blob) } : null;
        })().catch((error) => {
          console.error(error);
          previews.delete(d.fileId);
          return null;
        }));
      }
      return previews.get(d.fileId);
    }
  };
}

/**
 * Builds the Building Model from the project's drawings. DXF drawings are assembled (walls,
 * openings and rooms from the plans, heights from the sections, sizes from the working
 * drawings, the site from the layout); floors whose plan is a PDF or picture are left empty
 * to be traced, and the model is marked `source: 'trace'`.
 * @param {object} project
 * @param {object[]} parsedList ParsedDrawings of the project's placed, readable drawings
 * @returns {{ building: object, schedule: object, report: object }} `report.mode` is 'review'
 *   (every plan read from DXF) or 'trace'
 */
export function buildModel(project, parsedList) {
  const dxf = parsedList.filter((p) => p && p.readable && p.slot && p.format === 'dxf' && p.extracted);
  const result = assemble(dxf, { name: project.name, kind: project.kind, floors: project.floors });
  const traced = project.drawings.filter((d) => d.slot === 'plan' && d.readable && d.format !== 'dxf' && Number.isInteger(d.levelIndex));
  if (traced.length > 0) {
    result.building.source = 'trace';
    const skip = new Set(traced.map((d) => `No plan for the ${floorName(d.levelIndex).toLowerCase()}, so it has no walls yet.`));
    result.report.warnings = result.report.warnings.filter((w) => !skip.has(w));
    result.building.meta.warnings = result.report.warnings;
  }
  result.report.mode = traced.length > 0 ? 'trace' : 'review';
  return result;
}

/**
 * The editor backdrops: each floor's plan (DXF linework lined up the way the model was
 * assembled, or the scanned plan as a bitmap with its saved scale) and the DXF site layout.
 * @param {object} project with `building` and `report`
 * @param {object} session from `createDrawingSession`
 * @returns {Promise<object>} backdrops keyed by level id or 'site'
 */
export async function backdropsFor(project, session) {
  const alignment = project.report?.alignment ?? {};
  const out = {};
  for (const d of project.drawings) {
    if (!d.readable || !d.slot) continue;
    try {
      if (d.slot === 'plan') {
        const level = levelForIndex(project.building, d.levelIndex);
        if (!level || out[level.id]) continue;
        if (d.format === 'dxf') {
          const drawing = await session.parsedFor(project, d);
          const align = alignment[d.fileId];
          if (drawing?.doc && align) {
            const walls = project.building.walls.filter((w) => w.level === level.id).flatMap((w) => [w.a, w.b]);
            const entities = entitiesWithin(drawing.doc.entities, align.factor, align.offset, areaOf(walls, PLAN_MARGIN));
            out[level.id] = { kind: 'dxf', entities, factor: align.factor, offset: align.offset };
          }
        } else {
          const bitmap = await session.bitmap(project, d);
          if (bitmap) out[level.id] = { kind: 'bitmap', bitmap, metresPerPixel: project.scale?.[level.id] ?? null, offset: [0, 0] };
        }
      } else if (d.slot === 'layout' && d.format === 'dxf' && !out.site && alignment[d.fileId]) {
        const drawing = await session.parsedFor(project, d);
        const align = alignment[d.fileId];
        if (drawing?.doc) {
          const area = areaOf(project.building.site?.boundary ?? [], SITE_MARGIN);
          out.site = { kind: 'dxf', entities: entitiesWithin(drawing.doc.entities, align.factor, align.offset, area), factor: align.factor, offset: align.offset };
        }
      }
    } catch (error) {
      console.error(error);
    }
  }
  return out;
}
