/**
 * Plan drawing helpers for the editor: DXF backdrop entities to SVG path data, door and window
 * symbols, polygon paths and area labels. Everything is in plan metres (y north).
 * Pure module: no DOM, no three.js.
 */
import { add, scale, sub, normalize, leftNormal } from '../model/geometry.js';

/** Largest angle (degrees) between samples when arcs and circles become polylines. */
const ARC_STEP = 7.5;
/** Square feet per square metre. */
const SQFT_PER_SQM = 1 / (0.3048 * 0.3048);

/**
 * Formats a coordinate for path data: at most 4 decimals, no "-0".
 * @param {number} n
 * @returns {string}
 */
function num(n) {
  return String(Number(n.toFixed(4)) + 0);
}

/**
 * True when `p` is an `[x, y]` pair of finite numbers.
 * @param {unknown} p
 * @returns {boolean}
 */
function isPoint(p) {
  return Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
}

/**
 * Path data for an open or closed polyline.
 * @param {[number, number][]} points
 * @param {boolean} [closed=false]
 * @returns {string}
 */
export function polylinePath(points, closed = false) {
  if (!points || points.length === 0) return '';
  const body = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${num(p[0])} ${num(p[1])}`).join('');
  return closed ? `${body}Z` : body;
}

/**
 * Path data for a closed polygon.
 * @param {[number, number][]} points
 * @returns {string}
 */
export function polygonPath(points) {
  return points && points.length >= 3 ? polylinePath(points, true) : '';
}

/**
 * Samples an anticlockwise arc into points.
 * @param {[number, number]} center
 * @param {number} radius
 * @param {number} startDeg
 * @param {number} endDeg reached anticlockwise from `startDeg`
 * @returns {[number, number][]}
 */
export function arcPoints(center, radius, startDeg, endDeg) {
  let sweep = endDeg - startDeg;
  while (sweep <= 0) sweep += 360;
  while (sweep > 360) sweep -= 360;
  const steps = Math.max(4, Math.ceil(sweep / ARC_STEP));
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((startDeg + (sweep * i) / steps) * Math.PI) / 180;
    points.push([center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a)]);
  }
  return points;
}

/**
 * Converts one DXF entity to plan-metre points.
 * @returns {{ points: [number, number][], closed: boolean } | null}
 */
function entityShape(entity, place, factor) {
  switch (entity.type) {
    case 'LINE':
      return isPoint(entity.a) && isPoint(entity.b) ? { points: [place(entity.a), place(entity.b)], closed: false } : null;
    case 'POLY': {
      const pts = Array.isArray(entity.points) ? entity.points.filter(isPoint) : [];
      return pts.length >= 2 ? { points: pts.map(place), closed: Boolean(entity.closed) } : null;
    }
    case 'ARC':
      if (!isPoint(entity.center) || !(entity.radius > 0)) return null;
      return {
        points: arcPoints(place(entity.center), entity.radius * factor, entity.startDeg ?? 0, entity.endDeg ?? 360),
        closed: false
      };
    case 'CIRCLE':
      if (!isPoint(entity.center) || !(entity.radius > 0)) return null;
      return { points: arcPoints(place(entity.center), entity.radius * factor, 0, 360).slice(0, -1), closed: true };
    default:
      return null;
  }
}

/**
 * Turns DXF backdrop entities (drawing units) into one path per layer in plan metres:
 * `metres = units × factor + offset`. LINE, POLY, ARC and CIRCLE become path data; TEXT is
 * returned separately; INSERT and unknown entities are skipped (blocks arrive already expanded).
 * @param {object[]} entities Track C entity shapes
 * @param {number} [factor=1] metres per drawing unit
 * @param {[number, number]} [offset=[0, 0]] metres added after scaling
 * @returns {{
 *   layers: { layer: string, d: string }[],
 *   texts: { layer: string, at: [number, number], text: string, height: number, rotationDeg: number }[],
 *   bounds: { min: [number, number], max: [number, number] } | null
 * }}
 */
export function dxfToPaths(entities, factor = 1, offset = [0, 0]) {
  const place = (p) => [p[0] * factor + offset[0], p[1] * factor + offset[1]];
  const byLayer = new Map();
  const texts = [];
  const min = [Infinity, Infinity];
  const max = [-Infinity, -Infinity];
  const grow = (p) => {
    min[0] = Math.min(min[0], p[0]);
    min[1] = Math.min(min[1], p[1]);
    max[0] = Math.max(max[0], p[0]);
    max[1] = Math.max(max[1], p[1]);
  };
  for (const entity of entities ?? []) {
    if (!entity || typeof entity !== 'object') continue;
    const layer = String(entity.layer ?? '0');
    if (entity.type === 'TEXT') {
      if (!isPoint(entity.at) || !entity.text) continue;
      const at = place(entity.at);
      grow(at);
      texts.push({ layer, at, text: String(entity.text), height: (entity.height ?? 0) * factor, rotationDeg: entity.rotationDeg ?? 0 });
      continue;
    }
    const shape = entityShape(entity, place, factor);
    if (!shape || !shape.points.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))) continue;
    shape.points.forEach(grow);
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer).push(polylinePath(shape.points, shape.closed));
  }
  const layers = [...byLayer.entries()].map(([layer, parts]) => ({ layer, d: parts.join('') }));
  const bounds = Number.isFinite(min[0]) ? { min, max } : null;
  return { layers, texts, bounds };
}

/**
 * Plan symbol for an opening on a (noded) wall piece. `cut` is the rectangle removed from the
 * wall poché; `lines` and `dashed` are segments; `arc` is the door swing (null for other types).
 * Doors hinge on the jamb nearer the wall's a end and swing to its left (L) side.
 * @param {{ a: [number, number], b: [number, number], thickness: number }} wall
 * @param {{ type: string, at: number, width: number }} opening
 * @returns {{ cut: [number, number][], lines: [number, number][][], dashed: [number, number][][], arc: [number, number][] | null }}
 */
export function openingSymbol(wall, opening) {
  const u = normalize(sub(wall.b, wall.a));
  const n = leftNormal(u);
  const h = (wall.thickness ?? 0) / 2;
  const s0 = opening.at - opening.width / 2;
  const s1 = opening.at + opening.width / 2;
  const p = (s, off) => add(add(wall.a, scale(u, s)), scale(n, off));
  const cut = [p(s0, -h), p(s1, -h), p(s1, h), p(s0, h)];
  const jambs = [[p(s0, -h), p(s0, h)], [p(s1, -h), p(s1, h)]];
  switch (opening.type) {
    case 'door': {
      const hinge = p(s0, h);
      const tip = p(s0, h + opening.width);
      const startDeg = (Math.atan2(n[1], n[0]) * 180) / Math.PI;
      const arc = arcPoints(hinge, opening.width, startDeg - 90, startDeg).reverse();
      return { cut, lines: [...jambs, [hinge, tip]], dashed: [], arc };
    }
    case 'window':
    case 'shopfront':
      return { cut, lines: [[p(s0, -h), p(s1, -h)], [p(s0, 0), p(s1, 0)], [p(s0, h), p(s1, h)], ...jambs], dashed: [], arc: null };
    default:
      return { cut, lines: jambs, dashed: [[p(s0, 0), p(s1, 0)]], arc: null };
  }
}

/**
 * Where a gate sits on the plot boundary: the boundary edge nearest its centre, the gap's two
 * ends along that edge, and the rectangle to cut from a boundary wall of `thickness`.
 * @param {[number, number][]} boundary closed polygon
 * @param {{ at: [number, number], width: number }} gate
 * @param {number} thickness boundary wall thickness (0 when there is no wall)
 * @returns {{ edge: number, a: [number, number], b: [number, number], cut: [number, number][], dir: [number, number] } | null}
 */
export function gateGeometry(boundary, gate, thickness) {
  if (!Array.isArray(boundary) || boundary.length < 2 || !isPoint(gate?.at)) return null;
  let best = null;
  for (let i = 0; i < boundary.length; i++) {
    const p = boundary[i];
    const q = boundary[(i + 1) % boundary.length];
    const d = sub(q, p);
    const len2 = d[0] * d[0] + d[1] * d[1];
    if (len2 === 0) continue;
    const t = Math.min(1, Math.max(0, ((gate.at[0] - p[0]) * d[0] + (gate.at[1] - p[1]) * d[1]) / len2));
    const foot = add(p, scale(d, t));
    const dist = Math.hypot(gate.at[0] - foot[0], gate.at[1] - foot[1]);
    if (!best || dist < best.dist) best = { edge: i, dir: normalize(d), foot, dist };
  }
  if (!best) return null;
  const half = gate.width / 2;
  const n = leftNormal(best.dir);
  const h = thickness / 2 + 0.002;
  const a = add(best.foot, scale(best.dir, -half));
  const b = add(best.foot, scale(best.dir, half));
  const cut = [add(a, scale(n, -h)), add(b, scale(n, -h)), add(b, scale(n, h)), add(a, scale(n, h))];
  return { edge: best.edge, a, b, cut, dir: best.dir };
}

/**
 * Formats a floor area: whole square feet, or square metres to one decimal.
 * @param {number} squareMetres
 * @param {'imperial'|'metric'} system
 * @returns {string}
 */
export function formatArea(squareMetres, system) {
  if (!Number.isFinite(squareMetres)) return '';
  return system === 'metric'
    ? `${squareMetres.toFixed(1)} m²`
    : `${Math.round(squareMetres * SQFT_PER_SQM)} ft²`;
}
