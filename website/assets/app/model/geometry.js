/**
 * Plan geometry for the Building Model: vectors, polygons, wall noding, mitred wall
 * footprints and room detection from the wall centreline graph.
 * Pure module: no DOM, no three.js. Points are `[x, y]` arrays in plan metres (y north).
 */

/** Numeric tolerance for degenerate vectors and parallel lines. */
export const EPS = 1e-9;

/** Wall ends closer than this (metres) are treated as one node by footprints and room faces. */
const NODE_TOLERANCE = 1e-3;
/** A mitre corner may sit at most this many wall thicknesses from its node. */
const MITRE_LIMIT = 3;
/** Faces smaller than this (m²) are not rooms. */
const MIN_ROOM_AREA = 0.5;
/** Below this (m²) a point is treated as lying on a polygon edge when deciding mitre gaps. */
const ON_EDGE = 1e-12;

/**
 * Subtracts two vectors.
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {[number, number]} a − b
 */
export function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1]];
}

/**
 * Adds two vectors.
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {[number, number]} a + b
 */
export function add(a, b) {
  return [a[0] + b[0], a[1] + b[1]];
}

/**
 * Scales a vector.
 * @param {[number, number]} a
 * @param {number} s
 * @returns {[number, number]} a · s
 */
export function scale(a, s) {
  return [a[0] * s, a[1] * s];
}

/**
 * Dot product.
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {number}
 */
export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1];
}

/**
 * 2D cross product (z of the 3D cross product). Positive when b is anticlockwise of a.
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {number}
 */
export function cross(a, b) {
  return a[0] * b[1] - a[1] * b[0];
}

/**
 * Vector length.
 * @param {[number, number]} a
 * @returns {number}
 */
export function length(a) {
  return Math.hypot(a[0], a[1]);
}

/**
 * Unit vector in the direction of `a`; `[0, 0]` for a zero vector.
 * @param {[number, number]} a
 * @returns {[number, number]}
 */
export function normalize(a) {
  const len = length(a);
  return len < EPS ? [0, 0] : [a[0] / len, a[1] / len];
}

/**
 * The normal to the left of direction `d` (rotated 90° anticlockwise). Wall side L uses it.
 * @param {[number, number]} d
 * @returns {[number, number]}
 */
export function leftNormal(d) {
  return [0 - d[1], d[0] + 0];
}

/**
 * Distance between two points.
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {number}
 */
export function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * Linear interpolation between two points.
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @param {number} t 0 gives a, 1 gives b
 * @returns {[number, number]}
 */
export function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Intersection of the infinite lines p + t·d and q + s·e.
 * @param {[number, number]} p
 * @param {[number, number]} d
 * @param {[number, number]} q
 * @param {[number, number]} e
 * @returns {[number, number] | null} null when the lines are parallel (or a direction is zero)
 */
export function lineIntersection(p, d, q, e) {
  const denom = cross(d, e);
  if (Math.abs(denom) <= EPS * length(d) * length(e)) return null;
  const t = cross(sub(q, p), e) / denom;
  return add(p, scale(d, t));
}

/**
 * Projects a point onto the line through segment a→b.
 * @param {[number, number]} pt
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {{ t: number, point: [number, number], distance: number }} `t` is the unclamped
 *   parameter (0 at a, 1 at b), `point` the foot of the perpendicular at `t`, and `distance`
 *   the distance from `pt` to that foot. Clamp `t` yourself to measure to the segment.
 */
export function projectOnSegment(pt, a, b) {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  const t = len2 > 0 ? dot(sub(pt, a), ab) / len2 : 0;
  const point = add(a, scale(ab, t));
  return { t, point, distance: distance(pt, point) };
}

/**
 * Signed polygon area: positive when the vertices run anticlockwise.
 * @param {[number, number][]} poly
 * @returns {number} m²
 */
export function polygonArea(poly) {
  if (!poly || poly.length < 3) return 0;
  const o = poly[0];
  let sum = 0;
  for (let i = 1; i < poly.length - 1; i++) {
    sum += cross(sub(poly[i], o), sub(poly[i + 1], o));
  }
  return sum / 2;
}

