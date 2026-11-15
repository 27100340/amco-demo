/**
 * Walls: mitred footprints from the model, one face mesh per wall side with exact holes for
 * openings, reveals through the thickness, end caps, a dark section-cut top cap (dollhouse only),
 * skirting along room faces and glass partitions. Every paintable face is tagged with its surface id.
 */
import * as THREE from 'three';
import { sub, add, scale, dot, normalize, leftNormal, distance } from '../../model/geometry.js';
import { QuadBuilder, addFace, toWorld, planDir, flatPolygon, mesh, GROUND_Y } from './mesh-utils.js';
import { buildOpening } from './openings.js';

/** Skirting height and depth (m). */
const SKIRTING_H = 0.09;
const SKIRTING_D = 0.012;
/** Openings lower than this (m) at the bottom are walk-through for skirting and collisions. */
const WALKABLE_SILL = 0.3;
const MIN_FACE = 1e-4;

/**
 * Height of a wall's solid above its level floor: explicit height, else up to the slab above.
 * @param {import('../../model/schema.js').Wall} wall
 * @param {import('../../model/schema.js').Level} level
 * @returns {number}
 */
export function wallTop(wall, level) {
  if (Number.isFinite(wall.height)) return wall.height;
  const slab = Number.isFinite(level.slab) ? level.slab : 0.15;
  const height = Number.isFinite(level.height) ? level.height : level.ceiling + slab;
  return Math.max(level.ceiling, height - slab);
}

/**
 * Number of wall ends meeting at each node (keyed by rounded coordinates).
 * @param {import('../../model/schema.js').Wall[]} walls
 * @returns {(p: [number, number]) => number}
 */
function nodeDegree(walls) {
  const counts = new Map();
  const key = (p) => `${Math.round(p[0] * 500)},${Math.round(p[1] * 500)}`;
  for (const w of walls) {
    for (const p of [w.a, w.b]) counts.set(key(p), (counts.get(key(p)) || 0) + 1);
  }
  return (p) => counts.get(key(p)) || 0;
}

/**
 * Openings of a wall in face coordinates (metres from a, height above the floor), clipped.
 * @returns {{ id: string, type: string, start: number, end: number, sill: number, head: number, source: object }[]}
 */
function wallHoles(wall, t0, t1, topRel) {
  return (wall.openings || []).map((o) => {
    const sill = Math.max(0, o.sill ?? 0);
    return {
      id: o.id,
      type: o.type,
      start: Math.max(t0, o.at - o.width / 2),
      end: Math.min(t1, o.at + o.width / 2),
      sill,
      head: Math.min(topRel, sill + o.height),
      source: o
    };
  }).filter((h) => h.end - h.start > 1e-4 && h.head - h.sill > 1e-4);
}

/**
 * Builds the skirting strips for one room face, leaving gaps at walk-through openings.
 */
function addSkirting(builder, at, normal, t0, t1, holes) {
  const gaps = holes.filter((h) => h.sill < 0.05).sort((p, q) => p.start - q.start);
  const spans = [];
  let from = t0;
  for (const gap of gaps) {
    if (gap.start > from + 0.02) spans.push([from, gap.start]);
    from = Math.max(from, gap.end);
  }
  if (t1 > from + 0.02) spans.push([from, t1]);
  const up = new THREE.Vector3(0, 1, 0);
  for (const [a, b] of spans) {
    const p = (t, y, d) => at(t, y, d);
    builder.quad([p(a, 0, SKIRTING_D), p(b, 0, SKIRTING_D), p(b, SKIRTING_H, SKIRTING_D), p(a, SKIRTING_H, SKIRTING_D)], normal, [[a, 0], [b, 0], [b, SKIRTING_H], [a, SKIRTING_H]]);
    builder.quad([p(a, SKIRTING_H, 0), p(b, SKIRTING_H, 0), p(b, SKIRTING_H, SKIRTING_D), p(a, SKIRTING_H, SKIRTING_D)], up, [[a, 0], [b, 0], [b, SKIRTING_D], [a, SKIRTING_D]]);
  }
}

