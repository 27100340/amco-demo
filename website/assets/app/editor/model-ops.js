/**
 * Building Model operations used by the plan editor: defaults, ids, room upkeep, opening fit
 * checks, scale changes and level heights. Functions that change a building say so and mutate the
 * object they are given; the editor always passes a fresh copy, so history snapshots stay intact.
 * Pure module: no DOM, no three.js.
 */
import {
  sub, add, scale, cross, distance, normalize, projectOnSegment, polygonCentroid,
  pointInPolygon, nodeWalls, wallFootprints, findRoomFaces
} from '../model/geometry.js';
import { guessRoomUse } from '../model/schema.js';

const FOOT = 0.3048;
const INCH = 0.0254;

/** Standard wall thicknesses: 9″ (full brick) and 4½″ (half brick), in metres. */
export const WALL_THICKNESS = Object.freeze({ full: 9 * INCH, half: 4.5 * INCH });

/** Door and window sizes used when no schedule was read from the drawings (Pakistani standards). */
export const DEFAULT_SCHEDULE = Object.freeze({
  D1: Object.freeze({ type: 'door', width: 3 * FOOT, height: 7 * FOOT, sill: 0 }),
  D2: Object.freeze({ type: 'door', width: 2 * FOOT + 6 * INCH, height: 7 * FOOT, sill: 0 }),
  W1: Object.freeze({ type: 'window', width: 4 * FOOT, height: 4 * FOOT, sill: 3 * FOOT }),
  W2: Object.freeze({ type: 'window', width: 6 * FOOT, height: 4 * FOOT, sill: 3 * FOOT }),
  V1: Object.freeze({ type: 'ventilator', width: 2 * FOOT, height: FOOT + 6 * INCH, sill: 6 * FOOT })
});

/** Schedule row types the editor offers, in display order. */
export const SCHEDULE_TYPES = ['door', 'window', 'ventilator', 'opening', 'shopfront', 'garage'];

/** Level used when a building arrives with none. */
const DEFAULT_LEVEL = { id: 'g', name: 'Ground floor', elevation: 0, height: 3.2, ceiling: 3.05, slab: 0.15, parapet: 1.07 };

/** Wall ends closer than this (m) are joined, matching `nodeWalls`. */
export const NODE_JOIN = 0.02;
/** Openings are placed on a 5 cm grid along their wall. */
export const OPENING_STEP = 0.05;
/** A room label less than this share as clear of its outline as the room's best label spot is moved there. */
const LABEL_CENTRING = 0.5;
/** Below this |sin| two walls count as running in line (a continuation, not a junction). */
const IN_LINE = 0.2;
/** Name given to rooms the editor creates; such rooms are flagged "Name this room". */
const AUTO_ROOM = /^Room \d+$/;
/** Captures the number of an editor-made room name. */
const AUTO_ROOM_NUMBER = /^Room (\d+)$/;

/**
 * Deep copy of plain data.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function copyData(value) {
  return structuredClone(value);
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
 * A fresh copy of a building with the lists the editor relies on, and one level when none exist.
 * @param {import('../model/schema.js').Building} building
 * @returns {import('../model/schema.js').Building}
 */
export function normaliseBuilding(building) {
  const b = copyData(building ?? {});
  b.levels = Array.isArray(b.levels) ? b.levels : [];
  b.walls = Array.isArray(b.walls) ? b.walls : [];
  b.rooms = Array.isArray(b.rooms) ? b.rooms : [];
  if (b.levels.length === 0) b.levels.push({ ...DEFAULT_LEVEL });
  for (const wall of b.walls) {
    if (!Array.isArray(wall.openings)) wall.openings = [];
  }
  return b;
}

/**
 * Schedule row type for an opening already in a building.
 * @param {import('../model/schema.js').Opening} opening
 * @returns {string}
 */
function scheduleTypeOf(opening) {
  if (opening.type === 'window' && /^v/i.test(opening.tag ?? '')) return 'ventilator';
  return SCHEDULE_TYPES.includes(opening.type) ? opening.type : 'window';
}

/**
 * Builds the editor's door and window schedule. Rows given by the caller win; tags used by
 * openings in the building but missing from the schedule are added with that opening's size;
 * when the caller gave no rows at all the standard sizes fill the rest.
 * @param {Object<string, { type: string, width: number, height: number, sill: number }> | undefined} schedule
 * @param {import('../model/schema.js').Building} building
 * @returns {Object<string, { type: string, width: number, height: number, sill: number }>} a fresh copy
 */
