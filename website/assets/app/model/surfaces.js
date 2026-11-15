/**
 * Paintable surfaces derived from a Building Model. Surfaces are never stored; they are
 * recomputed from the walls, rooms and site whenever needed.
 * Pure module: no DOM, no three.js.
 */
import {
  EPS, add, sub, scale, dot, distance, lerp, normalize, leftNormal,
  projectOnSegment, polygonArea, pointInPolygon, nodeWalls, wallFootprints, findRoomFaces, baseWallId
} from './geometry.js';

/** How far (m) beyond a face the room sample point is taken. */
const SAMPLE_OFFSET = 0.05;
/** Faces shorter than this (m) along the wall are not surfaces. */
const MIN_FACE_LENGTH = 1e-6;
/** Within this many degrees of north/east/south/west a wall takes the plain compass name. */
const CARDINAL_SLACK = 10;

/**
 * True when `p` is an `[x, y]` pair of finite numbers.
 * @param {unknown} p
 * @returns {boolean}
 */
function isPoint(p) {
  return Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
}

/**
 * Copy of a polygon with anticlockwise winding.
 * @param {[number, number][]} poly
 * @returns {[number, number][]}
 */
function anticlockwise(poly) {
  const copy = poly.map((p) => [p[0], p[1]]);
  return polygonArea(copy) < 0 ? copy.reverse() : copy;
}

/**
 * Compass name for a plan direction (x east, y north). Within 10° of an axis it is "north",
 * "east", "south" or "west"; otherwise the diagonal of that quadrant, e.g. "north-east".
 * @param {[number, number]} v
 * @returns {string}
 */
function compass(v) {
  const deg = ((Math.atan2(v[1], v[0]) * 180) / Math.PI + 360) % 360;
  const cardinals = [[0, 'east'], [90, 'north'], [180, 'west'], [270, 'south'], [360, 'east']];
  const cardinal = cardinals.find(([angle]) => Math.abs(deg - angle) <= CARDINAL_SLACK);
  if (cardinal) return cardinal[1];
  if (deg < 90) return 'north-east';
  if (deg < 180) return 'north-west';
  if (deg < 270) return 'south-west';
  return 'south-east';
}

/**
 * Walls of one level, noded the same way the engine nodes them.
 * @param {import('./schema.js').Building} building
 * @param {string} levelId
 * @returns {import('./schema.js').Wall[]}
 */
function levelWalls(building, levelId) {
  return nodeWalls((building.walls ?? []).filter((w) => w.level === levelId));
}

/**
 * Room outlines for every room that has one: `room.polygon` when given (made anticlockwise),
 * otherwise the smallest wall-graph face (of that level's noded walls) containing `room.at`.
 * Rooms with neither are left out.
 * @param {import('./schema.js').Building} building
 * @returns {Map<string, [number, number][]>} room id -> anticlockwise polygon (fresh copies)
 */
export function roomPolygons(building) {
  const result = new Map();
  const faceCache = new Map();
  const facesOf = (levelId) => {
    if (!faceCache.has(levelId)) faceCache.set(levelId, findRoomFaces(levelWalls(building, levelId)));
    return faceCache.get(levelId);
  };
  for (const room of building?.rooms ?? []) {
    if (Array.isArray(room.polygon) && room.polygon.length >= 3) {
      result.set(room.id, anticlockwise(room.polygon));
      continue;
    }
    if (!isPoint(room.at)) continue;
    const containing = facesOf(room.level)
      .filter((face) => pointInPolygon(room.at, face.polygon))
      .sort((x, y) => x.area - y.area);
    if (containing.length > 0) result.set(room.id, anticlockwise(containing[0].polygon));
  }
  return result;
}

/**
 * Openings of a wall in face coordinates, clipped to the face rectangle [t0,t1] × [0,height].
 * @returns {import('./schema.js').SurfaceOpening[]}
 */
function faceOpenings(openings, t0, t1, height) {
  return (openings ?? [])
    .map((o) => {
      const sill = o.sill ?? 0;
      return {
        id: o.id,
        start: Math.max(t0, o.at - o.width / 2),
        end: Math.min(t1, o.at + o.width / 2),
        sill: Math.max(0, sill),
        head: Math.min(height, sill + o.height)
      };
    })
    .filter((o) => o.end - o.start > EPS && o.head - o.sill > EPS);
}

/**
 * Total area of a list of face openings.
 * @param {{ start: number, end: number, sill: number, head: number }[]} openings
 * @returns {number} m²
 */