/**
 * Area centroid of a polygon (vertex average when the area is zero).
 * @param {[number, number][]} poly
 * @returns {[number, number]}
 */
export function polygonCentroid(poly) {
  if (!poly || poly.length === 0) return [0, 0];
  const o = poly[0];
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = sub(poly[i], o);
    const q = sub(poly[(i + 1) % poly.length], o);
    const c = cross(p, q);
    twiceArea += c;
    cx += (p[0] + q[0]) * c;
    cy += (p[1] + q[1]) * c;
  }
  if (Math.abs(twiceArea) < EPS) {
    const sum = poly.reduce((acc, p) => add(acc, p), [0, 0]);
    return scale(sum, 1 / poly.length);
  }
  return [o[0] + cx / (3 * twiceArea), o[1] + cy / (3 * twiceArea)];
}

/**
 * Even-odd point-in-polygon test. Points exactly on an edge may go either way.
 * @param {[number, number]} pt
 * @param {[number, number][]} poly
 * @returns {boolean}
 */
export function pointInPolygon(pt, poly) {
  if (!poly || poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * The original wall id of a noded piece, with every trailing `~N` suffix removed:
 * `w1~2` -> `w1`, `w1~2~3` -> `w1`.
 * @param {string} wallId
 * @returns {string}
 */
export function baseWallId(wallId) {
  return String(wallId).replace(/(?:~\d+)+$/, '');
}

/**
 * Groups wall indices by `wall.level`, keeping first-seen level order.
 * @param {{ level?: string }[]} walls
 * @returns {number[][]}
 */
function groupByLevel(walls) {
  const groups = new Map();
  walls.forEach((wall, i) => {
    if (!groups.has(wall.level)) groups.set(wall.level, []);
    groups.get(wall.level).push(i);
  });
  return [...groups.values()];
}

/**
 * Mean of a cluster of points, exact when all points are identical.
 * @param {[number, number][]} points
 * @returns {[number, number]}
 */
function meanPoint(points) {
  const o = points[0];
  let dx = 0;
  let dy = 0;
  for (const p of points) {
    dx += p[0] - o[0];
    dy += p[1] - o[1];
  }
  return [o[0] + dx / points.length, o[1] + dy / points.length];
}

/**
 * Clusters points that lie within `tolerance` of each other (transitively).
 * @param {[number, number][]} points
 * @param {number} tolerance
 * @returns {{ nodes: [number, number][], index: number[], members: [number, number][][] }}
 *   cluster means, each point's cluster and the points in each cluster
 */
function clusterPoints(points, tolerance) {
  const parent = points.map((_, i) => i);
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
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (distance(points[i], points[j]) <= tolerance) {
        const ri = find(i);
        const rj = find(j);
        if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj);
      }
    }
  }
  const clusterOfRoot = new Map();
  const members = [];
  const index = points.map((p, i) => {
    const root = find(i);
    if (!clusterOfRoot.has(root)) {
      clusterOfRoot.set(root, members.length);
      members.push([]);
    }
    const cluster = clusterOfRoot.get(root);
    members[cluster].push(p);
    return cluster;
  });
  return { nodes: members.map(meanPoint), index, members };
}

/**
 * Interior crossing point of segments a→b and c→d, ignoring touches within `tolerance` of an end.
 * @returns {[number, number] | null}
 */
function segmentCrossing(a, b, c, d, tolerance) {
  const r = sub(b, a);
  const s = sub(d, c);
  const lr = length(r);
  const ls = length(s);
  const denom = cross(r, s);
  if (Math.abs(denom) <= EPS * lr * ls) return null;
  const ac = sub(c, a);
  const t = cross(ac, s) / denom;
  const u = cross(ac, r) / denom;
  const inside = (param, len) => param * len > tolerance && param * len < len - tolerance;
  return inside(t, lr) && inside(u, ls) ? add(a, scale(r, t)) : null;
}

/**
 * Clamps a value into [lo, hi].
 * @returns {number}
 */
