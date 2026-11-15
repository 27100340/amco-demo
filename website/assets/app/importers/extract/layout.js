/**
 * Site-layout extraction without AI: plot boundary, boundary wall with its gates, lawn, paving
 * and road areas, the building footprint and the street side.
 * Pure module: no DOM. Input in drawing units, output in metres.
 */
import { distance, polygonArea, polygonCentroid, pointInPolygon } from '../../model/geometry.js';
import { layerRole } from './classify.js';
import { textsOf, parseDrawingLength } from './text.js';
import { collectSegments, pairSegments, mergePieces, snapEnds, framePoint, junctionTest } from './walls.js';
import { createGrid, boxOf } from './grid.js';

/** Narrowest gap in a boundary wall treated as a gate (m). */
const MIN_GATE = 0.6;
/** Points closer than this (m) close a polyline loop. */
const CLOSE_TOLERANCE = 0.01;
/** Grid cell (m) for finding line ends that meet: small, as only ends within 1 cm matter. */
const GRID_CELL = 0.1;
const GROUND_MATERIALS = { lawn: 'lawn', paving: 'paving', road: 'road' };
const WALL_LAYER_RE = /WALL|FENC/i;
const HEIGHT_RE = /(\d+\s*'(?:\s*-?\s*\d+(?:\s+\d+\/\d+)?\s*")?|\d+(?:\.\d+)?\s*(?:mm|m)\b)\s*(?:HIGH|HT\b)|(?:HEIGHT|HT\.?)\s*[:=]?\s*(\d+\s*'(?:\s*-?\s*\d+(?:\s+\d+\/\d+)?\s*")?|\d+(?:\.\d+)?\s*(?:mm|m)?)/i;
const ROAD_TEXT_RE = /\bROAD\b|\bSTREET\b/i;
const ROAD_WIDTH_RE = /(\d+\s*'(?:\s*-?\s*\d+(?:\s+\d+\/\d+)?\s*")?|\d+(?:\.\d+)?\s*m\b)/i;

/**
 * Closed polygons (closed POLY entities, or open ones whose ends meet) in metres.
 * @returns {{ layer: string, role: string | null, polygon: [number, number][], area: number }[]}
 */
function closedPolygons(entities, factor) {
  const out = [];
  for (const e of entities) {
    if (e.type !== 'POLY' || e.points.length < 3) continue;
    let pts = e.points.map((p) => [p[0] * factor, p[1] * factor]);
    const ends = distance(pts[0], pts[pts.length - 1]) <= CLOSE_TOLERANCE;
    if (!e.closed && !ends) continue;
    if (ends) pts = pts.slice(0, -1);
    if (pts.length < 3) continue;
    out.push({ layer: e.layer, role: layerRole(e.layer), polygon: pts, area: Math.abs(polygonArea(pts)) });
  }
  return out;
}

/**
 * Chains LINE entities into closed loops (end to end within 1 cm), largest first. Each step takes
 * the first unused line, in drawing order, with an end at the loop's tail; line ends are indexed
 * so each step only looks at lines ending nearby.
 * @returns {[number, number][][]}
 */
function lineLoops(entities, factor) {
  const segs = entities.filter((e) => e.type === 'LINE').map((e) => [[e.a[0] * factor, e.a[1] * factor], [e.b[0] * factor, e.b[1] * factor]]);
  const grid = createGrid(GRID_CELL);
  segs.forEach(([p, q], i) => {
    grid.insert(i, boxOf([p]));
    grid.insert(i, boxOf([q]));
  });
  const used = new Set();
  const loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (used.has(i)) continue;
    const loop = [segs[i][0], segs[i][1]];
    used.add(i);
    let extended = true;
    while (extended) {
      extended = false;
      const tail = loop[loop.length - 1];
      for (const j of grid.query(boxOf([tail], CLOSE_TOLERANCE))) {
        if (used.has(j)) continue;
        const [p, q] = segs[j];
        if (distance(p, tail) <= CLOSE_TOLERANCE) loop.push(q);
        else if (distance(q, tail) <= CLOSE_TOLERANCE) loop.push(p);
        else continue;
        used.add(j);
        extended = true;
        break;
      }
    }
    if (loop.length >= 4 && distance(loop[0], loop[loop.length - 1]) <= CLOSE_TOLERANCE) loops.push(loop.slice(0, -1));
  }
  return loops.sort((x, y) => Math.abs(polygonArea(y)) - Math.abs(polygonArea(x)));
}

/**
 * The largest polygon of a list, or null.
 * @returns {[number, number][] | null}
 */
function largest(list) {
  const sorted = [...list].sort((x, y) => y.area - x.area);
  return sorted.length > 0 ? sorted[0].polygon : null;
}

/**
 * Bounding box of a polygon.
 * @returns {{ min: [number, number], max: [number, number] }}
 */
function bounds(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] };
}

/**
 * The boundary wall: thickness from its line pairs, gates from the gaps between collinear runs,
 * height from a note such as "BOUNDARY WALL 7'-0\" HIGH".
 * @returns {{ thickness: number, height: number | null, gates: { at: [number, number], width: number }[] } | null}
 */
