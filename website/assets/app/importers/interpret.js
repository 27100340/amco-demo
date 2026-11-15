/**
 * Everything about reading an uploaded drawing that needs no browser: the file type from its
 * first bytes, DXF text decoding, and the DXF pipeline (classify → units → the matching
 * extractor) with the one-line summary and the warnings shown on the file card.
 * Pure module: no DOM.
 */
import { parseDxf } from './dxf/reader.js';
import { NOT_ASCII_DXF } from './dxf/tokenizer.js';
import { classifyDrawing } from './extract/classify.js';
import { detectUnits } from './extract/units.js';
import { extractPlan } from './extract/plan.js';
import { extractSection, STOREY_NAMES } from './extract/section.js';
import { extractSchedule } from './extract/schedule.js';
import { extractLayout } from './extract/layout.js';
import { sectionLabel } from './requirements.js';
import { UNIT_FACTORS } from '../model/units.js';

/** Shown for a DWG file (spec §7.2). */
export const DWG_ERROR = 'DWG files can\'t be read in the browser. In AutoCAD use File → Save As → DXF and upload that.';
/** The file card summary of any file that could not be read; `error` gives the reason. */
export const UNREADABLE_SUMMARY = 'Couldn\'t read this file';
const BINARY_DXF_ERROR = 'This DXF is saved in binary form, which can\'t be read in the browser. In AutoCAD use File → Save As → DXF, choose ASCII under Tools → Options, and upload that.';
const NOT_DXF_ERROR = 'This file isn\'t a DXF drawing. Save it again from your CAD program as DXF and upload that.';
const EMPTY_DXF_ERROR = 'This DXF has nothing drawn in model space. Check the drawing is in model space (not only on a layout sheet), save it again as DXF and upload that.';
const READ_DXF_ERROR = 'This DXF couldn\'t be read. Save it again from your CAD program as DXF (AutoCAD R12 or 2000 and later) and upload that.';
const UNSUPPORTED_ERROR = 'This kind of file can\'t be used. Upload drawings as DXF, PDF, PNG, JPG or WebP.';

/** File types the upload page accepts (spec §7.2). */
export const ACCEPTED_EXTENSIONS = ['.dxf', '.pdf', '.png', '.jpg', '.jpeg', '.webp'];
/** Largest file accepted: 25 MB. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Largest project (all files together): 150 MB. Checked by the upload page. */
export const MAX_PROJECT_BYTES = 150 * 1024 * 1024;
/** Drawing units the customer can choose in review, in menu order. */
export const UNIT_CHOICES = [
  { unit: 'mm', label: 'Millimetres' },
  { unit: 'cm', label: 'Centimetres' },
  { unit: 'm', label: 'Metres' },
  { unit: 'in', label: 'Inches' },
  { unit: 'ft', label: 'Feet' }
];

/** The extractor for each slot. */
const EXTRACTORS = { plan: extractPlan, section: extractSection, working: extractSchedule, layout: extractLayout };
const SLOTS = Object.keys(EXTRACTORS);
const LABELLED_SLOTS = ['section', 'working'];
const MB = 1024 * 1024;

/**
 * The lower-case extension of a file name, with its dot ('.dxf'), or ''.
 * @param {string} name
 * @returns {string}
 */
function extensionOf(name) {
  const match = /\.[^./\\]+$/.exec(String(name ?? ''));
  return match ? match[0].toLowerCase() : '';
}

/**
 * Works out a file's type from its first bytes, then its extension. DWG and binary DXF files
 * are recognised by their headers whatever they are called.
 * @param {Uint8Array} head the first bytes of the file (32 or more)
 * @param {string} name the file name
 * @returns {{ format: 'dxf'|'pdf'|'image'|'dwg'|'other', error?: string }} `error` when the file
 *   can't be used
 */
