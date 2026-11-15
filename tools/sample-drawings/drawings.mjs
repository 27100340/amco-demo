/**
 * The sample drawing set, generated from the sample house model: floor plans, sections A-A and
 * B-B, working drawings A-A and B-B (section, elevation and door & window schedule) and the site
 * layout. Each sheet is a list of drawing items in model millimetres that is written both as an
 * R12 DXF (dxf-writer.mjs) and as an A3 SVG (svg-sheet.mjs), so the DXF and PDF always match.
 */
import {
  sampleHouse, SAMPLE_SCHEDULE, PLAN_ORIGIN, SECTION_CUTS, PLINTH, PLAN_LABELS, PLOT, roomLabels, ft, NINE_INCH
} from './sample-house.js';
import { createDxf } from './dxf-writer.mjs';
import {
  add, sub, scale, dot, cross, normalize, leftNormal, distance, nodeWalls, wallFootprints, pointInPolygon
} from '../../website/assets/app/model/geometry.js';
import { roomPolygons } from '../../website/assets/app/model/surfaces.js';

const MM = 1000;
/** A3 landscape paper size (mm) and the drawing area left of the title block. */
export const PAPER = { width: 420, height: 297 };
const AREA = { x0: 14, y0: 8, x1: 342, y1: 289 };
const PROJECT = 'SAMPLE HOUSE - 10 MARLA, DHA LAHORE';

/**
 * Layer styles: ACI colour and linetype for the DXF, pen weight (paper mm) for the PDF.
 * Names follow AIA/NCS so the importer's alias table recognises them.
 */
export const LAYERS = {
  'A-WALL': { color: 7, linetype: 'CONTINUOUS', weight: 0.5 },
  'A-WALL-PRHT': { color: 7, linetype: 'CONTINUOUS', weight: 0.4 },
  'A-DOOR': { color: 2, linetype: 'CONTINUOUS', weight: 0.2 },
  'A-DOOR-IDEN': { color: 2, linetype: 'CONTINUOUS', weight: 0.18 },
  'A-GLAZ': { color: 4, linetype: 'CONTINUOUS', weight: 0.2 },
  'A-GLAZ-IDEN': { color: 4, linetype: 'CONTINUOUS', weight: 0.18 },
  'A-AREA-IDEN': { color: 3, linetype: 'CONTINUOUS', weight: 0.18 },
  'A-FLOR-STRS': { color: 8, linetype: 'CONTINUOUS', weight: 0.18 },
  'A-FLOR-OTLN': { color: 8, linetype: 'DASHED', weight: 0.18 },
  'A-FLOR-PFIX': { color: 8, linetype: 'CONTINUOUS', weight: 0.13 },
  'A-FURN': { color: 8, linetype: 'CONTINUOUS', weight: 0.13 },
  'A-ANNO-SECT': { color: 1, linetype: 'CENTER', weight: 0.35 },
  'A-ANNO-SYMB': { color: 1, linetype: 'CONTINUOUS', weight: 0.25 },
  'A-ANNO-DIMS': { color: 6, linetype: 'CONTINUOUS', weight: 0.13 },
  'A-ANNO-NOTE': { color: 7, linetype: 'CONTINUOUS', weight: 0.18 },
  'A-ANNO-LEVL': { color: 1, linetype: 'CONTINUOUS', weight: 0.18 },
  'A-ANNO-SCHD': { color: 7, linetype: 'CONTINUOUS', weight: 0.18 },
  'A-ANNO-TTLB': { color: 7, linetype: 'CONTINUOUS', weight: 0.35 },
  'A-SECT-MCUT': { color: 7, linetype: 'CONTINUOUS', weight: 0.5 },
  'A-SECT-MBND': { color: 8, linetype: 'CONTINUOUS', weight: 0.18 },
  'A-ELEV-OTLN': { color: 7, linetype: 'CONTINUOUS', weight: 0.35 },
  'A-ELEV-OPEN': { color: 4, linetype: 'CONTINUOUS', weight: 0.18 },
  'C-PROP': { color: 1, linetype: 'PHANTOM', weight: 0.35 },
  'A-SITE-WALL': { color: 7, linetype: 'CONTINUOUS', weight: 0.4 },
  'A-SITE-GATE': { color: 2, linetype: 'CONTINUOUS', weight: 0.2 },
  'A-SITE-PAVE': { color: 8, linetype: 'CONTINUOUS', weight: 0.18 },
  'A-SITE-BLDG': { color: 7, linetype: 'CONTINUOUS', weight: 0.5 },
  'L-PLNT': { color: 3, linetype: 'CONTINUOUS', weight: 0.18 },
  'C-ROAD': { color: 8, linetype: 'CONTINUOUS', weight: 0.25 },
  'C-ROAD-CNTR': { color: 8, linetype: 'DASHED', weight: 0.18 }
};

/** Text heights on paper (mm). */
const TXT = { title: 6, subtitle: 4, room: 2.5, size: 1.8, tag: 2, dim: 1.8, note: 2, level: 2, small: 1.6 };

/**
 * Feet-and-inches text for a length in metres: 3.2004 → 10'-6", 0.2286 → 9", 0.1143 → 4 1/2".
 * @param {number} metres
 * @returns {string}
 */
export function ftIn(metres) {
  const halves = Math.round((Math.abs(metres) / 0.0254) * 2);
  const feet = Math.floor(halves / 24);
  const rest = halves - feet * 24;
  const inches = `${Math.floor(rest / 2)}${rest % 2 ? ' 1/2' : ''}`;
  return feet === 0 ? `${inches}"` : `${feet}'-${inches}"`;
}

/**
 * A level value with its sign: 0 → ±0'-0", 3.3528 → +11'-0", -0.4572 → -1'-6".
 * @param {number} metres
 * @returns {string}
 */
export function levelText(metres) {
  const body = ftIn(metres);
  const full = body.includes("'") ? body : `0'-${body}`;
  if (Math.abs(metres) < 1e-6) return '±0\'-0"';
  return `${metres > 0 ? '+' : '-'}${full}`;
}

/**
 * Creates an empty sheet; drawing helpers append items in model millimetres.
 * @param {{ file: string, title: string, slot: string, levelIndex?: number, section?: string, number: number, scale?: number }} meta
 * @returns {object}
 */
function createSheet(meta) {
  const sheet = { scale: 100, ...meta, items: [] };
  const push = (item) => sheet.items.push(item);
  sheet.line = (layer, a, b) => push({ kind: 'line', layer, a, b });
  sheet.poly = (layer, points, closed = false) => push({ kind: 'poly', layer, points, closed });
  sheet.rect = (layer, p, q) => sheet.poly(layer, [[p[0], p[1]], [q[0], p[1]], [q[0], q[1]], [p[0], q[1]]], true);
  sheet.arc = (layer, center, radius, startDeg, endDeg) => push({ kind: 'arc', layer, center, radius, startDeg, endDeg });
  sheet.circle = (layer, center, radius) => push({ kind: 'circle', layer, center, radius });
  sheet.text = (layer, at, height, text, rotationDeg = 0, align = {}) => push({ kind: 'text', layer, at, height, text, rotationDeg, align });
  /** Paper-size text: height in paper millimetres. */
  sheet.label = (layer, at, paperHeight, text, rotationDeg = 0, align = {}) => sheet.text(layer, at, paperHeight * sheet.scale, text, rotationDeg, align);
  sheet.fill = (style, points) => push({ kind: 'fill', style, points });
  return sheet;
}

/** Plot metres → plan millimetres (plans are drawn with the house's south-west corner at 0,0). */
const P = (p) => [(p[0] - PLAN_ORIGIN[0]) * MM, (p[1] - PLAN_ORIGIN[1]) * MM];
/** Plot feet → plan millimetres. */
const F = (x, y) => P([ft(x), ft(y)]);

/**
 * Clips a polygon to the slab lo ≤ s ≤ hi along direction d from origin o.
 * @returns {[number, number][]}
 */
function clipToSlab(poly, o, d, lo, hi) {
  const clip = (pts, keep) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const fp = keep(p);
      const fq = keep(q);
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) {
        const t = fp / (fp - fq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    return out;
  };
  const s = (p) => dot(sub(p, o), d);
  return clip(clip(poly, (p) => s(p) - lo), (p) => hi - s(p));
}

/**
 * Subtracts intervals from [lo, hi].
 * @returns {[number, number][]}
 */
function subtract(lo, hi, cuts) {
  let parts = [[lo, hi]];
  for (const [c0, c1] of cuts) {
    parts = parts.flatMap(([p0, p1]) => {
      if (c1 <= p0 || c0 >= p1) return [[p0, p1]];
      const out = [];
      if (c0 > p0) out.push([p0, c0]);
      if (c1 < p1) out.push([c1, p1]);
      return out;
    });
  }
  return parts;
}

/**
 * Footprint edges not shared with a neighbouring wall: the drawn face lines and end caps.
 * @returns {{ a: [number, number], b: [number, number], wall: object }[]}
 */