function boundaryWall(entities, texts, factor, footprint) {
  const layers = new Set(entities.map((e) => e.layer).filter((name) => {
    const role = layerRole(name);
    return (role === 'site' || role === 'boundary') && WALL_LAYER_RE.test(name);
  }));
  if (layers.size === 0) return null;
  const segments = collectSegments(entities, factor, (e) => (layers.has(e.layer) ? 'site' : null));
  const { pieces } = pairSegments(segments);
  if (pieces.length === 0) return null;
  const isJunction = junctionTest(pieces);
  const walls = mergePieces(pieces, (wall, g0, g1) => g1 - g0 <= 1.5 * wall.t || isJunction(wall, g0, g1));
  snapEnds(walls, () => false);
  const total = walls.reduce((s, w) => s + (w.s1 - w.s0), 0);
  const thickness = walls.reduce((s, w) => s + w.t * (w.s1 - w.s0), 0) / total;

  const gates = [];
  const lines = [];
  for (const w of walls) {
    const line = lines.find((l) => l.bucket === w.bucket && Math.abs(l.c - w.c) <= 0.01 && Math.abs(l.t - w.t) <= 0.012);
    if (line) line.walls.push(w);
    else lines.push({ bucket: w.bucket, c: w.c, t: w.t, walls: [w] });
  }
  for (const line of lines) {
    const runs = line.walls.sort((x, y) => x.s0 - y.s0);
    for (let i = 0; i + 1 < runs.length; i++) {
      const width = runs[i + 1].s0 - runs[i].s1;
      if (width < MIN_GATE) continue;
      const at = framePoint(runs[i], (runs[i].s1 + runs[i + 1].s0) / 2);
      if (footprint && pointInPolygon(at, footprint)) continue;
      gates.push({ at, width });
    }
  }

  let height = null;
  for (const e of texts) {
    if (!/WALL/i.test(e.text)) continue;
    const m = HEIGHT_RE.exec(e.text);
    if (m) {
      height = parseDrawingLength((m[1] ?? m[2]).trim());
      if (height !== null) break;
    }
  }
  return { thickness, height, gates };
}

/**
 * The street side and width from "ROAD" text and road polygons.
 * @returns {{ side: 'north'|'south'|'east'|'west', width: number | null } | null}
 */
function streetOf(boundary, roads, texts, factor) {
  if (!boundary) return null;
  const roadTexts = texts.filter((e) => ROAD_TEXT_RE.test(e.text));
  if (roadTexts.length === 0 && roads.length === 0) return null;
  const point = roadTexts.length > 0
    ? [roadTexts[0].at[0] * factor, roadTexts[0].at[1] * factor]
    : polygonCentroid(roads[0]);
  const box = bounds(boundary);
  const outside = {
    south: box.min[1] - point[1],
    north: point[1] - box.max[1],
    west: box.min[0] - point[0],
    east: point[0] - box.max[0]
  };
  const side = Object.entries(outside).sort((x, y) => y[1] - x[1])[0][0];
  let width = null;
  const road = roads.find((r) => pointInPolygon(point, r)) ?? roads[0];
  if (road) {
    const rb = bounds(road);
    width = side === 'south' || side === 'north' ? rb.max[1] - rb.min[1] : rb.max[0] - rb.min[0];
  } else {
    for (const e of roadTexts) {
      const m = ROAD_WIDTH_RE.exec(e.text);
      if (m) {
        width = parseDrawingLength(m[1].trim());
        if (width !== null) break;
      }
    }
  }
  return { side, width };
}

/**
 * Extracts the site from a layout drawing.
 * - boundary: the largest closed polyline on a property layer (C-PROP, PLOT*, BOUNDARY*), else on
 *   another A-SITE* layer, else the largest loop of lines on those layers;
 * - boundaryWall: line pairs on boundary-wall layers (A-SITE-WALL, BOUNDARY WALL…): thickness,
 *   height from a "… WALL … 7'-0\" HIGH" note, gates at the gaps (not under the footprint);
 * - ground: closed polylines on lawn (L-PLNT), paving (A-SITE-PAVE) and road (C-ROAD) layers;
 * - footprint: the largest closed polyline on A-SITE-BLDG;
 * - street: the boundary side the "ROAD" text (or road area) lies beyond, with the road width.
 * @param {import('../dxf/reader.js').DxfDoc} doc
 * @param {{ factor?: number }} [options] metres per drawing unit
 * @returns {{ boundary: [number, number][] | null, boundaryWall: { thickness: number, height: number | null, gates: { at: [number, number], width: number }[] } | null,
 *   ground: { polygon: [number, number][], material: 'lawn'|'paving'|'road' }[], footprint: [number, number][] | null,
 *   street: { side: string, width: number | null } | null, warnings: string[] }}
 */
export function extractLayout(doc, { factor = 0.001 } = {}) {
  const warnings = [];
  const entities = doc?.entities ?? [];
  const texts = textsOf(doc);
  const polys = closedPolygons(entities, factor);
  const notWall = (p) => !WALL_LAYER_RE.test(p.layer);
  let boundary = largest(polys.filter((p) => p.role === 'boundary' && notWall(p)))
    ?? largest(polys.filter((p) => p.role === 'site' && notWall(p)));
  if (!boundary) {
    const loops = lineLoops(entities.filter((e) => layerRole(e.layer) === 'boundary' && !WALL_LAYER_RE.test(e.layer)), factor);
    boundary = loops[0] ?? null;
  }
  if (!boundary) warnings.push('No plot boundary found. Draw it as a closed polyline on layer C-PROP.');

  const footprint = largest(polys.filter((p) => p.role === 'footprint'));
  const ground = polys
    .filter((p) => GROUND_MATERIALS[p.role])
    .map((p) => ({ polygon: p.polygon, material: GROUND_MATERIALS[p.role] }));
  const roads = ground.filter((g) => g.material === 'road').map((g) => g.polygon);

  return {
    boundary,
    boundaryWall: boundary ? boundaryWall(entities, texts, factor, footprint) : null,
    ground,
    footprint,
    street: streetOf(boundary, roads, texts, factor),
    warnings
  };
}