/**
 * Glass partition along the wall centreline: aluminium rails and mullions, glass panes, door gaps.
 */
function buildGlassWall(wall, level, ctx, group, topRel) {
  const d = normalize(sub(wall.b, wall.a));
  const len = distance(wall.a, wall.b);
  const holes = wallHoles(wall, 0, len, topRel);
  const base = level.elevation;
  const along = planDir(d);
  const across = planDir(leftNormal(d));
  const at = (t, y) => toWorld(add(wall.a, scale(d, t)), base + y);
  const glass = new QuadBuilder();
  addFace(glass, at, across, 0, len, 0.05, topRel - 0.05, holes);
  const pane = mesh(glass.build(), ctx.mat('glass'), `glass-${wall.id}`, { cast: false });
  group.add(pane);
  const frame = ctx.mat('aluminium-dark');
  const rail = (t0, t1, y, h) => {
    const box = new THREE.Mesh(ctx.kitCtx.rounded(t1 - t0, h, 0.06, 0.004), frame);
    box.position.copy(at((t0 + t1) / 2, y + h / 2));
    box.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), along);
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
  };
  const solid = [];
  let from = 0;
  for (const h of [...holes].sort((p, q) => p.start - q.start)) {
    if (h.sill < WALKABLE_SILL) {
      solid.push([from, h.start]);
      from = h.end;
    }
  }
  solid.push([from, len]);
  for (const [t0, t1] of solid) {
    if (t1 - t0 < 0.02) continue;
    rail(t0, t1, 0, 0.05);
  }
  rail(0, len, topRel - 0.05, 0.05);
  const posts = new Set([0.025, len - 0.025]);
  for (const h of holes) {
    posts.add(h.start - 0.02);
    posts.add(h.end + 0.02);
  }
  const bays = Math.max(1, Math.round(len / 1.2));
  for (let i = 1; i < bays; i++) posts.add((len * i) / bays);
  for (const t of posts) {
    if (t < 0 || t > len) continue;
    if (holes.some((h) => t > h.start + 0.01 && t < h.end - 0.01)) continue;
    const post = new THREE.Mesh(ctx.kitCtx.rounded(0.04, topRel, 0.06, 0.004), frame);
    post.position.copy(at(t, topRel / 2));
    post.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), along);
    post.castShadow = true;
    group.add(post);
  }
  for (const h of holes) {
    if (h.head < topRel - 0.06) rail(h.start, h.end, h.head, 0.04);
  }
}

/**
 * Collision spans of a wall: the centreline minus walk-through openings.
 */
function collisionSegments(wall, len, holes, levelId, out) {
  const d = normalize(sub(wall.b, wall.a));
  const passable = holes.filter((h) => h.sill < WALKABLE_SILL && h.head > 1.8).sort((p, q) => p.start - q.start);
  let from = 0;
  const push = (t0, t1) => {
    if (t1 - t0 < 0.01) return;
    out.push({ level: levelId, a: add(wall.a, scale(d, t0)), b: add(wall.a, scale(d, t1)), half: (wall.thickness || 0.1) / 2 });
  };
  for (const h of passable) {
    push(from, h.start);
    from = h.end;
  }
  push(from, len);
}

/**
 * Compiles every wall of one level.
 * @param {import('../../model/schema.js').Level} level
 * @param {boolean} lowest true for the lowest level (faces reach down to the ground)
 * @param {import('../../model/schema.js').Wall[]} walls noded walls of the level
 * @param {Map<string, object>} footprints from wallFootprints
 * @param {object} ctx compile context (see building.js)
 * @returns {THREE.Group}
 */
export function compileWalls(level, lowest, walls, footprints, ctx) {
  const group = new THREE.Group();
  group.name = `walls-${level.id}`;
  const degree = nodeDegree(walls);
  for (const wall of walls) {
    const fp = footprints.get(wall.id);
    if (!fp) continue;
    const wallGroup = buildWall(wall, fp, level, lowest, degree, ctx);
    if (wallGroup) group.add(wallGroup);
  }
  return group;
}