function exposedEdges(walls, footprints) {
  const edges = [];
  for (const w of walls) {
    const poly = footprints.get(w.id).polygon;
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length];
      if (distance(p, q) > 1e-9) edges.push({ a: p, b: q, wall: w });
    });
  }
  const out = [];
  for (const e of edges) {
    const len = distance(e.a, e.b);
    const d = normalize(sub(e.b, e.a));
    const cuts = [];
    for (const f of edges) {
      if (f.wall === e.wall) continue;
      const fd = normalize(sub(f.b, f.a));
      if (Math.abs(cross(d, fd)) > 1e-6 || dot(d, fd) > 0 || Math.abs(cross(d, sub(f.a, e.a))) > 1e-6) continue;
      const t0 = dot(sub(f.a, e.a), d);
      const t1 = dot(sub(f.b, e.a), d);
      cuts.push([Math.max(0, Math.min(t0, t1)), Math.min(len, Math.max(t0, t1))]);
    }
    for (const [u0, u1] of subtract(0, len, cuts)) {
      if (u1 - u0 > 1e-6) out.push({ a: add(e.a, scale(d, u0)), b: add(e.a, scale(d, u1)), wall: e.wall });
    }
  }
  return out;
}

/**
 * Draws the walls of one level: poché, face lines broken at openings, jambs.
 */
function drawWalls(s, walls) {
  const footprints = wallFootprints(walls);
  for (const w of walls) {
    const d = normalize(sub(w.b, w.a));
    const len = distance(w.a, w.b);
    const gaps = w.openings.map((o) => [o.at - o.width / 2, o.at + o.width / 2]).sort((x, y) => x[0] - y[0]);
    const poly = footprints.get(w.id).polygon;
    for (const [lo, hi] of subtract(-len, 2 * len, gaps)) {
      const piece = clipToSlab(poly, w.a, d, lo, hi);
      if (piece.length >= 3) s.fill(w.height ? 'poche-low' : 'poche', piece.map(P));
    }
  }
  for (const e of exposedEdges(walls, footprints)) {
    const w = e.wall;
    const layer = w.height ? 'A-WALL-PRHT' : 'A-WALL';
    const d = normalize(sub(w.b, w.a));
    const ed = normalize(sub(e.b, e.a));
    if (Math.abs(cross(d, ed)) > 1e-9 || w.openings.length === 0) {
      s.line(layer, P(e.a), P(e.b));
      continue;
    }
    const sa = dot(sub(e.a, w.a), d);
    const sb = dot(sub(e.b, w.a), d);
    const off = sub(e.a, add(w.a, scale(d, sa)));
    const gaps = w.openings.map((o) => [o.at - o.width / 2, o.at + o.width / 2]);
    for (const [lo, hi] of subtract(Math.min(sa, sb), Math.max(sa, sb), gaps)) {
      if (hi - lo > 1e-6) s.line(layer, P(add(add(w.a, scale(d, lo)), off)), P(add(add(w.a, scale(d, hi)), off)));
    }
  }
  for (const w of walls) {
    const d = normalize(sub(w.b, w.a));
    const n = scale(leftNormal(d), w.thickness / 2);
    for (const o of w.openings) {
      for (const at of [o.at - o.width / 2, o.at + o.width / 2]) {
        const c = add(w.a, scale(d, at));
        s.line('A-WALL', P(add(c, n)), P(sub(c, n)));
      }
    }
  }
}

/**
 * The outside normal of a wall (towards no room), else its left normal.
 * @returns {[number, number]}
 */
function outsideNormal(w, polygons) {
  const d = normalize(sub(w.b, w.a));
  const n = leftNormal(d);
  const mid = scale(add(w.a, w.b), 0.5);
  const probe = add(mid, scale(n, w.thickness / 2 + 0.3));
  return polygons.some((poly) => pointInPolygon(probe, poly)) ? scale(n, -1) : n;
}

/**
 * Draws doors (leaf and swing), windows (frame and glazing) and their tags.
 */
function drawOpenings(s, walls, polygons) {
  for (const w of walls) {
    const d = normalize(sub(w.b, w.a));
    const half = w.thickness / 2;
    for (const o of w.openings) {
      const centre = add(w.a, scale(d, o.at));
      if (o.type === 'door') {
        const swing = o.swing ?? { side: 'L', hinge: 'a' };
        const n = scale(leftNormal(d), swing.side === 'L' ? 1 : -1);
        const sh = swing.hinge === 'a' ? o.at - o.width / 2 : o.at + o.width / 2;
        const sj = swing.hinge === 'a' ? o.at + o.width / 2 : o.at - o.width / 2;
        const hinge = add(add(w.a, scale(d, sh)), scale(n, half));
        const jamb = add(add(w.a, scale(d, sj)), scale(n, half));
        const leafEnd = add(hinge, scale(n, o.width));
        s.line('A-DOOR', P(hinge), P(leafEnd));
        s.line('A-DOOR', P(add(hinge, scale(sub(jamb, hinge), 0.04))), P(add(leafEnd, scale(sub(jamb, hinge), 0.04))));
        const a1 = (Math.atan2(jamb[1] - hinge[1], jamb[0] - hinge[0]) * 180) / Math.PI;
        const a2 = (Math.atan2(n[1], n[0]) * 180) / Math.PI;
        const ccw = (((a2 - a1) % 360) + 360) % 360;
        const [start, end] = Math.abs(ccw - 90) < 1 ? [a1, a2] : [a2, a1];
        s.arc('A-DOOR', P(hinge), o.width * MM, (start + 360) % 360, (end + 360) % 360);
        s.label('A-DOOR-IDEN', P(sub(centre, scale(n, half + 0.35))), TXT.tag, o.tag, 0, { h: 'center', v: 'middle' });
      } else {
        const n = scale(leftNormal(d), half);
        const p0 = add(w.a, scale(d, o.at - o.width / 2));
        const p1 = add(w.a, scale(d, o.at + o.width / 2));
        s.poly('A-GLAZ', [P(add(p0, n)), P(add(p1, n)), P(sub(p1, n)), P(sub(p0, n))], true);
        const g = scale(normalize(n), 0.02);
        s.line('A-GLAZ', P(add(p0, g)), P(add(p1, g)));
        s.line('A-GLAZ', P(sub(p0, g)), P(sub(p1, g)));
        const out = outsideNormal(w, polygons);
        s.label('A-GLAZ-IDEN', P(add(centre, scale(out, half + 0.45))), TXT.tag, o.tag, 0, { h: 'center', v: 'middle' });
      }
    }
  }
}

/** Furniture and fittings per level (plot feet). */
const FURNITURE = {
  ground: [
    ['sofa', [20.5, 22.0, 27.5, 24.6], 'N'], ['sofa', [28.6, 14.5, 31.1, 20.5], 'E'], ['table', [21.75, 13.5, 25.75, 16.0]],
    ['sofa', [28.5, 33.5, 31.1, 40.5], 'E'], ['chair2', [22.5, 33.75, 25.0, 36.25]], ['chair2', [22.5, 37.75, 25.0, 40.25]],
    ['table', [25.75, 35.5, 27.75, 38.5]], ['dining', [13.5, 33.0, 19.5, 36.5]],
    ['counterN', [17.75, 57.25, 31.25, 59.25]], ['counterE', [29.25, 52.5, 31.25, 57.25]], ['sink', [23.75, 57.6, 25.25, 59.0]], ['stove', [19.0, 57.5, 21.5, 59.0]],
    ['bed', [3.8, 53.5, 10.3, 58.5], 'W'], ['wardrobe', [3.75, 46.75, 9.75, 48.75]],
    ['wc', [15.0, 57.0, 16.8, 59.2], 'N'], ['basin', [12.05, 54.5, 13.55, 56.0], 'W'], ['shower', [12.05, 56.4, 14.6, 59.2]],
    ['wc', [29.4, 29.5, 31.2, 31.45], 'E'], ['basin', [29.6, 25.55, 31.1, 27.0], 'S'],
    ['car', [6.25, 11.0, 12.25, 26.0]]
  ],
  first: [
    ['bed', [21.0, 18.0, 27.0, 24.7], 'N'], ['table', [19.25, 23.0, 20.75, 24.5]], ['wardrobe', [15.5, 11.5, 17.5, 19.5]],
    ['wc', [29.4, 30.8, 31.2, 32.95], 'N'], ['basin', [26.3, 28.2, 27.8, 29.7], 'W'], ['shower', [26.3, 30.5, 28.8, 32.95]],
    ['bed', [8.75, 24.1, 14.7, 27.9], 'E'],
    ['wc', [3.8, 21.5, 5.6, 23.45], 'N'], ['basin', [7.2, 21.9, 8.7, 23.4], 'N'], ['shower', [3.8, 16.05, 6.3, 18.6]],
    ['sofa', [24.0, 43.4, 31.1, 45.95], 'N'], ['chair2', [24.5, 37.0, 27.0, 39.5]], ['table', [26.5, 40.0, 29.5, 41.6]], ['tv', [13.0, 33.0, 13.6, 39.0]]
  ]
};

/**
 * Draws one furniture item (plot feet) on A-FURN / A-FLOR-PFIX.
 */