function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Chooses the piece an opening belongs to after its wall is split and re-bases `at` onto it.
 * Openings that fit their piece keep their exact position. An opening that straddles a split
 * point stays on the piece holding its centre, shifted to fit; when it cannot fit there it
 * moves to the longest piece it overlaps.
 * @param {{ at: number, width: number }} opening
 * @param {{ from: number, to: number }[]} ranges piece extents in metres from the wall's a end
 * @returns {{ piece: number, at: number }}
 */
function placeOpening(opening, ranges) {
  const centre = opening.at;
  const half = (opening.width ?? 0) / 2;
  let piece = ranges.findIndex((r) => centre < r.to);
  if (piece === -1) piece = ranges.length - 1;
  const own = ranges[piece];
  const crossesStart = piece > 0 && centre - half < own.from - EPS;
  const crossesEnd = piece < ranges.length - 1 && centre + half > own.to + EPS;
  if (!crossesStart && !crossesEnd) return { piece, at: centre - own.from };
  const ownLength = own.to - own.from;
  if (2 * half <= ownLength + EPS) {
    return { piece, at: clamp(centre - own.from, half, ownLength - half) };
  }
  let best = piece;
  ranges.forEach((r, i) => {
    const overlaps = centre + half > r.from && centre - half < r.to;
    if (overlaps && r.to - r.from > ranges[best].to - ranges[best].from) best = i;
  });
  const target = ranges[best];
  const targetLength = target.to - target.from;
  const at = 2 * half <= targetLength ? clamp(centre - target.from, half, targetLength - half) : targetLength / 2;
  return { piece: best, at };
}

/**
 * Joins wall ends that miss another wall's end diagonally: when an end projects onto another wall
 * within `tolerance` of that wall's end and lies within `tolerance` of its line, the two ends
 * become one node at the mean of all the wall ends it holds. Updates `records` in place.
 * @param {[number, number][]} nodes node positions (updated)
 * @param {[number, number][][]} members wall-end points held by each node (updated)
 * @param {{ ia: number, ib: number }[]} records
 * @param {number} tolerance
 */
function mergeNearEnds(nodes, members, records, tolerance) {
  const parent = nodes.map((_, i) => i);
  const find = (i) => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    return root;
  };
  const used = new Set(records.filter((r) => r.ia !== r.ib).flatMap((r) => [r.ia, r.ib]));
  for (const n of used) {
    for (const record of records) {
      const root = find(n);
      const ia = find(record.ia);
      const ib = find(record.ib);
      if (ia === ib || root === ia || root === ib) continue;
      const len = distance(nodes[ia], nodes[ib]);
      const projection = projectOnSegment(nodes[root], nodes[ia], nodes[ib]);
      if (projection.distance > tolerance) continue;
      const along = projection.t * len;
      let target = -1;
      if (Math.abs(along) <= tolerance) target = ia;
      else if (Math.abs(along - len) <= tolerance) target = ib;
      if (target === -1) continue;
      parent[root] = target;
      members[target].push(...members[root]);
      nodes[target] = meanPoint(members[target]);
    }
  }
  for (const record of records) {
    record.ia = find(record.ia);
    record.ib = find(record.ib);
  }
}

/**
 * Drops pieces that repeat an earlier piece's node pair (in either direction): duplicate walls and
 * the shared stretch of collinear overlapping walls. The survivor takes the dropped piece's
 * openings, re-based to its own direction, unless they would overlap one it already has.
 * @param {{ start: number, end: number, wall: object }[][]} pieceLists per input wall
 * @returns {{ start: number, end: number, wall: object }[][]}
 */
function dropDuplicates(pieceLists) {
  const survivors = new Map();
  return pieceLists.map((list) => list.filter((piece) => {
    const key = piece.start < piece.end ? `${piece.start},${piece.end}` : `${piece.end},${piece.start}`;
    const survivor = survivors.get(key);
    if (!survivor) {
      survivors.set(key, piece);
      return true;
    }
    const len = distance(survivor.wall.a, survivor.wall.b);
    const flipped = piece.start !== survivor.start;
    const span = (o, at) => [at - (o.width ?? 0) / 2, at + (o.width ?? 0) / 2];
    const taken = survivor.wall.openings.map((o) => span(o, o.at));
    for (const opening of piece.wall.openings) {
      const at = flipped ? len - opening.at : opening.at;
      const [start, end] = span(opening, at);
      if (taken.some(([s, e]) => start < e - EPS && end > s + EPS)) continue;
      survivor.wall.openings.push({ ...opening, at });
      taken.push([start, end]);
    }
    return false;
  }));
}

