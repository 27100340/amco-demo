/**
 * Hit testing for the plan editor: what lies under a plan point on the current level or the site.
 * Pure module: no DOM, no three.js.
 */
import { sub, dot, distance, normalize, leftNormal, projectOnSegment, pointInPolygon, polygonArea } from '../model/geometry.js';
import { faceAt } from './model-ops.js';

/**
 * Rooms on a level with the outline each one covers: its explicit polygon, or the smallest face
 * of the noded wall graph containing its label point.
 * @param {import('../model/schema.js').Building} building
 * @param {string} levelId
 * @param {{ faces: { polygon: [number, number][], area: number }[] }} plan from `levelPlan`
 * @returns {{ room: import('../model/schema.js').Room, polygon: [number, number][], area: number }[]}
 */
export function levelRooms(building, levelId, plan) {
  const out = [];
  for (const room of building.rooms ?? []) {
    if (room.level !== levelId) continue;
    if (Array.isArray(room.polygon) && room.polygon.length >= 3) {
      out.push({ room, polygon: room.polygon, area: Math.abs(polygonArea(room.polygon)) });
      continue;
    }
    if (!Array.isArray(room.at)) continue;
    const i = faceAt(plan.faces, room.at);
    if (i !== -1) out.push({ room, polygon: plan.faces[i].polygon, area: plan.faces[i].area });
  }
  return out;
}

/**
 * True when `pt` is on an opening's span (or a door's swing).
 * @returns {boolean}
 */
function onOpening(piece, opening, pt, tolerance) {
  const u = normalize(sub(piece.b, piece.a));
  const n = leftNormal(u);
  const rel = sub(pt, piece.a);
  const s = dot(rel, u);
  const off = dot(rel, n);
  const half = (piece.thickness ?? 0) / 2;
  const s0 = opening.at - opening.width / 2;
  const s1 = opening.at + opening.width / 2;
  if (s >= s0 - tolerance / 2 && s <= s1 + tolerance / 2 && Math.abs(off) <= half + tolerance / 2) return true;
  if (opening.type !== 'door') return false;
  const ds = s - s0;
  const dn = off - half;
  return ds >= 0 && dn >= 0 && Math.hypot(ds, dn) <= opening.width;
}

/**
 * True when `pt` is on a wall piece's footprint, or close to a thin wall's centreline.
 * @returns {boolean}
 */
function onWall(piece, footprint, pt, tolerance) {
  if (footprint && pointInPolygon(pt, footprint.polygon)) return true;
  const p = projectOnSegment(pt, piece.a, piece.b);
  return p.t >= 0 && p.t <= 1 && p.distance <= Math.max((piece.thickness ?? 0) / 2, tolerance * 0.6);
}

/**
 * Hit test on the site: gates, boundary corners, then the boundary line.
 * @returns {{ kind: 'gate', index: number } | { kind: 'vertex', index: number } | { kind: 'boundary' } | null}
 */
function hitSite(site, pt, tolerance) {
  const boundary = site?.boundary ?? [];
  const gates = site?.boundaryWall?.gates ?? [];
  for (let i = 0; i < gates.length; i++) {
    if (distance(gates[i].at, pt) <= gates[i].width / 2 + tolerance / 2) return { kind: 'gate', index: i };
  }
  for (let i = 0; i < boundary.length; i++) {
    if (distance(boundary[i], pt) <= tolerance) return { kind: 'vertex', index: i };
  }
  for (let i = 0; i < boundary.length; i++) {
    const p = projectOnSegment(pt, boundary[i], boundary[(i + 1) % boundary.length]);
    if (p.t >= 0 && p.t <= 1 && p.distance <= tolerance) return { kind: 'boundary' };
  }
  return null;
}

/**
 * What lies under a point. On a level, in order: a wall end (when `ends`), an opening, a wall,
 * a room. On the site ('site'): a gate, a boundary corner, the boundary line.
 * @param {import('../model/schema.js').Building} building
 * @param {string} levelId a level id or 'site'
 * @param {ReturnType<typeof import('./model-ops.js').levelPlan>} plan the level's plan (ignored on the site)
 * @param {[number, number]} pt plan metres
 * @param {number} tolerance metres (a few screen pixels)
 * @param {{ ends?: boolean }} [options]
 * @returns {{ kind: string, id?: string, wallId?: string, point?: [number, number], index?: number } | null}
 */
export function hitTest(building, levelId, plan, pt, tolerance, { ends = true } = {}) {
  if (levelId === 'site') return hitSite(building.site, pt, tolerance);
  if (ends) {
    let best = null;
    let bestDistance = tolerance + 1e-9;
    for (const wall of plan.walls) {
      for (const end of ['a', 'b']) {
        const d = distance(wall[end], pt);
        if (d < bestDistance) {
          best = { kind: 'end', wallId: wall.id, point: [wall[end][0], wall[end][1]] };
          bestDistance = d;
        }
      }
    }
    if (best) return best;
  }
  for (const { piece, wallId } of plan.pieces) {
    for (const opening of piece.openings ?? []) {
      if (onOpening(piece, opening, pt, tolerance)) return { kind: 'opening', id: opening.id, wallId };
    }
  }
  for (const { piece, wallId } of plan.pieces) {
    if (onWall(piece, plan.footprints.get(piece.id), pt, tolerance)) return { kind: 'wall', id: wallId };
  }
  const rooms = levelRooms(building, levelId, plan)
    .filter(({ polygon }) => pointInPolygon(pt, polygon))
    .sort((x, y) => x.area - y.area);
  return rooms.length > 0 ? { kind: 'room', id: rooms[0].room.id } : null;
}
