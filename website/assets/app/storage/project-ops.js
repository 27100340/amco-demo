/**
 * Changes to a project's drawing package, and the views of it the page needs: which place each
 * drawing fills (so a corrected file replaces the old one), the list the requirements gate
 * checks, and a fingerprint that tells when the model is out of date. Every function returns a
 * new project and leaves the one passed in untouched.
 * Pure module: no DOM.
 */
import { sectionLabel } from '../importers/requirements.js';

/** Slots that are labelled by section. */
const LABELLED = ['section', 'working'];

/**
 * The place a drawing fills: 'plan:0', 'section:A', 'working:A', or 'layout:<file name>' (any
 * number of layouts can be added). Null while the drawing has no slot, floor or section yet.
 * @param {{ slot: string|null, levelIndex?: number|null, section?: string|null, name: string }} d
 * @returns {string|null}
 */
export function drawingKey(d) {
  if (!d || !d.slot) return null;
  if (d.slot === 'plan') return Number.isInteger(d.levelIndex) ? `plan:${d.levelIndex}` : null;
  if (LABELLED.includes(d.slot)) {
    const label = sectionLabel(d.section);
    return label ? `${d.slot}:${label}` : null;
  }
  if (d.slot === 'layout') return `layout:${String(d.name).trim().toLowerCase()}`;
  return null;
}

/**
 * The project's record of a drawing read by `readDrawing` (the parsed drawing, DXF document and
 * thumbnail stay out of it; the file itself is kept in the store).
 * @param {object} parsed a ParsedDrawing
 * @param {{ now?: string }} [options] time added (ISO), for tests
 * @returns {import('./project-schema.js').ProjectDrawing}
 */
export function drawingFromParsed(parsed, { now } = {}) {
  return {
    fileId: parsed.id,
    name: parsed.name,
    format: parsed.format,
    size: Number(parsed.size) || 0,
    slot: parsed.slot ?? null,
    levelIndex: parsed.levelIndex ?? null,
    section: parsed.section ?? null,
    sectionMarks: [...(parsed.sectionMarks ?? [])],
    readable: parsed.readable !== false,
    error: parsed.error ?? null,
    summary: parsed.summary ?? '',
    warnings: [...(parsed.warnings ?? [])],
    added: now ?? new Date().toISOString(),
    placement: parsed.format === 'dxf' && parsed.slot ? 'auto' : 'manual',
    unit: parsed.units?.unit ?? null,
    unitSource: parsed.units?.source ?? null
  };
}

/**
 * True when `old` should give way to `next`: it fills the same place, or it could not be read
 * and has the same file name.
 * @returns {boolean}
 */
function isReplacedBy(old, next) {
  if (old.fileId === next.fileId) return false;
  const key = drawingKey(next);
  if (key && drawingKey(old) === key) return true;
  return old.readable === false && String(old.name).toLowerCase() === String(next.name).toLowerCase();
}

/**
 * Puts `entry` in the project, removing every drawing it replaces.
 * @returns {{ project: object, replaced: object[] }}
 */
function place(project, entry, index) {
  const replaced = project.drawings.filter((d) => isReplacedBy(d, entry));
  const kept = project.drawings.filter((d) => d.fileId !== entry.fileId && !replaced.includes(d));
  const at = Math.min(index ?? kept.length, kept.length);
  const drawings = [...kept.slice(0, at), entry, ...kept.slice(at)];
  return { project: { ...project, drawings }, replaced };
}

/**
 * Adds a drawing. A drawing for the same floor (plans) or section label (sections, working
 * drawings), a layout with the same file name, or an unreadable file with the same name is
 * replaced, so a corrected upload never counts twice.
 * @param {object} project
 * @param {import('./project-schema.js').ProjectDrawing} entry
 * @returns {{ project: object, replaced: object[] }} `replaced` lists the drawings taken out
 */
export function addDrawing(project, entry) {
  return place(project, { ...entry }, null);
}

/**
 * Changes a drawing's details (the customer's answer to "which drawing is this?", or a new read
 * of the same file) and applies the same replacement rule as `addDrawing`.
 * @param {object} project
 * @param {string} fileId
 * @param {object} changes fields to change, such as `{ slot, levelIndex, section }`
 * @returns {{ project: object, replaced: object[] }}
 */
export function updateDrawing(project, fileId, changes) {
  const index = project.drawings.findIndex((d) => d.fileId === fileId);
  if (index < 0) return { project, replaced: [] };
  const entry = { ...project.drawings[index], ...changes };
  const before = project.drawings.slice(0, index).filter((d) => !isReplacedBy(d, entry)).length;
  return place(project, entry, before);
}

/**
 * Removes a drawing.
 * @param {object} project
 * @param {string} fileId
 * @returns {{ project: object, removed: object[] }}
 */
export function removeDrawing(project, fileId) {
  const removed = project.drawings.filter((d) => d.fileId === fileId);
  return { project: { ...project, drawings: project.drawings.filter((d) => d.fileId !== fileId) }, removed };
}

/**
 * The drawings in the shape `checkPackage` reads; drawings without a slot are left out.
 * @param {object} project
 * @returns {{ id: string, name: string, format: string, slot: string, levelIndex: number|null, section: string|null, sectionMarks: string[], readable: boolean }[]}
 */
export function packageDrawings(project) {
  return project.drawings.filter((d) => d.slot).map((d) => ({
    id: d.fileId,
    name: d.name,
    format: d.format,
    slot: d.slot,
    levelIndex: d.levelIndex ?? null,
    section: d.section ?? null,
    sectionMarks: [...(d.sectionMarks ?? [])],
    readable: d.readable !== false && (d.format === 'dxf' || d.format === 'pdf' || d.format === 'image')
  }));
}

/**
 * True when a plan is a PDF or picture, so the customer has to say which sections are marked.
 * @param {object} project
 * @returns {boolean}
 */
export function needsSectionDeclaration(project) {
  return project.drawings.some((d) => d.slot === 'plan' && d.readable !== false && d.format !== 'dxf');
}

/**
 * A fingerprint of everything the 3D model is built from: floors, the drawings in their places,
 * the declared sections and the chosen drawing units. Order and summaries don't matter.
 * @param {object} project
 * @returns {string}
 */
export function packageFingerprint(project) {
  const drawings = project.drawings
    .map((d) => [d.fileId, d.slot, d.levelIndex ?? null, sectionLabel(d.section) ?? null, d.readable !== false])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const declared = [...(project.declaredSections ?? [])].map(sectionLabel).filter(Boolean).sort();
  const units = Object.entries(project.units ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify({ floors: project.floors, kind: project.kind, drawings, declared, units });
}

/**
 * Total size of the project's drawings in bytes.
 * @param {object} project
 * @returns {number}
 */
export function projectBytes(project) {
  return project.drawings.reduce((sum, d) => sum + (Number(d.size) || 0), 0);
}
