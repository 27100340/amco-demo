/**
 * Wall finding from double-line drawings: parallel line pairs become centreline pieces, pieces
 * are merged across junctions and openings, and wall ends are snapped onto neighbouring
 * centrelines. Shared by plan, layout and unit detection.
 * Pure module: no DOM. Lengths are metres unless a function says otherwise.
 */
import { add, dot, scale, sub, leftNormal, cross, distance } from '../../model/geometry.js';
import { createGrid, boxOf } from './grid.js';

const DEG = Math.PI / 180;
/** Segments within this angle are treated as parallel. */
const ANGLE_TOLERANCE = 1 * DEG;
/** Grid cell (m) for finding neighbouring walls. */
const GRID_CELL = 2;
/** Walls meeting at less than this angle are not snapped onto each other. */
const MIN_SNAP_ANGLE = 10 * DEG;
/** Thinnest and thickest wall a line pair may describe (m). */
export const MIN_WALL_THICKNESS = 0.075;
export const MAX_WALL_THICKNESS = 0.6;
/** Shortest centreline piece kept (m). */
const MIN_PIECE = 0.05;
/** Lines within this distance (m) of a centreline offset are collinear / on the same face. */
const OFFSET_TOLERANCE = 0.01;
/** Pieces whose thickness differs by more than this (m) are different walls. */
const THICKNESS_TOLERANCE = 0.012;
/** Common wall thicknesses (m): 4½″, 9″, 13½″ brick and 100/115/200/230 mm metric. */
const STANDARD_THICKNESSES = [0.1, 0.1143, 0.115, 0.2, 0.2286, 0.23, 0.3429];
const STANDARD_MATCH = 0.06;
/** Farthest (m) a wall end is pushed through a door or window gap to reach a corner. */
const MAX_OPENING_EXTENSION = 2.5;

/**
 * True when a thickness is within 6% of a common wall thickness.
 * @param {number} t metres
 * @returns {boolean}
 */
export function isStandardThickness(t) {
  return STANDARD_THICKNESSES.some((s) => Math.abs(t - s) <= s * STANDARD_MATCH);
}

/**
 * Straight segments of LINE and POLY entities, scaled by `factor`.
 * @param {object[]} entities DXF entities
 * @param {number} factor metres per drawing unit
 * @param {(entity: object) => string | null} groupOf class of a segment's layer ('full', 'partial'…) or null to skip
 * @returns {{ a: [number, number], b: [number, number], layer: string, group: string }[]}
 */
export function collectSegments(entities, factor, groupOf) {
  const out = [];
  const push = (a, b, layer, group) => {
    const pa = [a[0] * factor, a[1] * factor];
    const pb = [b[0] * factor, b[1] * factor];
    if (distance(pa, pb) > 1e-6) out.push({ a: pa, b: pb, layer, group });
  };
  for (const e of entities) {
    const group = groupOf(e);
    if (group === null) continue;
    if (e.type === 'LINE') push(e.a, e.b, e.layer, group);
    if (e.type === 'POLY') {
      const pts = e.points;
      for (let i = 0; i + 1 < pts.length; i++) push(pts[i], pts[i + 1], e.layer, group);
      if (e.closed && pts.length > 2) push(pts[pts.length - 1], pts[0], e.layer, group);
    }
  }
  return out;
}

/**
 * Groups segments into angle buckets (within 1°) and expresses each in the bucket's frame:
 * `s0..s1` along the bucket direction `u`, offset `o` along its left normal `n`; items are
 * sorted by offset.
 * @param {{ a: [number, number], b: [number, number] }[]} segments
 * @returns {{ id: number, u: [number, number], n: [number, number], items: { seg: object, index: number, s0: number, s1: number, o: number }[] }[]}
 */
export function bucketSegments(segments) {
  const angles = segments.map((s, index) => {
    let theta = Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]);
    if (theta < 0) theta += Math.PI;
    if (theta >= Math.PI - ANGLE_TOLERANCE) theta -= Math.PI;
    return { index, theta };
  }).sort((x, y) => x.theta - y.theta);
  const groups = [];
  for (const entry of angles) {
    const last = groups[groups.length - 1];
    if (last && entry.theta - last[0].theta <= ANGLE_TOLERANCE) last.push(entry);
    else groups.push([entry]);
  }
  return groups.map((members, id) => {
    const theta = members.reduce((sum, m) => sum + m.theta, 0) / members.length;
    const u = [Math.cos(theta), Math.sin(theta)];
    const n = leftNormal(u);
    const items = members.map(({ index }) => {
      const seg = segments[index];
      const sa = dot(seg.a, u);
      const sb = dot(seg.b, u);
      const mid = scale(add(seg.a, seg.b), 0.5);
      return { seg, index, s0: Math.min(sa, sb), s1: Math.max(sa, sb), o: dot(mid, n) };
    }).sort((x, y) => x.o - y.o);
    return { id, u, n, items };
  });
}