function drawFurniture(s, [kind, box, facing]) {
  if (kind === 'round') {
    const [cx, cy, r] = box;
    s.circle('A-FURN', F(cx, cy), ft(r) * MM);
    return;
  }
  const [x0, y0, x1, y1] = box;
  const r = (layer, a, b, c, e) => s.rect(layer, F(a, b), F(c, e));
  const inset = (k) => [x0 + k, y0 + k, x1 - k, y1 - k];
  switch (kind) {
    case 'sofa': {
      r('A-FURN', x0, y0, x1, y1);
      const back = 0.6;
      if (facing === 'N') r('A-FURN', x0, y1 - back, x1, y1);
      if (facing === 'E') r('A-FURN', x1 - back, y0, x1, y1);
      if (facing === 'N') { r('A-FURN', x0, y0, x0 + 0.6, y1 - back); r('A-FURN', x1 - 0.6, y0, x1, y1 - back); }
      if (facing === 'E') { r('A-FURN', x0, y0, x1 - back, y0 + 0.6); r('A-FURN', x0, y1 - 0.6, x1 - back, y1); }
      break;
    }
    case 'chair2':
      r('A-FURN', x0, y0, x1, y1);
      r('A-FURN', ...inset(0.35));
      break;
    case 'table':
    case 'tv':
      r('A-FURN', x0, y0, x1, y1);
      break;
    case 'dining': {
      r('A-FURN', x0, y0, x1, y1);
      const w = (x1 - x0) / 3;
      for (let k = 0; k < 3; k++) {
        const cx = x0 + w * (k + 0.5);
        r('A-FURN', cx - 0.75, y1 + 0.2, cx + 0.75, y1 + 1.6);
        r('A-FURN', cx - 0.75, y0 - 1.6, cx + 0.75, y0 - 0.2);
      }
      break;
    }
    case 'bed': {
      r('A-FURN', x0, y0, x1, y1);
      if (facing === 'E' || facing === 'W') {
        const h = (y1 - y0) / 2;
        const [p0, p1, fold] = facing === 'E' ? [x1 - 1.6, x1 - 0.3, x0 + 1.8] : [x0 + 0.3, x0 + 1.6, x1 - 1.8];
        r('A-FURN', p0, y0 + 0.3, p1, y0 + h - 0.15);
        r('A-FURN', p0, y0 + h + 0.15, p1, y1 - 0.3);
        s.line('A-FURN', F(fold, y0), F(fold, y1));
      } else {
        const h = (x1 - x0) / 2;
        r('A-FURN', x0 + 0.3, y1 - 1.6, x0 + h - 0.15, y1 - 0.3);
        r('A-FURN', x0 + h + 0.15, y1 - 1.6, x1 - 0.3, y1 - 0.3);
        s.line('A-FURN', F(x0, y0 + 1.8), F(x1, y0 + 1.8));
      }
      break;
    }
    case 'wardrobe':
      r('A-FURN', x0, y0, x1, y1);
      s.line('A-FURN', F(x0, y0), F(x1, y1));
      s.line('A-FURN', F(x0, y1), F(x1, y0));
      break;
    case 'counterN':
    case 'counterE':
      r('A-FURN', x0, y0, x1, y1);
      break;
    case 'sink':
      r('A-FLOR-PFIX', x0, y0, x1, y1);
      r('A-FLOR-PFIX', ...inset(0.15));
      break;
    case 'stove':
      r('A-FURN', x0, y0, x1, y1);
      for (const [cx, cy] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) {
        s.circle('A-FURN', F(x0 + (x1 - x0) * cx, y0 + (y1 - y0) * cy), ft(0.25) * MM);
      }
      break;
    case 'wc': {
      const tank = 0.6;
      const pts = [];
      let tankBox;
      let centre;
      let rx;
      let ry;
      if (facing === 'N') {
        tankBox = [x0, y1 - tank, x1, y1];
        centre = [(x0 + x1) / 2, (y0 + y1 - tank) / 2];
        rx = (x1 - x0) / 2 - 0.1;
        ry = (y1 - tank - y0) / 2;
      } else {
        tankBox = [x1 - tank, y0, x1, y1];
        centre = [(x0 + x1 - tank) / 2, (y0 + y1) / 2];
        rx = (x1 - tank - x0) / 2;
        ry = (y1 - y0) / 2 - 0.1;
      }
      r('A-FLOR-PFIX', ...tankBox);
      for (let k = 0; k < 20; k++) {
        const a = (k / 20) * Math.PI * 2;
        pts.push(F(centre[0] + rx * Math.cos(a), centre[1] + ry * Math.sin(a)));
      }
      s.poly('A-FLOR-PFIX', pts, true);
      break;
    }
    case 'basin':
      r('A-FLOR-PFIX', x0, y0, x1, y1);
      s.circle('A-FLOR-PFIX', F((x0 + x1) / 2, (y0 + y1) / 2), ft(Math.min(x1 - x0, y1 - y0) * 0.32) * MM);
      break;
    case 'shower':
      r('A-FLOR-PFIX', x0, y0, x1, y1);
      s.line('A-FLOR-PFIX', F(x0, y0), F(x1, y1));
      s.line('A-FLOR-PFIX', F(x0, y1), F(x1, y0));
      s.circle('A-FLOR-PFIX', F((x0 + x1) / 2, (y0 + y1) / 2), ft(0.15) * MM);
      break;
    case 'car': {
      const c = 0.9;
      s.poly('A-FURN', [F(x0 + c, y0), F(x1 - c, y0), F(x1, y0 + c), F(x1, y1 - c * 1.6), F(x1 - c, y1), F(x0 + c, y1), F(x0, y1 - c * 1.6), F(x0, y0 + c)], true);
      s.line('A-FURN', F(x0 + 0.4, y1 - 4.2), F(x1 - 0.4, y1 - 4.2));
      s.line('A-FURN', F(x0 + 0.4, y0 + 3.0), F(x1 - 0.4, y0 + 3.0));
      s.rect('A-FURN', F(x0 + 0.6, y0 + 3.4), F(x1 - 0.6, y1 - 4.6));
      break;
    }
    default:
      break;
  }
}

/**
 * Draws the dog-leg stair in the stair hall (plot feet): two flights of nine 10″ treads and a landing.
 */
function drawStair(s, levelId) {
  const flights = [[3.75, 7.25], [7.75, 11.25]];
  const y0 = 35.0;
  const tread = 10 / 12;
  for (const [x0, x1] of flights) {
    for (let k = 0; k <= 9; k++) s.line('A-FLOR-STRS', F(x0, y0 + k * tread), F(x1, y0 + k * tread));
    s.line('A-FLOR-STRS', F(x0, y0), F(x0, y0 + 9 * tread));
    s.line('A-FLOR-STRS', F(x1, y0), F(x1, y0 + 9 * tread));
  }
  s.line('A-FLOR-STRS', F(3.75, 42.5), F(11.25, 42.5));
  const up = [F(5.5, 35.4), F(5.5, 44.25), F(9.5, 44.25), F(9.5, levelId === 'ground' ? 38.6 : 35.6)];
  s.poly('A-FLOR-STRS', up, false);
  const tip = levelId === 'ground' ? 38.6 : 35.6;
  s.poly('A-FLOR-STRS', [F(9.2, tip + 0.6), F(9.5, tip), F(9.8, tip + 0.6)], false);
  if (levelId === 'ground') {
    s.poly('A-FLOR-STRS', [F(7.4, 37.6), F(8.9, 37.6), F(9.3, 38.3), F(9.7, 37.2), F(10.1, 37.9), F(11.6, 37.9)], false);
  }
  s.label('A-FLOR-STRS', F(4.4, 34.3), TXT.small, levelId === 'ground' ? 'UP' : 'DN', 0, { h: 'center', v: 'middle' });
}

/**
 * Draws a chain of dimensions along x or y (positions and line position in plot feet).
 */
function dimChain(s, axis, values, at, from) {
  const pt = (v, o) => (axis === 'x' ? F(v, o) : F(o, v));
  const outward = Math.sign(at - from);
  const tick = 0.12 * s.scale;
  s.line('A-ANNO-DIMS', pt(values[0], at), pt(values[values.length - 1], at));
  for (const v of values) {
    const p = pt(v, at);
    s.line('A-ANNO-DIMS', pt(v, from + outward * 0.4), pt(v, at + outward * 0.5));
    s.line('A-ANNO-DIMS', [p[0] - tick, p[1] - tick], [p[0] + tick, p[1] + tick]);
  }
  for (let i = 0; i + 1 < values.length; i++) {
    const mid = (values[i] + values[i + 1]) / 2;
    const text = ftIn(ft(values[i + 1] - values[i]));
    const base = pt(mid, at);
    const lift = 0.9 * s.scale * outward;
    if (axis === 'x') s.label('A-ANNO-DIMS', [base[0], base[1] + lift], TXT.dim, text, 0, { h: 'center', v: 'middle' });
    else s.label('A-ANNO-DIMS', [base[0] + lift, base[1]], TXT.dim, text, 90, { h: 'center', v: 'middle' });
  }
}