/**
 * Drops dangling pieces hidden inside the wall they hang from: a piece with one free end whose
 * length is at most the thickest neighbour's half-thickness plus `tolerance` (a stub that
 * overshoots the wall it meets, which would otherwise cut a slot into that wall's far face).
 * @param {{ start: number, end: number, wall: object }[][]} pieceLists per input wall
 * @param {number} tolerance
 * @returns {{ start: number, end: number, wall: object }[][]}
 */
function dropHiddenStubs(pieceLists, tolerance) {
  const incident = new Map();
  for (const piece of pieceLists.flat()) {
    for (const node of [piece.start, piece.end]) {
      if (!incident.has(node)) incident.set(node, []);
      incident.get(node).push(piece);
    }
  }
  const hidden = (piece) => {
    const freeStart = incident.get(piece.start).length === 1;
    const freeEnd = incident.get(piece.end).length === 1;
    if (freeStart === freeEnd) return false;
    const others = incident.get(freeStart ? piece.end : piece.start).filter((p) => p !== piece);
    const cover = Math.max(...others.map((p) => (p.wall.thickness ?? 0) / 2));
    return distance(piece.wall.a, piece.wall.b) <= cover + tolerance;
  };
  return pieceLists.map((list) => list.filter((piece) => !hidden(piece)));
}

/**
 * Nodes the walls of one level. Returns, per input wall, its pieces (possibly none). Piece ids are
 * still the input wall's id; `nodeWalls` gives every piece after the first a free id.
 * @param {object[]} walls
 * @param {number} tolerance
 * @returns {object[][]}
 */
function nodeLevel(walls, tolerance) {
  const { nodes, index, members } = clusterPoints(walls.flatMap((w) => [w.a, w.b]), tolerance);
  const records = walls.map((wall, k) => ({ wall, ia: index[2 * k], ib: index[2 * k + 1], splits: [] }));
  mergeNearEnds(nodes, members, records, tolerance);
  const live = records.filter((r) => r.ia !== r.ib);
  const used = new Set(live.flatMap((r) => [r.ia, r.ib]));
  const addSplit = (record, node) => {
    if (!record.splits.includes(node)) record.splits.push(node);
  };

  for (let n = 0; n < nodes.length; n++) {
    if (!used.has(n)) continue;
    const hits = [];
    for (const record of live) {
      if (record.ia === n || record.ib === n) continue;
      const a = nodes[record.ia];
      const b = nodes[record.ib];
      const len = distance(a, b);
      const projection = projectOnSegment(nodes[n], a, b);
      const along = projection.t * len;
      if (projection.distance <= tolerance && along > tolerance && along < len - tolerance) {
        hits.push({ record, projection });
      }
    }
    if (hits.length === 0) continue;
    hits.sort((x, y) => x.projection.distance - y.projection.distance);
    hits.forEach((hit) => addSplit(hit.record, n));
    nodes[n] = hits[0].projection.point;
  }

  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const p = live[i];
      const q = live[j];
      if (p.ia === q.ia || p.ia === q.ib || p.ib === q.ia || p.ib === q.ib) continue;
      const hit = segmentCrossing(nodes[p.ia], nodes[p.ib], nodes[q.ia], nodes[q.ib], tolerance);
      if (!hit) continue;
      let node = [...p.splits, ...q.splits].find((k) => distance(nodes[k], hit) <= tolerance);
      if (node === undefined) {
        node = nodes.length;
        nodes.push(hit);
      }
      addSplit(p, node);
      addSplit(q, node);
    }
  }

  const pieceLists = records.map((record) => buildPieces(record, nodes));
  return dropHiddenStubs(dropDuplicates(pieceLists), tolerance).map((list) => list.map((piece) => piece.wall));
}

/**
 * Turns a noded wall record into one or more pieces with re-based openings, each with its start and
 * end node index. Every piece keeps the wall's id for now.
 * @returns {{ start: number, end: number, wall: object }[]}
 */
