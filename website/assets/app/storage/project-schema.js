/**
 * Customer projects on the "My property" page: the shape every ProjectStore saves and the
 * `.amco.json` export format (model plus paint, never the drawing files themselves).
 * Pure module: no DOM.
 *
 * @typedef {object} ProjectDrawing one uploaded drawing (its file lives in the store's files)
 * @property {string} fileId
 * @property {string} name file name
 * @property {'dxf'|'pdf'|'image'|'dwg'|'other'} format
 * @property {number} size bytes
 * @property {'plan'|'section'|'working'|'layout'|null} slot null until the customer says
 * @property {number|null} levelIndex plans: 0 ground, 1 first…
 * @property {string|null} section sections and working drawings: the label ('A')
 * @property {string[]} sectionMarks DXF plans: section marks drawn on the plan
 * @property {boolean} readable false when the file could not be read
 * @property {string|null} error why it could not be read
 * @property {string} summary what was read from it
 * @property {string[]} warnings
 * @property {string} added ISO time
 * @property {'auto'|'manual'} placement whether the slot came from the drawing or the customer
 *
 * @typedef {object} Project
 * @property {string} id
 * @property {string} name
 * @property {'house'|'office'|'shop'} kind
 * @property {number} floors 1–4
 * @property {string} created ISO time
 * @property {string} updated ISO time
 * @property {'collecting'|'review'|'ready'} status
 * @property {'property'|'drawings'|'review'|'paint'} step where the customer was last
 * @property {ProjectDrawing[]} drawings
 * @property {string[]} declaredSections sections the customer says are marked on PDF/image plans
 * @property {object|null} building Building Model (amco.building/1) once built
 * @property {object|null} schedule door and window schedule, keyed by tag
 * @property {object|null} report what the importer found when the model was built
 * @property {Object<string, { code: string, finish: 'matt'|'silk'|'gloss' }>} paint
 * @property {Object<string, number|null>} scale metres per pixel of each level's scanned plan
 * @property {Object<string, string>} units drawing units chosen in review, by file id
 * @property {string|null} builtFrom fingerprint of the drawings the model was built from
 * @property {boolean} edited true once the customer has changed the model in review
 */

/** Export format id. */
export const PROJECT_FORMAT = 'amco.project/1';
/** Property types the page offers. */
export const PROJECT_KINDS = ['house', 'office', 'shop'];
/** Most floors a project can declare. */
export const MAX_FLOORS = 4;
/** Where a project is: adding drawings, checking the model, painting. */
export const PROJECT_STATUSES = ['collecting', 'review', 'ready'];
/** The page's steps, in order. */
export const PROJECT_STEPS = ['property', 'drawings', 'review', 'paint'];
/** The four required document types. */
export const DRAWING_SLOTS = ['plan', 'section', 'working', 'layout'];
/** File types a drawing entry can record (DWG and others are kept only to explain why they can't be used). */
export const DRAWING_FORMATS = ['dxf', 'pdf', 'image', 'dwg', 'other'];
const FINISHES = ['matt', 'silk', 'gloss'];
const DEFAULT_NAME = 'My property';
const BUILDING_SCHEMA = 'amco.building/1';

/**
 * A fresh id: a random UUID where the runtime has one, else time plus randomness.
 * @returns {string}
 */
function newId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Whole number of floors within 1…MAX_FLOORS.
 * @param {unknown} floors
 * @returns {number}
 */
function clampFloors(floors) {
  const n = Math.round(Number(floors));
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_FLOORS, Math.max(1, n));
}

/**
 * True for a plain object (not null, not an array).
 * @param {unknown} v
 * @returns {boolean}
 */
function isObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/**
 * True for values that never go into an export (file contents and images).
 * @param {unknown} v
 * @returns {boolean}
 */
function isBinary(v) {
  return (typeof Blob !== 'undefined' && v instanceof Blob)
    || (typeof ArrayBuffer !== 'undefined' && (v instanceof ArrayBuffer || ArrayBuffer.isView(v)))
    || (typeof ImageBitmap !== 'undefined' && v instanceof ImageBitmap);
}

/**
 * Deep copy of plain data with binary values left out.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function plainCopy(value) {
  return JSON.parse(JSON.stringify(value, (key, v) => (isBinary(v) ? undefined : v)));
}

/**
 * Step to resume at when a project does not say.
 * @param {{ building?: object|null, status?: string }} p
 * @returns {'drawings'|'review'|'paint'}
 */
function defaultStep(p) {
  if (!p.building) return 'drawings';
  return p.status === 'ready' ? 'paint' : 'review';
}

/**
 * Creates a new, empty project.
 * @param {{ name?: string, kind?: string, floors?: number, id?: string, now?: string }} [details]
 *   `id` and `now` (ISO time) are for tests and imports; both are made up when left out
 * @returns {Project}
 */
export function createProject({ name, kind, floors, id, now } = {}) {
  const time = now ?? new Date().toISOString();
  return {
    id: id ?? newId(),
    name: String(name ?? '').trim() || DEFAULT_NAME,
    kind: PROJECT_KINDS.includes(kind) ? kind : 'house',
    floors: clampFloors(floors ?? 1),
    created: time,
    updated: time,
    status: 'collecting',
    step: 'drawings',
    drawings: [],
    declaredSections: [],
    building: null,
    schedule: null,
    report: null,
    paint: {},
    scale: {},
    units: {},
    builtFrom: null,
    edited: false
  };
}

/**
 * Fills fields an older or hand-made project may lack, without changing the ones it has.
 * @param {object} p
 * @returns {Project}
 */