/**
 * Builds one wall piece.
 */
function buildWall(wall, fp, level, lowest, degree, ctx) {
  const len = distance(wall.a, wall.b);
  if (len < 1e-4) return null;
  const d = normalize(sub(wall.b, wall.a));
  const half = (wall.thickness || 0.1) / 2;
  const topRel = wallTop(wall, level);
  const y0 = lowest ? GROUND_Y : 0;
  const base = level.elevation;
  const left = leftNormal(d);
  const group = new THREE.Group();
  group.name = `wall-${wall.id}`;

  const sides = {};
  for (const side of ['L', 'R']) {
    const surface = ctx.surfacesById.get(`${wall.id}:${side}`) || null;
    const n = side === 'L' ? left : scale(left, -1);
    const face = fp[side];
    const t0 = dot(sub(face[0], wall.a), d);
    const t1 = dot(sub(face[1], wall.a), d);
    sides[side] = { side, surface, n, t0, t1, room: surface ? surface.room : null, builder: new QuadBuilder() };
  }
  const exteriorish = (s) => !s.room || s.room === 'exterior';
  const extSide = exteriorish(sides.L) && !exteriorish(sides.R) ? 'L' : exteriorish(sides.R) && !exteriorish(sides.L) ? 'R' : null;
  const roomSide = extSide ? (extSide === 'L' ? 'R' : 'L') : 'L';

  /** World point at distance t along the wall, height y above the floor, `off` metres out of `side`'s face. */
  const point = (side, t, y, off = 0) => toWorld(add(add(wall.a, scale(d, t)), scale(sides[side].n, half + off)), base + y);

  if (wall.role === 'glass') {
    buildGlassWall(wall, level, ctx, group, topRel);
    collisionSegments(wall, len, wallHoles(wall, 0, len, topRel), level.id, ctx.out.wallSegments);
    if (extSide) {
      group.userData.cutaway = {
        point: toWorld(add(wall.a, scale(d, len / 2)), base + topRel / 2),
        normal: planDir(sides[extSide].n),
        along: planDir(d),
        half: len / 2,
        height: topRel,
        face: 0.03,
        thickness: 0.06
      };
      group.userData.level = level.id;
      ctx.out.wallGroups.push(group);
    }
    return group;
  }

  const allHoles = wallHoles(wall, 0, len, topRel);

  for (const side of ['L', 'R']) {
    const s = sides[side];
    if (s.t1 - s.t0 < MIN_FACE) continue;
    const holes = wallHoles(wall, s.t0, s.t1, topRel);
    addFace(s.builder, (t, y) => point(side, t, y), planDir(s.n), s.t0, s.t1, y0, topRel, holes, side === 'R');
  }

  addReveals(sides, allHoles, roomSide, half, point, d);
  addEndCaps(wall, fp, sides, roomSide, base, y0, topRel, degree, d);

  for (const side of ['L', 'R']) {
    const s = sides[side];
    if (s.builder.isEmpty()) continue;
    const cladding = s.surface && s.surface.cladding;
    const paintable = s.surface && !cladding;
    const material = cladding ? ctx.mat(cladding) : paintable ? ctx.surfaceMaterial(s.surface.id) : ctx.mat('plaster');
    const faceMesh = mesh(s.builder.build(), material, `face-${wall.id}:${side}`);
    if (paintable) {
      faceMesh.userData.surfaceId = s.surface.id;
      ctx.addSurfaceMesh(s.surface.id, faceMesh);
    }
    if (extSide === side) ctx.out.exteriorFaces.push(faceMesh);
    group.add(faceMesh);

    if (s.room && s.room !== 'exterior') {
      const skirting = new QuadBuilder();
      const holes = wallHoles(wall, s.t0, s.t1, topRel);
      addSkirting(skirting, (t, y, off) => point(side, t, y, off), planDir(s.n), s.t0, s.t1, holes);
      if (!skirting.isEmpty()) {
        const skirt = mesh(skirting.build(), ctx.mat(ctx.skirtingFor(s.room)), `skirting-${wall.id}:${side}`, { cast: false });
        group.add(skirt);
      }
    }
  }

  const cap = mesh(flatPolygon(fp.polygon, base + topRel, true), ctx.mat('section-cut'), `cap-${wall.id}`, { cast: false });
  cap.visible = false;
  ctx.out.topCaps.push(cap);
  group.add(cap);

  for (const hole of allHoles) {
    const built = buildOpening(wall, hole.source, { level, d, half, extSide, roomSide, sides, len }, ctx);
    if (built.object) group.add(built.object);
    if (built.windowLight) ctx.out.windowLights.push(built.windowLight);
  }

  collisionSegments(wall, len, allHoles, level.id, ctx.out.wallSegments);

  if (extSide) {
    const s = sides[extSide];
    const mid = (s.t0 + s.t1) / 2;
    group.userData.cutaway = { point: point(extSide, mid, topRel / 2), normal: planDir(s.n), along: planDir(d), half: (s.t1 - s.t0) / 2, height: topRel, face: 0, thickness: half * 2 };
  }
  group.userData.level = level.id;
  ctx.out.wallGroups.push(group);
  return group;
}

