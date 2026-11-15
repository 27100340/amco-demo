/**
 * The requirements checklist beside the upload slots: one line per required document type
 * (floor plans, sections, working drawings, layouts), ticked when satisfied, otherwise saying
 * exactly what is missing. Renders the result of `checkPackage`.
 */
import { esc } from '../editor/dom.js';
import { icon } from './my-property-icons.js';

/**
 * Markup for one checklist item.
 * @param {{ key: string, label: string, satisfied: boolean, files: string[], missing: string[], details?: string[] }} item
 * @returns {string}
 */
function itemHtml(item) {
  const lines = item.missing.map((short, i) => item.details?.[i] || short);
  const body = item.satisfied
    ? `<p class="mp-req-files">${item.files.map(esc).join(', ')}</p>`
    : `<ul class="mp-req-missing">${lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>`;
  return `
    <li class="mp-req" data-key="${esc(item.key)}" data-ok="${item.satisfied}">
      <span class="mp-req-mark">${icon(item.satisfied ? 'check' : 'ring')}<span class="visually-hidden">${item.satisfied ? 'Done:' : 'Still needed:'}</span></span>
      <div class="mp-req-body">
        <p class="mp-req-label">${esc(item.label)}</p>
        ${body}
      </div>
    </li>`;
}

/**
 * Renders the checklist.
 * @param {HTMLElement} root element to fill
 * @param {{ complete: boolean, items: object[] }} result from `checkPackage`
 */
export function renderRequirements(root, result) {
  const done = result.items.filter((i) => i.satisfied).length;
  root.innerHTML = `
    <p class="mp-req-count"><span class="num">${done}</span> of ${result.items.length} ready</p>
    <ul class="mp-reqs list-plain">${result.items.map(itemHtml).join('')}</ul>`;
}

/**
 * One sentence naming everything still missing (for the note under the build button).
 * @param {{ complete: boolean, items: object[] }} result from `checkPackage`
 * @returns {string} empty when the package is complete
 */
export function missingSummary(result) {
  if (result.complete) return '';
  const names = [...new Set(result.items.flatMap((i) => i.missing))];
  return `Still needed: ${names.join(', ')}.`;
}