function buildPieces(record, nodes) {
  const { wall, ia, ib } = record;
  if (ia === ib) return [];
  const a = nodes[ia];
  const b = nodes[ib];
  const openings = wall.openings ?? [];
  const len = distance(a, b);
  const dir = normalize(sub(b, a));
  const stops = record.splits
    .map((node) => ({ node, s: dot(sub(nodes[node], a), dir) }))
    .filter((stop) => stop.s > EPS && stop.s < len - EPS)
    .sort((x, y) => x.s - y.s)
    .filter((stop, i, list) => i === 0 || stop.s - list[i - 1].s > EPS);
  if (stops.length === 0) {
    return [{ start: ia, end: ib, wall: { ...wall, a: [...a], b: [...b], openings: openings.map((o) => ({ ...o })) } }];
  }
  const chain = [{ node: ia, s: 0 }, ...stops, { node: ib, s: len }];
  const ranges = chain.slice(1).map((stop, k) => ({ from: chain[k].s, to: stop.s, start: chain[k].node, end: stop.node }));
  const buckets = ranges.map(() => []);
  for (const opening of openings) {
    const { piece, at } = placeOpening(opening, ranges);
    buckets[piece].push({ ...opening, at });
  }
  return ranges.map((range, k) => ({
    start: range.start,
    end: range.end,
    wall: { ...wall, a: [...nodes[range.start]], b: [...nodes[range.end]], openings: buckets[k] }
  }));
}

/**
 * The first `${base}~N` (N ≥ 2) not yet taken, for a new piece of wall `id`. Marks it taken.
 * @param {string} id
 * @param {Set<string>} taken
 * @returns {string}
 */
function freePieceId(id, taken) {
  const base = baseWallId(id);
  let n = 2;
  while (taken.has(`${base}~${n}`)) n++;
  const fresh = `${base}~${n}`;
  taken.add(fresh);
  return fresh;
}

/**
 * Nodes a wall set into a clean planar graph, per level (walls on different levels never interact):
 * 1. wall ends within `tolerance` of each other snap to their mean, and an end that misses another
 *    wall's end diagonally (within `tolerance` along and across that wall) joins it; walls that
 *    collapse to a point are dropped;
 * 2. a wall end lying within `tolerance` of another wall's interior (a T-junction) splits that wall
 *    there, and the end moves onto the wall's centreline;
 * 3. walls whose interiors cross are split at the crossing;
 * 4. pieces that repeat another piece's end nodes (duplicate or overlapping walls) are dropped, their
 *    openings moving to the surviving piece when they fit, and dangling pieces no longer than the
 *    neighbouring wall's half-thickness plus `tolerance` (stubs overshooting a wall) are dropped.
 * Pieces keep the original direction and properties. The first surviving piece of a wall keeps its
 * id; each further piece gets the first free `${base}~N` (N ≥ 2, base = id without `~N` suffixes),
 * so ids stay unique when already-noded walls are noded again. Openings are re-based onto the piece
 * that holds their centre (see placeOpening). The input is never mutated; every output wall has
 * fresh `a`, `b` and `openings`.
 * @param {import('./schema.js').Wall[]} walls
 * @param {number} [tolerance=0.02] metres
 * @returns {import('./schema.js').Wall[]} walls in input order, pieces in place of split walls
 */
export function nodeWalls(walls, tolerance = 0.02) {
  const pieces = new Array(walls.length);
  for (const group of groupByLevel(walls)) {
    const result = nodeLevel(group.map((i) => walls[i]), tolerance);
    group.forEach((wallIndex, k) => {
      pieces[wallIndex] = result[k];
    });
  }
  const taken = new Set(walls.map((w) => w.id));
  return walls.flatMap((wall, i) => pieces[i].map((piece, k) => {
    if (k > 0) piece.id = freePieceId(wall.id, taken);
    return piece;
  }));
}

/**
 * Finds the node for a wall end on the same level, creating it when none is within NODE_TOLERANCE.
 * @returns {{ level: string, point: [number, number], ends: object[] }}
 */