/**
 * Jambs, head and sill through the wall thickness. Plain openings take the room side's paint;
 * windows and doors split their reveals at the frame (wall mid-plane) so each half takes the paint
 * of the face it belongs to.
 */
function addReveals(sides, holes, roomSide, half, point, d) {
  const up = new THREE.Vector3(0, 1, 0);
  const down = new THREE.Vector3(0, -1, 0);
  const along = planDir(d);
  const back = along.clone().negate();
  const tMin = Math.max(sides.L.t0, sides.R.t0);
  const tMax = Math.min(sides.L.t1, sides.R.t1);
  for (const h of holes) {
    const start = Math.max(h.start, tMin);
    const end = Math.min(h.end, tMax);
    if (end - start < 1e-3) continue;
    const split = h.type !== 'opening';
    const parts = split ? [['L', -half], ['R', -half]] : [[roomSide, -2 * half]];
    for (const [side, inner] of parts) {
      const builder = sides[side].builder;
      const p = (t, y, o) => point(side, t, y, o);
      const depth = -inner;
      builder.quad([p(start, h.sill, 0), p(start, h.sill, inner), p(start, h.head, inner), p(start, h.head, 0)], along, [[0, h.sill], [depth, h.sill], [depth, h.head], [0, h.head]]);
      builder.quad([p(end, h.sill, 0), p(end, h.sill, inner), p(end, h.head, inner), p(end, h.head, 0)], back, [[0, h.sill], [depth, h.sill], [depth, h.head], [0, h.head]]);
      builder.quad([p(start, h.head, 0), p(end, h.head, 0), p(end, h.head, inner), p(start, h.head, inner)], down, [[start, 0], [end, 0], [end, depth], [start, depth]]);
      if (h.sill > 0.001) {
        builder.quad([p(start, h.sill, 0), p(end, h.sill, 0), p(end, h.sill, inner), p(start, h.sill, inner)], up, [[start, 0], [end, 0], [end, depth], [start, depth]]);
      }
    }
  }
}

/**
 * End caps where a wall end is free (no other wall meets it).
 */
function addEndCaps(wall, fp, sides, roomSide, base, y0, topRel, degree, d) {
  const builder = sides[roomSide].builder;
  const ends = [
    { node: wall.a, l: fp.L[0], r: fp.R[0], normal: planDir(scale(d, -1)) },
    { node: wall.b, l: fp.L[1], r: fp.R[1], normal: planDir(d) }
  ];
  for (const end of ends) {
    if (degree(end.node) > 1) continue;
    const width = distance(end.l, end.r);
    builder.quad(
      [toWorld(end.l, base + y0), toWorld(end.r, base + y0), toWorld(end.r, base + topRel), toWorld(end.l, base + topRel)],
      end.normal,
      [[0, y0], [width, y0], [width, topRel], [0, topRel]]
    );
  }
}
