/**
 * Floor-plan extraction without AI: walls from parallel line pairs, doors and windows from the
 * symbols in wall gaps, rooms from the faces of the wall graph, and section marks.
 * Pure module: no DOM. Input in drawing units, output in metres.
 */
import { distance, dot, pointInPolygon, polygonCentroid } from '../../model/geometry.js';
import { guessRoomUse } from '../../model/schema.js';
import { layerRole, isPartialWallLayer, normaliseSectionLabel } from './classify.js';
import { textsOf, tagOf, isNameLike } from './text.js';
import {
  collectSegments, pairSegments, mergePieces, snapEnds, faceHoles, framePoint, wallEnds, junctionTest
} from './walls.js';
import { createGrid, boxOf } from './grid.js';
import { nodeWallsGrouped, findRoomFacesGrouped, estimateNodedWalls } from './noding.js';

/** Door and window entities closer than this (m) belong to one symbol. */
const CLUSTER_GAP = 0.1;
/** A tag text must be within this distance (m) of its opening. */
const TAG_REACH = 1.5;
/** Slack (m) around a wall band when deciding which wall a symbol sits in. */
const BAND_SLACK = 0.03;
/** Narrowest opening kept (m). */
const MIN_OPENING = 0.2;
/** Arcs on a wall layer that look like door swings: sweep and radius ranges. */
const SWING_SWEEP = [60, 120];
const SWING_RADIUS = [0.45, 1.5];
const DEG = Math.PI / 180;
/** Grid cell (m) for finding nearby symbols, walls and tags. */
const GRID_CELL = 2;
/**
 * Most line segments read from the wall layer. A real floor plan stays well below this; more
 * means hatching or patterns on the wall layer, which would take minutes to sort through.
 */
export const MAX_WALL_SEGMENTS = 10000;
/**
 * Most door and window entities read (lines, arcs and polylines on door and window layers, and
 * door swings on the wall layer). A large floor has a few thousand; more means hatching, and
 * grouping them into symbols would take minutes.
 */
export const MAX_SYMBOL_ENTITIES = 5000;
/**
 * Most walls a plan may give, counted after crossings and T-junctions split them. A large house
 * floor has about 100 and a floor of 20 × 20 rooms 840; more usually means hatching or patterns
 * that pair up like walls. Checking and building a floor grows with the square of its walls
 * (about 2 s at this limit), so more would keep the page busy for many seconds.
 */
export const MAX_WALLS = 1000;

/**
 * Sample points of a drawing entity in metres, used for clustering and band tests. Arcs include
 * their centre, which for a door swing is the hinge on the wall face.
 * @returns {[number, number][]}
 */
function samplePoints(e, factor) {
  const s = (p) => [p[0] * factor, p[1] * factor];
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  switch (e.type) {
    case 'LINE':
      return [s(e.a), s(e.b), s(mid(e.a, e.b))];
    case 'POLY': {
      const pts = e.points.map(s);
      const out = [...pts];
      for (let i = 0; i + 1 < pts.length; i++) out.push(mid(pts[i], pts[i + 1]));
      if (e.closed && pts.length > 2) out.push(mid(pts[pts.length - 1], pts[0]));
      return out;
    }
    case 'ARC': {
      const sweep = ((e.endDeg - e.startDeg) % 360 + 360) % 360 || 360;
      const out = [s(e.center)];
      for (let k = 0; k <= 4; k++) {
        const a = (e.startDeg + (sweep * k) / 4) * DEG;
        out.push(s([e.center[0] + e.radius * Math.cos(a), e.center[1] + e.radius * Math.sin(a)]));
      }
      return out;
    }
    case 'CIRCLE':
      return [0, 90, 180, 270].map((deg) => s([e.center[0] + e.radius * Math.cos(deg * DEG), e.center[1] + e.radius * Math.sin(deg * DEG)]));
    default:
      return [];
  }
}

/**
 * Gap between two boxes (0 when they touch or overlap).
 * @returns {number}
 */
