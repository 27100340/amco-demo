/**
 * The 3D paint studio: a stage with the viewer, view tabs, floor selector and hint, and a side
 * panel (bottom sheet on phones) with the selected wall, paint scope, shade picker, light and
 * finish, a keyboard-friendly wall list and the paint estimate.
 */
import { createViewer } from '../engine/viewer.js';
import { createShadePanel } from './shade-panel.js';
import { amco, data } from '../legacy.js';

const SCOPES = [['surface', 'This wall'], ['room', 'Whole room'], ['exterior', 'All exterior']];
const LIGHTS = [['day', 'Daylight'], ['warm', 'Warm bulb'], ['cool', 'Tube light']];
const FINISH_LABELS = [['matt', 'Matt'], ['silk', 'Silk'], ['gloss', 'Gloss']];
const DEFAULT_PRODUCT = 'aqueous-matt';
/** Space kept beside a view tab scrolled into sight (px). */
const TAB_MARGIN = 24;
const COATS = 2;

/**
 * Escapes text for HTML.
 * @param {unknown} text
 * @returns {string}
 */
function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Formats a number with at most one decimal.
 * @param {number} value
 * @returns {string}
 */
function num(value) {
  return (Math.round(value * 10) / 10).toLocaleString('en-GB');
}

/** Segmented control markup. */
function seg(name, label, items, active) {
  return `<div class="seg studio-seg" role="group" aria-label="${esc(label)}" data-seg="${name}">${items
    .map(([value, text]) => `<button type="button" data-value="${value}" aria-pressed="${value === active}">${esc(text)}</button>`)
    .join('')}</div>`;
}

/** Sets aria-pressed across a segmented control. */
function press(group, value) {
  group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === value)));
}

/** Wall paints for the product picker. */
function wallProducts() {
  const list = data && Array.isArray(data.products) ? data.products : [];
  return list.filter((p) => (p.category === 'interior' || p.category === 'exterior') && p.coverage > 0);
}

/** Tins as words: "1 Drum, 2 Gallons". */
function tinsText(tins) {
  if (!tins || !tins.length) return '';
  return tins.map((row) => `${row.count} ${row.pack.label}${row.count > 1 ? 's' : ''}`).join(', ');
}

/** Stage hint for a mode. */
function hintFor(mode, touch) {
  const pick = touch ? 'Tap a wall to choose it.' : 'Click a wall to choose it.';
  if (mode === 'room') return touch ? `Drag to look around. Tap the floor to walk there. ${pick}` : `Drag to look around. Click the floor to walk there, or use the arrow keys. ${pick}`;
  if (mode === 'dollhouse') return `Drag to turn the model, pinch or scroll to zoom. ${pick}`;
  return `Drag to walk around the outside, pinch or scroll to zoom. ${pick}`;
}

/**
 * Mounts the studio.
 * @param {HTMLElement} root element to fill
 * @param {{ building: object, paintState?: object, onChange?: (state: object, info: { productId: string }) => void,
 *   onSave?: (state: object, look: object) => void, onView?: (view: object) => void,
 *   onProduct?: (productId: string) => void, productId?: string,
 *   headerSlot?: HTMLElement|string, quality?: 'auto'|'high'|'medium'|'low', interactive?: boolean, view?: string }} options
 *   `productId` preselects the paint used for the estimate; `onProduct` fires when the customer picks another one
 * @returns {{ viewer: object|null, ready: Promise<void>, load: (building: object, paintState?: object, view?: string) => Promise<void>,
 *   getProduct: () => string, setProduct: (productId: string) => boolean, destroy: () => void }}
 *   `getProduct()` is the id of the product chosen for the estimate (an id from `AmcoData.products`)
 */
