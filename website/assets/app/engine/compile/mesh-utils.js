/**
 * Geometry helpers shared by the building compiler: plan-to-world mapping, a quad builder with
 * automatic winding, wall faces split into strips around openings, and polygon slabs.
 * Plan coordinates `[x, y]` map to world `(x, elevation, -y)`; UVs are in metres.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pointInPolygon } from '../../model/geometry.js';

/** Height of the open ground below the finished ground floor (m). */
export const GROUND_Y = -0.03;
const EPS = 1e-6;

/**
 * World position of a plan point.
 * @param {[number, number]} p plan point
 * @param {number} [elevation=0]
 * @returns {THREE.Vector3}
 */
export function toWorld(p, elevation = 0) {
  return new THREE.Vector3(p[0], elevation, -p[1]);
}

/**
 * World direction of a plan vector (y = 0).
 * @param {[number, number]} v
 * @returns {THREE.Vector3}
 */
export function planDir(v) {
  return new THREE.Vector3(v[0], 0, -v[1]);
}

/** Collects quads into one indexed BufferGeometry. */
export class QuadBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.indices = [];
  }

  /**
   * Adds a planar quad a-b-c-d (any winding); it is wound so its front faces `normal`.
   * @param {THREE.Vector3[]} corners four corners in order around the quad
   * @param {THREE.Vector3} normal unit normal the quad should face
   * @param {[number, number][]} uvs UV per corner
   */
  quad(corners, normal, uvs) {
    const [a, b, c] = corners;
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const flip = n.dot(normal) < 0;
    const base = this.positions.length / 3;
    corners.forEach((p, i) => {
      this.positions.push(p.x, p.y, p.z);
      this.normals.push(normal.x, normal.y, normal.z);
      this.uvs.push(uvs[i][0], uvs[i][1]);
    });
    if (flip) this.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** @returns {boolean} true when nothing was added */
  isEmpty() {
    return this.indices.length === 0;
  }

  /** @returns {THREE.BufferGeometry} */
  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setIndex(this.indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/**
 * Vertical ranges of [y0, y1] left solid after removing the given openings.
 * @param {number} y0
 * @param {number} y1
 * @param {{ sill: number, head: number }[]} cuts
 * @returns {[number, number][]}
 */
function solidRanges(y0, y1, cuts) {
  const sorted = [...cuts].sort((p, q) => p.sill - q.sill);
  const out = [];
  let at = y0;
  for (const cut of sorted) {
    const lo = Math.max(y0, cut.sill);
    const hi = Math.min(y1, cut.head);
    if (hi <= lo) continue;
    if (lo > at + EPS) out.push([at, lo]);
    at = Math.max(at, hi);
  }
  if (y1 > at + EPS) out.push([at, y1]);
  return out;
}

/**
 * Adds a wall face rectangle t0..t1 × y0..y1 (face coordinates) with rectangular holes, as strips.
 * @param {QuadBuilder} builder
 * @param {(t: number, y: number) => THREE.Vector3} at world point of face coordinates
 * @param {THREE.Vector3} normal face normal (world)
 * @param {number} t0
 * @param {number} t1
 * @param {number} y0
 * @param {number} y1
 * @param {{ start: number, end: number, sill: number, head: number }[]} holes
 * @param {boolean} [mirrorU=false] run U backwards so the texture reads the same from this side
 */
export function addFace(builder, at, normal, t0, t1, y0, y1, holes, mirrorU = false) {
  const inside = holes.filter((h) => h.end > t0 + EPS && h.start < t1 - EPS);
  const xs = [t0, t1];
  for (const h of inside) {
    if (h.start > t0 + EPS && h.start < t1 - EPS) xs.push(h.start);
    if (h.end > t0 + EPS && h.end < t1 - EPS) xs.push(h.end);
  }
  xs.sort((p, q) => p - q);
  const u = (t) => (mirrorU ? -t : t);
  for (let i = 0; i < xs.length - 1; i++) {
    const xa = xs[i];
    const xb = xs[i + 1];
    if (xb - xa < EPS) continue;
    const covering = inside.filter((h) => h.start <= xa + EPS && h.end >= xb - EPS);
    for (const [ya, yb] of solidRanges(y0, y1, covering)) {
      builder.quad(
        [at(xa, ya), at(xb, ya), at(xb, yb), at(xa, yb)],
        normal,
        [[u(xa), ya], [u(xb), ya], [u(xb), yb], [u(xa), yb]]
      );
    }
  }
}

/**
 * Valid floor openings (stair wells) of a level: `level.voids`, plan polygons.
 * @param {{ voids?: unknown }} level
 * @returns {[number, number][][]}
 */
export function levelVoids(level) {
  if (!level || !Array.isArray(level.voids)) return [];
  return level.voids.filter((v) => Array.isArray(v) && v.length >= 3 && v.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])));
}