function boxGap(p, q) {
  const dx = Math.max(0, p.min[0] - q.max[0], q.min[0] - p.max[0]);
  const dy = Math.max(0, p.min[1] - q.max[1], q.min[1] - p.max[1]);
  return Math.hypot(dx, dy);
}

/**
 * Groups door or window entities into symbols by proximity (union of items within 0.1 m).
 * @param {{ points: [number, number][], role: string }[]} items
 * @returns {{ role: string, points: [number, number][], bbox: object }[]}
 */
function clusterSymbols(items) {
  const boxes = items.map((item) => boxOf(item.points));
  const parent = items.map((_, i) => i);
  const find = (i) => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== root) {
      const next = parent[i];
      parent[i] = root;
      i = next;
    }
    return root;
  };
  // Boxes grown by half the gap overlap when the items are within the gap, so such pairs share a
  // grid cell. Pairs already in one group are skipped before measuring, which keeps dense
  // hatching quick; the groups do not depend on the order pairs are joined in.
  const grid = createGrid(GRID_CELL);
  boxes.forEach((box, i) => grid.insert(i, boxOf([box.min, box.max], CLUSTER_GAP / 2)));
  grid.forEachCell((cell) => {
    for (let x = 0; x < cell.length; x++) {
      for (let y = x + 1; y < cell.length; y++) {
        const i = cell[x];
        const j = cell[y];
        if (items[i].role !== items[j].role) continue;
        const ri = find(i);
        const rj = find(j);
        if (ri !== rj && boxGap(boxes[i], boxes[j]) <= CLUSTER_GAP) parent[Math.max(ri, rj)] = Math.min(ri, rj);
      }
    }
  });
  const groups = new Map();
  items.forEach((item, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, { role: item.role, points: [] });
    groups.get(root).points.push(...item.points);
  });
  return [...groups.values()].map((g) => ({ ...g, bbox: boxOf(g.points) }));
}

/**
 * True for an arc that looks like a door swing (about a quarter circle, door-sized radius).
 * @returns {boolean}
 */
function isSwingArc(e, factor) {
  const sweep = ((e.endDeg - e.startDeg) % 360 + 360) % 360;
  const r = e.radius * factor;
  return sweep >= SWING_SWEEP[0] && sweep <= SWING_SWEEP[1] && r >= SWING_RADIUS[0] && r <= SWING_RADIUS[1];
}

/**
 * Chooses the layer with the most wall-like line pairs when no layer is named as a wall layer.
 * Layers with more than MAX_WALL_SEGMENTS segments are not tried.
 * @returns {{ layer: string | null, tooMany: number }} tooMany: the most segments on a layer
 *   that was not tried (0 when none)
 */
function guessWallLayer(entities, factor) {
  const byLayer = new Map();
  for (const e of entities) {
    if ((e.type !== 'LINE' && e.type !== 'POLY') || layerRole(e.layer) !== null) continue;
    if (!byLayer.has(e.layer)) byLayer.set(e.layer, []);
    byLayer.get(e.layer).push(e);
  }
  let best = null;
  let tooMany = 0;
  for (const [name, list] of byLayer) {
    const segments = collectSegments(list, factor, () => 'full');
    if (segments.length > MAX_WALL_SEGMENTS) {
      tooMany = Math.max(tooMany, segments.length);
      continue;
    }
    const { pieces } = pairSegments(segments);
    const total = pieces.reduce((sum, p) => sum + (p.s1 - p.s0), 0);
    if (total >= 0.5 && (!best || total > best.total)) best = { name, total };
  }
  return { layer: best ? best.name : null, tooMany };
}

/**
 * Indexes door and window symbols by their boxes for symbolInStretch.
 * @param {{ points: [number, number][], bbox: object }[]} symbols
 * @returns {{ symbols: object[], grid: ReturnType<typeof createGrid> }}
 */
function indexSymbols(symbols) {
  const grid = createGrid(GRID_CELL);
  symbols.forEach((sym, i) => grid.insert(i, sym.bbox));
  return { symbols, grid };
}