export function mountStudio(root, options) {
  const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  let building = options.building;
  let scope = 'surface';
  const products = wallProducts();
  const known = (id) => products.some((p) => p.id === id);
  let productId = known(options.productId) ? options.productId : DEFAULT_PRODUCT;
  let currentView = { mode: 'exterior', level: null, room: null };
  let frame = 0;

  root.classList.add('studio');
  root.innerHTML = `
    <section class="studio-stage" aria-label="3D model">
      <div class="studio-canvas" data-canvas></div>
      <div class="studio-top">
        <div class="studio-views" role="group" aria-label="Views" data-views></div>
        <label class="studio-level" data-level-wrap hidden>
          <span class="visually-hidden">Floor</span>
          <select class="select" data-level></select>
        </label>
      </div>
      <p class="studio-hint" data-hint></p>
      <div class="studio-status" role="status" data-status>Building the 3D model…</div>
    </section>
    <aside class="studio-panel" aria-label="Paint controls">
      <div class="studio-sheet-handle" aria-hidden="true"></div>
      <div data-header></div>
      <section class="studio-section">
        <h2 class="studio-h">Selected wall</h2>
        <div class="studio-selected" data-selected>
          <span class="studio-selected-chip" data-selected-chip></span>
          <span class="studio-selected-text">
            <strong data-selected-label>No wall chosen yet</strong>
            <span data-selected-detail>${touch ? 'Tap' : 'Click'} any wall in the model, or pick one from the list below.</span>
          </span>
        </div>
        ${seg('scope', 'What to paint', SCOPES, scope)}
      </section>
      <section class="studio-section">
        <h2 class="studio-h">Shade</h2>
        <div data-shades></div>
      </section>
      <section class="studio-section studio-pair">
        <div>
          <h2 class="studio-h">Light</h2>
          ${seg('light', 'Lighting', LIGHTS, 'day')}
        </div>
        <div>
          <h2 class="studio-h">Finish</h2>
          ${seg('finish', 'Paint finish', FINISH_LABELS, 'matt')}
        </div>
        <p class="studio-note">The same shade reads warmer under a bulb and cooler under a tube light. Check all three.</p>
      </section>
      <section class="studio-section">
        <h2 class="studio-h">Walls</h2>
        <div class="studio-walls" data-walls></div>
      </section>
      <section class="studio-section">
        <h2 class="studio-h">Paint needed</h2>
        <label class="field studio-product">
          <span class="label">Product</span>
          <select class="select" data-product>${products.map((p) => `<option value="${esc(p.id)}"${p.id === productId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        </label>
        <div class="studio-estimate" data-estimate></div>
        <div class="studio-actions">
          <button class="btn btn-brand" type="button" data-save>Save to my project</button>
          <button class="btn btn-ghost" type="button" data-reset>Reset</button>
        </div>
      </section>
    </aside>`;

  const $ = (sel) => root.querySelector(sel);
  const canvasHost = $('[data-canvas]');
  const status = $('[data-status]');
  const hint = $('[data-hint]');
  const viewsBar = $('[data-views]');
  const levelWrap = $('[data-level-wrap]');
  const levelSelect = $('[data-level]');
  const header = $('[data-header]');
  if (options.headerSlot instanceof HTMLElement) header.appendChild(options.headerSlot);
  else if (typeof options.headerSlot === 'string') header.innerHTML = options.headerSlot;

  let viewer = null;
  try {
    viewer = createViewer(canvasHost, {
      quality: options.quality || 'auto',
      interactive: options.interactive !== false,
      onSelect: renderSelected,
      onChange(state) {
        scheduleLists();
        if (options.onChange) options.onChange(state, { productId });
      },
      onView(next) {
        currentView = next;
        renderViews();
        hint.textContent = hintFor(next.mode, touch);
        if (options.onView) options.onView(next);
      }
    });
  } catch (error) {
    console.error(error);
    root.classList.add('studio-failed');
    $('.studio-stage').innerHTML = `<div class="studio-error">
      <h2>The 3D view could not start</h2>
      <p>Your browser has 3D graphics switched off or does not support WebGL2. Try an up-to-date Chrome, Edge, Safari or Firefox, or browse the shade card instead.</p>
      <p><a class="btn btn-light" href="colours.html">Open the shade card</a></p>
    </div>`;
    return {
      viewer: null,
      ready: Promise.reject(error),
      load: () => Promise.reject(error),
      getProduct: () => productId,
      setProduct: () => false,
      destroy() { root.innerHTML = ''; }
    };
  }

  const shadePanel = createShadePanel($('[data-shades]'), {
    onPick(code) {
      if (!viewer.paint(code, { scope, finish: viewer.getFinish() })) {
        if (amco && amco.toast) amco.toast(`${touch ? 'Tap' : 'Click'} a wall in the model first`);
      }
    }
  });

  /* ---------- views and levels */

  /** View tabs from the building's views (exterior, dollhouse and every room when it has none). */
  function viewList() {
    const list = [];
    const seen = new Set();
    const add = (id, label) => {
      if (seen.has(id)) return;
      seen.add(id);
      list.push({ id, label });
    };
    for (const v of building.views || []) {
      if (v.mode === 'exterior') add('exterior', v.label || 'Exterior');
      else if (v.mode === 'dollhouse') add('dollhouse', v.label || 'Dollhouse');
      else if (v.mode === 'room' && v.room) add(`room:${v.room}`, v.label || v.room);
    }
    add('exterior', 'Exterior');
    add('dollhouse', 'Dollhouse');
    if (!(building.views || []).some((v) => v.mode === 'room')) {
      for (const room of viewer.getRooms()) add(`room:${room.id}`, room.name);
    }
    const order = (id) => (id === 'exterior' ? 0 : id === 'dollhouse' ? 1 : 2);
    return list.sort((a, b) => order(a.id) - order(b.id));
  }

  function renderViews() {
    let active = null;
    viewsBar.querySelectorAll('button').forEach((b) => {
      const id = b.dataset.view;
      const on = id === currentView.mode || (currentView.mode === 'room' && id === `room:${currentView.room}`);
      b.setAttribute('aria-pressed', String(on));
      if (on) active = b;
    });
    if (active) revealTab(active);
    if (!levelWrap.hidden) levelSelect.value = currentView.mode === 'dollhouse' ? currentView.level || '' : levelSelect.value;
    updateTabEdges();
  }

  /** Scrolls the view tabs sideways (never the page) so a tab is fully in sight. */
  function revealTab(tab) {
    const left = tab.offsetLeft - TAB_MARGIN;
    const right = tab.offsetLeft + tab.offsetWidth + TAB_MARGIN;
    if (left < viewsBar.scrollLeft) viewsBar.scrollLeft = left;
    else if (right > viewsBar.scrollLeft + viewsBar.clientWidth) viewsBar.scrollLeft = right - viewsBar.clientWidth;
  }

  /** Marks which ends of the tab strip have more tabs beyond them (for the edge fades). */
  function updateTabEdges() {
    const max = viewsBar.scrollWidth - viewsBar.clientWidth;
    viewsBar.classList.toggle('has-more-start', viewsBar.scrollLeft > 1);
    viewsBar.classList.toggle('has-more-end', max - viewsBar.scrollLeft > 1);
  }

  function buildViewBar() {
    viewsBar.innerHTML = viewList().map((v) => `<button type="button" class="studio-view" data-view="${esc(v.id)}" aria-pressed="false">${esc(v.label)}</button>`).join('');
    const levels = viewer.getLevels();
    levelWrap.hidden = levels.length < 2;
    levelSelect.innerHTML = `<option value="">All floors</option>${levels.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}`;
    renderViews();
  }

  viewsBar.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-view]');
    if (button) viewer.setView(button.dataset.view);
  });
  viewsBar.addEventListener('scroll', updateTabEdges, { passive: true });
  viewsBar.addEventListener('focusin', (event) => {
    if (event.target.matches('button[data-view]')) revealTab(event.target);
  });
  viewsBar.addEventListener('wheel', (event) => {
    if (viewsBar.scrollWidth <= viewsBar.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    event.preventDefault();
    viewsBar.scrollLeft += event.deltaY;
  }, { passive: false });
  const tabsObserver = new ResizeObserver(updateTabEdges);
  tabsObserver.observe(viewsBar);
  levelSelect.addEventListener('change', () => {
    const level = levelSelect.value || null;
    viewer.setLevel(level);
    if (currentView.mode !== 'dollhouse') viewer.setView({ mode: 'dollhouse', level });
  });

  /* ---------- selection */

  function renderSelected(surface) {
    const chip = $('[data-selected-chip]');
    const label = $('[data-selected-label]');
    const detail = $('[data-selected-detail]');
    if (!surface) {
      chip.style.background = '';
      chip.classList.add('is-empty');
      label.textContent = 'No wall chosen yet';
      detail.textContent = `${touch ? 'Tap' : 'Click'} any wall in the model, or pick one from the list below.`;
      shadePanel.setSelected(null);
      return;
    }
    chip.classList.toggle('is-empty', !surface.hex);
    chip.style.background = surface.hex || '';
    label.textContent = surface.label;
    const finish = surface.finish ? surface.finish[0].toUpperCase() + surface.finish.slice(1) : '';
    detail.textContent = surface.code
      ? `${surface.shadeName} (${surface.code}) · ${finish} · ${num(surface.groupArea)} m²`
      : `Not painted yet · ${num(surface.groupArea)} m²`;
    shadePanel.setSelected(surface.code);
    if (surface.finish) press($('[data-seg="finish"]'), surface.finish);
    scheduleLists();
  }

  /* ---------- wall list and estimate */

  function scheduleLists() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      renderWalls();
      renderEstimate();
    });
  }

  function renderWalls() {
    const selected = viewer.getSelected();
    const selectedGroup = selected ? selected.group : null;
    const byRoom = new Map();
    for (const row of viewer.getGroups()) {
      const key = row.room;
      if (!byRoom.has(key)) byRoom.set(key, { name: row.roomName, rows: [] });
      byRoom.get(key).rows.push(row);
    }
    const openRoom = selected ? selected.room : currentView.room;
    $('[data-walls]').innerHTML = [...byRoom.entries()].map(([room, entry]) => `
      <details class="studio-room"${room === openRoom ? ' open' : ''}>
        <summary>${esc(entry.name)} <span>${entry.rows.length}</span></summary>
        <ul>${entry.rows.map((row) => `
          <li><button type="button" class="studio-wall" data-surface="${esc(row.surfaceIds[0])}" aria-pressed="${row.group === selectedGroup}">
            <span class="dot" style="--chip:${esc(row.hex || '#efede8')}"></span>
            <span class="studio-wall-label">${esc(row.label)}</span>
            <span class="studio-wall-area">${num(row.area)} m²</span>
          </button></li>`).join('')}</ul>
      </details>`).join('');
  }

  $('[data-walls]').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-surface]');
    if (!button) return;
    viewer.select(button.dataset.surface);
    viewer.focus(button.dataset.surface);
  });

  function renderEstimate() {
    const product = data && data.product ? data.product(productId) : null;
    const result = viewer.estimate(productId);
    const box = $('[data-estimate]');
    if (!result.rows.length) {
      box.innerHTML = '<p class="studio-note">Paint a wall to see how much you need.</p>';
      return;
    }
    box.innerHTML = `
      <table class="studio-table">
        <thead><tr><th scope="col">Area</th><th scope="col" class="num">m²</th><th scope="col" class="num">Litres</th></tr></thead>
        <tbody>${result.rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${num(r.area)}</td><td class="num">${num(r.litres)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th scope="row">Total, ${COATS} coats</th><td class="num">${num(result.totalArea)}</td><td class="num">${num(result.totalLitres)} L</td></tr></tfoot>
      </table>
      <p class="studio-note">${result.tins.length ? `Buy ${esc(tinsText(result.tins))}` : ''}${product ? ` of ${esc(product.name)}, at ${esc(product.coverage)} m² per litre per coat.` : ''}</p>`;
  }

  const productSelect = $('[data-product]');
  productSelect.addEventListener('change', () => {
    productId = productSelect.value;
    renderEstimate();
    if (options.onProduct) options.onProduct(productId);
  });

  /**
   * Chooses the product used for the estimate.
   * @param {string} id product id
   * @returns {boolean} false for an unknown or non-wall product
   */
  function setProduct(id) {
    if (!known(id)) return false;
    productId = id;
    productSelect.value = id;
    renderEstimate();
    return true;
  }

  /* ---------- segmented controls */

  root.querySelectorAll('[data-seg]').forEach((group) => {
    group.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-value]');
      if (!button) return;
      const value = button.dataset.value;
      press(group, value);
      if (group.dataset.seg === 'scope') scope = value;
      if (group.dataset.seg === 'light') viewer.setLight(value);
      if (group.dataset.seg === 'finish') viewer.setFinish(value);
    });
  });

  /* ---------- save and reset */

  $('[data-save]').addEventListener('click', () => {
    const rows = viewer.getGroups().filter((g) => g.code).map((g) => ({ label: g.label, code: g.code, shadeName: g.shadeName, hex: g.hex }));
    const estimate = viewer.estimate(productId);
    const product = data && data.product ? data.product(productId) : null;
    const summary = `About ${num(estimate.totalLitres)} litres${product ? ` of ${product.name}` : ''} for ${COATS} coats across ${building.name || 'the property'} (${rows.length} walls).`;
    if (amco && amco.project) {
      amco.project.setWalls(rows);
      amco.project.setEstimate({ summary });
    }
    if (amco && amco.toast) amco.toast('Look saved. Open My project to send it to a dealer.');
    if (options.onSave) options.onSave(viewer.getPaintState(), { building: building.id, rows, estimate, product: productId, light: viewer.getLight() });
  });
  $('[data-reset]').addEventListener('click', () => viewer.resetPaint());

  /* ---------- loading */

  async function load(next, paintState, view) {
    building = next;
    status.hidden = false;
    status.textContent = 'Building the 3D model…';
    root.classList.add('is-loading');
    try {
      await viewer.load(next, paintState);
      buildViewBar();
      if (view) viewer.setView(view);
      currentView = viewer.getView();
      renderViews();
      hint.textContent = hintFor(currentView.mode, touch);
      renderSelected(null);
      scheduleLists();
      await viewer.rendered();
      status.hidden = true;
      root.classList.remove('is-loading');
    } catch (error) {
      console.error(error);
      status.textContent = error.message || 'This model could not be built.';
      root.classList.remove('is-loading');
      throw error;
    }
  }

  const ready = load(building, options.paintState, options.view);
  ready.catch(() => {});

  return {
    viewer,
    ready,
    load,
    getProduct: () => productId,
    setProduct,
    destroy() {
      tabsObserver.disconnect();
      if (frame) cancelAnimationFrame(frame);
      shadePanel.destroy();
      viewer.dispose();
      root.innerHTML = '';
      root.classList.remove('studio', 'is-loading', 'studio-failed');
    }
  };
}