/** Dimension chains per level (plot feet): [axis, positions, dimension line, extension start]. */
const DIMENSIONS = {
  ground: [
    ['x', [3.0, 3.75, 14.75, 15.5, 31.25, 32.0], 5.0, 10.0], ['x', [3.0, 32.0], 2.0, 10.0],
    ['y', [10.0, 10.75, 24.75, 25.5, 31.5, 31.875, 46.0, 46.75, 59.25, 60.0], 37.0, 32.0], ['y', [10.0, 60.0], 40.0, 32.0],
    ['y', [10.0, 28.0, 28.75, 46.0, 46.75, 59.25, 60.0], -2.0, 3.0], ['y', [10.0, 60.0], -5.0, 3.0],
    ['x', [3.0, 3.75, 11.625, 12.0, 17.0, 17.75, 31.25, 32.0], 65.0, 60.0], ['x', [3.0, 32.0], 68.0, 60.0]
  ],
  first: [
    ['x', [3.0, 3.75, 14.75, 15.5, 31.25, 32.0], 5.0, 10.0], ['x', [3.0, 32.0], 2.0, 10.0],
    ['y', [10.0, 10.75, 24.75, 25.5, 33.0, 33.375, 46.0, 46.75], 37.0, 32.0], ['y', [10.0, 46.75], 40.0, 32.0],
    ['y', [10.0, 10.75, 15.25, 16.0, 23.5, 23.875, 28.0, 28.75, 46.0, 46.75], -2.0, 3.0], ['y', [10.0, 46.75], -5.0, 3.0],
    ['x', [3.0, 3.75, 11.25, 12.0, 31.25, 32.0], 63.5, 46.75], ['x', [3.0, 32.0], 66.5, 46.75]
  ]
};

/**
 * Section-cut marks on a plan: dash-dot cut line, lettered bubbles and view arrows (plot feet).
 */
function drawSectionMarks(s, extentY) {
  const bubble = (x, y, label, arrow) => {
    s.circle('A-ANNO-SYMB', F(x, y), 4.5 * s.scale);
    s.label('A-ANNO-SECT', F(x, y), 3.5, label, 0, { h: 'center', v: 'middle' });
    s.poly('A-ANNO-SYMB', arrow, true);
  };
  const ax = 20;
  s.line('A-ANNO-SECT', F(ax, 7.5), F(ax, extentY + 2.5));
  bubble(ax, 6.0, 'A', [F(ax - 1.5, 6.6), F(ax - 3.2, 6.0), F(ax - 1.5, 5.4)]);
  bubble(ax, extentY + 4.0, 'A', [F(ax - 1.5, extentY + 4.6), F(ax - 3.2, extentY + 4.0), F(ax - 1.5, extentY + 3.4)]);
  const by = 38;
  s.line('A-ANNO-SECT', F(0.5, by), F(34.5, by));
  bubble(-1.0, by, 'B', [F(-1.6, by + 1.5), F(-1.0, by + 3.2), F(-0.4, by + 1.5)]);
  bubble(36.0, by, 'B', [F(35.4, by + 1.5), F(36.0, by + 3.2), F(36.6, by + 1.5)]);
}

/**
 * North arrow at a model point.
 */
function northArrow(s, at, size) {
  s.circle('A-ANNO-SYMB', at, size);
  s.poly('A-ANNO-SYMB', [[at[0], at[1] + size * 0.9], [at[0] - size * 0.35, at[1] - size * 0.6], [at[0], at[1] - size * 0.25], [at[0] + size * 0.35, at[1] - size * 0.6]], true);
  s.text('A-ANNO-NOTE', [at[0], at[1] + size * 1.35], size * 0.55, 'N', 0, { h: 'center', v: 'middle' });
}

/**
 * A floor plan sheet.
 * @returns {object}
 */
function planSheet(house, levelId, meta) {
  const s = createSheet(meta);
  const walls = nodeWalls(house.walls.filter((w) => w.level === levelId));
  const polygons = [...roomPolygons({ ...house, rooms: house.rooms.filter((r) => r.level === levelId) }).values()];
  drawWalls(s, walls);
  drawOpenings(s, walls, polygons);
  const labels = roomLabels();
  for (const room of house.rooms.filter((r) => r.level === levelId)) {
    const { lines, size, small } = labels.get(room.id);
    const at = P(room.at);
    const height = small ? TXT.tag : TXT.room;
    lines.forEach((line, i) => {
      s.label('A-AREA-IDEN', [at[0], at[1] - i * height * 1.45 * s.scale], height, line, 0, { h: 'center', v: 'middle' });
    });
    if (size) {
      const below = at[1] - ((lines.length - 1) * height * 1.45 + 3.6) * s.scale;
      s.label('A-AREA-IDEN', [at[0], below], TXT.size, size, 0, { h: 'center', v: 'middle' });
    }
  }
  for (const [name, at, size] of PLAN_LABELS[levelId]) {
    const p = F(at[0], at[1]);
    s.label('A-AREA-IDEN', p, TXT.room, name, 0, { h: 'center', v: 'middle' });
    if (size) s.label('A-AREA-IDEN', [p[0], p[1] - 3.6 * s.scale], TXT.size, size, 0, { h: 'center', v: 'middle' });
  }
  drawStair(s, levelId);
  for (const item of FURNITURE[levelId]) drawFurniture(s, item);
  if (levelId === 'first') {
    s.poly('A-FLOR-OTLN', [F(3, 46.75), F(3, 60), F(32, 60), F(32, 46.75)], false);
  }
  drawSectionMarks(s, 60);
  for (const [axis, values, at, from] of DIMENSIONS[levelId]) dimChain(s, axis, values, at, from);
  northArrow(s, F(44, 58), 6 * s.scale);
  const area = levelId === 'ground' ? 29 * 50 : 29 * 36.75;
  const title = meta.title;
  s.label('A-ANNO-TTLB', F(17.5, -1.5), TXT.title, title, 0, { h: 'center', v: 'middle' });
  s.label('A-ANNO-NOTE', F(17.5, -5.0), TXT.note, `SCALE 1:100   |   COVERED AREA ${Math.round(area).toLocaleString('en-GB')} SFT`, 0, { h: 'center', v: 'middle' });
  const notes = [
    'NOTES',
    '1. DRAWING UNITS: MILLIMETRES. DIMENSIONS IN FEET AND INCHES.',
    '2. EXTERNAL AND MAIN WALLS 9" BRICK; PARTITIONS 4 1/2" BRICK.',
    '3. D = DOOR, W = WINDOW, V = VENTILATOR. SIZES ON THE WORKING DRAWINGS.',
    '4. A-A AND B-B ARE THE SECTION CUTS.',
    levelId === 'first' ? '5. BALCONY PARAPET 3\'-6" HIGH (LAYER A-WALL-PRHT).' : '5. PLINTH 1\'-6" ABOVE NATURAL GROUND.'
  ];
  notes.forEach((line, i) => s.label('A-ANNO-NOTE', F(46, 30 - i * 2.2), i === 0 ? TXT.note * 1.2 : TXT.small, line));
  const statement = ['AREA STATEMENT', 'PLOT: 35\'-0" x 65\'-0" = 2,275 SFT (10 MARLA)', 'GROUND FLOOR COVERED: 1,450 SFT', 'FIRST FLOOR COVERED: 1,066 SFT', 'TOTAL COVERED: 2,516 SFT'];
  statement.forEach((line, i) => s.label('A-ANNO-NOTE', F(46, 15 - i * 2.2), i === 0 ? TXT.note * 1.2 : TXT.small, line));
  return s;
}

/**
 * Where a polygon crosses a line (axis 'x' means the line x = at; result is along y), as
 * sorted [from, to] intervals.
 * @returns {[number, number][]}
 */
function cutIntervals(poly, axis, at) {
  const across = axis === 'x' ? 0 : 1;
  const along = 1 - across;
  const hits = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    if ((p[across] - at) * (q[across] - at) < 0) {
      const t = (at - p[across]) / (q[across] - p[across]);
      hits.push(p[along] + (q[along] - p[along]) * t);
    }
  }
  hits.sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i + 1 < hits.length; i += 2) out.push([hits[i], hits[i + 1]]);
  return out;
}

/**
 * Everything a section cut needs from the model: cut walls per level with their openings, slabs
 * and the extent of each level along the cut.
 * @returns {object[]}
 */
function cutLevels(house, cut) {
  return house.levels.map((level) => {
    const walls = nodeWalls(house.walls.filter((w) => w.level === level.id));
    const footprints = wallFootprints(walls);
    const pieces = [];
    for (const w of walls) {
      for (const [u0, u1] of cutIntervals(footprints.get(w.id).polygon, cut.axis, cut.at)) {
        const mid = cut.axis === 'x' ? [cut.at, (u0 + u1) / 2] : [(u0 + u1) / 2, cut.at];
        const d = normalize(sub(w.b, w.a));
        const along = dot(sub(mid, w.a), d);
        const opening = w.openings.find((o) => Math.abs(along - o.at) < o.width / 2);
        pieces.push({ u0, u1, wall: w, opening });
      }
    }
    const uMin = Math.min(...pieces.map((p) => p.u0));
    const uMax = Math.max(...pieces.map((p) => p.u1));
    return { level, walls, pieces, uMin, uMax };
  });
}

