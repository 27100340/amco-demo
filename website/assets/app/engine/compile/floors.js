/**
 * Room floors, ceilings and recessed downlights.
 * Floors take `room.floor` or a material by use; ceilings are paintable surfaces `${roomId}:ceiling`.
 */
import * as THREE from 'three';
import { polygonArea, polygonCentroid, pointInPolygon, projectOnSegment } from '../../model/geometry.js';
import { flatPolygon, levelVoids, mesh } from './mesh-utils.js';

/** Floors sit this far above the level elevation so they never fight with slabs below. */
export const FLOOR_LIFT = 0.004;

/** Floor material by room use. */
const FLOOR_BY_USE = {
  bedroom: 'oak-floor',
  kitchen: 'porcelain',
  bath: 'porcelain',
  pantry: 'porcelain',
  office: 'carpet-tile',
  meeting: 'carpet-tile',
  cafe: 'porcelain',
  porch: 'paving',
  balcony: 'porcelain',
  store: 'concrete'
};

/**
 * Floor material id for a room.
 * @param {import('../../model/schema.js').Room} room
 * @returns {string}
 */
export function floorMaterialId(room) {
  return room.floor || FLOOR_BY_USE[room.use] || 'marble';
}

/**
 * Distance from a point to a polygon's boundary.
 * @returns {number}
 */
function edgeDistance(p, polygon) {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const hit = projectOnSegment(p, polygon[i], polygon[(i + 1) % polygon.length]);
    const t = Math.min(1, Math.max(0, hit.t));
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1]));
  }
  return best;
}

/**
 * Downlight positions on a grid inside the room, kept away from the walls.
 * @param {[number, number][]} polygon
 * @returns {[number, number][]}
 */
function downlightGrid(polygon) {
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spacing = 1.5;
  const nx = Math.max(1, Math.round((maxX - minX - 0.8) / spacing) + 1);
  const ny = Math.max(1, Math.round((maxY - minY - 0.8) / spacing) + 1);
  const points = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const p = [minX + ((i + 0.5) / nx) * (maxX - minX), minY + ((j + 0.5) / ny) * (maxY - minY)];
      if (pointInPolygon(p, polygon) && edgeDistance(p, polygon) > 0.45) points.push(p);
    }
  }
  return points;
}

/**
 * Compiles floors, ceilings and downlights of the rooms on one level.
 * @param {import('../../model/schema.js').Building} building
 * @param {import('../../model/schema.js').Level} level
 * @param {Map<string, [number, number][]>} polygons room outlines from roomPolygons
 * @param {object} ctx compile context
 * @returns {{ floors: THREE.Group, ceilings: THREE.Group }}
 */
export function compileFloors(building, level, polygons, ctx) {
  const floors = new THREE.Group();
  floors.name = `floors-${level.id}`;
  const ceilings = new THREE.Group();
  ceilings.name = `ceilings-${level.id}`;
  const lights = [];
  const ceilingY = level.elevation + level.ceiling;
  const openings = levelVoids(level);
  const above = [...(building.levels || [])].filter((l) => l.elevation > level.elevation).sort((a, b) => a.elevation - b.elevation)[0];
  const overhead = levelVoids(above);
  for (const hole of openings) {
    const xs = hole.map((p) => p[0]);
    const ys = hole.map((p) => p[1]);
    ctx.out.colliders.push({
      level: level.id,
      box: new THREE.Box2(new THREE.Vector2(Math.min(...xs), -Math.max(...ys)), new THREE.Vector2(Math.max(...xs), -Math.min(...ys))),
      object: null
    });
  }

  for (const room of building.rooms || []) {
    if (room.level !== level.id || !polygons.has(room.id)) continue;
    const polygon = polygons.get(room.id);
    const floor = mesh(flatPolygon(polygon, level.elevation + FLOOR_LIFT, true, openings), ctx.mat(floorMaterialId(room)), `floor-${room.id}`, { cast: false });
    floor.userData.floor = room.id;
    floor.userData.level = level.id;
    floors.add(floor);
    ctx.out.floors.push(floor);

    const surfaceId = `${room.id}:ceiling`;
    const paintable = ctx.surfacesById.has(surfaceId);
    const material = paintable ? ctx.surfaceMaterial(surfaceId) : ctx.mat('plaster');
    const ceiling = mesh(flatPolygon(polygon, ceilingY, false, overhead), material, `ceiling-${room.id}`);
    if (paintable) {
      ceiling.userData.surfaceId = surfaceId;
      ctx.addSurfaceMesh(surfaceId, ceiling);
    }
    ceilings.add(ceiling);
    ctx.out.ceilings.push(ceiling);

    const area = Math.abs(polygonArea(polygon));
    const centroid = polygonCentroid(polygon);
    for (const p of downlightGrid(polygon)) {
      if (!overhead.some((hole) => pointInPolygon(p, hole))) lights.push(p);
    }
    ctx.out.lamps.push({ room: room.id, position: new THREE.Vector3(centroid[0], ceilingY - 0.4, -centroid[1]), area });

    const xs = polygon.map((p) => p[0]);
    const ys = polygon.map((p) => p[1]);
    ctx.out.rooms.set(room.id, {
      id: room.id,
      name: room.name || room.id,
      use: room.use,
      level: level.id,
      polygon,
      centroid,
      area,
      elevation: level.elevation,
      ceiling: level.ceiling,
      bounds: new THREE.Box3(
        new THREE.Vector3(Math.min(...xs), level.elevation, -Math.max(...ys)),
        new THREE.Vector3(Math.max(...xs), level.elevation + level.ceiling, -Math.min(...ys))
      )
    });
  }

  if (lights.length) {
    const disc = new THREE.CylinderGeometry(0.045, 0.045, 0.01, 24);
    const ring = new THREE.CylinderGeometry(0.062, 0.062, 0.006, 32);
    const discs = new THREE.InstancedMesh(disc, ctx.mat('led'), lights.length);
    const rings = new THREE.InstancedMesh(ring, ctx.mat('ceramic-white'), lights.length);
    const m = new THREE.Matrix4();
    lights.forEach((p, i) => {
      m.makeTranslation(p[0], ceilingY - 0.006, -p[1]);
      discs.setMatrixAt(i, m);
      m.makeTranslation(p[0], ceilingY - 0.002, -p[1]);
      rings.setMatrixAt(i, m);
    });
    discs.name = `downlights-${level.id}`;
    rings.name = `downlight-trims-${level.id}`;
    ceilings.add(discs, rings);
  }
  return { floors, ceilings };
}