export function detectFormat(head, name) {
  const ascii = String.fromCharCode(...(head ?? new Uint8Array(0)).subarray(0, 32));
  const ext = extensionOf(name);
  if (/^AC10\d\d/.test(ascii) || (ext === '.dwg' && !ascii.startsWith('%PDF-'))) return { format: 'dwg', error: DWG_ERROR };
  if (ascii.startsWith('AutoCAD Binary DXF')) return { format: 'dxf', error: BINARY_DXF_ERROR };
  if (ascii.startsWith('%PDF-')) return { format: 'pdf' };
  const png = head?.[0] === 0x89 && ascii.slice(1, 4) === 'PNG';
  const jpeg = head?.[0] === 0xff && head?.[1] === 0xd8 && head?.[2] === 0xff;
  const webp = ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP';
  if (png || jpeg || webp) return { format: 'image' };
  if (ext === '.dxf') return { format: 'dxf' };
  if (ext === '.pdf') return { format: 'pdf' };
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return { format: 'image' };
  return { format: 'other', error: UNSUPPORTED_ERROR };
}

/**
 * The message for a file over the size limit, or null when it is within it.
 * @param {number} bytes
 * @returns {string | null}
 */
export function sizeError(bytes) {
  if (!(bytes > MAX_FILE_BYTES)) return null;
  return `This file is ${(bytes / MB).toFixed(1)} MB; each drawing must be 25 MB or less. Save it with fewer layers or at a lower resolution and upload it again.`;
}

/**
 * Decodes DXF bytes: UTF-8 (AutoCAD 2007 and later), else Windows-1252 (older files).
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function decodeDxfText(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/**
 * Parses DXF text, turning failures into a plain-English reason.
 * @param {string} text
 * @returns {{ doc: import('./dxf/reader.js').DxfDoc } | { error: string }}
 */
export function readDxfText(text) {
  let doc;
  try {
    doc = parseDxf(text);
  } catch (error) {
    if (error?.message === NOT_ASCII_DXF) return { error: NOT_DXF_ERROR };
    console.error(error);
    return { error: READ_DXF_ERROR };
  }
  if (!doc.entities.some((e) => e.type !== 'INSERT')) return { error: EMPTY_DXF_ERROR };
  return { doc };
}

/**
 * "1 wall", "3 walls".
 * @param {number} n
 * @param {string} word singular
 * @returns {string}
 */