export function normaliseSchedule(schedule, building) {
  const given = schedule && typeof schedule === 'object' ? schedule : {};
  const rows = copyData(given);
  for (const wall of building?.walls ?? []) {
    for (const o of wall.openings ?? []) {
      if (!o.tag || rows[o.tag]) continue;
      rows[o.tag] = { type: scheduleTypeOf(o), width: o.width, height: o.height, sill: o.sill ?? 0 };
    }
  }
  if (Object.keys(given).length === 0) {
    for (const [tag, entry] of Object.entries(DEFAULT_SCHEDULE)) {
      if (!rows[tag]) rows[tag] = { ...entry };
    }
  }
  return rows;
}

/**
 * Building Model opening type for a schedule row: ventilators are windows; an unknown type is read
 * from the tag letter (D → door, anything else → window).
 * @param {{ type?: string }} entry
 * @param {string} tag
 * @returns {'door'|'window'|'opening'|'shopfront'|'garage'}
 */
export function openingTypeOf(entry, tag) {
  const type = String(entry?.type ?? '').toLowerCase();
  if (type === 'ventilator' || type.startsWith('vent')) return 'window';
  if (['door', 'window', 'opening', 'shopfront', 'garage'].includes(type)) return type;
  return /^d/i.test(tag ?? '') ? 'door' : 'window';
}

/**
 * True for rooms the editor created that still carry their placeholder name.
 * @param {{ name?: string, use?: string }} room
 * @returns {boolean}
 */
export function isUnnamedRoom(room) {
  return AUTO_ROOM.test(room?.name ?? '') && (room?.use ?? 'other') === 'other';
}

/**
 * Every id used by walls, openings, rooms and levels.
 * @param {import('../model/schema.js').Building} building
 * @returns {Set<string>}
 */
export function takenIds(building) {
  const ids = new Set();
  for (const level of building?.levels ?? []) ids.add(level.id);
  for (const room of building?.rooms ?? []) ids.add(room.id);
  for (const wall of building?.walls ?? []) {
    ids.add(wall.id);
    for (const o of wall.openings ?? []) ids.add(o.id);
  }
  return ids;
}

/**
 * The first free id of the form `${prefix}${n}` (or `${prefix}-${n}` for word prefixes), n ≥ 1.
 * The new id is added to `taken`.
 * @param {string} prefix
 * @param {Set<string>} taken
 * @returns {string}
 */
export function nextId(prefix, taken) {
  const join = prefix.length > 1 ? '-' : '';
  let n = 1;
  while (taken.has(`${prefix}${join}${n}`)) n++;
  const id = `${prefix}${join}${n}`;
  taken.add(id);
  return id;
}

/**
 * Shortest distance from a point to a polygon outline.
 * @param {[number, number]} pt
 * @param {[number, number][]} poly
 * @returns {number}
 */
export function distanceToOutline(pt, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const { t } = projectOnSegment(pt, a, b);
    const foot = add(a, scale(sub(b, a), Math.min(1, Math.max(0, t))));
    best = Math.min(best, distance(pt, foot));
  }
  return best;
}

/**
 * Midpoints of the inside spans of a horizontal line through a polygon.
 * @param {[number, number][]} poly
 * @param {number} y
 * @returns {[number, number][]}
 */
function scanMidpoints(poly, y) {
  const xs = [];
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    if ((y1 > y) !== (y2 > y)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
  }
  xs.sort((p, q) => p - q);
  const mids = [];
  for (let i = 0; i + 1 < xs.length; i += 2) mids.push([(xs[i] + xs[i + 1]) / 2, y]);
  return mids;
}

/**
 * A point well inside a polygon, used for room labels: the centroid when it is roughly as clear
 * of the outline as the best scan-line candidate, otherwise the clearest candidate.
 * @param {[number, number][]} poly
 * @returns {[number, number]}
 */
export function interiorPoint(poly) {
  const centroid = polygonCentroid(poly);
  const ys = poly.map((p) => p[1]);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const candidates = [];
  for (const f of [0.5, 0.25, 0.75, 0.125, 0.375, 0.625, 0.875]) {
    candidates.push(...scanMidpoints(poly, lo + (hi - lo) * f));
  }
  let best = null;
  let bestClear = -1;
  for (const c of candidates) {
    const clear = distanceToOutline(c, poly);
    if (clear > bestClear) {
      best = c;
      bestClear = clear;
    }
  }
  if (pointInPolygon(centroid, poly) && (!best || distanceToOutline(centroid, poly) >= 0.8 * bestClear)) {
    return [centroid[0] + 0, centroid[1] + 0];
  }
  return best ? [best[0] + 0, best[1] + 0] : centroid;
}