/**
 * Nearest-partner spacings between parallel, overlapping segments in drawing units, used to guess
 * units. A pair counts when the lines overlap for at least twice their spacing (wall-like).
 * Partners farther apart than `maxSpacing` are not looked for.
 * @param {{ a: [number, number], b: [number, number] }[]} segments in drawing units
 * @param {number} [maxSpacing] widest spacing of interest, in drawing units
 * @returns {number[]}
 */
export function rawSpacings(segments, maxSpacing = Infinity) {
  const spacings = [];
  for (const bucket of bucketSegments(segments)) {
    const { items } = bucket;
    for (let i = 0; i < items.length; i++) {
      let best = null;
      for (let j = i + 1; j < items.length; j++) {
        const d = items[j].o - items[i].o;
        if (d <= 1e-9) continue;
        if (d > maxSpacing || (best !== null && d > best)) break;
        const overlap = Math.min(items[i].s1, items[j].s1) - Math.max(items[i].s0, items[j].s0);
        if (overlap >= 2 * d) best = d;
      }
      if (best !== null) spacings.push(best);
    }
  }
  return spacings;
}

/**
 * Index of the first item whose key is at least `value`, in a list sorted by that key.
 * @template T
 * @param {T[]} list
 * @param {(item: T) => number} key
 * @param {number} value
 * @returns {number} list.length when there is none
 */
function firstAtLeast(list, key, value) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (key(list[mid]) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The box around a wall-frame piece's centreline, grown by `margin`.
 * @param {{ u: [number, number], n: [number, number], c: number, s0: number, s1: number }} piece
 * @param {number} margin
 * @returns {{ min: [number, number], max: [number, number] }}
 */
function pieceBox(piece, margin) {
  return boxOf([framePoint(piece, piece.s0), framePoint(piece, piece.s1)], margin);
}

/**
 * Subtracts intervals from [lo, hi].
 * @param {number} lo
 * @param {number} hi
 * @param {[number, number][]} cuts
 * @returns {[number, number][]}
 */
function subtractIntervals(lo, hi, cuts) {
  let parts = [[lo, hi]];
  for (const [c0, c1] of cuts) {
    const next = [];
    for (const [p0, p1] of parts) {
      if (c1 <= p0 || c0 >= p1) {
        next.push([p0, p1]);
        continue;
      }
      if (c0 > p0) next.push([p0, c0]);
      if (c1 < p1) next.push([c1, p1]);
    }
    parts = next;
  }
  return parts;
}

/**
 * Union of intervals, sorted.
 * @param {[number, number][]} intervals
 * @returns {[number, number][]}
 */
export function unionIntervals(intervals) {
  const sorted = intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 1e-9) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/**
 * Pairs parallel segments of the same group into wall pieces. Candidate pairs are 75–600 mm
 * apart and overlap for at least half their spacing; pairs with a common wall thickness are
 * taken first, then the nearest. Each stretch of a line is a face of one wall only.
 * @param {{ a, b, layer, group }[]} segments metres
 * @returns {{ pieces: object[], buckets: object[] }} pieces: { bucket, u, n, c, t, s0, s1, group }
 */
export function pairSegments(segments) {
  const buckets = bucketSegments(segments);
  const pieces = [];
  for (const bucket of buckets) {
    const { items } = bucket;
    const candidates = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const d = items[j].o - items[i].o;
        if (d > MAX_WALL_THICKNESS) break;
        if (d < MIN_WALL_THICKNESS || items[i].seg.group !== items[j].seg.group) continue;
        const lo = Math.max(items[i].s0, items[j].s0);
        const hi = Math.min(items[i].s1, items[j].s1);
        if (hi - lo < Math.max(MIN_PIECE, 0.5 * d)) continue;
        candidates.push({ i, j, d, lo, hi, standard: isStandardThickness(d) });
      }
    }
    candidates.sort((x, y) => (Number(y.standard) - Number(x.standard)) || (x.d - y.d));
    const used = items.map(() => []);
    for (const cand of candidates) {
      const free = subtractIntervals(cand.lo, cand.hi, [...used[cand.i], ...used[cand.j]]);
      for (const [f0, f1] of free) {
        if (f1 - f0 < Math.max(MIN_PIECE, 0.5 * cand.d)) continue;
        pieces.push({
          bucket: bucket.id,
          u: bucket.u,
          n: bucket.n,
          c: (items[cand.i].o + items[cand.j].o) / 2,
          t: cand.d,
          s0: f0,
          s1: f1,
          group: items[cand.i].seg.group
        });
        used[cand.i].push([f0, f1]);
        used[cand.j].push([f0, f1]);
      }
    }
  }
  return { pieces, buckets };
}