/**
 * Draws the doors and windows seen beyond a section cut: openings in walls parallel to the cut,
 * on the side the section looks towards, that no nearer wall hides.
 */
function drawBeyond(s, house, cut, U, V) {
  const sign = cut.look === 'west' || cut.look === 'south' ? -1 : 1;
  const across = cut.axis === 'x' ? 0 : 1;
  const along = 1 - across;
  for (const level of house.levels) {
    const walls = house.walls.filter((w) => w.level === level.id && Math.abs(w.a[across] - w.b[across]) < 1e-9 && (w.a[across] - cut.at) * sign > 0);
    const covers = (w, u) => Math.min(w.a[along], w.b[along]) <= u && Math.max(w.a[along], w.b[along]) >= u;
    for (const w of walls) {
      const dist = (w.a[across] - cut.at) * sign;
      const d = normalize(sub(w.b, w.a));
      for (const o of w.openings) {
        const c = add(w.a, scale(d, o.at))[along];
        const hidden = walls.some((q) => q !== w && (q.a[across] - cut.at) * sign < dist - 1e-6 && covers(q, c));
        if (hidden) continue;
        const v0 = level.elevation + o.sill;
        const v1 = v0 + o.height;
        s.rect('A-SECT-MBND', [U(c - o.width / 2), V(v0)], [U(c + o.width / 2), V(v1)]);
        if (o.type === 'door') {
          s.rect('A-SECT-MBND', [U(c - o.width / 2 + 0.06), V(v0)], [U(c + o.width / 2 - 0.06), V(v1 - 0.06)]);
        } else {
          s.line('A-SECT-MBND', [U(c), V(v0)], [U(c), V(v1)]);
          s.rect('A-SECT-MBND', [U(c - o.width / 2 - 0.1), V(v0 - 0.05)], [U(c + o.width / 2 + 0.1), V(v0)]);
        }
      }
    }
  }
}

/**
 * Draws a section through the model at (u, v) = (along the cut, elevation) in millimetres with
 * the section's left edge at `origin` (model mm). Returns the drawing extents (model mm).
 * @returns {{ uMin: number, uMax: number, vMin: number, vMax: number, levels: object[] }}
 */
function drawSection(s, house, cut, origin, { dims = false } = {}) {
  const levels = cutLevels(house, cut);
  const u0All = Math.min(...levels.map((l) => l.uMin));
  const U = (u) => origin[0] + (u - u0All) * MM;
  const V = (v) => origin[1] + v * MM;
  const R = (ua, va, ub, vb) => [[U(ua), V(va)], [U(ub), V(va)], [U(ub), V(vb)], [U(ua), V(vb)]];
  const solid = (pts, style = 'hatch') => {
    s.fill(style, pts);
    s.poly('A-SECT-MCUT', pts, true);
  };
  const top = levels[levels.length - 1];
  const roofTop = top.level.elevation + top.level.ceiling + top.level.slab;
  const ground = levels[0];
  const pcc = ft(4 / 12);
  s.fill('earth', R(ground.uMin - 3, -PLINTH - 1.3, ground.uMax + 3, -PLINTH));
  s.line('A-SECT-MCUT', [U(ground.uMin - 3), V(-PLINTH)], [U(ground.uMax + 3), V(-PLINTH)]);
  s.fill('earth', R(ground.uMin, -PLINTH, ground.uMax, -pcc));
  solid(R(ground.uMin, -pcc, ground.uMax, 0), 'concrete');
  for (const { level, pieces, uMin, uMax } of levels) {
    const base = level.elevation;
    for (const piece of pieces) {
      const height = piece.wall.height ?? level.ceiling;
      const o = piece.opening;
      const spans = o ? [[0, o.sill], [o.sill + o.height, height]] : [[0, height]];
      for (const [va, vb] of spans) {
        if (vb - va > 1e-6) solid(R(piece.u0, base + va, piece.u1, base + vb));
      }
      if (o) {
        const c = (piece.u0 + piece.u1) / 2;
        s.rect('A-SECT-MBND', [U(c) - 25, V(base + o.sill)], [U(c) + 25, V(base + o.sill + o.height)]);
      }
      if (level === ground.level) {
        solid(R(piece.u0, -PLINTH, piece.u1, 0));
        const steps = [[ft(0.75), -PLINTH, -PLINTH - ft(0.75)], [ft(1.5), -PLINTH - ft(0.75), -PLINTH - ft(1.5)], [ft(2.25), -PLINTH - ft(1.5), -PLINTH - ft(2.25)]];
        for (const [extra, va, vb] of steps) solid(R(piece.u0 - extra / 2, vb, piece.u1 + extra / 2, va));
        solid(R(piece.u0 - ft(1.6), -PLINTH - ft(2.75), piece.u1 + ft(1.6), -PLINTH - ft(2.25)), 'concrete');
      }
    }
    solid(R(uMin, base + level.ceiling, uMax, base + level.ceiling + level.slab), 'concrete');
  }
  for (const piece of top.pieces.filter((p) => p.wall.role === 'exterior' && !p.wall.height)) {
    solid(R(piece.u0, roofTop, piece.u1, roofTop + top.level.parapet));
    s.rect('A-SECT-MCUT', [U(piece.u0 - 0.05), V(roofTop + top.level.parapet)], [U(piece.u1 + 0.05), V(roofTop + top.level.parapet + 0.075)]);
  }
  if (cut.label === 'B') {
    const flight = (x0, x1, h) => solid(R(ft(x0), h - ft(0.5), ft(x1), h), 'concrete');
    flight(3.75, 7.25, ft(29.3 / 12));
    flight(7.75, 11.25, ft(8.8));
    s.rect('A-SECT-MBND', [U(ft(3.75)), V(ft(5.0))], [U(ft(11.25)), V(ft(5.5))]);
    s.line('A-SECT-MBND', [U(ft(3.75)), V(ft(5.5) + 0.9)], [U(ft(11.25)), V(ft(5.5) + 0.9)]);
  }
  drawBeyond(s, house, cut, U, V);
  const polygons = roomPolygons(house);
  for (const room of house.rooms) {
    const level = house.levels.find((l) => l.id === room.level);
    for (const [r0, r1] of cutIntervals(polygons.get(room.id), cut.axis, cut.at)) {
      s.label('A-AREA-IDEN', [U((r0 + r1) / 2), V(level.elevation + 2.6)], TXT.note, room.name.toUpperCase(), 0, { h: 'center', v: 'middle' });
    }
  }
  const uMax = Math.max(...levels.map((l) => l.uMax));
  const right = U(uMax) + 1200;
  const marker = (v, from, text) => {
    s.poly('A-ANNO-LEVL', [[right, V(v)], [right - 180, V(v) + 300], [right + 180, V(v) + 300]], true);
    s.line('A-ANNO-LEVL', [U(from) + 300, V(v)], [right + 3800, V(v)]);
    s.label('A-ANNO-LEVL', [right + 400, V(v) + 120], TXT.level, text);
  };
  const g = levels[0].level;
  const f = top.level;
  marker(-PLINTH, ground.uMax, `N.G.L. ${levelText(-PLINTH)}`);
  levels.forEach(({ level }, i) => marker(level.elevation, ground.uMax, `${i === 0 ? 'GROUND' : 'FIRST'} FLOOR F.F.L. ${levelText(level.elevation)}`));
  marker(roofTop, top.uMax, `ROOF T.O.S. ${levelText(roofTop)}`);
  marker(roofTop + f.parapet, top.uMax, `PARAPET ${levelText(roofTop + f.parapet)}`);
  for (const { level, uMin } of levels) {
    const v = level.elevation + level.ceiling;
    s.label('A-ANNO-LEVL', [U(uMin) + 450, V(v) - 380], TXT.level, `CEILING ${levelText(v)}`);
  }
  const left = U(u0All) - 600;
  const leftMarker = (v, text) => {
    s.line('A-ANNO-LEVL', [left - 3200, V(v)], [U(u0All) - 250, V(v)]);
    s.label('A-ANNO-LEVL', [left, V(v) + 120], TXT.level, text, 0, { h: 'right' });
  };
  leftMarker(0, 'PLINTH LEVEL ±0\'-0"');
  const sill = SAMPLE_SCHEDULE.W1.sill;
  leftMarker(sill, `SILL LEVEL ${levelText(sill)}`);
  leftMarker(sill + SAMPLE_SCHEDULE.W1.height, `LINTEL LEVEL ${levelText(sill + SAMPLE_SCHEDULE.W1.height)}`);
  if (dims) {
    const stops = [-PLINTH, 0, g.ceiling, f.elevation, f.elevation + f.ceiling, roofTop, roofTop + f.parapet];
    const x = left - 3700;
    s.line('A-ANNO-DIMS', [x, V(stops[0])], [x, V(stops[stops.length - 1])]);
    stops.forEach((v, i) => {
      s.line('A-ANNO-DIMS', [x - 150, V(v) - 150], [x + 150, V(v) + 150]);
      s.line('A-ANNO-DIMS', [x - 300, V(v)], [x + 600, V(v)]);
      if (i + 1 < stops.length) {
        s.label('A-ANNO-DIMS', [x - 450, (V(v) + V(stops[i + 1])) / 2], TXT.dim, ftIn(stops[i + 1] - v), 90, { h: 'center', v: 'middle' });
      }
    });
    const faces = [...new Set(levels[0].pieces.flatMap((p) => [p.u0, p.u1]).map((u) => Math.round(u * 1e6) / 1e6))].sort((a, b) => a - b);
    const y = V(-PLINTH) - 1900;
    s.line('A-ANNO-DIMS', [U(faces[0]), y], [U(faces[faces.length - 1]), y]);
    faces.forEach((u, i) => {
      s.line('A-ANNO-DIMS', [U(u) - 150, y - 150], [U(u) + 150, y + 150]);
      s.line('A-ANNO-DIMS', [U(u), y - 300], [U(u), y + 600]);
      if (i + 1 < faces.length) {
        s.label('A-ANNO-DIMS', [(U(u) + U(faces[i + 1])) / 2, y + 450], TXT.dim, ftIn(faces[i + 1] - u), 0, { h: 'center', v: 'middle' });
      }
    });
  }
  return { uMin: U(u0All), uMax: right + 3800, vMin: V(-PLINTH - ft(2.75)), vMax: V(roofTop + f.parapet), levels };
}