/**
 * The walls of one level, noded, with footprints and room faces, ready for drawing and hit tests.
 * Pieces are mapped back to the stored wall they came from (stored ids may contain anything).
 * @param {import('../model/schema.js').Building} building
 * @param {string} levelId
 * @returns {{
 *   walls: import('../model/schema.js').Wall[],
 *   pieces: { piece: import('../model/schema.js').Wall, wallId: string }[],
 *   footprints: Map<string, { L: [number, number][], R: [number, number][], polygon: [number, number][] }>,
 *   faces: { polygon: [number, number][], area: number }[]
 * }}
 */
export function levelPlan(building, levelId) {
  const walls = (building?.walls ?? []).filter((w) => w.level === levelId);
  const keyed = walls.map((w, i) => ({ ...w, id: `${i}` }));
  const noded = nodeWalls(keyed);
  const pieces = noded.map((piece) => ({ piece, wallId: walls[Number.parseInt(piece.id, 10)].id }));
  return { walls, pieces, footprints: wallFootprints(noded), faces: findRoomFaces(noded) };
}

/** Static wall pieces this close (m) to a moving wall are re-noded with it during a drag preview. */
const PREVIEW_REACH = 0.05;

/**
 * Bounding box of wall segments, grown by `pad` metres.
 * @param {{ a: [number, number], b: [number, number] }[]} walls
 * @param {number} pad
 * @returns {{ min: [number, number], max: [number, number] } | null}
 */
function wallBox(walls, pad) {
  if (walls.length === 0) return null;
  const min = [Infinity, Infinity];
  const max = [-Infinity, -Infinity];
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      min[0] = Math.min(min[0], p[0]);
      min[1] = Math.min(min[1], p[1]);
      max[0] = Math.max(max[0], p[0]);
      max[1] = Math.max(max[1], p[1]);
    }
  }
  return { min: [min[0] - pad, min[1] - pad], max: [max[0] + pad, max[1] + pad] };
}

/**
 * True when two boxes overlap.
 * @returns {boolean}
 */
function boxesMeet(x, y) {
  return x.min[0] <= y.max[0] && x.max[0] >= y.min[0] && x.min[1] <= y.max[1] && x.max[1] >= y.min[1];
}

/**
 * A cache of level plans. A plan is found first by building object, then by the content of that
 * level's walls, so a copy of the state (an undo step, a commit after a drag) reuses the plans of
 * every level it did not change. `preview` builds a drag preview's plan incrementally. Plans are
 * shared between buildings: treat them as read-only.
 * @param {number} [limit=24] most plans kept by content (the oldest are dropped first)
 * @returns {{
 *   readonly computed: number, readonly staticNodings: number,
 *   get(building: import('../model/schema.js').Building, levelId: string): ReturnType<typeof levelPlan>,
 *   preview(base: import('../model/schema.js').Building, building: import('../model/schema.js').Building, levelId: string): ReturnType<typeof levelPlan>
 * }} `computed` counts full plans worked out (cache misses); `staticNodings` counts how often the
 *   unchanged walls of a drag were noded (once per drag)
 */