/**
 * True when a symbol has a point inside a wall's band between positions lo and hi.
 * @param {{ symbols: object[], grid: ReturnType<typeof createGrid> }} index from indexSymbols
 * @returns {boolean}
 */
function symbolInStretch(index, wall, lo, hi) {
  const from = Math.min(lo, hi) - 0.02;
  const to = Math.max(lo, hi) + 0.02;
  const half = wall.t / 2 + 0.05;
  const area = boxOf([framePoint(wall, from, -half), framePoint(wall, from, half), framePoint(wall, to, -half), framePoint(wall, to, half)]);
  return index.grid.query(area).some((i) => index.symbols[i].points.some((p) => {
    const s = dot(p, wall.u);
    const o = dot(p, wall.n) - wall.c;
    return s >= from && s <= to && Math.abs(o) <= half;
  }));
}

/**
 * A point inside a polygon: its centroid when that is inside, else the middle of the widest
 * horizontal run through the centroid's height.
 * @returns {[number, number]}
 */
function interiorPoint(polygon) {
  const c = polygonCentroid(polygon);
  if (pointInPolygon(c, polygon)) return c;
  const ys = polygon.map((p) => p[1]).sort((a, b) => a - b);
  const tries = [c[1], (ys[0] + ys[ys.length - 1]) / 2, ys[0] + (ys[1] - ys[0]) / 2];
  for (const y of tries) {
    const xs = [];
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i];
      const q = polygon[(i + 1) % polygon.length];
      if ((p[1] > y) !== (q[1] > y)) xs.push(p[0] + ((y - p[1]) * (q[0] - p[0])) / (q[1] - p[1]));
    }
    xs.sort((a, b) => a - b);
    let best = null;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
    }
    if (best) return [(best[0] + best[1]) / 2, y];
  }
  return c;
}

/**
 * Section-mark labels: short texts on section layers, or "A-A" texts anywhere.
 * @returns {string[]}
 */
function sectionMarks(texts) {
  const labels = new Set();
  for (const e of texts) {
    const t = e.text.trim().toUpperCase().replace(/[‐-―−]/g, '-');
    if (layerRole(e.layer) === 'section') {
      const label = /^[A-Z0-9]{1,2}$/.test(t) ? t : normaliseSectionLabel(t);
      if (label) labels.add(label);
    } else {
      const m = /^(?:SEC(?:TION)?\.?\s*)?([A-Z]|\d{1,2})\s*-\s*\1$/.exec(t);
      if (m) labels.add(m[1]);
    }
  }
  return [...labels].sort();
}

/**
 * Finds openings in the walls from door and window symbols.
 * @returns {{ wall: number, type: string, s0: number, s1: number }[]}
 */
function placeOpenings(symbols, walls, warnings) {
  const openings = [];
  let unplaced = 0;
  const grid = createGrid(GRID_CELL);
  walls.forEach((w, wi) => grid.insert(wi, boxOf([framePoint(w, w.s0 - BAND_SLACK), framePoint(w, w.s1 + BAND_SLACK)], w.t / 2 + BAND_SLACK)));
  for (const sym of symbols) {
    let best = null;
    grid.query(sym.bbox).forEach((wi) => {
      const w = walls[wi];
      const inBand = sym.points.filter((p) => {
        const s = dot(p, w.u);
        const o = dot(p, w.n) - w.c;
        return Math.abs(o) <= w.t / 2 + BAND_SLACK && s >= w.s0 - BAND_SLACK && s <= w.s1 + BAND_SLACK;
      });
      if (inBand.length > 0 && (!best || inBand.length > best.points.length)) best = { wi, points: inBand };
    });
    if (!best) {
      unplaced += 1;
      continue;
    }
    const w = walls[best.wi];
    // A loop, not Math.min(...): a symbol made of hatching can have more points than a call takes.
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of best.points) {
      const along = dot(p, w.u);
      if (along < lo) lo = along;
      if (along > hi) hi = along;
    }
    const holes = w.holes.filter(([h0, h1]) => h1 > lo + 0.01 && h0 < hi - 0.01);
    const s0 = holes.length > 0 ? Math.min(...holes.map((h) => h[0])) : lo;
    const s1 = holes.length > 0 ? Math.max(...holes.map((h) => h[1])) : hi;
    if (s1 - s0 < MIN_OPENING) {
      unplaced += 1;
      continue;
    }
    const type = sym.role === 'door' ? 'door' : 'window';
    const clash = openings.find((o) => o.wall === best.wi && o.s0 < s1 - 0.01 && o.s1 > s0 + 0.01);
    if (clash) {
      if (type === 'door') clash.type = 'door';
      clash.s0 = Math.min(clash.s0, s0);
      clash.s1 = Math.max(clash.s1, s1);
      continue;
    }
    openings.push({ wall: best.wi, type, s0, s1 });
  }
  if (unplaced > 0) warnings.push(`${unplaced} door or window symbol${unplaced === 1 ? '' : 's'} could not be placed on a wall.`);
  return openings;
}