/**
 * Draws an elevation of the facade walls (plot metres) facing the viewer. `axis` is the plan
 * axis that runs left to right in the view; `pick` selects the walls on that face.
 * @returns {{ uMin: number, uMax: number }}
 */
function drawElevation(s, house, { axis, pick, origin, porch = false }) {
  const along = axis === 'x' ? 0 : 1;
  const faceWalls = house.walls.filter(pick);
  const lo = Math.min(...faceWalls.flatMap((w) => [w.a[along], w.b[along]])) - NINE_INCH / 2;
  const hi = Math.max(...faceWalls.flatMap((w) => [w.a[along], w.b[along]])) + NINE_INCH / 2;
  const U = (u) => origin[0] + (u - lo) * MM;
  const V = (v) => origin[1] + v * MM;
  const rect = (layer, ua, va, ub, vb) => s.rect(layer, [U(ua), V(va)], [U(ub), V(vb)]);
  s.line('A-ELEV-OTLN', [U(lo - 1.2), V(-PLINTH)], [U(hi + 1.2), V(-PLINTH)]);
  s.fill('earth', [[U(lo - 1.2), V(-PLINTH - 0.5)], [U(hi + 1.2), V(-PLINTH - 0.5)], [U(hi + 1.2), V(-PLINTH)], [U(lo - 1.2), V(-PLINTH)]]);
  rect('A-ELEV-OTLN', lo, -PLINTH, hi, 0);
  for (const level of house.levels) {
    const walls = faceWalls.filter((w) => w.level === level.id);
    if (walls.length === 0) continue;
    const wl = Math.min(...walls.flatMap((w) => [w.a[along], w.b[along]])) - NINE_INCH / 2;
    const wh = Math.max(...walls.flatMap((w) => [w.a[along], w.b[along]])) + NINE_INCH / 2;
    const base = level.elevation;
    const top = base + level.ceiling + level.slab;
    for (const w of walls) {
      const a = Math.min(w.a[along], w.b[along]) - NINE_INCH / 2;
      const b = Math.max(w.a[along], w.b[along]) + NINE_INCH / 2;
      const h = w.height ?? level.ceiling + level.slab;
      s.fill(w.height ? 'shade' : 'render', [[U(a), V(base)], [U(b), V(base)], [U(b), V(base + h)], [U(a), V(base + h)]]);
      rect('A-ELEV-OTLN', a, base, b, base + h);
      const d = normalize(sub(w.b, w.a));
      for (const o of w.openings) {
        const c = add(w.a, scale(d, o.at))[along];
        const x0 = c - o.width / 2;
        const x1 = c + o.width / 2;
        const v0 = base + o.sill;
        const v1 = v0 + o.height;
        s.fill('glass', [[U(x0), V(v0)], [U(x1), V(v0)], [U(x1), V(v1)], [U(x0), V(v1)]]);
        rect('A-ELEV-OPEN', x0, v0, x1, v1);
        rect('A-ELEV-OPEN', x0 + 0.05, v0 + 0.05, x1 - 0.05, v1 - 0.05);
        const panes = o.type === 'door' ? 1 : Math.max(2, Math.round(o.width / 0.6));
        for (let k = 1; k < panes; k++) s.line('A-ELEV-OPEN', [U(x0 + (o.width * k) / panes), V(v0 + 0.05)], [U(x0 + (o.width * k) / panes), V(v1 - 0.05)]);
        if (o.type !== 'door') rect('A-ELEV-OTLN', x0 - 0.15, v1 + 0.15, x1 + 0.15, v1 + 0.25);
      }
    }
    rect('A-ELEV-OTLN', wl, top - level.slab, wh, top);
    if (level === house.levels[house.levels.length - 1]) {
      rect('A-ELEV-OTLN', wl, top, wh, top + level.parapet);
      rect('A-ELEV-OTLN', wl - 0.05, top + level.parapet, wh + 0.05, top + level.parapet + 0.075);
    }
  }
  if (porch) {
    const g = house.levels[0];
    s.fill('shadow', [[U(ft(3.75)), V(0)], [U(ft(14.75)), V(0)], [U(ft(14.75)), V(g.ceiling)], [U(ft(3.75)), V(g.ceiling)]]);
    const d1 = SAMPLE_SCHEDULE.D1;
    rect('A-ELEV-OPEN', ft(7.5) - d1.width / 2, 0, ft(7.5) + d1.width / 2, d1.height);
    s.label('A-AREA-IDEN', [U(ft(9.25)), V(1.0)], TXT.small, 'CAR PORCH', 0, { h: 'center', v: 'middle' });
    s.label('A-AREA-IDEN', [U(ft(9.25)), V(4.1)], TXT.small, 'BALCONY', 0, { h: 'center', v: 'middle' });
  }
  return { uMin: U(lo - 1.2), uMax: U(hi + 1.2) };
}

/**
 * A section sheet (03, 04).
 * @returns {object}
 */
function sectionSheet(house, label, meta) {
  const s = createSheet(meta);
  const box = drawSection(s, house, SECTION_CUTS[label], [0, 0]);
  const cx = (box.uMin + box.uMax) / 2;
  s.label('A-ANNO-TTLB', [cx, box.vMin - 1600], TXT.title, meta.title, 0, { h: 'center', v: 'middle' });
  s.label('A-ANNO-NOTE', [cx, box.vMin - 2500], TXT.note, 'SCALE 1:100', 0, { h: 'center', v: 'middle' });
  const notes = [
    'NOTES',
    '1. LEVELS ARE IN FEET AND INCHES ABOVE THE GROUND FLOOR (±0\'-0").',
    '2. PLINTH 1\'-6" ABOVE NATURAL GROUND LEVEL (N.G.L.).',
    '3. SLABS 6" R.C.C.; 4" P.C.C. FLOOR ON COMPACTED EARTH.',
    '4. FOOTINGS: STEPPED BRICK MASONRY ON 6" LEAN CONCRETE.'
  ];
  notes.forEach((line, i) => s.label('A-ANNO-NOTE', [box.uMin, box.vMin - 4200 - i * 450], i === 0 ? TXT.note * 1.2 : TXT.small, line));
  return s;
}

/** Count of each schedule tag in the model. */
function tagCounts(house) {
  const counts = {};
  for (const o of house.walls.flatMap((w) => w.openings)) counts[o.tag] = (counts[o.tag] ?? 0) + 1;
  return counts;
}

/**
 * Draws the door and window schedule table with its top-left corner at `at`.
 */
function drawSchedule(s, house, at) {
  const cols = [['TAG', 1100], ['TYPE', 2900], ['SIZE (W x H)', 3000], ['SILL', 1400], ['MATERIAL', 2700], ['QTY', 1000]];
  const row = 650;
  const counts = tagCounts(house);
  const rows = Object.entries(SAMPLE_SCHEDULE).map(([tag, e]) => [tag, e.label, `${ftIn(e.width)} x ${ftIn(e.height)}`, e.sill === null ? '-' : ftIn(e.sill), e.material, String(counts[tag] ?? 0)]);
  const width = cols.reduce((sum, [, w]) => sum + w, 0);
  const height = row * (rows.length + 1);
  s.label('A-ANNO-TTLB', [at[0], at[1] + 600], TXT.subtitle, 'DOOR & WINDOW SCHEDULE');
  s.rect('A-ANNO-SCHD', [at[0], at[1] - height], [at[0] + width, at[1]]);
  for (let r = 1; r <= rows.length; r++) s.line('A-ANNO-SCHD', [at[0], at[1] - r * row], [at[0] + width, at[1] - r * row]);
  let x = at[0];
  cols.forEach(([name, w], c) => {
    if (c > 0) s.line('A-ANNO-SCHD', [x, at[1]], [x, at[1] - height]);
    s.label('A-ANNO-SCHD', [x + 150, at[1] - row + 210], TXT.size, name);
    rows.forEach((cells, r) => s.label('A-ANNO-SCHD', [x + 150, at[1] - (r + 2) * row + 210], TXT.size, cells[c]));
    x += w;
  });
}