function nodeFor(nodes, level, point) {
  const found = nodes.find((n) => n.level === level && distance(n.point, point) <= NODE_TOLERANCE);
  if (found) return found;
  const node = { level, point, ends: [] };
  nodes.push(node);
  return node;
}

/**
 * Writes a corner point onto a wall footprint. "left"/"right" are as seen looking out of the node
 * along the wall; at the b end that swaps the wall's L and R sides.
 */
function setCorner(end, which, point) {
  const corner = [point[0], point[1]];
  if (end.end === 'a') {
    if (which === 'left') end.fp.L[0] = corner;
    else end.fp.R[0] = corner;
  } else if (which === 'left') {
    end.fp.R[1] = corner;
  } else {
    end.fp.L[1] = corner;
  }
}

/**
 * Mitres every pair of angularly adjacent walls meeting at a node.
 * @param {{ point: [number, number], ends: object[] }} node
 */
function mitreNode(node) {
  const angle = (end) => Math.atan2(end.u[1], end.u[0]);
  const ends = [...node.ends].sort((x, y) => angle(x) - angle(y));
  for (let i = 0; i < ends.length; i++) {
    const e = ends[i];
    const f = ends[(i + 1) % ends.length];
    const p = add(e.point, scale(leftNormal(e.u), e.half));
    const q = sub(f.point, scale(leftNormal(f.u), f.half));
    const hit = lineIntersection(p, e.u, q, f.u);
    const limit = MITRE_LIMIT * Math.max(e.half, f.half) * 2;
    const mitred = hit !== null && distance(hit, node.point) <= limit;
    setCorner(e, 'left', mitred ? hit : p);
    setCorner(f, 'right', mitred ? hit : q);
  }
}

/**
 * True when a footprint's end edge p→q needs the node point to close the junction: always at
 * nodes with three or more walls (so the footprints fan exactly around the node), and at two-wall
 * nodes only when the node lies outside that edge.
 * @param {{ point: [number, number], ends: object[] } | null} node
 * @returns {boolean}
 */
function needsNodePoint(node, p, q) {
  if (!node || node.ends.length < 2) return false;
  return node.ends.length >= 3 || cross(sub(q, p), sub(node.point, p)) < -ON_EDGE;
}

/**
 * Computes mitred wall footprints. Wall ends within 1 mm (same level) form a node; run
 * `nodeWalls` first so T-junctions become shared nodes. At each node the walls are sorted by
 * angle and each neighbouring pair of offset lines is intersected, so neighbouring footprints
 * share exactly the same corner point. Parallel neighbours use the plain perpendicular offset;
 * corners farther than 3× the thicker wall from the node fall back to square ends; free ends are
 * square.
 * @param {import('./schema.js').Wall[]} walls
 * @returns {Map<string, { L: [[number, number], [number, number]], R: [[number, number], [number, number]], polygon: [number, number][] }>}
 *   per wall id: `L`/`R` are that side's face line as [point at a end, point at b end];
 *   `polygon` is the anticlockwise outline R.start, R.end, L.end, L.start. At nodes with three
 *   or more walls (and at two-wall nodes where the corners alone would leave a gap) the node point
 *   is inserted after R.end (b end) or after L.start (a end), so footprints fan around the node
 *   and tile the junction with no gap or overlap.
 */
export function wallFootprints(walls) {
  const result = new Map();
  const nodes = [];
  const records = [];
  for (const wall of walls) {
    const { a, b } = wall;
    const d = normalize(sub(b, a));
    const half = (wall.thickness ?? 0) / 2;
    const offset = scale(leftNormal(d), half);
    const fp = { L: [add(a, offset), add(b, offset)], R: [sub(a, offset), sub(b, offset)], polygon: [] };
    result.set(wall.id, fp);
    const record = { fp, nodeA: null, nodeB: null };
    records.push(record);
    if (d[0] === 0 && d[1] === 0) continue;
    record.nodeA = nodeFor(nodes, wall.level, a);
    record.nodeB = nodeFor(nodes, wall.level, b);
    record.nodeA.ends.push({ fp, end: 'a', point: a, u: d, half });
    record.nodeB.ends.push({ fp, end: 'b', point: b, u: [0 - d[0], 0 - d[1]], half });
  }
  for (const node of nodes) {
    if (node.ends.length >= 2) mitreNode(node);
  }
  for (const { fp, nodeA, nodeB } of records) {
    const [r0, r1] = fp.R;
    const [l0, l1] = fp.L;
    const polygon = [[...r0], [...r1]];
    if (needsNodePoint(nodeB, r1, l1)) polygon.push([...nodeB.point]);
    polygon.push([...l1], [...l0]);
    if (needsNodePoint(nodeA, l0, r0)) polygon.push([...nodeA.point]);
    fp.polygon = polygon;
  }
  return result;
}

