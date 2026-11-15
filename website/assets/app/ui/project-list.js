/**
 * The list of saved projects on step 1, each with Open, Export and Delete (Delete asks first,
 * inline). Buttons carry `data-project-action` and `data-id`; the page handles the clicks.
 */
import { esc } from '../editor/dom.js';

const KIND_LABEL = { house: 'House', office: 'Office', shop: 'Shop' };
const STATUS_LABEL = { collecting: 'Adding drawings', review: 'In review', ready: 'Painting' };

/**
 * "12 Nov 2026, 09:30" in the visitor's time zone.
 * @param {string} iso
 * @returns {string}
 */
function when(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Plural helper: "1 floor", "2 floors".
 * @param {number} n
 * @param {string} word
 * @returns {string}
 */
function count(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Markup for one project row.
 * @param {object} p project
 * @param {{ current: boolean, confirming: boolean }} flags
 * @returns {string}
 */
function rowHtml(p, { current, confirming }) {
  const id = esc(p.id);
  const name = esc(p.name);
  const meta = [KIND_LABEL[p.kind] ?? p.kind, count(p.floors, 'floor'), count(p.drawings.length, 'drawing'), `Updated ${when(p.updated)}`];
  const confirm = confirming ? `
    <div class="mp-project-confirm" role="group" aria-label="Delete ${name}?">
      <p>Delete “${name}” and its drawings from this browser? This can't be undone.</p>
      <div class="row">
        <button class="btn btn-sm" type="button" data-project-action="confirm-delete" data-id="${id}">Delete</button>
        <button class="btn btn-ghost btn-sm" type="button" data-project-action="cancel-delete" data-id="${id}">Keep it</button>
      </div>
    </div>` : '';
  return `
    <li class="mp-project"${current ? ' aria-current="true"' : ''}>
      <div class="mp-project-main">
        <p class="mp-project-name">${name}${current ? ' <span class="tag">Open now</span>' : ''}</p>
        <p class="mp-project-meta">${meta.map(esc).join(' · ')}</p>
      </div>
      <p class="mp-project-status">${esc(STATUS_LABEL[p.status] ?? '')}</p>
      <div class="mp-project-actions">
        <button class="btn btn-sm" type="button" data-project-action="open" data-id="${id}">Open<span class="visually-hidden"> ${name}</span></button>
        <button class="btn btn-ghost btn-sm" type="button" data-project-action="export" data-id="${id}">Export<span class="visually-hidden"> ${name}</span></button>
        <button class="btn btn-ghost btn-sm" type="button" data-project-action="delete" data-id="${id}" data-focus-key="delete-${id}">Delete<span class="visually-hidden"> ${name}</span></button>
      </div>
      ${confirm}
    </li>`;
}

/**
 * Renders the project list.
 * @param {HTMLElement} root element to fill
 * @param {{ projects: object[], currentId?: string|null, confirmingId?: string|null }} view
 */
export function renderProjectList(root, { projects, currentId = null, confirmingId = null }) {
  if (projects.length === 0) {
    root.innerHTML = '<p class="mp-empty">No projects yet. Start one above, or load the sample house to see how it works.</p>';
    return;
  }
  root.innerHTML = `<ul class="mp-project-list list-plain">${projects
    .map((p) => rowHtml(p, { current: p.id === currentId, confirming: p.id === confirmingId }))
    .join('')}</ul>`;
}
