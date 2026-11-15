/**
 * Compiles a Building Model into a three.js scene graph: walls, openings, floors, ceilings, slabs,
 * roof, site and fixtures, with one material per paintable surface so paint changes are instant.
 */
import * as THREE from 'three';
import '../kits/all.js';
import { hasKit, buildKit } from '../kits/index.js';
import { nodeWalls, wallFootprints, findRoomFaces } from '../../model/geometry.js';
import { deriveSurfaces, roomPolygons } from '../../model/surfaces.js';
import { createPaintMaterial } from '../materials/registry.js';
import { compileWalls, wallTop } from './walls.js';
import { compileFloors, floorMaterialId, FLOOR_LIFT } from './floors.js';
import { compileSlabs } from './roof.js';
import { compileSite } from './site.js';
import { prepareShadows } from './openings.js';

/** Colour of a paintable surface before any paint is applied. */
const UNPAINTED = '#efede8';

/** Outside a façade: flush fixtures (louvres, signs) up to this depth go with the wall (m). */
const FLUSH_DEPTH = 0.5;
/** Outside a façade: high-mounted fixtures (awnings, window canopies) up to this depth go too (m). */
const CANOPY_DEPTH = 1.8;
const CANOPY_MIN_HEIGHT = 1.8;
/** Inside: wall-hung fixtures (curtains, art, mirrors, AC units) reaching this far into the room (m). */
const HUNG_DEPTH = 0.35;

/**
 * Links fixtures that hang on a façade to that wall, so the dollhouse cuts them away together
 * with it: outside, louvres, fascia signs, awnings and window canopies; inside, curtains, blinds,
 * art, mirrors and wall-mounted AC units. Deep outside parts (porch slabs) and free-standing
 * furniture are left alone.
 * @param {THREE.Group[]} wallGroups walls; those with a `userData.cutaway` record are façades
 * @param {{ object: THREE.Object3D, level: string, box: THREE.Box3 }[]} fixtures placed fixtures
 * @param {Map<string, number>} elevation level elevations
 */
function attachFacadeFixtures(wallGroups, fixtures, elevation) {
  const corner = new THREE.Vector3();
  const facades = wallGroups.filter((group) => group.userData.cutaway);
  for (const group of facades) group.userData.attached = [];
  for (const fixture of fixtures) {
    const { box } = fixture;
    const high = box.min.y >= (elevation.get(fixture.level) ?? 0) + CANOPY_MIN_HEIGHT;
    let best = null;
    for (const group of facades) {
      const cut = group.userData.cutaway;
      const bottom = cut.point.y - cut.height / 2;
      const top = cut.point.y + cut.height / 2;
      if (box.max.y <= bottom || box.min.y > top + 0.6) continue;
      let outMin = Infinity;
      let outMax = -Infinity;
      let alongMin = Infinity;
      let alongMax = -Infinity;
      for (const x of [box.min.x, box.max.x]) {
        for (const z of [box.min.z, box.max.z]) {
          corner.set(x - cut.point.x, 0, z - cut.point.z);
          const out = corner.dot(cut.normal) - cut.face;
          const along = corner.dot(cut.along);
          outMin = Math.min(outMin, out);
          outMax = Math.max(outMax, out);
          alongMin = Math.min(alongMin, along);
          alongMax = Math.max(alongMax, along);
        }
      }
      const overlap = Math.min(alongMax, cut.half) - Math.max(alongMin, -cut.half);
      if (overlap <= 0.05) continue;
      const depth = outMax - Math.max(outMin, 0);
      const outside = outMax > 0.02 && outMin > -cut.thickness - 0.05 && outMin < 0.4
        && (depth <= FLUSH_DEPTH || (high && depth <= CANOPY_DEPTH));
      const gap = -outMax - cut.thickness;
      const reach = -outMin - cut.thickness;
      const inside = outMax < 0.05 && gap <= 0.12 && reach <= HUNG_DEPTH;
      if ((outside || inside) && (!best || overlap > best.overlap)) best = { group, overlap };
    }
    if (best) best.group.userData.attached.push(fixture.object);
  }
}

