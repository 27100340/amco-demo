/**
 * Slabs between levels (with their edge band showing on the façade), the ground plinth, the roof
 * slab and parapet walls with coping. Parapets are paintable exterior surfaces `parapet:<wallId>`.
 */
import * as THREE from 'three';
import { nodeWalls, wallFootprints, sub, normalize, leftNormal, distance } from '../../model/geometry.js';
import { extrudePolygons, levelVoids, mesh, GROUND_Y } from './mesh-utils.js';

/** Coping overhang each side and thickness (m). */
const COPING_OVER = 0.03;
const COPING_H = 0.05;
/** Height gap that keeps slab pieces from sharing coplanar faces with floors (m). */
const GAP = 0.006;

/**
 * Compass name of an outward plan normal.
 * @param {[number, number]} v
 * @returns {string}
 */
function facing(v) {
  const deg = ((Math.atan2(v[1], v[0]) * 180) / Math.PI + 360) % 360;
  const names = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'];
  return names[Math.round(deg / 45) % 8];
}

/**
 * A slab covering a level's outline (room faces plus wall footprints).
 * @param {{ faces: { polygon: [number, number][] }[], footprints: Map<string, { polygon: [number, number][] }> }} info
 * @param {number} y0 bottom
 * @param {number} y1 top
 * @param {THREE.Material[]} materials [caps, sides]
 * @param {string} name
 * @param {[number, number][][]} [holes] floor openings (stair wells) cut through the slab
 * @returns {THREE.Mesh[]}
 */
function slab(info, y0, y1, materials, name, holes = []) {
  const meshes = [];
  const faces = extrudePolygons(info.faces.map((f) => f.polygon), y0 + GAP, y1 - GAP, holes);
  if (faces) meshes.push(mesh(faces, materials, `${name}-fill`));
  const prints = extrudePolygons([...info.footprints.values()].map((f) => f.polygon), y0, y1);
  if (prints) meshes.push(mesh(prints, materials, `${name}-edge`));
  return meshes;
}

/**
 * Compiles the plinth, the slabs between levels and the roof with its parapet.
 * @param {import('../../model/schema.js').Building} building
 * @param {{ level: object, walls: object[], footprints: Map, faces: object[], top: number }[]} infos per level, lowest first;
 *   `top` is the world height where that level's walls end
 * @param {object} ctx compile context
 * @returns {{ slabs: Map<string, THREE.Group>, roof: THREE.Group|null, parapets: object[] }}
 *   slabs keyed by the level they carry; parapets are extra Surface records
 */
export function compileSlabs(building, infos, ctx) {
  const slabs = new Map();
  const band = [ctx.mat('concrete', { color: '#cfcbc4' }), ctx.mat('render')];
  infos.forEach((info, i) => {
    const group = new THREE.Group();
    group.name = `slab-${info.level.id}`;
    if (i === 0) {
      for (const m of slab(info, GROUND_Y - 0.12, -0.002, band, 'plinth')) group.add(m);
    } else {
      const below = infos[i - 1];
      for (const m of slab(below, below.top, info.level.elevation, band, `slab-${info.level.id}`, levelVoids(info.level))) group.add(m);
    }
    slabs.set(info.level.id, group);
  });

  const top = infos[infos.length - 1];
  if (!top) return { slabs, roof: null, parapets: [] };
  const roof = new THREE.Group();
  roof.name = 'roof';
  const level = top.level;
  const roofBottom = top.top;
  const roofTop = level.elevation + (Number.isFinite(level.height) ? level.height : top.top - level.elevation + (level.slab || 0.15));
  const roofMaterials = [ctx.mat('concrete', { color: '#bdb8b0' }), ctx.mat('render')];
  for (const m of slab(top, roofBottom, roofTop, roofMaterials, 'roof')) roof.add(m);

  const parapets = [];
  const height = Number(level.parapet) || 0;
  if (height > 0) {
    const exteriorBase = new Map();
    for (const surface of ctx.surfaceList) {
      if (surface.level !== level.id || surface.room !== 'exterior' || !surface.wallId) continue;
      const baseId = surface.wallId.replace(/~\d+$/, '');
      if (!exteriorBase.has(baseId)) exteriorBase.set(baseId, surface.side);
    }
    const originals = (building.walls || []).filter((w) => w.level === level.id && exteriorBase.has(w.id) && w.role !== 'glass');
    const pieces = nodeWalls(originals.map((w) => ({ ...w, openings: [] })));
    const prints = wallFootprints(pieces);
    const coping = wallFootprints(pieces.map((w) => ({ ...w, thickness: w.thickness + COPING_OVER * 2 })));
    const byBase = new Map();
    for (const piece of pieces) {
      const baseId = piece.id.replace(/~\d+$/, '');
      if (!byBase.has(baseId)) byBase.set(baseId, []);
      byBase.get(baseId).push(piece);
    }
    for (const [baseId, list] of byBase) {
      const id = `parapet:${baseId}`;
      const side = exteriorBase.get(baseId);
      const first = list[0];
      const d = normalize(sub(first.b, first.a));
      const left = leftNormal(d);
      const out = side === 'L' ? left : [-left[0], -left[1]];
      const run = list.reduce((sum, w) => sum + distance(w.a, w.b), 0);
      const surface = {
        id,
        group: id,
        wallId: null,
        side: 'outer',
        level: level.id,
        room: 'exterior',
        label: `Parapet, ${facing(out)}-facing`,
        t0: 0,
        t1: run,
        height,
        grossArea: run * height * 2,
        area: run * height * 2,
        openings: []
      };
      parapets.push(surface);
      ctx.surfacesById.set(id, surface);
      const material = ctx.surfaceMaterial(id);
      const geometry = extrudePolygons(list.map((w) => prints.get(w.id).polygon), roofTop, roofTop + height);
      if (geometry) {
        const wallMesh = mesh(geometry, [ctx.mat('concrete', { color: '#cfcbc4' }), material], `parapet-${baseId}`);
        wallMesh.userData.surfaceId = id;
        ctx.addSurfaceMesh(id, wallMesh);
        roof.add(wallMesh);
      }
      const cap = extrudePolygons(list.map((w) => coping.get(w.id).polygon), roofTop + height, roofTop + height + COPING_H);
      if (cap) roof.add(mesh(cap, ctx.mat('concrete', { color: '#d8d4cd' }), `coping-${baseId}`));
    }
  }
  return { slabs, roof, parapets };
}
