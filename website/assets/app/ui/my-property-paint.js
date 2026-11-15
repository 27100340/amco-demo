/**
 * Step 4, paint: the same 3D studio as the visualiser, loaded with the customer's model and
 * saved paint, with "Back to review", "Send to Amco on WhatsApp" (rooms, shades and litres) and
 * "Export project" in the studio's panel header.
 */
import { mountStudio } from './studio.js';
import { amco, data } from '../legacy.js';
import { esc } from '../editor/dom.js';
import { icon } from './my-property-icons.js';
import { roomPolygons } from '../model/surfaces.js';
import { polygonArea } from '../model/geometry.js';

const DEFAULT_PRODUCT = 'aqueous-matt';
/** Room uses that get a view tab, most important first; other rooms are reached from the wall list. */
const TAB_USES = ['living', 'lounge', 'drawing', 'dining', 'kitchen', 'bedroom', 'study', 'reception', 'office', 'meeting', 'shop', 'cafe'];
/** Most room tabs shown above the 3D view. */
const MAX_ROOM_TABS = 5;
const COATS = 2;
const KIND_LABEL = { house: 'house', office: 'office', shop: 'shop' };

/**
 * One decimal, British style.
 * @param {number} value
 * @returns {string}
 */
function num(value) {
  return (Math.round(value * 10) / 10).toLocaleString('en-GB');
}

/**
 * Plural helper.
 * @param {number} n
 * @param {string} word
 * @returns {string}
 */