function openingArea(openings) {
  return openings.reduce((sum, o) => sum + (o.end - o.start) * (o.head - o.sill), 0);
}

/**
 * Builds the surface for one side of a noded wall, or null when the face has no length.
 * @param {import('./schema.js').Wall} wall
 * @param {'L'|'R'} side
 * @param {[[number, number], [number, number]]} face footprint points of that side [at a, at b]
 * @param {import('./schema.js').Level} level
 * @param {{ room: import('./schema.js').Room, polygon: [number, number][] }[]} rooms smallest first
 * @returns {import('./schema.js').Surface | null}
 */
function wallSurface(wall, side, face, level, rooms) {
  const d = normalize(sub(wall.b, wall.a));
  if (d[0] === 0 && d[1] === 0) return null;
  const [start, end] = face;
  const t0 = dot(sub(start, wall.a), d);
  const t1 = dot(sub(end, wall.a), d);
  if (t1 - t0 <= MIN_FACE_LENGTH) return null;
  const height = wall.height ?? level.ceiling;
  const left = leftNormal(d);
  const normal = side === 'L' ? left : scale(left, -1);
  const sample = add(lerp(start, end, 0.5), scale(normal, SAMPLE_OFFSET));
  const hit = rooms.find((r) => pointInPolygon(sample, r.polygon));
  const openings = faceOpenings(wall.openings, t0, t1, height);
  const grossArea = (t1 - t0) * height;
  const label = hit
    ? `${hit.room.name ?? hit.room.id}, ${compass(scale(normal, -1))} wall`
    : `Outside, ${compass(normal)}-facing wall`;
  const room = hit ? hit.room.id : 'exterior';
  const surface = {
    id: `${wall.id}:${side}`,
    group: `${baseWallId(wall.id)}:${side}:${room}`,
    wallId: wall.id,
    side,
    level: level.id,
    room,
    label,
    t0,
    t1,
    height,
    grossArea,
    area: Math.max(0, grossArea - openingArea(openings)),
    openings
  };
  const cladding = side === 'L' ? wall.cladding?.left : wall.cladding?.right;
  if (cladding) surface.cladding = cladding;
  return surface;
}

/**
 * Ceiling surface of a room.
 * @returns {import('./schema.js').Surface}
 */
function ceilingSurface(room, polygon) {
  const area = Math.abs(polygonArea(polygon));
  return {
    id: `${room.id}:ceiling`,
    group: `${room.id}:ceiling`,
    wallId: null,
    side: 'C',
    level: room.level,
    room: room.id,
    label: `${room.name ?? room.id}, ceiling`,
    t0: null,
    t1: null,
    height: null,
    grossArea: area,
    area,
    openings: []
  };
}

/**
 * Arc length along a closed boundary to the point nearest `point`.
 * @param {[number, number][]} boundary
 * @param {[number, number]} point
 * @returns {number} metres from the first boundary vertex
 */
function boundaryPosition(boundary, point) {
  if (!isPoint(point)) return 0;
  let best = { gap: Infinity, s: 0 };
  let travelled = 0;
  boundary.forEach((p, i) => {
    const q = boundary[(i + 1) % boundary.length];
    const edge = distance(p, q);
    const t = Math.min(1, Math.max(0, projectOnSegment(point, p, q).t));
    const gap = distance(point, lerp(p, q, t));
    if (gap < best.gap) best = { gap, s: travelled + t * edge };
    travelled += edge;
  });
  return best.s;
}

/**
 * Inner and outer surfaces of the plot boundary wall, when the site has one.
 * Face coordinates run along the boundary from its first vertex; gates are the openings.
 * @param {import('./schema.js').Site | undefined} site
 * @returns {import('./schema.js').Surface[]}
 */
function siteSurfaces(site) {
  const wall = site?.boundaryWall;
  const boundary = site?.boundary;
  if (!wall || !Array.isArray(boundary) || boundary.length < 3) return [];
  const perimeter = boundary.reduce((sum, p, i) => sum + distance(p, boundary[(i + 1) % boundary.length]), 0);
  const height = wall.height ?? 0;
  if (perimeter <= EPS || height <= 0) return [];
  const gates = (wall.gates ?? []).map((gate, i) => {
    const s = boundaryPosition(boundary, gate.at);
    return { id: `gate-${i + 1}`, start: s - gate.width / 2, end: s + gate.width / 2, sill: 0, head: height };
  });
  const grossArea = perimeter * height;
  const area = Math.max(0, grossArea - openingArea(gates));
  const make = (side, label) => ({
    id: `site:${side}`,
    group: `site:${side}`,
    wallId: null,
    side,
    level: null,
    room: 'site',
    label,
    t0: 0,
    t1: perimeter,
    height,
    grossArea,
    area,
    openings: gates.map((g) => ({ ...g }))
  });
  return [make('inner', 'Boundary wall, inside'), make('outer', 'Boundary wall, outside')];
}