/**
 * @typedef {object} CompiledBuilding
 * @property {THREE.Group} root
 * @property {import('../../model/schema.js').Surface[]} surfaces paintable surfaces (no cladding, no glass walls; parapets added)
 * @property {Map<string, THREE.Mesh[]>} surfaceMeshes meshes per surface id
 * @property {Map<string, THREE.MeshStandardMaterial>} surfaceMaterials one material per surface id
 * @property {Map<string, THREE.Group>} levelGroups
 * @property {THREE.Group|null} roof
 * @property {THREE.Group} site
 * @property {THREE.Mesh[]} ceilings
 * @property {THREE.Object3D[]} ceilingGroups ceilings and their downlights, per level
 * @property {THREE.Mesh[]} exteriorFaces outside faces of walls that enclose rooms
 * @property {THREE.Mesh[]} topCaps section-cut caps (dollhouse only)
 * @property {THREE.Mesh[]} floors
 * @property {THREE.Group[]} wallGroups walls with a cutaway record for the dollhouse
 * @property {Map<string, object>} rooms room id -> { polygon, level, bounds, centroid, area, name }
 * @property {{ level: string, box: THREE.Box2, object: THREE.Object3D|null }[]} colliders fixture footprints and floor openings in world XZ (x, z)
 * @property {{ level: string, a: number[], b: number[], half: number }[]} wallSegments collision segments (plan)
 * @property {object[]} windowLights window light descriptors
 * @property {object[]} lamps room lamp descriptors
 * @property {THREE.Box3} bounds building bounds, fixtures included
 * @property {THREE.Box3} structureBounds walls, slabs and roof only (what the cameras frame)
 * @property {THREE.Box3} siteBounds bounds including the site
 * @property {Map<string, number>} levelTops world height where each level's walls end
 * @property {{ object: THREE.Object3D, level: string, box: THREE.Box3 }[]} fixtures placed fixtures with world bounds
 * @property {THREE.Object3D[]} blockers solid objects that stop a pick reaching a wall behind them
 * @property {string[]} missingKits fixture kits that are not registered
 */

/**
 * Compiles a building.
 * @param {import('../../model/schema.js').Building} building
 * @param {{ quality: 'high'|'medium'|'low', mat: Function, kitCtx: object }} options
 * @returns {CompiledBuilding}
 */