export function normaliseProject(p) {
  const base = createProject({ id: p.id, name: p.name, kind: p.kind, floors: p.floors, now: p.created });
  const out = { ...base, ...p };
  for (const key of ['drawings', 'declaredSections']) if (!Array.isArray(out[key])) out[key] = [];
  for (const key of ['paint', 'scale', 'units']) if (!isObject(out[key])) out[key] = {};
  for (const key of ['building', 'schedule', 'report', 'builtFrom']) if (out[key] === undefined) out[key] = null;
  if (!PROJECT_STEPS.includes(p.step)) out.step = defaultStep(out);
  if (typeof out.edited !== 'boolean') out.edited = false;
  if (!out.updated) out.updated = out.created;
  return out;
}

/**
 * Problems with one drawing entry.
 * @param {unknown} d
 * @param {number} i
 * @returns {string[]}
 */
function drawingErrors(d, i) {
  if (!isObject(d)) return [`Drawing ${i + 1} is not a drawing entry.`];
  const name = typeof d.name === 'string' && d.name ? d.name : `Drawing ${i + 1}`;
  const errors = [];
  if (typeof d.fileId !== 'string' || !d.fileId) errors.push(`${name} has no file id.`);
  if (typeof d.name !== 'string' || !d.name) errors.push(`Drawing ${i + 1} has no file name.`);
  if (!DRAWING_FORMATS.includes(d.format)) errors.push(`${name} has an unknown file type.`);
  if (d.slot !== null && d.slot !== undefined && !DRAWING_SLOTS.includes(d.slot)) errors.push(`${name} is in an unknown slot.`);
  if (d.levelIndex !== null && d.levelIndex !== undefined && !Number.isInteger(d.levelIndex)) errors.push(`${name} has an unknown floor.`);
  if (d.section !== null && d.section !== undefined && typeof d.section !== 'string') errors.push(`${name} has an unknown section label.`);
  return errors;
}

/**
 * Problems with the paint state.
 * @param {unknown} paint
 * @returns {string[]}
 */
function paintErrors(paint) {
  if (!isObject(paint)) return ['The paint is not a list of walls and shades.'];
  const errors = [];
  for (const [id, entry] of Object.entries(paint)) {
    if (!isObject(entry) || typeof entry.code !== 'string') errors.push(`The paint for ${id} has no shade.`);
    else if (!FINISHES.includes(entry.finish)) errors.push(`The paint for ${id} has an unknown finish.`);
  }
  return errors;
}

/**
 * Checks a project before it is saved or imported.
 * @param {unknown} p
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateProject(p) {
  if (!isObject(p)) return { ok: false, errors: ['This is not a project.'] };
  const errors = [];
  if (typeof p.id !== 'string' || !p.id) errors.push('The project has no id.');
  if (typeof p.name !== 'string' || !p.name.trim()) errors.push('The project has no name.');
  if (!PROJECT_KINDS.includes(p.kind)) errors.push('The property type must be house, office or shop.');
  if (!Number.isInteger(p.floors) || p.floors < 1 || p.floors > MAX_FLOORS) errors.push(`The number of floors must be 1 to ${MAX_FLOORS}.`);
  if (p.status !== undefined && !PROJECT_STATUSES.includes(p.status)) errors.push('The project status is unknown.');
  if (p.step !== undefined && !PROJECT_STEPS.includes(p.step)) errors.push('The project step is unknown.');
  if (p.drawings !== undefined) {
    if (!Array.isArray(p.drawings)) errors.push('The drawings are not a list.');
    else p.drawings.forEach((d, i) => errors.push(...drawingErrors(d, i)));
  }
  if (p.declaredSections !== undefined && (!Array.isArray(p.declaredSections) || p.declaredSections.some((s) => typeof s !== 'string'))) {
    errors.push('The declared sections are not a list of labels.');
  }
  if (p.paint !== undefined) errors.push(...paintErrors(p.paint));
  if (p.building !== null && p.building !== undefined) {
    const b = p.building;
    if (!isObject(b) || b.schema !== BUILDING_SCHEMA || !Array.isArray(b.levels) || !Array.isArray(b.walls) || !Array.isArray(b.rooms)) {
      errors.push('The 3D model in this project is not an Amco building.');
    }
  }
  for (const key of ['scale', 'units']) {
    if (p[key] !== undefined && !isObject(p[key])) errors.push(`The project ${key} is not a list.`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * The `.amco.json` export: a copy of the project (model, paint, drawing details) without any
 * file contents.
 * @param {Project} project
 * @param {{ now?: string }} [options] export time (ISO), for tests
 * @returns {{ format: string, exported: string, project: Project }}
 */
export function toExport(project, { now } = {}) {
  return { format: PROJECT_FORMAT, exported: now ?? new Date().toISOString(), project: plainCopy(project) };
}

/**
 * Reads an export back into a project.
 * @param {object|string} obj parsed `.amco.json` contents, or its text
 * @returns {Project}
 * @throws {Error} with a plain-English message when the file is not an Amco project or is damaged
 */
export function fromExport(obj) {
  let data = obj;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (error) {
      throw new Error('This file is not an Amco project export (.amco.json).', { cause: error });
    }
  }
  if (!isObject(data) || data.format !== PROJECT_FORMAT || !isObject(data.project)) {
    throw new Error('This file is not an Amco project export (.amco.json).');
  }
  const check = validateProject(data.project);
  if (!check.ok) throw new Error(`This project file is damaged: ${check.errors.join(' ')}`);
  return normaliseProject(plainCopy(data.project));
}
