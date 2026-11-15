/**
 * Wall noding for large drawings. `nodeWalls` compares every wall with every other wall on a
 * level, so a drawing with many separate wall groups (scattered linework, several buildings) is
 * slow. Here walls that cannot touch are put in separate groups first, and the number of pieces
 * noding will make is estimated beforehand, so a drawing that would make too many is refused
 * before any slow work starts.
 * Pure module: no DOM. Lengths are metres.
 */

/**
 * Copies of the walls with each group (see wallGroups) on its own level, for geometry functions
 * that compare every wall on a level with every other, plus the way back to the real level.
 * @param {object[]} walls
 * @returns {{ tagged: object[], restore: (wall: object) => object }} `restore` puts the real level
 *   back on a wall made from a tagged one (in place) and returns it
 */
function byGroup(walls) {
  const groups = wallGroups(walls);
  const levelOf = new Map();
  const tagged = walls.map((wall, i) => {
    const key = `${String(wall.level)}#${groups[i]}`;
    levelOf.set(key, { has: Object.hasOwn(wall, 'level'), level: wall.level });
    return { ...wall, level: key };
  });
  const restore = (wall) => {
    const original = levelOf.get(wall.level);
    if (original.has) wall.level = original.level;
    else delete wall.level;
    return wall;
  };
  return { tagged, restore };
}
import { nodeWalls, findRoomFaces, wallFootprints, dot, sub, cross, distance } from '../../model/geometry.js';
import { createGrid, boxOf } from './grid.js';

/** nodeWalls' default tolerance (m). */
export const NODE_TOLERANCE = 0.02;
/**
 * Walls whose boxes are farther apart than this (m) go in separate groups. It is several times
 * the noding tolerance because noding moves wall ends a little (onto means and centrelines).
 */
const GROUP_MARGIN = 5 * NODE_TOLERANCE;
/** Grid cell (m) for finding neighbouring walls. */
const GRID_CELL = 2;

/**
 * Indexes walls by their boxes grown by `margin`.
 * @param {{ a: [number, number], b: [number, number] }[]} walls
 * @param {number} margin
 * @returns {{ boxes: { min: [number, number], max: [number, number] }[], grid: ReturnType<typeof createGrid> }}
 */
function indexWalls(walls, margin) {
  const grid = createGrid(GRID_CELL);
  const boxes = walls.map((w) => boxOf([w.a, w.b], margin));
  boxes.forEach((box, i) => grid.insert(i, box));
  return { boxes, grid };
}

/**
 * True when two boxes overlap or touch.
 * @returns {boolean}
 */
function boxesMeet(p, q) {
  return p.min[0] <= q.max[0] && q.min[0] <= p.max[0] && p.min[1] <= q.max[1] && q.min[1] <= p.max[1];
}

/**
 * Splits walls into groups that cannot affect each other when noded: two walls share a group when
 * their boxes, grown by GROUP_MARGIN, meet, and groups are joined through shared walls.
 * @param {{ a: [number, number], b: [number, number] }[]} walls
 * @returns {number[]} the group of each wall, numbered from 0 in order of first wall
 */
export function wallGroups(walls) {
  const { boxes, grid } = indexWalls(walls, GROUP_MARGIN);
  const parent = walls.map((_, i) => i);
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
  walls.forEach((_, i) => {
    for (const j of grid.query(boxes[i], { sorted: false })) {
      if (j <= i || !boxesMeet(boxes[i], boxes[j])) continue;
      const ri = find(i);
      const rj = find(j);
      if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj);
    }
  });
  const numbers = new Map();
  return walls.map((_, i) => {
    const root = find(i);
    if (!numbers.has(root)) numbers.set(root, numbers.size);
    return numbers.get(root);
  });
}

/**
 * Same result as `nodeWalls(walls, tolerance)`, but each group of walls that can touch (see
 * wallGroups) is noded on its own, so separate groups are never compared.
 * @param {import('../../model/schema.js').Wall[]} walls
 * @param {number} [tolerance] metres, at most NODE_TOLERANCE
 * @returns {import('../../model/schema.js').Wall[]} as nodeWalls
 */
export function nodeWallsGrouped(walls, tolerance = NODE_TOLERANCE) {
  const { tagged, restore } = byGroup(walls);
  return nodeWalls(tagged, tolerance).map(restore);
}

/**
 * The faces `findRoomFaces(walls)` finds, worked out group by group (see wallGroups), so walls in
 * separate groups are never compared. Faces come group by group (each group in findRoomFaces'
 * order), so only faces of equal area in different groups can come in another order.
 * @param {import('../../model/schema.js').Wall[]} walls noded walls
 * @returns {{ polygon: [number, number][], area: number }[]}
 */
export function findRoomFacesGrouped(walls) {
  return findRoomFaces(byGroup(walls).tagged);
}

/**
 * Same result as `wallFootprints(walls)`, worked out group by group (see wallGroups).
 * @param {import('../../model/schema.js').Wall[]} walls with unique ids
 * @returns {ReturnType<typeof wallFootprints>}
 */
export function wallFootprintsGrouped(walls) {
  return wallFootprints(byGroup(walls).tagged);
}

/**
 * True when point p lies on segment a→b away from its ends (within `tolerance` across it and more
 * than `tolerance` from either end).
 * @returns {boolean}
 */
function onInterior(p, a, b, tolerance) {
  const len = distance(a, b);
  if (len <= 2 * tolerance) return false;
  const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const along = dot(sub(p, a), u);
  return along > tolerance && along < len - tolerance && Math.abs(cross(u, sub(p, a))) <= tolerance;
}

/**
 * True when segments p and q cross away from all four ends (by more than `tolerance`).
 * @returns {boolean}
 */
function crossesInside(p, q, tolerance) {
  const r = sub(p.b, p.a);
  const s = sub(q.b, q.a);
  const denom = cross(r, s);
  const lr = Math.hypot(r[0], r[1]);
  const ls = Math.hypot(s[0], s[1]);
  if (Math.abs(denom) <= 1e-9 * lr * ls) return false;
  const ac = sub(q.a, p.a);
  const t = cross(ac, s) / denom;
  const u = cross(ac, r) / denom;
  return t * lr > tolerance && t * lr < lr - tolerance && u * ls > tolerance && u * ls < ls - tolerance;
}

/**
 * Estimates how many walls `nodeWalls` will make: one per wall, one more for every wall end that
 * lands inside another wall (T-junctions) and two more for every crossing. Counting stops once the
 * estimate passes `limit`, so a drawing that would make far too many pieces is found quickly.
 * @param {{ a: [number, number], b: [number, number] }[]} walls
 * @param {number} [limit] stop counting above this
 * @param {number} [tolerance] metres
 * @returns {number} the estimate, or the first count above `limit`
 */
export function estimateNodedWalls(walls, limit = Infinity, tolerance = NODE_TOLERANCE) {
  const { boxes, grid } = indexWalls(walls, tolerance);
  let count = walls.length;
  for (let i = 0; i < walls.length && count <= limit; i++) {
    const p = walls[i];
    for (const j of grid.query(boxes[i], { sorted: false })) {
      if (j === i || !boxesMeet(boxes[i], boxes[j])) continue;
      const q = walls[j];
      if (onInterior(q.a, p.a, p.b, tolerance)) count += 1;
      if (onInterior(q.b, p.a, p.b, tolerance)) count += 1;
      if (j > i && crossesInside(p, q, tolerance)) count += 2;
    }
  }
  return count;
}