export function createPlanCache(limit = 24) {
  const byBuilding = new WeakMap();
  const byContent = new Map();
  let computed = 0;
  let staticNodings = 0;
  let still = null;

  const remember = (building, levelId, plan) => {
    let levels = byBuilding.get(building);
    if (!levels) {
      levels = new Map();
      byBuilding.set(building, levels);
    }
    levels.set(levelId, plan);
    return plan;
  };
  const known = (building, levelId) => byBuilding.get(building)?.get(levelId);

  /**
   * The unchanged walls of a drag, noded once and kept while the same walls stay still.
   * @returns {{ walls: object[], pieces: { piece: object, box: object }[] }}
   */
  const stillPieces = (base, levelId, walls) => {
    const key = walls.map((w) => w.id).join('|');
    if (still && still.base === base && still.levelId === levelId && still.key === key) return still;
    const pieces = nodeWalls(walls.map((w, i) => ({ ...w, id: `s${i}` })))
      .map((piece) => ({ piece, box: wallBox([piece], 0) }));
    staticNodings += 1;
    still = { base, levelId, key, walls, pieces };
    return still;
  };

  return {
    get computed() { return computed; },
    get staticNodings() { return staticNodings; },
    get(building, levelId) {
      const cached = known(building, levelId);
      if (cached) return cached;
      const key = `${levelId}|${JSON.stringify((building?.walls ?? []).filter((w) => w.level === levelId))}`;
      let plan = byContent.get(key);
      if (plan) {
        byContent.delete(key);
      } else {
        plan = levelPlan(building, levelId);
        computed += 1;
      }
      byContent.set(key, plan);
      if (byContent.size > limit) byContent.delete(byContent.keys().next().value);
      return remember(building, levelId, plan);
    },
    preview(base, building, levelId) {
      const cached = known(building, levelId);
      if (cached) return cached;
      const walls = building.walls.filter((w) => w.level === levelId);
      const before = new Map(base.walls.filter((w) => w.level === levelId).map((w) => [w.id, w]));
      const moving = walls.filter((w) => !before.has(w.id) || JSON.stringify(before.get(w.id)) !== JSON.stringify(w));
      const movingIds = new Set(moving.map((w) => w.id));
      const present = new Set(walls.map((w) => w.id));
      const fixed = stillPieces(base, levelId, [...before.values()].filter((w) => present.has(w.id) && !movingIds.has(w.id)));
      const movers = moving.map((w, i) => ({ ...w, id: `m${i}` }));
      const reach = wallBox(movers, PREVIEW_REACH);
      const near = [];
      const far = [];
      for (const { piece, box } of fixed.pieces) {
        if (reach && boxesMeet(box, reach)) near.push(piece);
        else far.push(piece);
      }
      const nearOwner = near.map((piece) => fixed.walls[Number.parseInt(piece.id.slice(1), 10)].id);
      const local = nodeWalls([...near.map((piece, i) => ({ ...piece, id: `n${i}` })), ...movers]);
      const noded = [...far, ...local];
      const owner = (id) => {
        const index = Number.parseInt(id.slice(1), 10);
        if (id[0] === 's') return fixed.walls[index].id;
        return id[0] === 'n' ? nearOwner[index] : moving[index].id;
      };
      const plan = {
        walls,
        pieces: noded.map((piece) => ({ piece, wallId: owner(piece.id) })),
        footprints: wallFootprints(noded),
        faces: findRoomFaces(noded)
      };
      return remember(building, levelId, plan);
    }
  };
}

/**
 * The smallest face containing a point.
 * @param {{ polygon: [number, number][], area: number }[]} faces
 * @param {[number, number]} pt
 * @returns {number} face index, or -1
 */
export function faceAt(faces, pt) {
  let best = -1;
  faces.forEach((face, i) => {
    if (pointInPolygon(pt, face.polygon) && (best === -1 || face.area < faces[best].area)) best = i;
  });
  return best;
}

/**
 * Keeps exactly one Room per enclosed face on every level (a face without a Room would count as
 * outside). Mutates `building.rooms`:
 * - a room keeps its face when its label point is inside it (named rooms are matched first);
 *   a label point left near the outline (say after a partition split the room) is re-centred;
 * - rooms whose face disappeared, or whose face another room already holds, are removed;
 * - every face left without a room gets "Room N" (use 'other'), flagged as unnamed;
 * - rooms with an explicit polygon are never touched, and they hold the faces they cover.
 * Pass `planFor` (e.g. a plan cache) so the plans worked out here are reused for drawing.
 * @param {import('../model/schema.js').Building} building
 * @param {{ planFor?: (levelId: string) => ReturnType<typeof levelPlan> }} [options]
 * @returns {{ created: string[], removed: string[] }} room ids
 */
export function syncRooms(building, { planFor = (levelId) => levelPlan(building, levelId) } = {}) {
  const created = [];
  const removed = [];
  const taken = takenIds(building);
  let counter = Math.max(0, ...building.rooms.map((r) => Number(AUTO_ROOM_NUMBER.exec(r.name ?? '')?.[1] ?? 0)));
  const keep = new Set();
  const added = [];
  for (const level of building.levels) {
    const { faces } = planFor(level.id);
    const held = new Set();
    const rooms = building.rooms.filter((r) => r.level === level.id);
    for (const room of rooms) {
      if (!(Array.isArray(room.polygon) && room.polygon.length >= 3)) continue;
      keep.add(room);
      faces.forEach((face, i) => {
        if (pointInPolygon(interiorPoint(face.polygon), room.polygon)) held.add(i);
      });
    }
    const labelled = rooms
      .filter((r) => !keep.has(r) && isPoint(r.at))
      .sort((x, y) => Number(isUnnamedRoom(x)) - Number(isUnnamedRoom(y)));
    for (const room of labelled) {
      const i = faceAt(faces, room.at);
      if (i === -1 || held.has(i)) continue;
      held.add(i);
      keep.add(room);
      const poly = faces[i].polygon;
      const better = interiorPoint(poly);
      if (distanceToOutline(room.at, poly) < LABEL_CENTRING * distanceToOutline(better, poly)) room.at = better;
    }
    faces.forEach((face, i) => {
      if (held.has(i)) return;
      counter += 1;
      const room = { id: nextId('room', taken), level: level.id, name: `Room ${counter}`, use: 'other', at: interiorPoint(face.polygon) };
      added.push(room);
      created.push(room.id);
    });
  }
  const levelIds = new Set(building.levels.map((l) => l.id));
  building.rooms = building.rooms.filter((room) => {
    if (!levelIds.has(room.level) || keep.has(room)) return true;
    removed.push(room.id);
    return false;
  });
  building.rooms.push(...added);
  return { created, removed };
}