/**
 * A point on a wall-frame line.
 * @returns {[number, number]}
 */
export function framePoint(wall, s, offset = 0) {
  return add(scale(wall.u, s), scale(wall.n, wall.c + offset));
}

/**
 * Merges collinear pieces of the same thickness and group. Neighbouring pieces join across a
 * gap when `bridge(cluster, g0, g1)` allows it (junctions and openings).
 * @param {object[]} pieces from pairSegments
 * @param {(wall: object, g0: number, g1: number) => boolean} bridge
 * @returns {object[]} walls { bucket, u, n, c, t, s0, s1, group, gaps: [g0, g1][] }
 */
export function mergePieces(pieces, bridge) {
  const byKey = new Map();
  for (const p of pieces) {
    const key = `${p.bucket}|${p.group}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(p);
  }
  const walls = [];
  for (const list of byKey.values()) {
    list.sort((x, y) => x.c - y.c || x.t - y.t);
    const lines = [];
    for (const p of list) {
      let k = firstAtLeast(lines, (l) => l.c, p.c - OFFSET_TOLERANCE);
      while (k < lines.length && Math.abs(lines[k].t - p.t) > THICKNESS_TOLERANCE) k++;
      const line = lines[k];
      if (line) line.pieces.push(p);
      else lines.push({ c: p.c, t: p.t, pieces: [p] });
    }
    for (const line of lines) {
      const sorted = line.pieces.sort((x, y) => x.s0 - y.s0);
      let current = null;
      const flush = () => {
        if (!current) return;
        const total = current.weights.reduce((s, w) => s + w.len, 0);
        current.c = current.weights.reduce((s, w) => s + w.c * w.len, 0) / total;
        current.t = current.weights.reduce((s, w) => s + w.t * w.len, 0) / total;
        delete current.weights;
        walls.push(current);
      };
      for (const p of sorted) {
        const len = p.s1 - p.s0;
        if (current) {
          const gap = p.s0 - current.s1;
          if (gap <= 1e-9 || bridge(current, current.s1, p.s0)) {
            if (gap > 1e-9) current.gaps.push([current.s1, p.s0]);
            current.s1 = Math.max(current.s1, p.s1);
            current.weights.push({ c: p.c, t: p.t, len });
            continue;
          }
          flush();
        }
        current = { bucket: p.bucket, u: p.u, n: p.n, c: p.c, t: p.t, s0: p.s0, s1: p.s1, group: p.group, gaps: [], weights: [{ c: p.c, t: p.t, len }] };
      }
      flush();
    }
  }
  return walls;
}

/**
 * Builds the junction test for a set of pieces: `(wall, g0, g1)` is true when the gap g0…g1 in
 * a wall is a junction, i.e. a non-parallel wall piece reaches the gap and is thick enough to
 * explain it (gap no wider than 1.5× that piece's thickness). The pieces are indexed once, so
 * each test only looks at pieces near the gap.
 * @param {object[]} pieces from pairSegments
 * @returns {(wall: object, g0: number, g1: number) => boolean}
 */
export function junctionTest(pieces) {
  const grid = createGrid(GRID_CELL);
  pieces.forEach((q, i) => grid.insert(i, pieceBox(q, 0)));
  return (wall, g0, g1) => {
    const gap = g1 - g0;
    const centre = framePoint(wall, (g0 + g1) / 2);
    const reach = wall.t / 2 + MAX_WALL_THICKNESS / 2 + 0.05;
    return grid.query(boxOf([centre], reach)).some((i) => {
      const q = pieces[i];
      if (Math.abs(cross(q.u, wall.u)) < Math.sin(MIN_SNAP_ANGLE) || gap > 1.5 * q.t + 0.01) return false;
      const along = Math.max(q.s0, Math.min(q.s1, dot(centre, q.u)));
      return distance(framePoint(q, along), centre) <= wall.t / 2 + q.t / 2 + 0.05;
    });
  };
}

/**
 * Where the centrelines of two walls meet, as positions along each.
 * @returns {{ sW: number, sV: number, point: [number, number] } | null}
 */
function centrelineMeet(w, v) {
  const denom = cross(w.u, v.u);
  if (Math.abs(denom) < Math.sin(MIN_SNAP_ANGLE)) return null;
  const pw = framePoint(w, 0);
  const pv = framePoint(v, 0);
  const sW = cross(sub(pv, pw), v.u) / denom;
  const point = add(pw, scale(w.u, sW));
  return { sW, sV: dot(sub(point, pv), v.u), point };
}

/**
 * Snaps wall ends onto neighbouring centrelines so L, T and X junctions meet exactly: an end
 * moves to where its centreline meets another wall's centreline when that is no farther than the
 * thicker wall's thickness (or a little behind the end, for overlapping lines), or farther when
 * the stretch in between holds a door or window (`throughOpening`). Walls are updated in place.
 * @param {object[]} walls from mergePieces
 * @param {(wall: object, from: number, to: number) => boolean} throughOpening
 */
export function snapEnds(walls, throughOpening) {
  const updates = walls.map((w) => ({ s0: w.s0, s1: w.s1 }));
  const grid = createGrid(GRID_CELL);
  walls.forEach((v, vi) => grid.insert(vi, pieceBox(v, v.t + OFFSET_TOLERANCE)));
  const reach = MAX_OPENING_EXTENSION + MAX_WALL_THICKNESS;
  walls.forEach((w, wi) => {
    for (const end of ['s0', 's1']) {
      let best = null;
      grid.query(boxOf([framePoint(w, w[end])], reach)).forEach((vi) => {
        const v = walls[vi];
        if (vi === wi) return;
        const meet = centrelineMeet(w, v);
        if (!meet) return;
        if (meet.sV < v.s0 - v.t - OFFSET_TOLERANCE || meet.sV > v.s1 + v.t + OFFSET_TOLERANCE) return;
        const reach = end === 's1' ? meet.sW - w.s1 : w.s0 - meet.sW;
        const limit = Math.max(v.t, w.t) + 0.02;
        const behind = -(v.t / 2 + 0.02);
        const lo = end === 's1' ? w.s1 : meet.sW;
        const hi = end === 's1' ? meet.sW : w.s0;
        const ok = (reach >= behind && reach <= limit)
          || (reach > limit && reach <= MAX_OPENING_EXTENSION && throughOpening(w, lo, hi));
        if (ok && (!best || Math.abs(reach) < Math.abs(best.reach))) best = { reach, s: meet.sW };
      });
      if (best) updates[wi][end] = best.s;
    }
  });
  walls.forEach((w, i) => {
    w.s0 = updates[i].s0;
    w.s1 = updates[i].s1;
  });
}

/**
 * Stretches of a wall where neither face line is drawn (door and window gaps, crossings).
 * @param {object} wall merged wall
 * @param {object[]} buckets from pairSegments
 * @returns {[number, number][]}
 */
export function faceHoles(wall, buckets) {
  const bucket = buckets[wall.bucket]?.id === wall.bucket ? buckets[wall.bucket] : buckets.find((b) => b.id === wall.bucket);
  if (!bucket) return [[wall.s0, wall.s1]];
  const cover = [];
  const { items } = bucket;
  const last = wall.c + wall.t / 2 + OFFSET_TOLERANCE;
  for (let k = firstAtLeast(items, (item) => item.o, wall.c - wall.t / 2 - OFFSET_TOLERANCE); k < items.length && items[k].o <= last; k++) {
    const item = items[k];
    if (item.seg.group !== wall.group) continue;
    const off = item.o - wall.c;
    if (Math.abs(Math.abs(off) - wall.t / 2) <= OFFSET_TOLERANCE) cover.push([item.s0, item.s1]);
  }
  return subtractIntervals(wall.s0, wall.s1, unionIntervals(cover)).filter(([a, b]) => b - a >= MIN_PIECE);
}

/**
 * Converts a merged wall to plan points.
 * @returns {{ a: [number, number], b: [number, number] }}
 */
export function wallEnds(wall) {
  return { a: framePoint(wall, wall.s0), b: framePoint(wall, wall.s1) };
}
