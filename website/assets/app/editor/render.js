/**
 * Draws the plan into a view (browser only): backdrop, rooms, wall poché with openings cut out,
 * door and window symbols, the site, and the screen-space overlay (labels, handles, tool previews).
 */
import { wallFootprints, polygonCentroid } from '../model/geometry.js';
import { formatLength } from '../model/units.js';
import { polygonPath, polylinePath, openingSymbol, formatArea, gateGeometry } from './drawing.js';
import { isUnnamedRoom } from './model-ops.js';
import { esc } from './dom.js';
import { boundsOf } from './view.js';

/** Extra width (m) of the rectangle cut from the poché so no hairline is left at the faces. */
const CUT_BLEED = 0.003;
/** Screen scale (px per metre) above which opening tags are shown. */
const TAG_SCALE = 34;
/** Room labels need at least this much screen width (px) for the name, and more for the area. */
const LABEL_MIN = 28;
const LABEL_FULL = 64;
/** Rough width (px) of one label character, for the paper backing behind room labels. */
const LABEL_CHAR_PX = 7.4;

/**
 * Number formatting for SVG attributes.
 * @param {number} n
 * @returns {string}
 */
function f(n) {
  return String(Math.round(n * 100) / 100);
}

/**
 * Draws a level's backdrop.
 * @param {ReturnType<typeof import('./view.js').createView>} view
 * @param {{ kind: 'dxf', paths: ReturnType<typeof import('./drawing.js').dxfToPaths> }
 *   | { kind: 'bitmap', href: string, width: number, height: number, metresPerPixel: number, offset: [number, number] }
 *   | null} backdrop
 * @param {{ opacity: number, visible: boolean }} look
 */
export function renderBackdrop(view, backdrop, { opacity, visible }) {
  const layer = view.layers.backdrop;
  layer.style.opacity = String(opacity);
  layer.style.display = visible ? '' : 'none';
  if (!backdrop) {
    layer.innerHTML = '';
    return;
  }
  if (backdrop.kind === 'bitmap') {
    const { href, width, height, metresPerPixel: mpp, offset } = backdrop;
    const transform = `translate(${offset[0]} ${offset[1] + height * mpp}) scale(${mpp} ${-mpp})`;
    layer.innerHTML = `<image class="pe-bitmap" href="${esc(href)}" width="${width}" height="${height}" preserveAspectRatio="none" transform="${transform}"/>`;
    return;
  }
  const { layers, texts } = backdrop.paths;
  const lines = layers.map((l) => `<path class="pe-dxf" data-layer="${esc(l.layer)}" d="${l.d}"/>`).join('');
  const words = texts.map((t) => {
    const transform = `translate(${t.at[0]} ${t.at[1]}) scale(1 -1) rotate(${-t.rotationDeg})`;
    return `<text class="pe-dxf-text" font-size="${t.height || 0.15}" transform="${transform}">${esc(t.text)}</text>`;
  }).join('');
  layer.innerHTML = lines + words;
}

/**
 * Bounds covered by a backdrop, for fit-to-content.
 * @param {Parameters<typeof renderBackdrop>[1]} backdrop
 * @returns {{ min: [number, number], max: [number, number] } | null}
 */
export function backdropBounds(backdrop) {
  if (!backdrop) return null;
  if (backdrop.kind === 'bitmap') {
    const { width, height, metresPerPixel: mpp, offset } = backdrop;
    return { min: [offset[0], offset[1]], max: [offset[0] + width * mpp, offset[1] + height * mpp] };
  }
  return backdrop.paths.bounds;
}

/**
 * True when a selection or hover target refers to this item.
 * @returns {boolean}
 */
function isTarget(target, kind, id) {
  return Boolean(target) && target.kind === kind && target.id === id;
}

/**
 * Markup for the boundary wall, plot line and gates.
 * @returns {{ walls: string, cuts: string, lines: string, bounds: object | null }}
 */
