/**
 * Point snapping for the plan editor: wall endpoints, wall centrelines and the orthogonal lock.
 * Pure module: no DOM, no three.js. Points are `[x, y]` plan metres.
 */
import { EPS, sub, add, scale, cross, distance, projectOnSegment, lineIntersection } from '../model/geometry.js';

/** How far (as a multiple of the tolerance) a wall crossing may sit from the locked point. */
const CROSSING_REACH = 1.5;

/**
 * Nearest candidate within `tolerance` of `pt`.
 * @param {[number, number]} pt
 * @param {[number, number][]} candidates
 * @param {number} tolerance
 * @returns {[number, number] | null}
 */
function nearestPoint(pt, candidates, tolerance) {
  let best = null;
  let bestDistance = tolerance;
  for (const p of candidates) {
    const d = distance(pt, p);
    if (d <= bestDistance) {
      best = p;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Locks `pt` to the horizontal or vertical line through `from`, whichever is closer.
 * @param {[number, number]} pt
 * @param {[number, number]} from
 * @returns {{ point: [number, number], dir: [number, number] }}
 */
function orthoLock(pt, from) {
  const d = sub(pt, from);
  return Math.abs(d[0]) >= Math.abs(d[1])
    ? { point: [pt[0], from[1]], dir: [1, 0] }
    : { point: [from[0], pt[1]], dir: [0, 1] };
}

/**
 * Nearest point on any wall centreline within `tolerance`.
 * @param {[number, number]} pt
 * @param {{ a: [number, number], b: [number, number] }[]} walls
 * @param {number} tolerance
 * @returns {[number, number] | null}
 */
function nearestOnWall(pt, walls, tolerance) {
  let best = null;
  let bestDistance = tolerance;
  for (const wall of walls) {
    const { t } = projectOnSegment(pt, wall.a, wall.b);
    const foot = add(wall.a, scale(sub(wall.b, wall.a), Math.min(1, Math.max(0, t))));
    const d = distance(pt, foot);
    if (d <= bestDistance) {
      best = foot;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Where the locked line (through `from` along `dir`) crosses a wall near the locked point.
 * Walls parallel to the lock are skipped so the lock is never broken.
 * @returns {[number, number] | null}
 */
function crossingOnWall(locked, from, dir, walls, tolerance) {
  let best = null;
  let bestDistance = tolerance * CROSSING_REACH;
  for (const wall of walls) {
    const along = sub(wall.b, wall.a);
    if (Math.abs(cross(dir, along)) <= EPS * Math.hypot(along[0], along[1])) continue;
    const near = projectOnSegment(locked, wall.a, wall.b);
    if (near.t < 0 || near.t > 1 || near.distance > tolerance) continue;
    const hit = lineIntersection(from, dir, wall.a, along);
    if (!hit) continue;
    const t = projectOnSegment(hit, wall.a, wall.b).t;
    const d = distance(hit, locked);
    if (t >= -EPS && t <= 1 + EPS && d <= bestDistance) {
      best = hit;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Snaps a point for drawing or dragging. In order of priority:
 * 1. a wall endpoint (or one of `points`) within `tolerance` of the point, or of its ortho lock;
 * 2. with `ortho` and `from`: the locked point, moved onto a wall the locked line crosses nearby;
 * 3. with `ortho` and `from`: the point locked to 0°, 90°, 180° or 270° from `from`;
 * 4. without ortho: the nearest point on a wall centreline within `tolerance`;
 * 5. the point itself.
 * @param {[number, number]} pt raw point in plan metres
 * @param {{
 *   walls: { a: [number, number], b: [number, number] }[],
 *   ortho: boolean,
 *   from?: [number, number],
 *   tolerance: number,
 *   points?: [number, number][]
 * }} options `tolerance` in metres; `points` are extra endpoint candidates
 * @returns {{ point: [number, number], kind: 'endpoint'|'wall'|'ortho'|'free' }} a fresh point
 */
export function snapPoint(pt, { walls = [], ortho = false, from, tolerance, points = [] }) {
  const tol = Number.isFinite(tolerance) && tolerance > 0 ? tolerance : 0;
  const ends = [...walls.flatMap((w) => [w.a, w.b]), ...points];
  const fresh = (p) => [p[0], p[1]];

  const end = nearestPoint(pt, ends, tol);
  if (end) return { point: fresh(end), kind: 'endpoint' };

  if (ortho && from) {
    const { point: locked, dir } = orthoLock(pt, from);
    const lockedEnd = nearestPoint(locked, ends, tol);
    if (lockedEnd) return { point: fresh(lockedEnd), kind: 'endpoint' };
    const crossing = crossingOnWall(locked, from, dir, walls, tol);
    if (crossing) return { point: fresh(crossing), kind: 'wall' };
    return { point: locked, kind: 'ortho' };
  }

  const onWall = nearestOnWall(pt, walls, tol);
  if (onWall) return { point: fresh(onWall), kind: 'wall' };
  return { point: fresh(pt), kind: 'free' };
}