/**
 * Wall ends on a level within `tolerance` of a point: the ends that move together when a corner
 * is dragged.
 * @param {import('../model/schema.js').Wall[]} walls
 * @param {[number, number]} point
 * @param {string} levelId
 * @param {number} [tolerance=NODE_JOIN]
 * @returns {{ wallId: string, end: 'a'|'b' }[]}
 */
export function connectedEnds(walls, point, levelId, tolerance = NODE_JOIN) {
  const ends = [];
  for (const wall of walls) {
    if (wall.level !== levelId) continue;
    if (distance(wall.a, point) <= tolerance) ends.push({ wallId: wall.id, end: 'a' });
    if (distance(wall.b, point) <= tolerance) ends.push({ wallId: wall.id, end: 'b' });
  }
  return ends;
}

/**
 * Finds a wall and, for openings, the opening and its wall.
 * @param {import('../model/schema.js').Building} building
 * @param {string} openingId
 * @returns {{ wall: import('../model/schema.js').Wall, opening: import('../model/schema.js').Opening } | null}
 */
export function findOpening(building, openingId) {
  for (const wall of building.walls) {
    const opening = (wall.openings ?? []).find((o) => o.id === openingId);
    if (opening) return { wall, opening };
  }
  return null;
}

/**
 * Stretches of a wall (metres from its a end) that other walls occupy where they join or cross it.
 * @param {import('../model/schema.js').Building} building
 * @param {import('../model/schema.js').Wall} host
 * @returns {{ from: number, to: number }[]}
 */
function junctionZones(building, host) {
  const len = distance(host.a, host.b);
  const dir = normalize(sub(host.b, host.a));
  const zones = [];
  for (const other of building.walls) {
    if (other === host || other.level !== host.level) continue;
    const odir = normalize(sub(other.b, other.a));
    const sin = Math.abs(cross(dir, odir));
    if (sin < IN_LINE) continue;
    const half = (other.thickness ?? 0) / 2 / sin;
    const hits = [];
    for (const p of [other.a, other.b]) {
      const proj = projectOnSegment(p, host.a, host.b);
      const s = proj.t * len;
      if (proj.distance <= NODE_JOIN && s >= -NODE_JOIN && s <= len + NODE_JOIN) hits.push(s);
    }
    if (hits.length === 0) {
      const denom = cross(sub(host.b, host.a), sub(other.b, other.a));
      const ac = sub(other.a, host.a);
      const t = cross(ac, sub(other.b, other.a)) / denom;
      const u = cross(ac, sub(host.b, host.a)) / denom;
      if (t > 0 && t < 1 && u > 0 && u < 1) hits.push(t * len);
    }
    for (const s of hits) zones.push({ from: s - half, to: s + half });
  }
  return zones;
}

/**
 * Checks where an opening of `width` can sit on a wall. The centre is snapped to 5 cm. It fails
 * when the opening runs past an end of the wall ('overrun'), cuts into a wall joining or crossing
 * this one ('junction'), or overlaps another opening on the wall ('overlap', with `other`).
 * @param {import('../model/schema.js').Building} building
 * @param {string} wallId
 * @param {{ at: number, width: number }} opening `at` in metres from the wall's a end
 * @param {string} [ignoreId] an opening to leave out of the overlap check (the one being moved)
 * @returns {{ ok: boolean, at: number, reason?: 'missing'|'overrun'|'junction'|'overlap', other?: import('../model/schema.js').Opening }}
 */