function siteMarkup(site, selection, hover, faint) {
  const boundary = site?.boundary ?? [];
  if (boundary.length < 3) return { walls: '', cuts: '', lines: '', bounds: null };
  const boundaryClass = selection?.kind === 'boundary' ? ' is-selected' : hover?.kind === 'boundary' ? ' is-hover' : '';
  const lines = [`<path class="pe-plot${faint ? ' is-faint' : boundaryClass}" d="${polygonPath(boundary)}"/>`];
  if (faint) return { walls: '', cuts: '', lines: lines.join(''), bounds: null };
  const thickness = site.boundaryWall?.thickness ?? 0;
  let walls = '';
  const cuts = [];
  if (site.boundaryWall && thickness > 0) {
    const edges = boundary.map((p, i) => ({ id: `e${i}`, level: 'site', a: p, b: boundary[(i + 1) % boundary.length], thickness }));
    const fps = wallFootprints(edges);
    walls = `<path class="pe-bwall${boundaryClass}" d="${edges.map((e) => polygonPath(fps.get(e.id).polygon)).join('')}"/>`;
  }
  (site.boundaryWall?.gates ?? []).forEach((gate, index) => {
    const g = gateGeometry(boundary, gate, thickness);
    if (!g) return;
    const cls = selection?.kind === 'gate' && selection.index === index ? ' is-selected' : '';
    cuts.push(polygonPath(g.cut));
    lines.push(`<path class="pe-gate${cls}" d="${polylinePath([g.a, g.b])}"/>`);
  });
  return { walls, cuts: cuts.join(''), lines: lines.join(''), bounds: boundsOf(boundary) };
}

/**
 * Sets a mask that keeps everything inside `bounds` except the `cuts` path.
 */