/**
 * Runs a drawing step and returns the items it added with their extents.
 * @returns {{ items: object[], box: { min: [number, number], max: [number, number] } }}
 */
function block(s, draw) {
  const start = s.items.length;
  draw();
  const items = s.items.slice(start);
  return { items, box: itemExtents(items) };
}

/**
 * Moves a block's items so its box's top-left corner lands on `topLeft` (model mm).
 */
function placeBlock(blk, topLeft) {
  const dx = topLeft[0] - blk.box.min[0];
  const dy = topLeft[1] - blk.box.max[1];
  const move = (p) => [p[0] + dx, p[1] + dy];
  for (const it of blk.items) {
    if (it.a) it.a = move(it.a);
    if (it.b) it.b = move(it.b);
    if (it.points) it.points = it.points.map(move);
    if (it.center) it.center = move(it.center);
    if (it.at) it.at = move(it.at);
  }
  blk.box = { min: move(blk.box.min), max: move(blk.box.max) };
}

/**
 * A working drawing sheet (05, 06): dimensioned section, an elevation and the door and window
 * schedule. The schedule sits beside the section when the sheet is wide enough, otherwise
 * beside the elevation below it.
 * @returns {object}
 */
function workingSheet(house, label, meta) {
  const s = createSheet(meta);
  const width = (AREA.x1 - AREA.x0) * s.scale;
  const gap = 1500;
  const front = label === 'A';
  const section = block(s, () => {
    const box = drawSection(s, house, SECTION_CUTS[label], [0, 0], { dims: true });
    s.label('A-ANNO-NOTE', [(box.uMin + box.uMax) / 2, box.vMax + 1300], TXT.subtitle, SECTION_CUTS[label].title, 0, { h: 'center', v: 'middle' });
  });
  const elevation = block(s, () => {
    const box = drawElevation(s, house, front
      ? { axis: 'x', pick: (w) => ['g-front', 'g-porch-east', 'f-balcony-parapet', 'f-front'].includes(w.id), origin: [0, 0], porch: true }
      : { axis: 'y', pick: (w) => ['g-east', 'f-east'].includes(w.id), origin: [0, 0] });
    const top = house.levels.reduce((v, l) => Math.max(v, l.elevation + l.ceiling + l.slab + (l.parapet ?? 0)), 0) * MM;
    s.label('A-ANNO-NOTE', [(box.uMin + box.uMax) / 2, top + 1300], TXT.subtitle, front ? 'FRONT ELEVATION' : 'SIDE ELEVATION (EAST)', 0, { h: 'center', v: 'middle' });
    s.label('A-ANNO-NOTE', [(box.uMin + box.uMax) / 2, -PLINTH * MM - 1000], TXT.small, 'EXTERNAL WALLS: CEMENT PLASTER WITH EXTERIOR EMULSION PAINT', 0, { h: 'center', v: 'middle' });
  });
  const schedule = block(s, () => drawSchedule(s, house, [0, 0]));
  const secW = section.box.max[0] - section.box.min[0];
  const schedW = schedule.box.max[0] - schedule.box.min[0];
  placeBlock(elevation, [section.box.min[0], section.box.min[1] - gap]);
  if (secW + gap + schedW <= width) {
    placeBlock(schedule, [section.box.max[0] + gap, section.box.max[1]]);
  } else {
    placeBlock(schedule, [elevation.box.max[0] + gap, elevation.box.max[1]]);
  }
  const right = Math.max(section.box.max[0], elevation.box.max[0], schedule.box.max[0]);
  const bottom = Math.min(elevation.box.min[1], schedule.box.min[1]);
  s.label('A-ANNO-TTLB', [right, bottom - 1000], TXT.title, meta.title, 0, { h: 'right', v: 'middle' });
  s.label('A-ANNO-NOTE', [right, bottom - 1900], TXT.note, 'SCALE 1:100', 0, { h: 'right', v: 'middle' });
  return s;
}

/**
 * The site layout sheet (07), at 1:200 in plot coordinates.
 * @returns {object}
 */
function layoutSheet(house, meta) {
  const s = createSheet({ ...meta, scale: 200 });
  const site = house.site;
  const X = (p) => [p[0] * MM, p[1] * MM];
  const Fp = (x, y) => X([ft(x), ft(y)]);
  for (const g of site.ground) {
    s.fill(g.material, g.polygon.map(X));
    s.poly({ lawn: 'L-PLNT', paving: 'A-SITE-PAVE', road: 'C-ROAD' }[g.material], g.polygon.map(X), true);
  }
  s.line('C-ROAD-CNTR', Fp(-10, -20), Fp(45, -20));
  s.poly('C-PROP', site.boundary.map(X), true);
  const h = site.boundaryWall.thickness / 2;
  const W = PLOT.width;
  const D = PLOT.depth;
  const gate = site.boundaryWall.gates[0];
  const g0 = gate.at[0] - gate.width / 2;
  const g1 = gate.at[0] + gate.width / 2;
  const wall = (a, b) => s.line('A-SITE-WALL', X(a), X(b));
  wall([-h, -h], [g0, -h]); wall([g1, -h], [W + h, -h]);
  wall([h, h], [g0, h]); wall([g1, h], [W - h, h]);
  wall([g0, -h], [g0, h]); wall([g1, -h], [g1, h]);
  wall([W + h, -h], [W + h, D + h]); wall([W - h, h], [W - h, D - h]);
  wall([W + h, D + h], [-h, D + h]); wall([W - h, D - h], [h, D - h]);
  wall([-h, D + h], [-h, -h]); wall([h, D - h], [h, h]);
  const leaf = gate.width / 2;
  s.arc('A-SITE-GATE', X([g0, h]), leaf * MM, 0, 90);
  s.line('A-SITE-GATE', X([g0, h]), X([g0, h + leaf]));
  s.arc('A-SITE-GATE', X([g1, h]), leaf * MM, 90, 180);
  s.line('A-SITE-GATE', X([g1, h]), X([g1, h + leaf]));
  s.label('A-SITE-GATE', X([gate.at[0], -ft(2.2)]), TXT.note, 'GATE', 0, { h: 'center', v: 'middle' });
  const fp = [Fp(3, 10), Fp(32, 10), Fp(32, 60), Fp(3, 60)];
  s.fill('shade', fp);
  s.poly('A-SITE-BLDG', fp, true);
  s.label('A-AREA-IDEN', Fp(17.5, 40), TXT.room, 'DOUBLE STOREY HOUSE', 0, { h: 'center', v: 'middle' });
  s.label('A-AREA-IDEN', Fp(17.5, 36.5), TXT.size, 'G.F. COVERED 1,450 SFT  |  F.F. COVERED 1,066 SFT', 0, { h: 'center', v: 'middle' });
  s.label('A-AREA-IDEN', Fp(9.25, 19), TXT.size, 'CAR PORCH', 0, { h: 'center', v: 'middle' });
  s.label('A-AREA-IDEN', Fp(25.3, 4.7), TXT.size, 'LAWN', 0, { h: 'center', v: 'middle' });
  s.label('A-AREA-IDEN', Fp(9.25, 5), TXT.size, 'DRIVEWAY', 0, { h: 'center', v: 'middle' });
  for (const [x, y] of [[18, 2.2], [22, 7.2], [27, 2.2], [31.5, 7.2], [33.2, 2.4]]) s.circle('L-PLNT', Fp(x, y), ft(0.9) * MM);
  s.label('A-ANNO-NOTE', Fp(17.5, -20.0), TXT.subtitle, '30\'-0" WIDE ROAD', 0, { h: 'center', v: 'middle' });
  s.label('A-ANNO-NOTE', Fp(17.5, -2.6), TXT.small, 'FOOTPATH / GREEN BELT', 0, { h: 'center', v: 'middle' });
  s.label('A-ANNO-NOTE', Fp(-5.5, 32.5), TXT.note, 'PLOT No. 121', 90, { h: 'center', v: 'middle' });
  s.label('A-ANNO-NOTE', Fp(40.5, 32.5), TXT.note, 'PLOT No. 123', 90, { h: 'center', v: 'middle' });
  s.label('A-ANNO-NOTE', Fp(17.5, 69.0), TXT.note, 'PLOT No. 140 (REAR)', 0, { h: 'center', v: 'middle' });
  s.label('A-AREA-IDEN', Fp(17.5, 62.5), TXT.size, 'REAR SPACE 5\'-0"', 0, { h: 'center', v: 'middle' });
  s.label('A-AREA-IDEN', Fp(1.5, 35), TXT.size, 'SIDE SPACE 3\'-0"', 90, { h: 'center', v: 'middle' });
  s.label('A-AREA-IDEN', Fp(33.5, 35), TXT.size, 'SIDE SPACE 3\'-0"', 90, { h: 'center', v: 'middle' });
  const dim = (axis, values, at, from) => {
    const pt = (v, o) => (axis === 'x' ? Fp(v, o) : Fp(o, v));
    const out = Math.sign(at - from);
    s.line('A-ANNO-DIMS', pt(values[0], at), pt(values[values.length - 1], at));
    values.forEach((v, i) => {
      const p = pt(v, at);
      s.line('A-ANNO-DIMS', pt(v, from + out * 0.8), pt(v, at + out * 1.0));
      s.line('A-ANNO-DIMS', [p[0] - 250, p[1] - 250], [p[0] + 250, p[1] + 250]);
      if (i + 1 < values.length) {
        const mid = pt((v + values[i + 1]) / 2, at + out * 1.6);
        s.label('A-ANNO-DIMS', mid, TXT.dim, ftIn(ft(values[i + 1] - v)), axis === 'x' ? 0 : 90, { h: 'center', v: 'middle' });
      }
    });
  };
  dim('x', [0, 3, 32, 35], 72.0, 65);
  dim('x', [0, 35], 75.5, 65);
  dim('y', [0, 10, 60, 65], 39.0, 35);
  dim('y', [0, 65], 42.5, 35);
  northArrow(s, Fp(48, 60), 6 * s.scale);
  s.label('A-ANNO-NOTE', Fp(47, 40), TXT.note * 1.1, 'NOTES');
  const notes = [
    'BOUNDARY WALL 9" THICK, 7\'-0" HIGH',
    'MAIN GATE 12\'-0" WIDE (TWO LEAVES)',
    'PLOT 35\'-0" x 65\'-0" (10 MARLA)',
    'FRONT SETBACK 10\'-0", REAR SPACE 5\'-0"',
    'BUILDING FOOTPRINT ON LAYER A-SITE-BLDG'
  ];
  notes.forEach((line, i) => s.label('A-ANNO-NOTE', Fp(47, 37 - i * 3.2), TXT.small, `${i + 1}. ${line}`));
  s.label('A-ANNO-TTLB', Fp(17.5, -40.5), TXT.title, meta.title, 0, { h: 'center', v: 'middle' });
  s.label('A-ANNO-NOTE', Fp(17.5, -45.0), TXT.note, 'SCALE 1:200', 0, { h: 'center', v: 'middle' });
  return s;
}

