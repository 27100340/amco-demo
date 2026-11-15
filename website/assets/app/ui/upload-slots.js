/**
 * The four upload slots on step 2 (floor plans, section drawings, working drawings, layouts),
 * each with its files as cards: thumbnail, what was read, warnings, Replace and Remove. PDFs,
 * pictures and DXFs without a recognised title get a small form asking which drawing they are.
 * When a plan is a PDF or picture, the sections slot asks which sections are marked on it.
 * The page owns the project; this module renders it and reports what the customer did.
 */
import { esc } from '../editor/dom.js';
import { sectionLabel } from '../importers/requirements.js';
import { STOREY_NAMES } from '../importers/extract/section.js';
import { icon } from './my-property-icons.js';

/** Slot order and copy. */
const SLOTS = [
  { slot: 'plan', item: 'plans', title: 'Floor plans', text: 'One plan for each floor, showing walls, doors, windows, room names and section marks.' },
  { slot: 'section', item: 'sections', title: 'Section drawings', text: 'Every section marked on your plans, such as A-A and B-B, with the floor, ceiling and roof levels.' },
  { slot: 'working', item: 'working', title: 'Working drawings', text: 'One for each section, with the door and window schedule.' },
  { slot: 'layout', item: 'layouts', title: 'Layouts', text: 'The site layout with the plot, boundary wall and gate. A furniture layout can be added as well.' }
];
const SLOT_NAMES = { plan: 'Floor plan', section: 'Section drawing', working: 'Working drawing', layout: 'Layout' };

/**
 * Name of a floor by index.
 * @param {number} index
 * @returns {string}
 */
export function floorName(index) {
  return STOREY_NAMES[index] ?? `Level ${index}`;
}

/**
 * "A" → "A-A".
 * @param {string} label
 * @returns {string}
 */
function pair(label) {
  return `${label}-${label}`;
}

/**
 * File size in words.
 * @param {number} bytes
 * @returns {string}
 */