function setMask(mask, bounds, cuts) {
  if (!bounds) {
    mask.innerHTML = '';
    return;
  }
  const pad = 2;
  const x = bounds.min[0] - pad;
  const y = bounds.min[1] - pad;
  const w = bounds.max[0] - bounds.min[0] + pad * 2;
  const h = bounds.max[1] - bounds.min[1] + pad * 2;
  for (const [key, value] of [['x', x], ['y', y], ['width', w], ['height', h]]) mask.setAttribute(key, String(value));
  mask.innerHTML = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>${cuts ? `<path d="${cuts}" fill="#000"/>` : ''}`;
}

/**
 * Draws the world layers for the current level (or the site).
 * @param {ReturnType<typeof import('./view.js').createView>} view
 * @param {{
 *   building: import('../model/schema.js').Building, levelId: string,
 *   plan: ReturnType<typeof import('./model-ops.js').levelPlan> | null,
 *   rooms: ReturnType<typeof import('./hit.js').levelRooms>,
 *   ghost: [number, number][][], ghostFaces?: [number, number][][], selection: object | null, hover: object | null, showPlot: boolean
 * }} scene
 */
export function renderPlan(view, scene) {
  const { building, levelId, plan, rooms, ghost, ghostFaces = [], selection, hover } = scene;
  const isSite = levelId === 'site';
  const faces = ghostFaces.length ? `<path class="pe-footprint-fill" d="${ghostFaces.map(polygonPath).join('')}"/>` : '';
  view.layers.ghost.innerHTML = ghost.length
    ? `${faces}<path class="${isSite ? 'pe-footprint' : 'pe-ghost'}" d="${ghost.map(polygonPath).join('')}"/>`
    : '';

  const site = siteMarkup(building.site, selection, hover, !isSite);
  view.layers.site.innerHTML = isSite || scene.showPlot
    ? `<g mask="url(#${view.siteMaskId})">${site.walls}</g>${site.lines}`
    : '';
  setMask(view.siteMask, site.bounds, site.cuts);

  if (isSite || !plan) {
    view.layers.rooms.innerHTML = '';
    view.layers.walls.innerHTML = '';
    view.layers.openings.innerHTML = '';
    setMask(view.wallMask, null, '');
    return;
  }

  view.layers.rooms.innerHTML = rooms.map(({ room, polygon }) => {
    const cls = [
      'pe-room',
      isUnnamedRoom(room) ? 'is-unnamed' : '',
      isTarget(selection, 'room', room.id) ? 'is-selected' : isTarget(hover, 'room', room.id) ? 'is-hover' : ''
    ].filter(Boolean).join(' ');
    return `<path class="${cls}" d="${polygonPath(polygon)}"/>`;
  }).join('');

  const wallParts = [];
  const cuts = [];
  const openings = [];
  const points = [];
  for (const { piece, wallId } of plan.pieces) {
    const fp = plan.footprints.get(piece.id);
    points.push(...fp.polygon);
    const state = isTarget(selection, 'wall', wallId) ? ' is-selected' : isTarget(hover, 'wall', wallId) ? ' is-hover' : '';
    wallParts.push(`<path class="pe-wall${state}" d="${polygonPath(fp.polygon)}"/>`);
    for (const opening of piece.openings ?? []) {
      const sym = openingSymbol({ a: piece.a, b: piece.b, thickness: piece.thickness + CUT_BLEED * 2 }, opening);
      cuts.push(polygonPath(sym.cut));
      const drawn = openingSymbol(piece, opening);
      const ostate = isTarget(selection, 'opening', opening.id) ? ' is-selected' : isTarget(hover, 'opening', opening.id) ? ' is-hover' : '';
      const lines = drawn.lines.map((l) => polylinePath(l)).join('');
      const dashed = drawn.dashed.map((l) => polylinePath(l)).join('');
      openings.push(`<g class="pe-op pe-op-${esc(opening.type)}${ostate}">`
        + `<path class="pe-op-hit" d="${polygonPath(drawn.cut)}"/>`
        + (drawn.arc ? `<path class="pe-op-swing" d="${polylinePath(drawn.arc)}"/>` : '')
        + `<path class="pe-op-line" d="${lines}"/>`
        + (dashed ? `<path class="pe-op-dash" d="${dashed}"/>` : '')
        + '</g>');
    }
  }
  view.layers.walls.innerHTML = wallParts.join('');
  view.layers.openings.innerHTML = openings.join('');
  setMask(view.wallMask, boundsOf(points), cuts.join(''));
}

/**
 * Screen-space markup for one tool overlay shape.
 * @param {ReturnType<typeof import('./view.js').createView>} view
 * @param {object} shape
 * @returns {string}
 */
function shapeMarkup(view, shape) {
  const S = (p) => view.toScreen(p);
  const cls = shape.cls ? ` ${shape.cls}` : '';
  switch (shape.type) {
    case 'line': {
      const [a, b] = [S(shape.a), S(shape.b)];
      return `<line class="pe-o-line${cls}" x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}"/>`;
    }
    case 'polyline':
    case 'poly': {
      const pts = shape.points.map(S);
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`).join('') + (shape.type === 'poly' || shape.closed ? 'Z' : '');
      return `<path class="${shape.type === 'poly' ? 'pe-o-fill' : 'pe-o-line'}${cls}" d="${d}"/>`;
    }
    case 'guide': {
      const p = S(shape.at);
      const reach = view.width + view.height;
      const dx = shape.dir[0] * reach;
      const dy = -shape.dir[1] * reach;
      return `<line class="pe-o-guide${cls}" x1="${f(p[0] - dx)}" y1="${f(p[1] - dy)}" x2="${f(p[0] + dx)}" y2="${f(p[1] + dy)}"/>`;
    }
    case 'marker': {
      const [x, y] = S(shape.at);
      if (shape.kind === 'endpoint') return `<rect class="pe-o-snap${cls}" x="${f(x - 6)}" y="${f(y - 6)}" width="12" height="12"/>`;
      if (shape.kind === 'wall') return `<path class="pe-o-snap${cls}" d="M${f(x)} ${f(y - 7)}L${f(x + 7)} ${f(y)}L${f(x)} ${f(y + 7)}L${f(x - 7)} ${f(y)}Z"/>`;
      if (shape.kind === 'ortho') return `<path class="pe-o-snap is-ortho${cls}" d="M${f(x - 6)} ${f(y)}H${f(x + 6)}M${f(x)} ${f(y - 6)}V${f(y + 6)}"/>`;
      return `<circle class="pe-o-dot${cls}" cx="${f(x)}" cy="${f(y)}" r="3"/>`;
    }
    case 'handle': {
      const [x, y] = S(shape.at);
      return `<rect class="pe-o-handle${cls}" x="${f(x - 5)}" y="${f(y - 5)}" width="10" height="10"/>`;
    }
    case 'dot': {
      const [x, y] = S(shape.at);
      return `<circle class="pe-o-dot${cls}" cx="${f(x)}" cy="${f(y)}" r="${shape.r ?? 3.5}"/>`;
    }
    case 'label': {
      const [x, y] = S(shape.at);
      const anchor = shape.anchor ?? 'middle';
      return `<text class="pe-o-label${cls}" x="${f(x + (shape.dx ?? 0))}" y="${f(y + (shape.dy ?? 0))}" text-anchor="${anchor}">${esc(shape.text)}</text>`;
    }
    case 'dimension': {
      const a = S(shape.a);
      const b = S(shape.b);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      let nx = (a[1] - b[1]) / len;
      let ny = (b[0] - a[0]) / len;
      if (ny > 1e-6 || (Math.abs(ny) <= 1e-6 && nx < 0)) {
        nx = -nx;
        ny = -ny;
      }
      const gap = (shape.offset ?? 0) * view.scale + 10;
      const x = (a[0] + b[0]) / 2 + nx * gap;
      const y = (a[1] + b[1]) / 2 + ny * gap + (Math.abs(ny) < 0.5 ? 4 : 0);
      const anchor = nx > 0.5 ? 'start' : nx < -0.5 ? 'end' : 'middle';
      return `<text class="pe-o-label${cls}" x="${f(x)}" y="${f(y)}" text-anchor="${anchor}">${esc(shape.text)}</text>`;
    }
    case 'symbol': {
      const sym = openingSymbol(shape.wall, shape.opening);
      const cut = sym.cut.map(S);
      const line = (l) => l.map(S).map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`).join('');
      return `<g class="pe-o-symbol${cls}">`
        + `<path class="pe-o-cut" d="${line(cut)}Z"/>`
        + `<path class="pe-o-symline" d="${[...sym.lines, ...(sym.arc ? [sym.arc] : []), ...sym.dashed].map(line).join('')}"/>`
        + '</g>';
    }
    default:
      return '';
  }
}