function count(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * "A-A" from 'A'.
 * @param {string} label
 * @returns {string}
 */
function pairOf(label) {
  return `${label}-${label}`;
}

/**
 * A level index from the customer's choice: an integer, or null.
 * @param {unknown} value
 * @returns {number | null}
 */
function levelOf(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

/**
 * The plan's title for its summary: "Ground floor plan".
 * @param {number | null} levelIndex
 * @param {string | null} levelName from the drawing title
 * @returns {string}
 */
function planTitle(levelIndex, levelName) {
  const name = (levelIndex === null ? null : STOREY_NAMES[levelIndex]) ?? levelName;
  return name ? `${name} plan` : 'Floor plan';
}

/**
 * The one-line summary of a DXF drawing for its file card, e.g.
 * "Ground floor plan · 23 walls · 9 doors · 8 windows · 6 rooms · sections A-A, B-B".
 * @param {{ slot: string | null, levelIndex: number | null, section: string | null, kind: object, extracted: object | null }} reading
 * @returns {string}
 */
function dxfSummary({ slot, levelIndex, section, kind, extracted }) {
  const label = section ? ` ${pairOf(section)}` : '';
  switch (slot) {
    case 'plan': {
      const title = planTitle(levelIndex, kind.levelName);
      if (extracted.walls.length === 0) return `${title} · no walls found`;
      const of = (type) => extracted.openings.filter((o) => o.type === type).length;
      const parts = [title, count(extracted.walls.length, 'wall'), count(of('door'), 'door'), count(of('window'), 'window')];
      if (of('opening') > 0) parts.push(count(of('opening'), 'other opening'));
      parts.push(count(extracted.rooms.length, 'room'));
      const marks = extracted.sectionMarks;
      if (marks.length > 0) parts.push(`${marks.length === 1 ? 'section' : 'sections'} ${marks.map(pairOf).join(', ')}`);
      return parts.join(' · ');
    }
    case 'section': {
      const levels = extracted.levels.length;
      return `Section${label} · ${levels === 0 ? 'no level markers found' : count(levels, 'level')}`;
    }
    case 'working': {
      const entries = Object.keys(extracted.entries).length;
      return `Working drawing${label} · ${entries === 0 ? 'no door or window schedule found' : `${entries} ${entries === 1 ? 'door or window' : 'doors and windows'} in the schedule`}`;
    }
    case 'layout': {
      const parts = ['Site layout', extracted.boundary ? 'plot boundary' : 'no plot boundary found'];
      if (extracted.boundaryWall) parts.push(`boundary wall with ${count(extracted.boundaryWall.gates.length, 'gate')}`);
      if (extracted.footprint) parts.push('building footprint');
      return parts.join(' · ');
    }
    default:
      return 'DXF drawing · no title found, so choose what it shows';
  }
}

/**
 * A unit's name for messages: 'mm' → "millimetres".
 * @param {string} unit
 * @returns {string}
 */
function unitName(unit) {
  return (UNIT_CHOICES.find((c) => c.unit === unit)?.label ?? unit).toLowerCase();
}

/**
 * The warning for units that the file does not state.
 * @param {{ unit: string, source: string }} units
 * @returns {string[]}
 */
function unitWarnings(units) {
  if (units.source === 'heuristic') return [`The file doesn't say which units it is drawn in; the wall thicknesses suggest ${unitName(units.unit)}. Check the drawing units in the review step.`];
  if (units.source === 'default') return ['The file doesn\'t say which units it is drawn in, so millimetres were assumed. Check the drawing units in the review step.'];
  return [];
}

/**
 * Extracts a plan, checking a unit stated in the file ($INSUNITS) against the wall thicknesses:
 * when the stated unit finds no walls but the thicknesses point to a unit that does, that unit
 * is used and the customer is told; when neither finds walls, the customer is pointed at the
 * Drawing units choice. An empty wall layer, or one with too many lines, is not checked.
 * @param {import('./dxf/reader.js').DxfDoc} doc
 * @param {{ unit: string, factor: number, source: string }} units
 * @returns {{ units: object, extracted: object, notes: string[] }}
 */
function extractPlanChecked(doc, units) {
  const extracted = extractPlan(doc, { factor: units.factor });
  const nothingToRead = extracted.wallLayer === null || extracted.overLimit;
  if (units.source !== 'header' || extracted.walls.length > 0 || nothingToRead) return { units, extracted, notes: [] };
  const stated = unitName(units.unit);
  const guess = detectUnits({ ...doc, insunits: null });
  if (guess.source === 'heuristic' && guess.unit !== units.unit) {
    const retry = extractPlan(doc, { factor: guess.factor });
    if (retry.walls.length > 0) {
      const used = unitName(guess.unit);
      return { units: guess, extracted: retry, notes: [`Your file says ${stated} but the walls look like ${used}; we used ${used}. You can change this under Drawing units.`] };
    }
  }
  return { units, extracted, notes: [`No walls were found in ${stated}, the units your file states. If the plan was drawn in other units, choose them under Drawing units.`] };
}

/**
 * Runs the DXF pipeline on a parsed drawing: `classifyDrawing` → `detectUnits` (or the
 * customer's unit) → the extractor for the slot → summary and warnings. For a plan, a unit
 * stated in the file that finds no walls is checked against the wall thicknesses (see
 * extractPlanChecked); a unit the customer chose is always used as it is.
 * Choices (all optional) override what the drawing says: `unit` ('mm'|'cm'|'m'|'in'|'ft'),
 * `slot` ('plan'|'section'|'working'|'layout'), `levelIndex` (plans) and `section` (sections
 * and working drawings; 'a', 'A-A' and 'SECTION A-A' all mean 'A'). `undefined` means "use the
 * drawing's title".
 * @param {import('./dxf/reader.js').DxfDoc} doc
 * @param {{ unit?: string, slot?: string, levelIndex?: number | null, section?: string | null }} [choices]
 * @returns {{ kind: ReturnType<typeof classifyDrawing>, units: { unit: string, factor: number, source: 'header'|'heuristic'|'default'|'user' },
 *   slot: 'plan'|'section'|'working'|'layout'|null, levelIndex: number | null, section: string | null, sectionMarks: string[],
 *   extracted: object | null, summary: string, warnings: string[] }}
 */
export function interpretDxf(doc, choices = {}) {
  const kind = classifyDrawing(doc);
  let units = typeof choices.unit === 'string' && Object.hasOwn(UNIT_FACTORS, choices.unit)
    ? { unit: choices.unit, factor: UNIT_FACTORS[choices.unit], source: 'user' }
    : detectUnits(doc);
  let slot = null;
  if (SLOTS.includes(choices.slot)) slot = choices.slot;
  else if (choices.slot === undefined && SLOTS.includes(kind.kind)) slot = kind.kind;
  let extracted = null;
  let notes = [];
  if (slot === 'plan') ({ units, extracted, notes } = extractPlanChecked(doc, units));
  else if (slot) extracted = EXTRACTORS[slot](doc, { factor: units.factor });
  let levelIndex = null;
  if (slot === 'plan') levelIndex = choices.levelIndex === undefined ? kind.levelIndex : levelOf(choices.levelIndex);
  let section = null;
  if (LABELLED_SLOTS.includes(slot)) section = choices.section === undefined ? (kind.section ?? extracted.section ?? null) : sectionLabel(choices.section);
  const sectionMarks = slot === 'plan' ? [...extracted.sectionMarks] : [];
  const unitNotes = notes.length > 0 ? notes : unitWarnings(units);
  const warnings = [...new Set([...(doc.warnings ?? []), ...unitNotes, ...(extracted?.warnings ?? [])])];
  const summary = dxfSummary({ slot, levelIndex, section, kind, extracted });
  return { kind, units, slot, levelIndex, section, sectionMarks, extracted, summary, warnings };
}

/**
 * The one-line summary of a PDF or image drawing: "PDF drawing · 1 page", "PNG image".
 * @param {'pdf'|'image'} format
 * @param {string} name file name
 * @param {number} pages
 * @returns {string}
 */
export function rasterSummary(format, name, pages) {
  if (format === 'pdf') return `PDF drawing · ${count(pages, 'page')}`;
  const ext = extensionOf(name).slice(1).toUpperCase().replace('JPEG', 'JPG');
  return ext ? `${ext} image` : 'Image';
}

/**
 * Applies the customer's corrections to a drawing read by `readDrawing` and returns the
 * updated drawing (the original is not changed; id, name, thumbnail and doc are kept).
 * - DXF: re-runs the pipeline with the changes, so a new `unit` re-extracts every length (the
 *   review step's "Drawing units" menu), and a new `slot` runs the matching extractor (for a
 *   DXF whose title wasn't recognised). A unit chosen earlier is kept until it is changed.
 * - PDF and image: sets `slot`, `levelIndex` and `section` (the upload page's small form).
 * `levelIndex` only applies to plans and `section` to sections and working drawings. When
 * the slot changes, a level or section not given is read from the drawing again.
 * Unreadable drawings are returned unchanged.
 * @param {object} drawing a ParsedDrawing
 * @param {{ unit?: 'mm'|'cm'|'m'|'in'|'ft', slot?: 'plan'|'section'|'working'|'layout'|null, levelIndex?: number | null, section?: string | null }} [changes]
 * @returns {object} the updated ParsedDrawing
 */
export function reextract(drawing, changes = {}) {
  if (!drawing || drawing.readable === false) return drawing;
  const has = (key) => Object.hasOwn(changes, key);
  const slotChanged = has('slot') && changes.slot !== drawing.slot;
  const carry = (key) => {
    if (has(key)) return changes[key];
    return slotChanged ? undefined : drawing[key];
  };
  if (drawing.format === 'dxf' && drawing.doc) {
    const unit = has('unit') ? changes.unit : (drawing.units?.source === 'user' ? drawing.units.unit : undefined);
    const slot = has('slot') ? (changes.slot ?? null) : drawing.slot;
    return { ...drawing, ...interpretDxf(drawing.doc, { unit, slot, levelIndex: carry('levelIndex'), section: carry('section') }) };
  }
  const slot = has('slot') ? (SLOTS.includes(changes.slot) ? changes.slot : null) : drawing.slot;
  const levelIndex = slot === 'plan' ? levelOf(carry('levelIndex')) : null;
  const section = LABELLED_SLOTS.includes(slot) ? sectionLabel(carry('section')) : null;
  return { ...drawing, slot, levelIndex, section };
}