export function fitOpening(building, wallId, { at, width }, ignoreId) {
  const snapped = Number((Math.round(at / OPENING_STEP) * OPENING_STEP).toFixed(4));
  const wall = building.walls.find((w) => w.id === wallId);
  if (!wall) return { ok: false, at: snapped, reason: 'missing' };
  const len = distance(wall.a, wall.b);
  const start = snapped - width / 2;
  const end = snapped + width / 2;
  const slack = 1e-6;
  if (start < -slack || end > len + slack) return { ok: false, at: snapped, reason: 'overrun' };
  if (junctionZones(building, wall).some((z) => start < z.to - slack && end > z.from + slack)) {
    return { ok: false, at: snapped, reason: 'junction' };
  }
  const other = (wall.openings ?? []).find((o) => o.id !== ignoreId
    && start < o.at + o.width / 2 - slack && end > o.at - o.width / 2 + slack);
  if (other) return { ok: false, at: snapped, reason: 'overlap', other };
  return { ok: true, at: snapped };
}

/**
 * The stored wall nearest a point on a level, within `maxDistance` of its centreline.
 * @param {import('../model/schema.js').Building} building
 * @param {string} levelId
 * @param {[number, number]} pt
 * @param {number} maxDistance
 * @returns {{ wall: import('../model/schema.js').Wall, s: number, distance: number } | null} `s` metres from a
 */
export function nearestWall(building, levelId, pt, maxDistance) {
  let best = null;
  for (const wall of building.walls) {
    if (wall.level !== levelId) continue;
    const len = distance(wall.a, wall.b);
    if (len <= 0) continue;
    const { t } = projectOnSegment(pt, wall.a, wall.b);
    const clamped = Math.min(1, Math.max(0, t));
    const foot = add(wall.a, scale(sub(wall.b, wall.a), clamped));
    const d = distance(pt, foot);
    if (d <= maxDistance && (!best || d < best.distance)) best = { wall, s: clamped * len, distance: d };
  }
  return best;
}

/**
 * Scales everything drawn on one level (or the site) about `origin`, used when the tracing scale
 * changes. Positions scale; wall thicknesses and opening sizes do not. Mutates `building`.
 * @param {import('../model/schema.js').Building} building
 * @param {string} levelId a level id or 'site'
 * @param {[number, number]} origin
 * @param {number} factor
 * @returns {import('../model/schema.js').Building}
 */
export function rescaleLevel(building, levelId, origin, factor) {
  const move = (p) => [origin[0] + (p[0] - origin[0]) * factor, origin[1] + (p[1] - origin[1]) * factor];
  if (levelId === 'site') {
    const site = building.site;
    if (!site) return building;
    if (Array.isArray(site.boundary)) site.boundary = site.boundary.map(move);
    for (const gate of site.boundaryWall?.gates ?? []) gate.at = move(gate.at);
    for (const ground of site.ground ?? []) ground.polygon = ground.polygon.map(move);
    return building;
  }
  for (const wall of building.walls) {
    if (wall.level !== levelId) continue;
    wall.a = move(wall.a);
    wall.b = move(wall.b);
    for (const o of wall.openings ?? []) o.at *= factor;
  }
  for (const room of building.rooms) {
    if (room.level !== levelId) continue;
    if (isPoint(room.at)) room.at = move(room.at);
    if (Array.isArray(room.polygon)) room.polygon = room.polygon.map(move);
  }
  for (const fixture of building.fixtures ?? []) {
    if (fixture.level === levelId && isPoint(fixture.at)) fixture.at = move(fixture.at);
  }
  return building;
}

/**
 * Sets each level's floor-to-floor `height`: the gap up to the next floor level, or ceiling plus
 * slab for the top level (or when the next level is not above). Mutates the levels.
 * @param {import('../model/schema.js').Level[]} levels
 * @returns {import('../model/schema.js').Level[]}
 */
export function deriveLevelHeights(levels) {
  const ordered = [...levels].sort((x, y) => x.elevation - y.elevation);
  ordered.forEach((level, i) => {
    const next = ordered[i + 1];
    const gap = next ? next.elevation - level.elevation : 0;
    level.height = gap > 0 ? Number(gap.toFixed(6)) : Number(((level.ceiling ?? 0) + (level.slab ?? 0)).toFixed(6));
  });
  return levels;
}

/**
 * Counts for the summary panel.
 * @param {import('../model/schema.js').Building} building
 * @param {string} levelId
 * @returns {{ walls: number, doors: number, windows: number, openings: number, rooms: number, unnamed: number }}
 */
export function levelCounts(building, levelId) {
  const counts = { walls: 0, doors: 0, windows: 0, openings: 0, rooms: 0, unnamed: 0 };
  for (const wall of building.walls) {
    if (wall.level !== levelId) continue;
    counts.walls += 1;
    for (const o of wall.openings ?? []) {
      if (o.type === 'door' || o.type === 'garage') counts.doors += 1;
      else if (o.type === 'window' || o.type === 'shopfront') counts.windows += 1;
      else counts.openings += 1;
    }
  }
  for (const room of building.rooms) {
    if (room.level !== levelId) continue;
    counts.rooms += 1;
    if (isUnnamedRoom(room)) counts.unnamed += 1;
  }
  return counts;
}