/**
 * Room name, area and "Name this room" flag in screen space.
 * @returns {string}
 */
function roomLabels(view, rooms, units) {
  return rooms.map(({ room, polygon, area }) => {
    const at = Array.isArray(room.at) ? room.at : polygonCentroid(polygon);
    const box = boundsOf(polygon);
    const widthPx = (box.max[0] - box.min[0]) * view.scale;
    if (widthPx < LABEL_MIN) return '';
    const [x, y] = view.toScreen(at);
    const unnamed = isUnnamedRoom(room);
    const full = widthPx >= LABEL_FULL;
    const areaText = formatArea(area, units);
    const lines = [`<text class="pe-o-room-name" x="${f(x)}" y="${f(y - (full ? 4 : -4))}">${esc(room.name)}</text>`];
    if (full) lines.push(`<text class="pe-o-room-area" x="${f(x)}" y="${f(y + 12)}">${esc(areaText)}</text>`);
    if (full && unnamed) lines.push(`<text class="pe-o-flag" x="${f(x)}" y="${f(y + 28)}">Name this room</text>`);
    const chars = Math.max(room.name.length, full ? areaText.length : 0, full && unnamed ? 15 : 0);
    const w = Math.min(widthPx - 8, chars * LABEL_CHAR_PX + 12);
    const top = y - (full ? 18 : 10);
    const h = full ? (unnamed ? 50 : 34) : 18;
    const backing = `<rect class="pe-o-room-back" x="${f(x - w / 2)}" y="${f(top)}" width="${f(w)}" height="${h}" rx="3"/>`;
    return `<g class="pe-o-room${unnamed ? ' is-unnamed' : ''}">${backing}${lines.join('')}</g>`;
  }).join('');
}

/**
 * Schedule tags beside openings, on the wall's right-hand side, when zoomed in.
 * @returns {string}
 */
function openingTags(view, plan) {
  if (!plan || view.scale < TAG_SCALE) return '';
  const out = [];
  for (const { piece } of plan.pieces) {
    const dx = piece.b[0] - piece.a[0];
    const dy = piece.b[1] - piece.a[1];
    const len = Math.hypot(dx, dy) || 1;
    const u = [dx / len, dy / len];
    const r = [u[1], -u[0]];
    for (const o of piece.openings ?? []) {
      if (!o.tag) continue;
      const off = piece.thickness / 2 + 12 / view.scale;
      const at = [piece.a[0] + u[0] * o.at + r[0] * off, piece.a[1] + u[1] * o.at + r[1] * off];
      const [x, y] = view.toScreen(at);
      out.push(`<text class="pe-o-tag" x="${f(x)}" y="${f(y + 4)}">${esc(o.tag)}</text>`);
    }
  }
  return out.join('');
}

/**
 * Length label for the selected wall.
 * @returns {string}
 */
function selectedWallLabel(view, building, selection, units) {
  if (!selection || selection.kind !== 'wall') return '';
  const wall = building.walls.find((w) => w.id === selection.id);
  if (!wall) return '';
  const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  const ends = [wall.a, wall.b].map((p) => shapeMarkup(view, { type: 'handle', at: p })).join('');
  const label = shapeMarkup(view, { type: 'dimension', a: wall.a, b: wall.b, offset: wall.thickness / 2, text: formatLength(len, units), cls: 'is-strong' });
  return ends + label;
}

/**
 * Draws the screen-space overlay.
 * @param {ReturnType<typeof import('./view.js').createView>} view
 * @param {{ building: object, levelId: string, plan: object | null, rooms: object[], selection: object | null, units: 'imperial'|'metric' }} scene
 * @param {object[]} shapes tool overlay shapes in plan metres
 */
export function renderOverlay(view, scene, shapes) {
  const parts = [];
  if (scene.levelId !== 'site') {
    parts.push(roomLabels(view, scene.rooms, scene.units));
    parts.push(openingTags(view, scene.plan));
    parts.push(selectedWallLabel(view, scene.building, scene.selection, scene.units));
  }
  for (const shape of shapes) parts.push(shapeMarkup(view, shape));
  view.overlay.innerHTML = parts.join('');
}