function sizeText(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * The details form for a drawing the customer places by hand.
 * @param {object} d project drawing
 * @param {number} floors
 * @returns {string}
 */
function detailsForm(d, floors) {
  const id = esc(d.fileId);
  const slotOptions = ['<option value="">Choose…</option>', ...Object.entries(SLOT_NAMES)
    .map(([value, label]) => `<option value="${value}"${d.slot === value ? ' selected' : ''}>${label}</option>`)].join('');
  let second = '';
  if (d.slot === 'plan') {
    const options = Array.from({ length: floors }, (_, i) => `<option value="${i}"${d.levelIndex === i ? ' selected' : ''}>${esc(floorName(i))}</option>`);
    second = `
      <label class="field mp-file-field">
        <span class="label">Floor</span>
        <select class="select" data-detail="levelIndex" data-file="${id}" data-focus-key="floor-${id}">
          <option value="">Choose…</option>${options.join('')}
        </select>
      </label>`;
  } else if (d.slot === 'section' || d.slot === 'working') {
    second = `
      <label class="field mp-file-field">
        <span class="label">Section</span>
        <input class="input" data-detail="section" data-file="${id}" data-focus-key="section-${id}" value="${d.section ? esc(pair(d.section)) : ''}" placeholder="A-A" maxlength="16" autocomplete="off">
      </label>`;
  }
  return `
    <div class="mp-file-form" role="group" aria-label="Which drawing is ${esc(d.name)}?">
      <label class="field mp-file-field">
        <span class="label">This drawing is a</span>
        <select class="select" data-detail="slot" data-file="${id}" data-focus-key="slot-${id}">${slotOptions}</select>
      </label>
      ${second}
    </div>`;
}

/**
 * True when a hand-placed drawing still lacks its floor or section.
 * @param {object} d
 * @returns {boolean}
 */
function lacksDetail(d) {
  if (!d.slot) return true;
  if (d.slot === 'plan') return !Number.isInteger(d.levelIndex);
  if (d.slot === 'section' || d.slot === 'working') return !d.section;
  return false;
}

/**
 * One file card.
 * @param {object} d project drawing
 * @param {{ thumb: string|null, floors: number }} ctx
 * @returns {string}
 */
function cardHtml(d, { thumb, floors }) {
  const id = esc(d.fileId);
  const manual = d.readable && (d.placement === 'manual' || !d.slot);
  const state = !d.readable ? 'error' : lacksDetail(d) ? 'pending' : d.warnings.length ? 'warn' : 'ok';
  const media = thumb
    ? `<img src="${esc(thumb)}" alt="" width="72" height="72" decoding="async">`
    : icon(d.format === 'image' ? 'image' : 'file');
  const warnings = d.warnings.length ? `
    <details class="mp-file-warnings">
      <summary>${d.warnings.length === 1 ? '1 thing to check' : `${d.warnings.length} things to check`}</summary>
      <ul>${d.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
    </details>` : '';
  const placement = d.readable && !manual ? `
    <details class="mp-file-change">
      <summary>Placed from the drawing title. Not right? Change what this drawing is</summary>
      ${detailsForm(d, floors)}
    </details>` : '';
  return `
    <article class="mp-file" data-state="${state}" data-file-card="${id}">
      <div class="mp-file-thumb">${media}</div>
      <div class="mp-file-body">
        <p class="mp-file-name"><span>${esc(d.name)}</span> <span class="mp-file-size">${esc(sizeText(d.size))}</span></p>
        <p class="mp-file-summary">${esc(d.summary)}</p>
        ${d.error ? `<p class="mp-file-error">${icon('alert')}<span>${esc(d.error)}</span></p>` : ''}
        ${manual ? detailsForm(d, floors) : placement}
        ${warnings}
      </div>
      <div class="mp-file-actions">
        <button class="btn btn-ghost btn-sm" type="button" data-replace="${id}" data-focus-key="replace-${id}" data-focus-fallback="add-${d.slot ?? 'plan'}">Replace<span class="visually-hidden"> ${esc(d.name)}</span></button>
        <button class="icon-btn" type="button" data-remove="${id}" data-focus-key="remove-${id}" data-focus-fallback="add-${d.slot ?? 'plan'}" aria-label="Remove ${esc(d.name)}" title="Remove">${icon('trash')}</button>
      </div>
    </article>`;
}

/**
 * Floor or section chips showing which required drawings a slot has.
 * @param {string} slot
 * @param {object[]} files drawings in the slot
 * @param {{ floors: number, required: string[] }} ctx
 * @returns {string}
 */
function needsHtml(slot, files, { floors, required }) {
  const usable = files.filter((d) => d.readable);
  let chips = [];
  if (slot === 'plan') {
    chips = Array.from({ length: floors }, (_, i) => ({ label: floorName(i), ok: usable.some((d) => d.levelIndex === i) }));
  } else if (slot === 'section' || slot === 'working') {
    chips = required.map((s) => ({ label: `${slot === 'working' ? 'Working ' : 'Section '}${pair(s)}`, ok: usable.some((d) => sectionLabel(d.section) === s) }));
  }
  if (chips.length === 0) return '';
  return `<ul class="mp-slot-needs list-plain">${chips
    .map((c) => `<li data-ok="${c.ok}">${icon(c.ok ? 'check' : 'ring')}<span>${esc(c.label)}</span><span class="visually-hidden">${c.ok ? ', added' : ', missing'}</span></li>`)
    .join('')}</ul>`;
}

/**
 * The "which sections are marked on your plan?" chips input.
 * @param {string[]} declared labels ('A')
 * @returns {string}
 */
function declareHtml(declared) {
  const quick = ['A', 'B', 'C'].filter((l) => !declared.includes(l));
  return `
    <div class="mp-declare" role="group" aria-labelledby="mp-declare-title">
      <p class="mp-declare-title" id="mp-declare-title">Which sections are marked on your plan?</p>
      <p class="mp-declare-text">Your plans are PDFs or pictures, so we can't read the section marks on them. Add each section shown on the plan, for example A-A.</p>
      <ul class="mp-chips list-plain">${declared.map((l) => `
        <li class="mp-chip">Section ${esc(pair(l))}<button type="button" data-declare-remove="${esc(l)}" data-focus-fallback="declare-input" aria-label="Remove section ${esc(pair(l))}">${icon('close')}</button></li>`).join('')}
      </ul>
      <div class="mp-declare-add">
        <input class="input" type="text" data-declare-input data-focus-key="declare-input" placeholder="A-A" maxlength="16" autocomplete="off" aria-label="Section label">
        <button class="btn btn-ghost btn-sm" type="button" data-declare-add data-focus-key="declare-add">Add</button>
        ${quick.map((l) => `<button class="btn btn-ghost btn-sm" type="button" data-declare-quick="${l}" data-focus-key="quick-${l}" data-focus-fallback="declare-input">${pair(l)}</button>`).join('')}
      </div>
    </div>`;
}

/**
 * Sort order of drawings inside a slot: by floor or section label, then name.
 * @returns {number}
 */
function bySlotOrder(a, b) {
  const ka = a.slot === 'plan' ? (a.levelIndex ?? 99) : String(a.section ?? '~');
  const kb = b.slot === 'plan' ? (b.levelIndex ?? 99) : String(b.section ?? '~');
  if (ka !== kb) return ka < kb ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/**
 * Re-renders `root` with `html`, keeping keyboard focus on the same control, or on its
 * `data-focus-fallback` control when it is gone (a removed file, a section chip just added).
 * @param {HTMLElement} root
 * @param {string} html
 */
function renderKeepingFocus(root, html) {
  const active = document.activeElement;
  const keys = active && root.contains(active) ? [active.dataset.focusKey, active.dataset.focusFallback].filter(Boolean) : [];
  root.innerHTML = html;
  for (const key of keys) {
    const target = root.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
    if (target) {
      target.focus({ preventScroll: true });
      break;
    }
  }
}

/**
 * Mounts the slots.
 * @param {HTMLElement} root
 * @param {{ onAdd: (files: File[], options: { slot: string|null }) => void, onReplace: (fileId: string, file: File) => void,
 *   onRemove: (fileId: string) => void, onDetails: (fileId: string, changes: object) => void,
 *   onDeclare: (labels: string[]) => void }} handlers
 * @returns {{ render: (view: { project: object, gate: object, thumbs: Map<string, string>, needsSections: boolean }) => void }}
 */
export function mountUploadSlots(root, handlers) {
  let declared = [];
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.hidden = true;
  picker.accept = '.dxf,.dwg,.pdf,.png,.jpg,.jpeg,.webp';
  root.after(picker);
  let pick = null;

  picker.addEventListener('change', () => {
    const files = [...picker.files];
    picker.value = '';
    if (!files.length || !pick) return;
    if (pick.replace) handlers.onReplace(pick.replace, files[0]);
    else handlers.onAdd(files, { slot: pick.slot });
  });

  const choose = (target) => {
    pick = target;
    picker.multiple = !target.replace;
    picker.click();
  };

  const declare = (text) => {
    const label = sectionLabel(text);
    if (!label || declared.includes(label)) return false;
    handlers.onDeclare([...declared, label].sort());
    return true;
  };

  root.addEventListener('click', (event) => {
    const t = event.target.closest('button');
    if (!t || !root.contains(t)) return;
    if (t.dataset.addSlot) choose({ slot: t.dataset.addSlot });
    else if (t.dataset.replace) choose({ replace: t.dataset.replace });
    else if (t.dataset.remove) handlers.onRemove(t.dataset.remove);
    else if (t.dataset.declareRemove) handlers.onDeclare(declared.filter((l) => l !== t.dataset.declareRemove));
    else if (t.dataset.declareQuick) declare(t.dataset.declareQuick);
    else if (t.hasAttribute('data-declare-add')) {
      const input = root.querySelector('[data-declare-input]');
      if (declare(input.value)) input.value = '';
      else input.setAttribute('aria-invalid', 'true');
    }
  });

  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !event.target.matches('[data-declare-input]')) return;
    event.preventDefault();
    if (declare(event.target.value)) event.target.value = '';
    else event.target.setAttribute('aria-invalid', 'true');
  });

  root.addEventListener('change', (event) => {
    const t = event.target;
    if (!t.dataset.detail) return;
    const field = t.dataset.detail;
    let value = t.value;
    if (field === 'levelIndex') value = value === '' ? null : Number(value);
    if (field === 'slot') value = value || null;
    if (field === 'section') value = sectionLabel(value);
    handlers.onDetails(t.dataset.file, { [field]: value });
  });

  return {
    render({ project, gate, thumbs, needsSections }) {
      declared = [...(project.declaredSections ?? [])];
      const ctx = { floors: project.floors, required: gate.required.sections };
      const loose = project.drawings.filter((d) => !d.slot);
      const looseHtml = loose.length ? `
        <section class="mp-slot mp-slot-loose" aria-labelledby="mp-slot-loose">
          <div class="mp-slot-head">
            <h3 class="mp-slot-title" id="mp-slot-loose">Tell us about these files</h3>
            <p class="mp-slot-text">We couldn't tell what these are from the file alone. Choose what each one shows, or remove files we can't use.</p>
          </div>
          <div class="mp-files">${loose.map((d) => cardHtml(d, { thumb: thumbs.get(d.fileId) ?? null, floors: project.floors })).join('')}</div>
        </section>` : '';
      const slotsHtml = SLOTS.map((s) => {
        const files = project.drawings.filter((d) => d.slot === s.slot).sort(bySlotOrder);
        const item = gate.items.find((i) => i.key === s.item);
        const ok = Boolean(item?.satisfied);
        const status = ok ? 'Complete' : files.length ? 'Not complete yet' : 'Required';
        return `
          <section class="mp-slot" data-slot="${s.slot}" data-ok="${ok}" aria-labelledby="mp-slot-${s.slot}">
            <div class="mp-slot-head">
              <div class="mp-slot-heading">
                <h3 class="mp-slot-title" id="mp-slot-${s.slot}">${esc(s.title)}</h3>
                <p class="mp-slot-status" data-ok="${ok}">${ok ? icon('check') : ''}${status}</p>
              </div>
              <p class="mp-slot-text">${esc(s.text)}</p>
              ${needsHtml(s.slot, files, ctx)}
            </div>
            ${s.slot === 'section' && needsSections ? declareHtml(declared) : ''}
            ${files.length ? `<div class="mp-files">${files.map((d) => cardHtml(d, { thumb: thumbs.get(d.fileId) ?? null, floors: project.floors })).join('')}</div>` : ''}
            <div class="mp-slot-foot">
              <button class="btn btn-ghost btn-sm" type="button" data-add-slot="${s.slot}" data-focus-key="add-${s.slot}">${icon('upload')}<span>Add ${s.slot === 'layout' ? 'a layout' : s.title.toLowerCase()}</span></button>
            </div>
          </section>`;
      }).join('');
      renderKeepingFocus(root, looseHtml + slotsHtml);
    }
  };
}
