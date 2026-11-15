/**
 * Step 3, review and trace: a report of what was read (counts, the drawing units with a menu
 * to change them, standard sizes used, things to check), the section and working drawings to
 * check heights and sizes against (click to enlarge), and the plan editor. DXF packages open in
 * review mode over the CAD linework; PDF and picture plans open in trace mode over the scan.
 */
import { createPlanEditor } from '../editor/plan-editor.js';
import { UNIT_CHOICES } from '../importers/index.js';
import { esc } from '../editor/dom.js';
import { backdropsFor } from './my-property-drawings.js';
import { icon } from './my-property-icons.js';

const COUNT_LABELS = [['walls', 'Walls'], ['doors', 'Doors'], ['windows', 'Windows'], ['rooms', 'Rooms'], ['levels', 'Floors']];
const SOURCE_TEXT = {
  header: 'Read from the drawing files.',
  heuristic: 'Worked out from the wall thickness, because the files don\'t say. Please check.',
  default: 'Assumed, because the files don\'t say. Please check.',
  user: 'Chosen by you.'
};

/**
 * Menu of drawing units.
 * @param {string} selected unit or '' for mixed
 * @param {object} attrs extra attribute markup
 * @returns {string}
 */
function unitSelect(selected, attrs) {
  const mixed = selected ? '' : '<option value="" selected>Different units</option>';
  return `<select class="select" ${attrs}>${mixed}${UNIT_CHOICES
    .map((c) => `<option value="${c.unit}"${c.unit === selected ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select>`;
}

/**
 * A collapsible list.
 * @param {string} title
 * @param {string[]} lines
 * @param {boolean} open
 * @returns {string}
 */
function listBlock(title, lines, open) {
  if (!lines.length) return '';
  return `<details class="mp-report-list"${open ? ' open' : ''}><summary>${esc(title)} <span class="num">(${lines.length})</span></summary>
    <ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></details>`;
}

/**
 * Mounts step 3.
 * @param {HTMLElement} root
 * @param {{ session: object, getProject: () => object, onChange: (changes: { building: object, schedule: object, scale: object }) => void,
 *   onUnits: (fileIds: string[], unit: string) => void, onRebuild: () => void, onPreview3D: (building: object) => void,
 *   onEnlarge: (fileId: string) => void, isStale: () => boolean }} options
 * @returns {{ show: () => Promise<void>, refresh: () => void, hide: () => ({ building: object, schedule: object, scale: object }|null) }}
 */
export function createReviewStep(root, { session, getProject, onChange, onUnits, onRebuild, onPreview3D, onEnlarge, isStale }) {
  let editor = null;
  let backdrops = {};
  let pendingUnits = null;
  let token = 0;

  /** Metres per pixel of every scanned plan, read back from our own backdrop objects (R15). */
  const scales = () => Object.fromEntries(Object.entries(backdrops)
    .filter(([, b]) => b.kind === 'bitmap')
    .map(([id, b]) => [id, b.metresPerPixel > 0 ? b.metresPerPixel : null]));

  function dxfDrawings() {
    return getProject().drawings.filter((d) => d.readable && d.slot && d.format === 'dxf');
  }

  function unitsHtml() {
    const list = dxfDrawings();
    if (!list.length) return '';
    const units = [...new Set(list.map((d) => d.unit))];
    const common = units.length === 1 ? units[0] : '';
    const sources = [...new Set(list.map((d) => d.unitSource))];
    const note = common ? (SOURCE_TEXT[sources.length === 1 ? sources[0] : 'user'] ?? '') : 'Your drawings use different units. Check each one below.';
    const confirm = pendingUnits ? `
      <div class="mp-confirm" role="alertdialog" aria-labelledby="mp-units-confirm">
        <p id="mp-units-confirm">Changing the units rebuilds the model from your drawings, so the changes you made on this page will be lost.</p>
        <div class="row">
          <button class="btn btn-sm" type="button" data-units-confirm>Rebuild with ${esc((UNIT_CHOICES.find((c) => c.unit === pendingUnits.unit)?.label ?? pendingUnits.unit).toLowerCase())}</button>
          <button class="btn btn-ghost btn-sm" type="button" data-units-cancel>Cancel</button>
        </div>
      </div>` : '';
    return `
      <div class="mp-units">
        <label class="field">
          <span class="label">Drawing units</span>
          ${unitSelect(common, 'data-units-all')}
        </label>
        <p class="mp-units-note">${esc(note)} If the model looks far too big or too small, the units are wrong.</p>
        ${confirm}
        <details class="mp-units-each"${common ? '' : ' open'}>
          <summary>Units for each drawing</summary>
          <ul class="list-plain">${list.map((d) => `
            <li><span>${esc(d.name)}</span>${unitSelect(d.unit, `data-units-file="${esc(d.fileId)}" aria-label="Units of ${esc(d.name)}"`)}</li>`).join('')}
          </ul>
        </details>
      </div>`;
  }

  function reportHtml() {
    const report = getProject().report ?? { counts: {}, warnings: [], defaultsUsed: [], mode: 'review' };
    const trace = report.mode === 'trace';
    const counts = trace ? '' : `<dl class="mp-counts">${COUNT_LABELS
      .map(([key, label]) => `<div><dt>${label}</dt><dd class="num">${esc(report.counts?.[key] ?? 0)}</dd></div>`).join('')}</dl>`;
    const intro = trace
      ? '<p class="mp-report-text">Your plans are PDFs or pictures, so you draw the walls over them. Start with the scale: click both ends of a dimension you know and type its length. Then trace the walls, add the doors and windows, and name each room.</p>'
      : '<p class="mp-report-text">This is what we read from your drawings. Click any wall, door or room that looks wrong to fix it. Heights and door and window sizes are in the panel beside the plan.</p>';
    const warnings = report.warnings ?? [];
    return `
      <div class="mp-report">
        <h3 class="mp-panel-title">${trace ? 'Trace your plans' : 'What we found'}</h3>
        ${intro}
        ${counts}
        ${unitsHtml()}
        ${listBlock('Standard sizes we used where your drawings didn\'t say', report.defaultsUsed ?? [], false)}
        ${warnings.length ? listBlock('Things to check', warnings, true) : `<p class="mp-report-ok">${icon('check')}<span>${trace ? 'Nothing to check yet.' : 'No problems found.'}</span></p>`}
      </div>`;
  }

  function referencesHtml() {
    const refs = getProject().drawings.filter((d) => d.readable && (d.slot === 'section' || d.slot === 'working'))
      .sort((a, b) => (a.slot + a.section).localeCompare(b.slot + b.section));
    if (!refs.length) return '';
    return `
      <div class="mp-refs">
        <h3 class="mp-refs-title">Check against your drawings</h3>
        <p class="mp-refs-text">Compare the heights and the door and window sizes in the panel with your sections and working drawings.</p>
        <ul class="mp-refs-list list-plain">${refs.map((d) => {
          const thumb = session.thumbs.get(d.fileId);
          const label = `${d.slot === 'working' ? 'Working drawing' : 'Section'} ${d.section ? `${d.section}-${d.section}` : ''}`.trim();
          return `<li><button type="button" class="mp-ref" data-enlarge="${esc(d.fileId)}" aria-label="Enlarge ${esc(label)}">
            <span class="mp-ref-img">${thumb ? `<img src="${esc(thumb)}" alt="" decoding="async">` : icon('file')}<span class="mp-ref-zoom">${icon('expand')}</span></span>
            <span class="mp-ref-label">${esc(label)}</span>
          </button></li>`;
        }).join('')}</ul>
      </div>`;
  }

  function staleHtml() {
    if (!isStale()) return '';
    return `
      <div class="note mp-stale" role="status">
        <p>Your drawings have changed since this model was built.</p>
        <button class="btn btn-ghost btn-sm" type="button" data-rebuild>Rebuild from the drawings</button>
      </div>`;
  }

  function renderTop() {
    const top = root.querySelector('[data-review-top]');
    if (top) top.innerHTML = `${staleHtml()}<div class="mp-review-grid">${reportHtml()}${referencesHtml()}</div>`;
  }

  root.addEventListener('click', (event) => {
    const t = event.target.closest('button');
    if (!t) return;
    if (t.dataset.enlarge) onEnlarge(t.dataset.enlarge);
    else if (t.hasAttribute('data-rebuild')) onRebuild();
    else if (t.hasAttribute('data-units-confirm') && pendingUnits) {
      const { fileIds, unit } = pendingUnits;
      pendingUnits = null;
      onUnits(fileIds, unit);
    } else if (t.hasAttribute('data-units-cancel')) {
      pendingUnits = null;
      renderTop();
    }
  });

  root.addEventListener('change', (event) => {
    const t = event.target;
    let fileIds = null;
    if (t.matches('[data-units-all]')) fileIds = dxfDrawings().map((d) => d.fileId);
    else if (t.dataset.unitsFile) fileIds = [t.dataset.unitsFile];
    if (!fileIds || !t.value) return;
    if (getProject().edited) {
      pendingUnits = { fileIds, unit: t.value };
      renderTop();
      root.querySelector('[data-units-confirm]')?.focus();
    } else {
      onUnits(fileIds, t.value);
    }
  });

  return {
    /**
     * Shows the step for the open project (mounting a fresh editor).
     * @returns {Promise<void>}
     */
    async show() {
      this.hide();
      pendingUnits = null;
      const mine = ++token;
      root.innerHTML = `
        <div data-review-top></div>
        <div class="mp-editor" data-editor><p class="mp-loading">Opening the plan…</p></div>`;
      renderTop();
      backdrops = await backdropsFor(getProject(), session);
      if (mine !== token) return;
      renderTop();
      const host = root.querySelector('[data-editor]');
      host.innerHTML = '';
      editor = createPlanEditor(host, {
        building: getProject().building,
        backdrops,
        schedule: getProject().schedule ?? undefined,
        mode: getProject().report?.mode === 'trace' ? 'trace' : 'review',
        onChange(building, schedule) {
          onChange({ building, schedule, scale: scales() });
        },
        onPreview3D(building) {
          onPreview3D(building);
        }
      });
    },
    /** Refreshes the report and references (after the project changed outside the editor). */
    refresh() {
      renderTop();
    },
    /**
     * Closes the editor; any change still waiting is passed to onChange first.
     * @returns {{ building: object, schedule: object, scale: object }|null} the editor's final state
     */
    hide() {
      token += 1;
      if (!editor) return null;
      const result = { building: editor.getBuilding(), schedule: editor.getSchedule(), scale: scales() };
      editor.destroy();
      editor = null;
      return result;
    }
  };
}
