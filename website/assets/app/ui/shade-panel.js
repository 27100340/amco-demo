/**
 * Shade picker: colour-family tabs, a name/code search, a grid of square swatches and a
 * "true colour" chip showing the selected shade flat, as printed on the shade card.
 */
import { shades } from '../legacy.js';
import { nextSwatchIndex, tabStopIndex } from './swatch-nav.js';

/**
 * Escapes text for HTML.
 * @param {string} text
 * @returns {string}
 */
function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Mounts the shade panel.
 * @param {HTMLElement} root element to fill
 * @param {{ onPick: (code: string) => void, selected?: string|null }} options
 * @returns {{ setSelected: (code: string|null) => void, destroy: () => void }}
 */
export function createShadePanel(root, { onPick, selected = null }) {
  const library = shades ? shades.all : [];
  const families = shades ? shades.families : [];
  let family = 'all';
  let query = '';
  let current = selected;

  root.classList.add('shade-panel');
  root.innerHTML = `
    <div class="shade-true" data-true>
      <span class="shade-true-colour" data-true-colour></span>
      <span class="shade-true-text">
        <span class="shade-true-label">True colour</span>
        <strong data-true-name>No shade chosen</strong>
        <span class="shade-true-code" data-true-code>Pick a swatch below</span>
      </span>
    </div>
    <div class="shade-tools">
      <div class="shade-families" role="group" aria-label="Colour family" data-families>
        <button type="button" data-family="all" aria-pressed="true">All</button>
        ${families.map((f) => `<button type="button" data-family="${esc(f.id)}" aria-pressed="false">${esc(f.name)}</button>`).join('')}
      </div>
      <label class="shade-search">
        <span class="visually-hidden">Search shades by name or code</span>
        <input class="input" type="search" placeholder="Search by name or code" autocomplete="off" data-search>
      </label>
    </div>
    <div class="shade-grid" role="group" aria-label="Shades" data-grid></div>
    <p class="shade-empty" data-empty hidden>No shade matches that search.</p>`;

  const grid = root.querySelector('[data-grid]');
  const empty = root.querySelector('[data-empty]');
  const familyBar = root.querySelector('[data-families]');
  const search = root.querySelector('[data-search]');
  const trueColour = root.querySelector('[data-true-colour]');
  const trueName = root.querySelector('[data-true-name]');
  const trueCode = root.querySelector('[data-true-code]');

  /** Redraws the swatch grid for the current family and search. */
  function renderGrid() {
    const q = query.trim().toLowerCase();
    const list = library.filter((s) => (family === 'all' || s.family === family)
      && (!q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)));
    grid.innerHTML = list.map((s) => `<button class="swatch-btn shade-swatch" type="button" style="--chip:${esc(s.hex)}" data-code="${esc(s.code)}" title="${esc(s.name)} (${esc(s.code)})" aria-label="${esc(s.name)}, ${esc(s.code)}" aria-pressed="${s.code === current}" tabindex="-1"></button>`).join('');
    empty.hidden = list.length > 0;
    setTabStop(tabStopIndex(list.map((s) => s.code), current));
  }

  /** @returns {HTMLButtonElement[]} the swatches in display order */
  function swatches() {
    return [...grid.querySelectorAll('button[data-code]')];
  }

  /**
   * Gives one swatch the tab stop, so the grid is a single stop for the Tab key.
   * @param {number} index swatch index, or -1 for none
   */
  function setTabStop(index) {
    swatches().forEach((b, i) => { b.tabIndex = i === index ? 0 : -1; });
  }

  /** @returns {number} swatches per row, read from the laid-out grid */
  function columnCount() {
    const list = swatches();
    if (!list.length) return 1;
    return list.filter((b) => b.offsetTop === list[0].offsetTop).length;
  }

  function onGridKey(event) {
    const list = swatches();
    const from = list.indexOf(event.target);
    if (from < 0) return;
    const to = nextSwatchIndex(event.key, from, list.length, columnCount());
    if (to === null) return;
    event.preventDefault();
    setTabStop(to);
    list[to].focus();
  }

  /** Updates the true-colour chip. */
  function renderTrue() {
    const s = current && shades ? shades.get(current) : null;
    trueColour.style.background = s ? s.hex : '';
    trueColour.classList.toggle('is-empty', !s);
    trueName.textContent = s ? s.name : 'No shade chosen';
    trueCode.textContent = s ? `${s.code} · ${s.hex.toUpperCase()}` : 'Pick a swatch below';
  }

  function onFamily(event) {
    const button = event.target.closest('button[data-family]');
    if (!button) return;
    family = button.dataset.family;
    familyBar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    renderGrid();
  }
  function onSearch() {
    query = search.value;
    renderGrid();
  }
  function onGrid(event) {
    const button = event.target.closest('button[data-code]');
    if (!button) return;
    current = button.dataset.code;
    grid.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    setTabStop(swatches().indexOf(button));
    renderTrue();
    onPick(current);
  }
  familyBar.addEventListener('click', onFamily);
  search.addEventListener('input', onSearch);
  grid.addEventListener('click', onGrid);
  grid.addEventListener('keydown', onGridKey);
  renderGrid();
  renderTrue();

  return {
    setSelected(code) {
      current = code || null;
      grid.querySelectorAll('button[data-code]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.code === current)));
      setTabStop(tabStopIndex(swatches().map((b) => b.dataset.code), current));
      renderTrue();
    },
    destroy() {
      familyBar.removeEventListener('click', onFamily);
      search.removeEventListener('input', onSearch);
      grid.removeEventListener('click', onGrid);
      grid.removeEventListener('keydown', onGridKey);
      root.innerHTML = '';
    }
  };
}