/**
 * Links each opening to the nearest unused D/W/V tag text within 1.5 m.
 * @returns {(string | null)[]}
 */
function assignTags(openings, walls, texts, factor) {
  const tags = texts.map((e) => ({ tag: tagOf(e.text), at: [e.at[0] * factor, e.at[1] * factor] })).filter((t) => t.tag);
  const pairs = [];
  const grid = createGrid(GRID_CELL);
  tags.forEach((t, ti) => grid.insert(ti, boxOf([t.at])));
  openings.forEach((o, oi) => {
    const centre = framePoint(walls[o.wall], (o.s0 + o.s1) / 2);
    grid.query(boxOf([centre], TAG_REACH)).forEach((ti) => {
      const t = tags[ti];
      const d = distance(centre, t.at);
      if (d <= TAG_REACH) pairs.push({ oi, ti, d });
    });
  });
  pairs.sort((x, y) => x.d - y.d);
  const result = openings.map(() => null);
  const usedTags = new Set();
  for (const { oi, ti } of pairs) {
    if (result[oi] !== null || usedTags.has(ti)) continue;
    result[oi] = tags[ti].tag;
    usedTags.add(ti);
  }
  return result;
}

/**
 * Names every face of the noded wall graph from the room texts inside it.
 * @returns {{ name: string | null, use: string, at: [number, number] }[]}
 */
function nameRooms(noded, texts, factor) {
  const roomLayerTexts = texts.filter((e) => layerRole(e.layer) === 'room');
  const skipRoles = new Set(['door', 'window', 'section', 'level']);
  const pool = (roomLayerTexts.length > 0 ? roomLayerTexts : texts.filter((e) => !skipRoles.has(layerRole(e.layer))))
    .filter((e) => isNameLike(e.text))
    .map((e, i) => ({ i, text: e.text.trim(), at: [e.at[0] * factor, e.at[1] * factor] }));
  const faces = findRoomFacesGrouped(noded).sort((x, y) => x.area - y.area);
  const claimed = new Set();
  const within = (p, box) => p[0] >= box.min[0] && p[0] <= box.max[0] && p[1] >= box.min[1] && p[1] <= box.max[1];
  return faces.map((face) => {
    const box = boxOf(face.polygon);
    const inside = pool.filter((t) => !claimed.has(t.i) && within(t.at, box) && pointInPolygon(t.at, face.polygon));
    inside.forEach((t) => claimed.add(t.i));
    inside.sort((x, y) => (y.at[1] - x.at[1]) || (x.at[0] - y.at[0]));
    const name = inside.length > 0 ? inside.map((t) => t.text).join(' ') : null;
    const at = inside.length > 0 ? inside[0].at : interiorPoint(face.polygon);
    return { name, use: name ? guessRoomUse(name) : 'other', at };
  });
}

/**
 * The warning for a wall layer with too many lines.
 * @param {number} count segments on the wall layer
 * @returns {string}
 */
function tooManyLines(count) {
  return `This drawing has too many lines on the wall layer (${count.toLocaleString('en-GB')}). Turn off hatching and patterns on the wall layer, or explode fewer blocks, and export again.`;
}