/**
 * Removes out-and-back spikes (dangling walls) from a face's vertex cycle.
 * @param {number[]} cycle node indices
 * @returns {number[]}
 */
function removeSpikes(cycle) {
  let list = cycle;
  let changed = true;
  while (changed && list.length >= 3) {
    changed = false;
    for (let i = 0; i < list.length; i++) {
      const n = list.length;
      if (list[(i - 1 + n) % n] === list[(i + 1) % n]) {
        const drop = new Set([i, (i + 1) % n]);
        list = list.filter((_, k) => !drop.has(k));
        changed = true;
        break;
      }
    }
  }
  return list;
}

/**
 * Enumerates the bounded faces of one level's centreline graph.
 * @returns {{ polygon: [number, number][], area: number }[]}
 */
function levelFaces(walls) {
  const points = [];
  const nodeIndex = (p) => {
    const found = points.findIndex((q) => distance(q, p) <= NODE_TOLERANCE);
    if (found !== -1) return found;
    points.push(p);
    return points.length - 1;
  };
  const halfEdges = [];
  const outgoing = [];
  const seen = new Set();
  const addHalfEdge = (from, to) => {
    const id = halfEdges.length;
    const v = sub(points[to], points[from]);
    halfEdges.push({ from, to, angle: Math.atan2(v[1], v[0]) });
    (outgoing[from] ??= []).push(id);
  };
  for (const wall of walls) {
    const i = nodeIndex(wall.a);
    const j = nodeIndex(wall.b);
    if (i === j) continue;
    const key = i < j ? `${i},${j}` : `${j},${i}`;
    if (seen.has(key)) continue;
    seen.add(key);
    addHalfEdge(i, j);
    addHalfEdge(j, i);
  }
  const slot = new Array(halfEdges.length);
  outgoing.forEach((list) => {
    if (!list) return;
    list.sort((x, y) => halfEdges[x].angle - halfEdges[y].angle);
    list.forEach((id, k) => {
      slot[id] = k;
    });
  });
  const next = (id) => {
    const twin = id ^ 1;
    const list = outgoing[halfEdges[id].to];
    return list[(slot[twin] - 1 + list.length) % list.length];
  };
  const visited = new Uint8Array(halfEdges.length);
  const faces = [];
  for (let start = 0; start < halfEdges.length; start++) {
    if (visited[start]) continue;
    const cycle = [];
    let id = start;
    do {
      visited[id] = 1;
      cycle.push(halfEdges[id].from);
      id = next(id);
    } while (id !== start && cycle.length <= halfEdges.length);
    const clean = removeSpikes(cycle);
    if (clean.length < 3) continue;
    const polygon = clean.map((k) => [points[k][0], points[k][1]]);
    const area = polygonArea(polygon);
    if (area >= MIN_ROOM_AREA) faces.push({ polygon, area });
  }
  return faces;
}

/**
 * Finds the enclosed faces of the wall centreline graph, per level. Walls should already be
 * noded (`nodeWalls`); ends within 1 mm are joined. Faces are traced with the interior on the
 * left, so rooms come out anticlockwise; the clockwise outer face of each connected group and
 * faces under 0.5 m² are dropped, and dangling walls are trimmed from the outlines.
 * @param {import('./schema.js').Wall[]} walls
 * @returns {{ polygon: [number, number][], area: number }[]} anticlockwise polygons, area in m²
 */
export function findRoomFaces(walls) {
  const faces = [];
  for (const group of groupByLevel(walls)) {
    faces.push(...levelFaces(group.map((i) => walls[i])));
  }
  return faces;
}