/**
 * Openings that use a schedule tag.
 * @param {import('../model/schema.js').Building} building
 * @param {string} tag
 * @returns {import('../model/schema.js').Opening[]}
 */
export function openingsWithTag(building, tag) {
  return building.walls.flatMap((w) => (w.openings ?? []).filter((o) => o.tag === tag));
}

/**
 * Applies a schedule row's type and size to every opening using its tag. Mutates `building`.
 * @param {import('../model/schema.js').Building} building
 * @param {string} tag
 * @param {{ type: string, width: number, height: number, sill: number }} entry
 * @returns {number} how many openings changed
 */
export function applyScheduleRow(building, tag, entry) {
  const openings = openingsWithTag(building, tag);
  for (const o of openings) {
    o.type = openingTypeOf(entry, tag);
    o.width = entry.width;
    o.height = entry.height;
    o.sill = entry.sill ?? 0;
  }
  return openings.length;
}

/**
 * Renames a schedule tag and every opening that uses it. Mutates both.
 * @param {import('../model/schema.js').Building} building
 * @param {Object<string, object>} schedule
 * @param {string} from
 * @param {string} to
 * @returns {boolean} false when `to` is empty, already used or `from` is missing
 */
export function renameTag(building, schedule, from, to) {
  const tag = String(to ?? '').trim();
  if (!tag || tag === from || schedule[tag] || !schedule[from]) return false;
  const rows = Object.entries(schedule);
  for (const key of Object.keys(schedule)) delete schedule[key];
  for (const [key, entry] of rows) schedule[key === from ? tag : key] = entry;
  for (const o of openingsWithTag(building, from)) o.tag = tag;
  return true;
}

/**
 * A new schedule tag for a row type: the type's letter (D, W, V, O, S, G) and the next number.
 * @param {Object<string, object>} schedule
 * @param {string} type
 * @returns {string}
 */
export function nextTag(schedule, type) {
  const letter = { door: 'D', window: 'W', ventilator: 'V', opening: 'O', shopfront: 'S', garage: 'G' }[type] ?? 'X';
  let n = 1;
  while (schedule[`${letter}${n}`]) n++;
  return `${letter}${n}`;
}

/**
 * Picks the room use implied by a new name, unless the customer already chose a use by hand.
 * @param {{ name: string, use: string }} room the room before renaming
 * @param {string} name the new name
 * @returns {string} the use to store
 */
export function useAfterRename(room, name) {
  const chosenByHand = room.use !== 'other' && room.use !== guessRoomUse(room.name);
  return chosenByHand ? room.use : guessRoomUse(name);
}

/**
 * Re-attaches wall ends that sat on the middle of `before` (T-junctions) to the moved wall
 * `after`, by projecting them onto its new centreline. Ends listed in `skip` are left alone.
 * Mutates the walls in `building`.
 * @param {import('../model/schema.js').Building} building
 * @param {{ id: string, level: string, a: [number, number], b: [number, number] }} before
 * @param {{ a: [number, number], b: [number, number] }} after
 * @param {Set<string>} skip `${wallId}.${end}` keys
 */
export function followTee(building, before, after, skip) {
  const len = distance(before.a, before.b);
  for (const wall of building.walls) {
    if (wall.level !== before.level || wall.id === before.id) continue;
    for (const end of ['a', 'b']) {
      if (skip.has(`${wall.id}.${end}`)) continue;
      const p = projectOnSegment(wall[end], before.a, before.b);
      const s = p.t * len;
      if (p.distance > NODE_JOIN || s <= NODE_JOIN || s >= len - NODE_JOIN) continue;
      const q = projectOnSegment(wall[end], after.a, after.b);
      if (q.t > 0 && q.t < 1) wall[end] = q.point;
    }
  }
}

/**
 * Translates the walls listed by `ends` (whole-wall moves) and the T-junction ends attached to
 * the moved walls. Mutates `building`.
 * @param {import('../model/schema.js').Building} building
 * @param {{ wallId: string, end: 'a'|'b' }[]} ends
 * @param {[number, number]} delta
 */