/** The warning for wall lines that make more walls than MAX_WALLS. */
const TOO_MANY_WALLS = `The lines on this drawing's wall layer make more than ${MAX_WALLS.toLocaleString('en-GB')} walls, which is too many to build in 3D. Turn off hatching and patterns on the wall layer, or split the plan into smaller drawings, and export again.`;

/**
 * True when merged walls are, or once noded would be, more than MAX_WALLS.
 * @param {object[]} walls merged walls (wall-frame form)
 * @returns {boolean}
 */
function tooManyWalls(walls) {
  return walls.length > MAX_WALLS || estimateNodedWalls(walls.map(wallEnds), MAX_WALLS) > MAX_WALLS;
}

/**
 * The result for a plan whose wall layer is too busy to read.
 * @param {string} warning tooManyLines(…) or TOO_MANY_WALLS
 * @param {object[]} texts
 * @param {string | null} wallLayer
 * @returns {object} an extractPlan result with no walls, `overLimit: true` and the warning
 */
function overLimit(warning, texts, wallLayer) {
  return {
    walls: [],
    openings: [],
    rooms: [],
    sectionMarks: sectionMarks(texts),
    wallLayer,
    warnings: [warning],
    overLimit: true
  };
}

/**
 * Extracts walls, openings, rooms and section marks from a floor plan.
 * Walls: segments on the wall layers (or, when no layer is named like a wall layer, the layer
 * with the most wall-like pairs, with a "Wall layer guessed" warning) are paired 75–600 mm apart,
 * merged across junction gaps (up to 1.5× the thickness of the walls meeting there) and across
 * gaps holding a door or window symbol, snapped onto neighbouring centrelines, then noded.
 * Walls on partial-height layers (A-WALL-PRHT, parapets, railings) are marked `partial`.
 * Openings: door and window symbols (entities within 0.1 m of each other) sit in a wall gap;
 * the gap gives the width and position; the nearest D/W/V tag within 1.5 m gives the tag.
 * Rooms: every enclosed face of the wall graph, named from the room text inside it (null when
 * there is none). Section marks: labels on section layers or "A-A" texts.
 * More than MAX_SYMBOL_ENTITIES door and window entities are not read (no openings, with a
 * warning); the walls still are.
 * A wall layer with more than MAX_WALL_SEGMENTS line segments, or whose lines make more than
 * MAX_WALLS walls once crossings and T-junctions are split, is not read: the result has no walls,
 * `overLimit: true` and a warning that says how to export the drawing instead.
 * @param {import('../dxf/reader.js').DxfDoc} doc
 * @param {{ factor?: number }} [options] metres per drawing unit
 * @returns {{
 *   walls: { a: [number, number], b: [number, number], thickness: number, partial?: boolean }[],
 *   openings: { type: 'door'|'window'|'opening', wall: number, at: number, width: number, tag: string | null }[],
 *   rooms: { name: string | null, use: string, at: [number, number] }[],
 *   sectionMarks: string[], wallLayer: string | null, warnings: string[], overLimit?: true
 * }}
 */