export function compileBuilding(building, options) {
  const root = new THREE.Group();
  root.name = building.id || 'building';
  const levels = [...(building.levels || [])].sort((a, b) => a.elevation - b.elevation);
  const glassWalls = new Set((building.walls || []).filter((w) => w.role === 'glass').map((w) => w.id));
  const derived = deriveSurfaces(building);
  const surfaces = derived.filter((s) => !s.cladding && !(s.wallId && glassWalls.has(s.wallId.replace(/~\d+$/, ''))));
  const surfacesById = new Map(derived.map((s) => [s.id, s]));
  for (const s of derived) {
    if (!surfaces.includes(s)) surfacesById.set(s.id, { ...s, cladding: s.cladding || 'glass' });
  }
  for (const s of surfaces) surfacesById.set(s.id, s);

  const out = {
    surfaceMeshes: new Map(),
    surfaceMaterials: new Map(),
    exteriorFaces: [],
    topCaps: [],
    ceilings: [],
    floors: [],
    wallGroups: [],
    rooms: new Map(),
    colliders: [],
    wallSegments: [],
    windowLights: [],
    lamps: []
  };
  const roomFloor = new Map((building.rooms || []).map((r) => [r.id, floorMaterialId(r)]));
  const ctx = {
    quality: options.quality,
    mat: options.mat,
    kitCtx: options.kitCtx,
    surfacesById,
    surfaceList: surfaces,
    out,
    surfaceMaterial(id) {
      if (!out.surfaceMaterials.has(id)) {
        const material = createPaintMaterial(UNPAINTED, 'matt');
        material.name = `paint:${id}`;
        out.surfaceMaterials.set(id, material);
      }
      return out.surfaceMaterials.get(id);
    },
    addSurfaceMesh(id, m) {
      if (!out.surfaceMeshes.has(id)) out.surfaceMeshes.set(id, []);
      out.surfaceMeshes.get(id).push(m);
    },
    skirtingFor(roomId) {
      return roomFloor.get(roomId) === 'oak-floor' ? 'walnut' : 'ceramic-white';
    }
  };

  const polygons = roomPolygons(building);
  const levelGroups = new Map();
  const ceilingGroups = [];
  const infos = [];
  levels.forEach((level, index) => {
    const group = new THREE.Group();
    group.name = `level-${level.id}`;
    group.userData.level = level.id;
    const walls = nodeWalls((building.walls || []).filter((w) => w.level === level.id));
    const footprints = wallFootprints(walls);
    group.add(compileWalls(level, index === 0, walls, footprints, ctx));
    const { floors, ceilings } = compileFloors(building, level, polygons, ctx);
    group.add(floors, ceilings);
    ceilingGroups.push(ceilings);
    const top = walls.length ? Math.max(...walls.map((w) => level.elevation + wallTop(w, level))) : level.elevation + level.ceiling;
    infos.push({ level, walls, footprints, faces: findRoomFaces(walls), top });
    levelGroups.set(level.id, group);
    root.add(group);
  });

  const { slabs, roof, parapets } = compileSlabs(building, infos, ctx);
  const blockers = [...slabs.values()];
  if (roof) blockers.push(roof);
  for (const [levelId, group] of slabs) levelGroups.get(levelId).add(group);
  if (roof && levels.length) levelGroups.get(levels[levels.length - 1].id).add(roof);
  surfaces.push(...parapets);

  root.updateMatrixWorld(true);
  const structureBounds = new THREE.Box3();
  for (const group of levelGroups.values()) structureBounds.expandByObject(group);
  const levelTops = new Map(infos.map((info) => [info.level.id, info.top]));

  const fixtures = [];
  const missingKits = new Set();
  const elevation = new Map(levels.map((l) => [l.id, l.elevation]));
  for (const fixture of building.fixtures || []) {
    if (!hasKit(fixture.kit)) {
      missingKits.add(fixture.kit);
      continue;
    }
    let object;
    try {
      object = buildKit(fixture.kit, fixture.params || {}, ctx.kitCtx);
    } catch (error) {
      console.error(error);
      continue;
    }
    object.position.set(fixture.at[0], (elevation.get(fixture.level) ?? 0) + FLOOR_LIFT, -fixture.at[1]);
    object.rotation.y = THREE.MathUtils.degToRad(-(fixture.rotation || 0));
    object.name = object.name || `fixture-${fixture.kit}`;
    object.userData.fixture = fixture.kit;
    prepareShadows(object);
    const parent = levelGroups.get(fixture.level) || root;
    parent.add(object);
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    if (!box.isEmpty()) fixtures.push({ object, level: fixture.level, box });
    if (!box.isEmpty() && box.max.y - box.min.y > 0.25) {
      out.colliders.push({ level: fixture.level, box: new THREE.Box2(new THREE.Vector2(box.min.x, box.min.z), new THREE.Vector2(box.max.x, box.max.z)), object });
    }
  }

  attachFacadeFixtures(out.wallGroups, fixtures, elevation);

  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  for (const group of levelGroups.values()) bounds.expandByObject(group);
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
  if (structureBounds.isEmpty()) structureBounds.copy(bounds);
  const site = compileSite(building, bounds, ctx);
  root.add(site);
  blockers.push(site, ...out.colliders.map((c) => c.object).filter(Boolean));
  root.updateMatrixWorld(true);
  const siteBounds = bounds.clone();
  if (building.site && Array.isArray(building.site.boundary)) {
    for (const p of building.site.boundary) siteBounds.expandByPoint(new THREE.Vector3(p[0], 0, -p[1]));
  }

  return {
    root,
    surfaces,
    surfaceMeshes: out.surfaceMeshes,
    surfaceMaterials: out.surfaceMaterials,
    levelGroups,
    roof,
    site,
    ceilings: out.ceilings,
    ceilingGroups,
    exteriorFaces: out.exteriorFaces,
    topCaps: out.topCaps,
    floors: out.floors,
    wallGroups: out.wallGroups,
    rooms: out.rooms,
    colliders: out.colliders,
    wallSegments: out.wallSegments,
    windowLights: out.windowLights,
    lamps: out.lamps,
    bounds,
    structureBounds,
    siteBounds,
    levelTops,
    fixtures,
    blockers,
    missingKits: [...missingKits]
  };
}

/**
 * Material ids a building is likely to need, so their textures can be generated up front.
 * @param {import('../../model/schema.js').Building} building
 * @returns {string[]}
 */
export function materialsFor(building) {
  const ids = new Set(['plaster', 'render', 'concrete', 'lawn', 'marble', 'walnut', 'paving']);
  for (const room of building.rooms || []) ids.add(floorMaterialId(room));
  for (const wall of building.walls || []) {
    if (wall.cladding && wall.cladding.left) ids.add(wall.cladding.left);
    if (wall.cladding && wall.cladding.right) ids.add(wall.cladding.right);
  }
  for (const patch of (building.site && building.site.ground) || []) ids.add(patch.material === 'road' ? 'asphalt' : patch.material);
  if (building.site && building.site.street) ids.add('asphalt');
  return [...ids];
}
