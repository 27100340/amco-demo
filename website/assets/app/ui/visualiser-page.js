/**
 * Visualiser page: a gallery of showcase properties with kind filters, and the 3D studio below.
 * URL state: `?property=<id>&view=<view>` is read on load and kept up to date with replaceState.
 * `?still=1` hides every control, renders at high quality and sets `window.__amcoReady` once the
 * first full frame is drawn (used by tools/render-stills.mjs); `?light=warm|cool` sets the light;
 * `?quality=high|medium|low` forces a quality tier instead of the automatic one (used by
 * tools/load-timing.mjs).
 */
import { CATALOGUE, findProperty } from '../properties/index.js';
import { mountStudio } from './studio.js';
import { markLoad } from '../engine/load-timing.js';

markLoad('page-modules');

const FILTERS = {
  all: () => true,
  homes: (kind) => kind === 'house',
  office: (kind) => kind === 'office',
  retail: (kind) => kind === 'shop'
};
const KIND_LABEL = { house: 'Home', office: 'Office', shop: 'Retail', mixed: 'Mixed use' };

/**
 * Escapes text for HTML.
 * @param {unknown} text
 * @returns {string}
 */
function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const params = new URLSearchParams(window.location.search);
const still = params.get('still') === '1';
const forcedQuality = ['high', 'medium', 'low'].includes(params.get('quality')) ? params.get('quality') : null;
const gallery = document.querySelector('[data-gallery]');
const galleryEmpty = document.querySelector('[data-gallery-empty]');
const filters = document.querySelector('[data-filters]');
const studioRoot = document.querySelector('[data-studio]');
const studioSection = document.getElementById('studio');
let studio = null;
let currentId = null;
let filter = 'all';

const panelHead = document.createElement('div');
panelHead.className = 'vis-panel-head';

/**
 * Writes the property and view into the address bar without adding history entries.
 * @param {string|null} view
 */
function writeUrl(view) {
  const next = new URLSearchParams(window.location.search);
  if (currentId) next.set('property', currentId);
  if (view) next.set('view', view);
  else next.delete('view');
  window.history.replaceState(null, '', `${window.location.pathname}?${next.toString()}${window.location.hash}`);
}

/**
 * View id for the address bar.
 * @param {{ mode: string, room: string|null }} view
 * @returns {string}
 */
function viewId(view) {
  return view.mode === 'room' ? `room:${view.room}` : view.mode;
}

/** Draws the gallery cards for the current filter. */
function renderGallery() {
  const list = CATALOGUE.filter((entry) => FILTERS[filter](entry.kind));
  galleryEmpty.hidden = CATALOGUE.length > 0;
  gallery.innerHTML = list.map((entry) => `
    <button type="button" class="vis-card" data-property="${esc(entry.id)}" aria-pressed="${entry.id === currentId}">
      <span class="vis-card-media"><img src="${esc(entry.still)}" alt="" loading="lazy" decoding="async" width="1600" height="1000"></span>
      <span class="vis-card-body">
        <span class="vis-card-kind">${esc(KIND_LABEL[entry.kind] || entry.kind)}</span>
        <span class="vis-card-name">${esc(entry.name)}</span>
        <span class="vis-card-blurb">${esc(entry.blurb)}</span>
      </span>
    </button>`).join('');
  gallery.querySelectorAll('img').forEach((img) => {
    img.addEventListener('error', () => img.closest('.vis-card-media').classList.add('is-missing'), { once: true });
  });
}

/**
 * Fills the panel header with the property's name and description.
 * @param {object} entry catalogue entry
 */
function renderPanelHead(entry) {
  panelHead.innerHTML = `
    <p class="eyebrow">${esc(KIND_LABEL[entry.kind] || entry.kind)}</p>
    <h2 class="vis-panel-title">${esc(entry.name)}</h2>
    <p class="vis-panel-blurb">${esc(entry.blurb)}</p>`;
}

/**
 * Loads a property into the studio (mounting the studio the first time).
 * @param {object} entry catalogue entry
 * @param {string|null} view view to open
 * @returns {Promise<void>}
 */
async function open(entry, view) {
  currentId = entry.id;
  renderGallery();
  renderPanelHead(entry);
  writeUrl(view);
  const building = await entry.load();
  markLoad('property-data');
  if (!studio) {
    studio = mountStudio(studioRoot, {
      building,
      view: view || undefined,
      quality: still ? 'high' : forcedQuality || 'auto',
      interactive: !still,
      headerSlot: panelHead,
      onView(next) {
        if (!still) writeUrl(viewId(next));
      }
    });
    await studio.ready;
  } else {
    await studio.load(building, undefined, view || undefined);
  }
  if (studio.viewer && params.get('light')) studio.viewer.setLight(params.get('light'));
}

filters.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-filter]');
  if (!button) return;
  filter = button.dataset.filter;
  filters.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
  renderGallery();
});

gallery.addEventListener('click', (event) => {
  const card = event.target.closest('button[data-property]');
  if (!card) return;
  const entry = findProperty(card.dataset.property);
  if (!entry || entry.id === currentId) {
    studioSection.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    return;
  }
  studioSection.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  open(entry, null).catch((error) => console.error(error));
});

/** Starts the page. */
async function start() {
  if (still) document.body.classList.add('is-still');
  renderGallery();
  const entry = findProperty(params.get('property')) || CATALOGUE[0];
  if (!entry) {
    studioSection.hidden = true;
    if (still) window.__amcoReady = true;
    return;
  }
  try {
    await open(entry, params.get('view'));
    if (still && studio && studio.viewer) {
      await studio.viewer.rendered();
      await studio.viewer.rendered();
    }
  } catch (error) {
    console.error(error);
    if (still) window.__amcoError = String(error && error.message);
  }
  if (still) window.__amcoReady = true;
}

start();