/**
 * Derives every paintable surface of a building:
 * - two per wall (`${wallId}:L`, `${wallId}:R`) on the walls as noded by `nodeWalls`, so a wall
 *   split at a T-junction gives `${id}~2:L` and so on. `t0`/`t1` are the face's extent along the
 *   wall in metres from its `a` end (taken from the mitred footprint), `height` is
 *   `wall.height ?? level.ceiling`, openings are clipped to the face, `area` is net of openings.
 *   A face belongs to the room whose polygon contains a point 5 cm in front of its middle,
 *   otherwise it is `'exterior'`. Labels read "Lounge, north wall" or "Outside, north-facing wall".
 *   `group` is `${baseWallId}:${side}:${room}` (base id = wall id without its `~N` suffix), so the
 *   pieces of a split wall that face the same room paint as one wall.
 *   Faces with a non-paint `cladding` carry `cladding: materialId`.
 * - one ceiling per room with a polygon (`${roomId}:ceiling`, side 'C', area = polygon area);
 * - `site:inner` and `site:outer` when `site.boundaryWall` exists (room 'site', level null).
 * Ceilings and site surfaces are each a group of their own (`group` equals `id`).
 * The building is not modified.
 * @param {import('./schema.js').Building} building
 * @returns {import('./schema.js').Surface[]}
 */
export function deriveSurfaces(building) {
  const surfaces = [];
  const polygons = roomPolygons(building);
  const rooms = building?.rooms ?? [];
  for (const level of building?.levels ?? []) {
    const walls = levelWalls(building, level.id);
    const footprints = wallFootprints(walls);
    const levelRooms = rooms
      .filter((room) => room.level === level.id && polygons.has(room.id))
      .map((room) => ({ room, polygon: polygons.get(room.id) }));
    const smallestFirst = [...levelRooms].sort((x, y) => polygonArea(x.polygon) - polygonArea(y.polygon));
    for (const wall of walls) {
      const fp = footprints.get(wall.id);
      for (const side of ['L', 'R']) {
        const surface = wallSurface(wall, side, fp[side], level, smallestFirst);
        if (surface) surfaces.push(surface);
      }
    }
    for (const { room, polygon } of levelRooms) surfaces.push(ceilingSurface(room, polygon));
  }
  surfaces.push(...siteSurfaces(building?.site));
  return surfaces;
}

/**
 * Resolves a paint selector to surface ids, in surface order.
 * Selectors: a surface id (`'w3:L'`), `'group:<groupId>'` (every piece of one wall side facing
 * one room, e.g. `'group:w3:L:lounge'`), `'room:<roomId>'` (its walls and ceiling), `'exterior'`
 * (building faces outside every room), `'site'` (boundary wall faces) or `'*'` (everything).
 * Unknown selectors, groups, rooms and surface ids resolve to an empty list.
 * @param {import('./schema.js').Building} building
 * @param {import('./schema.js').Surface[]} surfaces from `deriveSurfaces(building)`
 * @param {string} selector
 * @returns {string[]}
 */
export function resolveSelector(building, surfaces, selector) {
  if (typeof selector !== 'string' || !Array.isArray(surfaces)) return [];
  const ids = (keep) => surfaces.filter(keep).map((s) => s.id);
  if (selector === '*') return ids(() => true);
  if (selector === 'exterior') return ids((s) => s.room === 'exterior');
  if (selector === 'site') return ids((s) => s.room === 'site');
  if (selector.startsWith('group:')) {
    const groupId = selector.slice('group:'.length);
    return ids((s) => s.group === groupId);
  }
  if (selector.startsWith('room:')) {
    const roomId = selector.slice('room:'.length);
    const known = (building?.rooms ?? []).some((r) => r.id === roomId);
    return known ? ids((s) => s.room === roomId) : [];
  }
  return surfaces.some((s) => s.id === selector) ? [selector] : [];
}