/**
 * A plan shape with the holes that lie wholly inside it.
 * @param {[number, number][]} polygon
 * @param {[number, number][][]} holes
 * @returns {THREE.Shape}
 */
function shapeWithHoles(polygon, holes) {
  const shape = new THREE.Shape(polygon.map((p) => new THREE.Vector2(p[0], p[1])));
  for (const hole of holes) {
    if (hole.every((p) => pointInPolygon(p, polygon))) shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p[0], p[1]))));
  }
  return shape;
}

/**
 * A horizontal polygon at height `y`, facing up or down. UVs are plan metres.
 * @param {[number, number][]} polygon plan polygon
 * @param {number} y world height
 * @param {boolean} [up=true] facing direction
 * @param {[number, number][][]} [holes] openings cut where they lie wholly inside the polygon
 * @returns {THREE.BufferGeometry}
 */
export function flatPolygon(polygon, y, up = true, holes = []) {
  const shape = shapeWithHoles(polygon, holes);
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  if (!up) {
    const index = geometry.index.array;
    for (let i = 0; i < index.length; i += 3) {
      const t = index[i + 1];
      index[i + 1] = index[i + 2];
      index[i + 2] = t;
    }
    const normals = geometry.attributes.normal.array;
    for (let i = 0; i < normals.length; i++) normals[i] = -normals[i];
  }
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Plan polygons extruded vertically from y0 to y1, merged into one geometry. UVs are in metres
 * (plan x/y on the caps, run/height on the sides). Groups: 0 = top and bottom, 1 = sides.
 * @param {[number, number][][]} polygons
 * @param {number} y0
 * @param {number} y1
 * @param {[number, number][][]} [holes] openings cut from the polygons that wholly contain them
 * @returns {THREE.BufferGeometry|null}
 */
export function extrudePolygons(polygons, y0, y1, holes = []) {
  const parts = [];
  for (const polygon of polygons) {
    if (!polygon || polygon.length < 3) continue;
    const shape = shapeWithHoles(polygon, holes);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, y0, 0);
    parts.push(geometry.index ? geometry.toNonIndexed() : geometry);
  }
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  const groups = [];
  let start = 0;
  for (const part of parts) {
    for (const g of part.groups) groups.push({ start: start + g.start, count: g.count, materialIndex: g.materialIndex });
    start += part.attributes.position.count;
    part.clearGroups();
  }
  const merged = mergeGeometries(parts, false);
  if (!merged) return null;
  for (const g of groups) merged.addGroup(g.start, g.count, g.materialIndex);
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Merges geometries that share one material (no groups).
 * @param {THREE.BufferGeometry[]} list
 * @returns {THREE.BufferGeometry|null}
 */
export function mergeAll(list) {
  const parts = list.filter(Boolean).map((g) => (g.index ? g.toNonIndexed() : g));
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  const merged = mergeGeometries(parts.map((g) => {
    g.clearGroups();
    return g;
  }), false);
  return merged;
}

/**
 * Mesh with shadows on, named for debugging.
 * @param {THREE.BufferGeometry} geometry
 * @param {THREE.Material|THREE.Material[]} material
 * @param {string} name
 * @param {{ cast?: boolean, receive?: boolean }} [shadow]
 * @returns {THREE.Mesh}
 */
export function mesh(geometry, material, name, shadow = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  m.castShadow = shadow.cast !== false;
  m.receiveShadow = shadow.receive !== false;
  return m;
}

/**
 * Inward-or-outward offset of a closed polygon by a constant distance (mitred corners).
 * Positive `distance` moves edges to the left of each edge (inwards for anticlockwise polygons).
 * @param {[number, number][]} polygon
 * @param {number} distance
 * @returns {[number, number][]}
 */
export function offsetPolygon(polygon, distance) {
  const n = polygon.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n];
    const cur = polygon[i];
    const next = polygon[(i + 1) % n];
    const d0 = normal2(sub2(cur, prev));
    const d1 = normal2(sub2(next, cur));
    const n0 = [-d0[1], d0[0]];
    const n1 = [-d1[1], d1[0]];
    const bis = [n0[0] + n1[0], n0[1] + n1[1]];
    const len = Math.hypot(bis[0], bis[1]);
    if (len < 1e-9) {
      out.push([cur[0] + n0[0] * distance, cur[1] + n0[1] * distance]);
      continue;
    }
    const cos = (bis[0] * n0[0] + bis[1] * n0[1]) / len;
    const k = distance / Math.max(0.2, cos);
    out.push([cur[0] + (bis[0] / len) * k, cur[1] + (bis[1] / len) * k]);
  }
  return out;
}

const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
function normal2(v) {
  const len = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / len, v[1] / len];
}