/**
 * Model-space extents of a sheet's items.
 * @returns {{ min: [number, number], max: [number, number] }}
 */
function itemExtents(items) {
  const pts = [];
  for (const it of items) {
    if (it.kind === 'line') pts.push(it.a, it.b);
    if (it.kind === 'poly' || it.kind === 'fill') pts.push(...it.points);
    if (it.kind === 'arc' || it.kind === 'circle') pts.push([it.center[0] - it.radius, it.center[1] - it.radius], [it.center[0] + it.radius, it.center[1] + it.radius]);
    if (it.kind === 'text') pts.push(it.at);
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] };
}

/**
 * Places the drawing on an A3 sheet and adds the border and title block (in model space, so the
 * DXF carries it too). Sets `sheet.origin`, the model point at the paper's lower-left corner.
 */
function frameSheet(sheet, total) {
  const box = itemExtents(sheet.items);
  const k = sheet.scale;
  const fits = box.max[0] - box.min[0] <= (AREA.x1 - AREA.x0) * k && box.max[1] - box.min[1] <= (AREA.y1 - AREA.y0) * k;
  if (!fits) throw new Error(`${sheet.file} does not fit on an A3 sheet at 1:${k}`);
  const centre = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2];
  const areaCentre = [(AREA.x0 + AREA.x1) / 2, (AREA.y0 + AREA.y1) / 2];
  sheet.origin = [centre[0] - areaCentre[0] * k, centre[1] - areaCentre[1] * k];
  const M = (x, y) => [sheet.origin[0] + x * k, sheet.origin[1] + y * k];
  const t = (x, y, h, text, align = {}) => sheet.text('A-ANNO-TTLB', M(x, y), h * k, text, 0, align);
  sheet.rect('A-ANNO-TTLB', M(10, 5), M(415, 292));
  sheet.rect('A-ANNO-TTLB', M(345, 5), M(415, 292));
  const rules = [262, 222, 182, 132, 72, 52, 32];
  for (const y of rules) sheet.line('A-ANNO-TTLB', M(345, y), M(415, y));
  t(380, 281, 3.2, 'SAMPLE DRAWING SET', { h: 'center', v: 'middle' });
  t(380, 274, 2.2, 'FOR TESTING THE AMCO 3D VISUALISER', { h: 'center', v: 'middle' });
  t(380, 268, 2.2, 'NOT FOR CONSTRUCTION', { h: 'center', v: 'middle' });
  t(348, 256, 1.8, 'PROJECT');
  t(348, 249, 2.6, 'SAMPLE HOUSE - 10 MARLA,');
  t(348, 243, 2.6, 'DHA LAHORE');
  t(348, 236, 1.8, 'PLOT 35\'-0" x 65\'-0" (FICTIONAL ADDRESS)');
  t(348, 230, 1.8, 'DOUBLE STOREY RESIDENCE');
  t(348, 216, 1.8, 'PREPARED FOR');
  t(348, 209, 2.4, 'AMCO 3D VISUALISER TESTING');
  t(348, 202, 1.8, 'UPLOAD ALL SEVEN DXF FILES TO');
  t(348, 197, 1.8, 'BUILD THE HOUSE IN 3D.');
  t(348, 176, 1.8, 'CONVENTIONS');
  const conventions = ['DRAWING UNITS: MILLIMETRES', 'DIMENSIONS: FEET AND INCHES', 'WALLS: A-WALL (TWO LINES)', 'DOORS: A-DOOR  WINDOWS: A-GLAZ', 'ROOM NAMES: A-AREA-IDEN', 'SITE: C-PROP, A-SITE-*, L-PLNT'];
  conventions.forEach((line, i) => t(348, 169 - i * 6, 1.7, line));
  t(348, 126, 1.8, 'DRAWING');
  const words = sheet.title.split(' ');
  const lines = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && `${last} ${w}`.length <= 20) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  lines.forEach((line, i) => t(380, 113 - i * 8, 4.2, line, { h: 'center', v: 'middle' }));
  t(348, 66, 1.8, 'SCALE');
  t(380, 58, 3.2, `1:${k}`, { h: 'center', v: 'middle' });
  t(348, 46, 1.8, 'SHEET');
  t(380, 38, 3.2, `${String(sheet.number).padStart(2, '0')} OF ${String(total).padStart(2, '0')}`, { h: 'center', v: 'middle' });
  t(348, 26, 1.8, 'DATE');
  t(380, 16, 2.6, '10 NOV 2026', { h: 'center', v: 'middle' });
}

/**
 * Writes a sheet as R12 DXF text (fills are SVG-only and left out).
 * @param {object} sheet
 * @returns {string}
 */
export function sheetToDxf(sheet) {
  const d = createDxf({ insunits: 4, ltscale: (25 * sheet.scale) / 100 });
  const used = [...new Set(sheet.items.filter((i) => i.kind !== 'fill').map((i) => i.layer))];
  for (const name of used) {
    const style = LAYERS[name] ?? { color: 7, linetype: 'CONTINUOUS' };
    d.layer(name, { color: style.color, linetype: style.linetype });
  }
  for (const it of sheet.items) {
    if (it.kind === 'line') d.line(it.layer, it.a, it.b);
    else if (it.kind === 'poly') d.poly(it.layer, it.points, it.closed);
    else if (it.kind === 'arc') d.arc(it.layer, it.center, it.radius, it.startDeg, it.endDeg);
    else if (it.kind === 'circle') d.circle(it.layer, it.center, it.radius);
    else if (it.kind === 'text') d.text(it.layer, it.at, it.height, it.text, it.rotationDeg, it.align);
  }
  return d.toString();
}

/**
 * Builds the whole sample set from the sample house.
 * @returns {{ file: string, title: string, slot: string, levelIndex?: number, section?: string, number: number, scale: number, origin: number[], items: object[], dxf: string }[]}
 */
export function buildDrawingSet() {
  const house = sampleHouse();
  const sheets = [
    planSheet(house, 'ground', { file: '01-ground-floor-plan.dxf', title: 'GROUND FLOOR PLAN', slot: 'plan', levelIndex: 0, number: 1 }),
    planSheet(house, 'first', { file: '02-first-floor-plan.dxf', title: 'FIRST FLOOR PLAN', slot: 'plan', levelIndex: 1, number: 2 }),
    sectionSheet(house, 'A', { file: '03-section-A-A.dxf', title: 'SECTION A-A', slot: 'section', section: 'A', number: 3 }),
    sectionSheet(house, 'B', { file: '04-section-B-B.dxf', title: 'SECTION B-B', slot: 'section', section: 'B', number: 4 }),
    workingSheet(house, 'A', { file: '05-working-drawing-A-A.dxf', title: 'WORKING DRAWING SECTION A-A', slot: 'working', section: 'A', number: 5 }),
    workingSheet(house, 'B', { file: '06-working-drawing-B-B.dxf', title: 'WORKING DRAWING SECTION B-B', slot: 'working', section: 'B', number: 6 }),
    layoutSheet(house, { file: '07-site-layout.dxf', title: 'SITE LAYOUT', slot: 'layout', number: 7 })
  ];
  for (const sheet of sheets) {
    frameSheet(sheet, sheets.length);
    sheet.dxf = sheetToDxf(sheet);
  }
  return sheets;
}