export function extractPlan(doc, { factor = 0.001 } = {}) {
  const warnings = [];
  const entities = doc?.entities ?? [];
  const texts = textsOf(doc);
  let wallLayers = new Set(entities.filter((e) => layerRole(e.layer) === 'wall').map((e) => e.layer));
  const groupOf = (e) => (wallLayers.has(e.layer) ? (isPartialWallLayer(e.layer) ? 'partial' : 'full') : null);
  let segments = collectSegments(entities, factor, groupOf);
  if (segments.length > MAX_WALL_SEGMENTS) return overLimit(tooManyLines(segments.length), texts, [...wallLayers][0] ?? null);
  let paired = pairSegments(segments);
  if (paired.pieces.length === 0) {
    const guess = guessWallLayer(entities, factor);
    if (guess.layer !== null) {
      wallLayers = new Set([guess.layer]);
      segments = collectSegments(entities, factor, groupOf);
      paired = pairSegments(segments);
      warnings.push(`Wall layer guessed: "${guess.layer}". Name wall layers A-WALL so they are found for sure.`);
    } else if (wallLayers.size === 0 && guess.tooMany > 0) {
      return overLimit(tooManyLines(guess.tooMany), texts, null);
    }
  }
  const counts = new Map();
  for (const s of segments) counts.set(s.layer, (counts.get(s.layer) ?? 0) + 1);
  const wallLayer = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;

  const items = [];
  let curved = 0;
  for (const e of entities) {
    const role = layerRole(e.layer);
    const onWall = wallLayers.has(e.layer);
    if (onWall && (e.type === 'ARC' || e.type === 'CIRCLE')) {
      if (e.type === 'ARC' && isSwingArc(e, factor)) items.push({ role: 'door', points: samplePoints(e, factor) });
      else curved += 1;
      continue;
    }
    if ((role === 'door' || role === 'window') && ['LINE', 'POLY', 'ARC', 'CIRCLE'].includes(e.type)) {
      items.push({ role, points: samplePoints(e, factor) });
    }
  }
  if (curved > 0) warnings.push(`Curved wall skipped: ${curved} arc${curved === 1 ? '' : 's'} on the wall layer ${curved === 1 ? 'is' : 'are'} not built in 3D.`);
  const tooManySymbols = items.length > MAX_SYMBOL_ENTITIES;
  if (tooManySymbols) {
    warnings.push(`This drawing has too many lines on the door and window layers (${items.length.toLocaleString('en-GB')}), so doors and windows were left out. Turn off hatching and patterns on those layers and export again.`);
  }
  const symbols = tooManySymbols ? [] : clusterSymbols(items);
  const symbolIndex = indexSymbols(symbols);
  const isJunction = junctionTest(paired.pieces);

  const merged = mergePieces(paired.pieces, (wall, g0, g1) => (g1 - g0) <= 1.5 * wall.t
    || symbolInStretch(symbolIndex, wall, g0, g1)
    || isJunction(wall, g0, g1));
  // Checked before snapping (crossings alone can make far too many walls) and again after it.
  if (tooManyWalls(merged)) return overLimit(TOO_MANY_WALLS, texts, wallLayer);
  snapEnds(merged, (wall, lo, hi) => symbolInStretch(symbolIndex, wall, lo, hi));
  const walls = merged.filter((w) => w.s1 - w.s0 > 0.05);
  if (tooManyWalls(walls)) return overLimit(TOO_MANY_WALLS, texts, wallLayer);
  for (const w of walls) w.holes = faceHoles(w, paired.buckets);

  if (walls.length === 0) {
    warnings.push('No walls found on this plan. Walls should be drawn as two parallel lines on a layer named A-WALL.');
  }

  const found = placeOpenings(symbols, walls, warnings);
  const tags = assignTags(found, walls, texts, factor);
  const byWall = walls.map(() => []);
  found.forEach((o, k) => byWall[o.wall].push({ o, k }));
  const modelWalls = walls.map((w, i) => {
    const { a, b } = wallEnds(w);
    const openings = byWall[i]
      .map(({ o, k }) => ({ id: `o${k}`, type: o.type, at: (o.s0 + o.s1) / 2 - w.s0, width: o.s1 - o.s0, height: 1, sill: 0, tag: tags[k] }));
    return { id: `p${i}`, level: 'plan', a, b, thickness: w.t, partial: w.group === 'partial', openings };
  });
  const noded = nodeWallsGrouped(modelWalls);
  const outWalls = noded.map((w) => {
    const wall = { a: w.a, b: w.b, thickness: w.thickness };
    if (w.partial) wall.partial = true;
    return wall;
  });
  const outOpenings = [];
  noded.forEach((w, wi) => {
    for (const o of w.openings) outOpenings.push({ type: o.type, wall: wi, at: o.at, width: o.width, tag: o.tag });
  });

  return {
    walls: outWalls,
    openings: outOpenings,
    rooms: noded.length > 0 ? nameRooms(noded, texts, factor) : [],
    sectionMarks: sectionMarks(texts),
    wallLayer,
    warnings
  };
}