function count(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * The WhatsApp message: the property, each room's shades, and the paint needed.
 * @param {object} project
 * @param {object[]} groups `viewer.getGroups()` rows
 * @param {{ totalLitres: number, tins: { pack: { label: string }, count: number }[] }|null} estimate
 * @param {string|null} productName
 * @returns {string}
 */
function whatsappMessage(project, groups, estimate, productName) {
  const lines = [
    'Assalam o alaikum. I have painted my property in the Amco 3D visualiser.',
    '',
    `Property: ${project.name} (${KIND_LABEL[project.kind] ?? project.kind}, ${count(project.floors, 'floor')})`
  ];
  const painted = groups.filter((g) => g.code);
  if (!painted.length) {
    lines.push('', 'I haven\'t chosen my shades yet. Please help me choose.');
  } else {
    const rooms = new Map();
    for (const g of painted) {
      const room = g.roomName || 'Outside';
      if (!rooms.has(room)) rooms.set(room, new Map());
      const shades = rooms.get(room);
      const key = `${g.code}|${g.finish}`;
      if (!shades.has(key)) shades.set(key, { code: g.code, name: g.shadeName || g.code, finish: g.finish || 'matt', walls: 0 });
      shades.get(key).walls += 1;
    }
    lines.push('', 'Rooms and shades:');
    for (const [room, shades] of rooms) {
      const list = [...shades.values()].map((s) => `${s.name} ${s.code}, ${s.finish}, ${count(s.walls, 'wall')}`);
      lines.push(`- ${room}: ${list.join('; ')}`);
    }
    if (estimate && estimate.totalLitres > 0) {
      const tins = (estimate.tins ?? []).map((t) => `${t.count} ${t.pack.label}${t.count > 1 ? 's' : ''}`).join(', ');
      lines.push('', `Paint needed: about ${num(estimate.totalLitres)} litres${productName ? ` of ${productName}` : ''} for ${COATS} coats${tins ? ` (${tins})` : ''}.`);
    }
  }
  lines.push('', 'Please confirm the price and my nearest dealer.');
  return lines.join('\n');
}

/**
 * The building with a short list of view tabs: outside, dollhouse and the main rooms, largest
 * first within each kind of room (customer models have no views of their own, and a tab for
 * every bath and stair crowds the 3D view). The stored building is not changed.
 * @param {object} building
 * @returns {object}
 */
function withViews(building) {
  if (Array.isArray(building.views) && building.views.length) return building;
  const rank = (room) => TAB_USES.indexOf(room.use);
  const order = new Map([...building.levels].sort((a, b) => a.elevation - b.elevation).map((l, i) => [l.id, i]));
  let shapes = new Map();
  try {
    shapes = roomPolygons(building);
  } catch (error) {
    console.error(error);
  }
  const area = (room) => (shapes.get(room.id) ? Math.abs(polygonArea(shapes.get(room.id))) : 0);
  const main = building.rooms.filter((r) => rank(r) >= 0)
    .sort((a, b) => rank(a) - rank(b) || area(b) - area(a))
    .slice(0, MAX_ROOM_TABS)
    .sort((a, b) => (order.get(a.level) ?? 0) - (order.get(b.level) ?? 0) || building.rooms.indexOf(a) - building.rooms.indexOf(b));
  const named = new Map();
  for (const r of main) named.set(r.name, (named.get(r.name) ?? 0) + 1);
  const levelName = (id) => building.levels.find((l) => l.id === id)?.name ?? id;
  const views = [
    { id: 'exterior', label: 'Outside', mode: 'exterior' },
    { id: 'dollhouse', label: 'Dollhouse', mode: 'dollhouse' },
    ...main.map((r) => ({ id: `room:${r.id}`, label: named.get(r.name) > 1 ? `${r.name} (${levelName(r.level)})` : r.name, mode: 'room', room: r.id, level: r.level }))
  ];
  return { ...building, views };
}

/**
 * Mounts step 4.
 * @param {HTMLElement} root
 * @param {{ onPaint: (state: object) => void, onSave: (state: object, look: object) => void, onBack: () => void, onExport: () => void }} options
 * @returns {{ show: (project: object, options: { paint: object, version: number, view?: string }) => Promise<void> }}
 */
export function createPaintStep(root, { onPaint, onSave, onBack, onExport }) {
  let studio = null;
  let loaded = -1;
  let project = null;
  let frame = 0;
  const head = document.createElement('div');
  head.className = 'mp-paint-head';
  const host = document.createElement('div');
  root.append(host);

  const productId = () => studio?.getProduct?.() || DEFAULT_PRODUCT;

  function refreshLink() {
    frame = 0;
    const link = head.querySelector('[data-whatsapp]');
    if (!link || !project || !amco) return;
    const viewer = studio?.viewer;
    const id = productId();
    const product = data && data.product ? data.product(id) : null;
    const groups = viewer ? viewer.getGroups() : [];
    const estimate = viewer ? viewer.estimate(id) : null;
    link.href = amco.whatsappLink(whatsappMessage(project, groups, estimate, product ? product.name : null));
  }

  function scheduleLink() {
    if (!frame) frame = requestAnimationFrame(refreshLink);
  }

  function renderHead() {
    head.innerHTML = `
      <p class="eyebrow">Your property</p>
      <h2 class="mp-paint-title">${esc(project.name)}</h2>
      <p class="mp-paint-text">Choose a wall, then a shade. Everything you paint is saved in this browser as you go.</p>
      <div class="mp-paint-actions">
        <button class="btn btn-ghost btn-sm" type="button" data-back>${icon('arrowLeft')}<span>Back to review</span></button>
        <a class="btn btn-wa btn-sm" data-whatsapp target="_blank" rel="noopener" href="#">Send to Amco on WhatsApp</a>
        <button class="btn btn-ghost btn-sm" type="button" data-export>${icon('download')}<span>Export project</span></button>
      </div>`;
  }

  head.addEventListener('click', (event) => {
    if (event.target.closest('[data-whatsapp]')) refreshLink();
    else if (event.target.closest('[data-back]')) onBack();
    else if (event.target.closest('[data-export]')) onExport();
  });
  host.addEventListener('change', (event) => {
    if (event.target.matches('[data-product]')) scheduleLink();
  });

  return {
    /**
     * Shows the studio with the project's model; the model is rebuilt only when it changed.
     * @param {object} next project with a building
     * @param {{ paint: object, version: number, view?: string }} options paint for the surfaces
     *   that exist, the model version, and an optional view to open ('dollhouse')
     * @returns {Promise<void>}
     */
    async show(next, { paint, version, view }) {
      project = next;
      renderHead();
      if (!studio) {
        loaded = version;
        studio = mountStudio(host, {
          building: withViews(project.building),
          paintState: paint,
          view,
          headerSlot: head,
          onChange(state) {
            onPaint(state);
            scheduleLink();
          },
          onSave(state, look) {
            onSave(state, look);
          }
        });
        try {
          await studio.ready;
        } catch (error) {
          console.error(error);
        }
      } else if (version !== loaded) {
        loaded = version;
        try {
          await studio.load(withViews(project.building), paint, view);
        } catch (error) {
          console.error(error);
        }
      } else if (view && studio.viewer) {
        studio.viewer.setView(view);
      }
      refreshLink();
    }
  };
}
