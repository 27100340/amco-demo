/**
 * The mandatory drawing package: one plan per floor, a section for every section mark, a working
 * drawing for every section, and a site layout. Pure module: no DOM.
 */
import { normaliseSectionLabel } from './extract/classify.js';

/** Plan names by level index. */
const PLAN_NAMES = { '-1': 'Basement plan', 0: 'Ground floor plan', 1: 'First floor plan', 2: 'Second floor plan', 3: 'Third floor plan', 4: 'Fourth floor plan' };
const ASK_SECTIONS = 'Tell us which sections are marked on your plan';

/**
 * @typedef {object} PackageDrawing
 * @property {string} id
 * @property {string} name file name
 * @property {'dxf'|'pdf'|'image'} format
 * @property {'plan'|'section'|'working'|'layout'} slot
 * @property {number} [levelIndex] plans: 0 ground, 1 first…
 * @property {string} [section] sections and working drawings: the label ('A')
 * @property {string[]} [sectionMarks] DXF plans: labels of the section marks drawn on them
 * @property {boolean} readable false when the file could not be read
 */

/**
 * The name of a floor's plan.
 * @param {number} index
 * @returns {string}
 */
function planName(index) {
  return PLAN_NAMES[index] ?? `Level ${index} plan`;
}

/**
 * Normalises a section label: 'a', 'A-A', 'SECTION A-A' → 'A'.
 * @param {unknown} label
 * @returns {string | null}
 */
export function sectionLabel(label) {
  if (typeof label !== 'string' || label.trim() === '') return null;
  const t = label.trim().toUpperCase();
  return /^[A-Z0-9]{1,2}$/.test(t) ? t : normaliseSectionLabel(t);
}

/**
 * Unique values in first-seen order.
 * @template T
 * @param {T[]} list
 * @returns {T[]}
 */
function unique(list) {
  return [...new Set(list)];
}

/**
 * Builds one checklist item.
 * @returns {{ key: string, label: string, satisfied: boolean, files: string[], missing: string[], details: string[] }}
 */
function itemOf(key, label, files, gaps) {
  return {
    key,
    label,
    satisfied: gaps.length === 0,
    files: unique(files.map((d) => d.name)),
    missing: gaps.map((g) => g.missing),
    details: gaps.map((g) => g.detail)
  };
}

/**
 * Checks a drawing package against the four requirement rules.
 * R1 plans: one readable plan per floor (levelIndex 0 … floors−1).
 * R2 sections: every section mark on a readable DXF plan, plus every declared section, needs a
 *   readable section drawing with that label (labels compare as 'A' for "SECTION A-A", "a"…;
 *   the same label uploaded twice counts once). With PDF or image plans and no marks or declared
 *   sections, the customer must say which sections are marked. With nothing marked, at least one
 *   section drawing is needed.
 * R3 working drawings: one per required section label (or per uploaded section label when none
 *   are required; at least one otherwise).
 * R4 layouts: at least one readable layout.
 * Unreadable files never count.
 * @param {PackageDrawing[]} drawings
 * @param {{ floors?: number, declaredSections?: string[] }} [options]
 * @returns {{ complete: boolean, required: { floors: number[], sections: string[] },
 *   items: { key: 'plans'|'sections'|'working'|'layouts', label: string, satisfied: boolean, files: string[], missing: string[], details: string[] }[] }}
 *   `missing` holds short names ("Section B-B"); `details` the matching full sentence.
 */
export function checkPackage(drawings, { floors = 1, declaredSections = [] } = {}) {
  const usable = (drawings ?? []).filter((d) => d && d.readable !== false);
  const inSlot = (slot) => usable.filter((d) => d.slot === slot);
  const floorCount = Math.max(1, Math.floor(Number(floors) || 1));
  const requiredFloors = Array.from({ length: floorCount }, (_, i) => i);

  const plans = inSlot('plan');
  const planGaps = requiredFloors
    .filter((f) => !plans.some((p) => p.levelIndex === f))
    .map((f) => ({ missing: planName(f), detail: `Upload the ${planName(f).toLowerCase()}.` }));

  const markedOn = new Map();
  for (const p of plans.filter((d) => d.format === 'dxf')) {
    for (const mark of p.sectionMarks ?? []) {
      const label = sectionLabel(mark);
      if (label && !markedOn.has(label)) markedOn.set(label, p.levelIndex);
    }
  }
  const declared = unique((declaredSections ?? []).map(sectionLabel).filter(Boolean));
  const requiredSections = unique([...markedOn.keys(), ...declared]).sort();
  const needsDeclaration = requiredSections.length === 0 && plans.some((p) => p.format !== 'dxf');

  const sections = inSlot('section');
  const sectionLabels = new Set(sections.map((d) => sectionLabel(d.section)).filter(Boolean));
  let sectionGaps;
  if (needsDeclaration) {
    sectionGaps = [{ missing: ASK_SECTIONS, detail: 'Your plans are PDFs or pictures, so we can\'t read the section marks on them. Tell us which sections are marked on your plan (for example A-A and B-B).' }];
  } else if (requiredSections.length === 0) {
    sectionGaps = sections.length > 0 ? [] : [{ missing: 'At least one section drawing', detail: 'Upload at least one section drawing.' }];
  } else {
    sectionGaps = requiredSections.filter((s) => !sectionLabels.has(s)).map((s) => {
      const where = markedOn.has(s) ? `is marked on your ${planName(markedOn.get(s)).toLowerCase()}` : 'is one of the sections you said are marked on your plan';
      return { missing: `Section ${s}-${s}`, detail: `Section ${s}-${s} ${where} but no section drawing for ${s}-${s} was uploaded.` };
    });
  }

  const workings = inSlot('working');
  const workingLabels = new Set(workings.map((d) => sectionLabel(d.section)).filter(Boolean));
  const workingNeeded = requiredSections.length > 0 ? requiredSections : [...sectionLabels].sort();
  let workingGaps;
  if (needsDeclaration) {
    workingGaps = [{ missing: ASK_SECTIONS, detail: 'Tell us which sections are marked on your plan, so we know which working drawings are needed.' }];
  } else if (workingNeeded.length === 0) {
    workingGaps = workings.length > 0 ? [] : [{ missing: 'At least one working drawing', detail: 'Upload at least one working drawing.' }];
  } else {
    workingGaps = workingNeeded.filter((s) => !workingLabels.has(s)).map((s) => ({
      missing: `Working drawing for section ${s}-${s}`,
      detail: `Upload the working drawing for section ${s}-${s}.`
    }));
  }

  const layouts = inSlot('layout');
  const layoutGaps = layouts.length > 0 ? [] : [{ missing: 'Site layout', detail: 'Upload the site layout showing the plot, boundary wall and gate.' }];

  const items = [
    itemOf('plans', 'Floor plans', plans, planGaps),
    itemOf('sections', 'Section drawings', sections, sectionGaps),
    itemOf('working', 'Working drawings', workings, workingGaps),
    itemOf('layouts', 'Layouts', layouts, layoutGaps)
  ];
  return {
    complete: items.every((i) => i.satisfied),
    required: { floors: requiredFloors, sections: requiredSections },
    items
  };
}