export function translateEnds(building, ends, delta) {
  const moved = new Set(ends.map((e) => `${e.wallId}.${e.end}`));
  const whole = building.walls.filter((w) => moved.has(`${w.id}.a`) && moved.has(`${w.id}.b`));
  const tees = [];
  for (const host of whole) {
    const len = distance(host.a, host.b);
    for (const wall of building.walls) {
      if (wall.level !== host.level || wall === host) continue;
      for (const end of ['a', 'b']) {
        const key = `${wall.id}.${end}`;
        if (moved.has(key)) continue;
        const p = projectOnSegment(wall[end], host.a, host.b);
        const s = p.t * len;
        if (p.distance <= NODE_JOIN && s > NODE_JOIN && s < len - NODE_JOIN) tees.push({ wall, end, key });
      }
    }
  }
  for (const { wallId, end } of ends) {
    const wall = building.walls.find((w) => w.id === wallId);
    if (wall) wall[end] = add(wall[end], delta);
  }
  for (const { wall, end, key } of tees) {
    if (moved.has(key)) continue;
    moved.add(key);
    wall[end] = add(wall[end], delta);
  }
}

/**
 * Removes walls shorter than 1 cm on a level (left behind by dragging an end onto the other).
 * Mutates `building`.
 * @param {import('../model/schema.js').Building} building
 * @returns {string[]} removed wall ids
 */
export function dropCollapsedWalls(building) {
  const removed = [];
  building.walls = building.walls.filter((w) => {
    if (distance(w.a, w.b) >= 0.01) return true;
    removed.push(w.id);
    return false;
  });
  return removed;
}

/** Gates further than this (m) from a changed boundary are dropped. */
const GATE_REACH = 1;

/**
 * Nearest point on a closed boundary.
 * @param {[number, number][]} boundary
 * @param {[number, number]} pt
 * @returns {{ edge: number, foot: [number, number], along: number, length: number, distance: number } | null}
 */
function nearestOnBoundary(boundary, pt) {
  let best = null;
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i];
    const b = boundary[(i + 1) % boundary.length];
    const length = distance(a, b);
    if (length === 0) continue;
    const { t } = projectOnSegment(pt, a, b);
    const clamped = Math.min(1, Math.max(0, t));
    const foot = add(a, scale(sub(b, a), clamped));
    const d = distance(pt, foot);
    if (!best || d < best.distance) best = { edge: i, foot, along: clamped * length, length, distance: d };
  }
  return best;
}

/**
 * Checks where a gate of `width` can sit on the plot boundary, nearest to `point`. It fails when
 * there is no boundary ('none'), when the gate would run round a corner ('overrun'), or when it
 * overlaps another gate ('overlap').
 * @param {import('../model/schema.js').Site | undefined} site
 * @param {[number, number]} point
 * @param {number} width
 * @param {number} [ignoreIndex] a gate to leave out of the overlap check (the one being moved)
 * @returns {{ ok: boolean, at?: [number, number], edge?: number, reason?: 'none'|'overrun'|'overlap' }}
 */
export function fitGate(site, point, width, ignoreIndex) {
  const boundary = site?.boundary ?? [];
  if (boundary.length < 3) return { ok: false, reason: 'none' };
  const near = nearestOnBoundary(boundary, point);
  if (!near) return { ok: false, reason: 'none' };
  const margin = (site.boundaryWall?.thickness ?? 0) / 2;
  const at = [near.foot[0] + 0, near.foot[1] + 0];
  if (near.along - width / 2 < margin - 1e-9 || near.along + width / 2 > near.length - margin + 1e-9) {
    return { ok: false, at, edge: near.edge, reason: 'overrun' };
  }
  const gates = site.boundaryWall?.gates ?? [];
  const clash = gates.some((gate, i) => {
    if (i === ignoreIndex) return false;
    const other = nearestOnBoundary(boundary, gate.at);
    return other.edge === near.edge && Math.abs(other.along - near.along) < (gate.width + width) / 2 - 1e-9;
  });
  if (clash) return { ok: false, at, edge: near.edge, reason: 'overlap' };
  return { ok: true, at, edge: near.edge };
}

/**
 * Moves every gate onto the nearest point of the (changed) plot boundary and drops gates that
 * are now far from it. Mutates `site`.
 * @param {import('../model/schema.js').Site} site
 * @returns {import('../model/schema.js').Site}
 */
export function reseatGates(site) {
  const boundary = site?.boundary ?? [];
  if (!site?.boundaryWall?.gates) return site;
  site.boundaryWall.gates = site.boundaryWall.gates.flatMap((gate) => {
    const near = boundary.length >= 3 ? nearestOnBoundary(boundary, gate.at) : null;
    if (!near || near.distance > GATE_REACH) return [];
    return [{ ...gate, at: [near.foot[0] + 0, near.foot[1] + 0] }];
  });
  return site;
}
