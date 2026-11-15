/**
 * Shared building blocks for the kit families: a part collector that merges geometry into one
 * mesh per material, bevelled primitives, soft cushions, draped and pleated fabric, foliage
 * cards and canvas textures. Browser-only: kits run inside the 3D engine.
 *
 * Conventions: metres; a kit's origin is the floor centre of its footprint; its front faces −Z.
 * Rotations are `[rx, ry, rz]` in radians, applied yaw first (Euler order 'YXZ').
 */
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** Per-context cache of bespoke materials and textures. */
const bespoke = new WeakMap();

/** Attributes kept on merged kit geometry. */
const KEPT_ATTRIBUTES = ['position', 'normal', 'uv', 'color'];

/**
 * Returns a cached object for this kit context, creating it on first use.
 * @param {object} ctx kit context
 * @param {string} key cache key
 * @param {() => any} create factory
 * @returns {any} the cached value
 */
export function cached(ctx, key, create) {
  let store = bespoke.get(ctx);
  if (!store) {
    store = new Map();
    bespoke.set(ctx, store);
  }
  if (!store.has(key)) store.set(key, create());
  return store.get(key);
}

/**
 * Seeded pseudo-random generator (mulberry32), so kits look the same on every load.
 * @param {number} seed any integer
 * @returns {() => number} returns numbers in [0, 1)
 */
export function random(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Semantic finishes on top of the material registry, so every kit asks for wood, fabric or
 * metal the same way.
 * @param {object} ctx kit context
 * @returns {object} finish factories
 */
export function finishes(ctx) {
  const m = ctx.mat;
  return {
    fabric: (color = '#b8b0a3') => m('fabric-linen', { color }),
    leather: (color = '#6b4630') => m('leather', { color }),
    walnut: () => m('walnut'),
    oak: () => m('oak-floor', { repeat: [0.14, 0.14] }),
    lacquer: (color = '#ece8e1', roughness = 0.45) => m('ceramic-white', { color, roughness }),
    steel: () => m('brushed-steel'),
    brass: () => m('brushed-steel', { color: '#c9a66b', roughness: 0.3 }),
    black: () => m('metal-black'),
    aluminium: () => m('aluminium-dark'),
    chrome: () => m('chrome'),
    mirror: () => m('mirror'),
    glass: () => m('glass'),
    frosted: () => m('glass-frosted'),
    rubber: () => m('rubber'),
    ceramic: (color) => m('ceramic-white', color ? { color } : {}),
    led: () => m('led'),
    marble: (color) => m('marble', color ? { color } : {}),
    concrete: (color) => m('concrete', color ? { color } : {}),
    stone: () => m('stone-cladding'),
    porcelain: (color) => m('porcelain', color ? { color } : {})
  };
}

/**
 * A material with per-vertex colours, for many small coloured items (books, garments, stock)
 * that should draw in one call.
 * @param {object} ctx kit context
 * @param {number} [roughness] surface roughness
 * @returns {import('three').Material} cached material
 */
export function tintedMaterial(ctx, roughness = 0.75) {
  return cached(ctx, `tinted:${roughness}`, () => new ctx.THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0 }));
}

/**
 * A double-sided copy of a registry material, for thin fabric such as curtains and duvets.
 * @param {object} ctx kit context
 * @param {import('three').Material} material base material
 * @param {string} key cache key
 * @returns {import('three').Material} cached double-sided material
 */
export function doubleSided(ctx, material, key) {
  return cached(ctx, `double:${key}`, () => {
    const copy = material.clone();
    copy.side = ctx.THREE.DoubleSide;
    return copy;
  });
}

/**
 * Creates a canvas of the given size (DOM canvas, or OffscreenCanvas in workers).
 * @param {number} w width in pixels
 * @param {number} h height in pixels
 * @returns {HTMLCanvasElement|OffscreenCanvas} the canvas
 */
export function makeCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }
  return new OffscreenCanvas(w, h);
}

/**
 * A cached canvas texture drawn once per kit context.
 * @param {object} ctx kit context
 * @param {string} key cache key
 * @param {number} w width in pixels
 * @param {number} h height in pixels
 * @param {(g: CanvasRenderingContext2D, w: number, h: number) => void} draw painter
 * @param {{ colour?: boolean, repeat?: boolean }} [opts] colour textures use sRGB; repeat wraps
 * @returns {import('three').CanvasTexture} the texture
 */
export function canvasTexture(ctx, key, w, h, draw, opts = {}) {
  return cached(ctx, `tex:${key}`, () => {
    const T = ctx.THREE;
    const canvas = makeCanvas(w, h);
    draw(canvas.getContext('2d'), w, h);
    const texture = new T.CanvasTexture(canvas);
    if (opts.colour !== false) texture.colorSpace = T.SRGBColorSpace;
    if (opts.repeat) {
      texture.wrapS = T.RepeatWrapping;
      texture.wrapT = T.RepeatWrapping;
    }
    texture.anisotropy = 8;
    return texture;
  });
}

/**
 * A matte material showing a canvas picture (prints, signs, rugs, screens).
 * @param {object} ctx kit context
 * @param {string} key cache key
 * @param {number} w canvas width in pixels
 * @param {number} h canvas height in pixels
 * @param {(g: CanvasRenderingContext2D, w: number, h: number) => void} draw painter
 * @param {object} [props] extra MeshStandardMaterial properties
 * @returns {import('three').Material} cached material
 */
export function pictureMaterial(ctx, key, w, h, draw, props = {}) {
  return cached(ctx, `pic:${key}`, () => new ctx.THREE.MeshStandardMaterial({
    map: canvasTexture(ctx, key, w, h, draw),
    roughness: 0.85,
    metalness: 0,
    ...props
  }));
}

/**
 * Projects metre-scale UVs onto a non-indexed geometry, one axis pair per triangle, with u along
 * the part's longer in-plane dimension so wood grain follows the length of a board.
 * @param {object} T three namespace
 * @param {import('three').BufferGeometry} g non-indexed geometry
 * @param {number} scale UV units per metre
 */
function boxUV(T, g, scale) {
  const pos = g.attributes.position;
  g.computeBoundingBox();
  const size = g.boundingBox.getSize(new T.Vector3());
  const extent = [size.x, size.y, size.z];
  const uv = new Float32Array(pos.count * 2);
  const p = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let tri = 0; tri + 2 < pos.count; tri += 3) {
    for (let k = 0; k < 3; k++) p[k] = [pos.getX(tri + k), pos.getY(tri + k), pos.getZ(tri + k)];
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const n = [
      Math.abs(e1[1] * e2[2] - e1[2] * e2[1]),
      Math.abs(e1[2] * e2[0] - e1[0] * e2[2]),
      Math.abs(e1[0] * e2[1] - e1[1] * e2[0])
    ];
    const axis = n[0] >= n[1] && n[0] >= n[2] ? 0 : (n[1] >= n[2] ? 1 : 2);
    let [ua, va] = [[2, 1], [0, 2], [0, 1]][axis];
    if (extent[va] > extent[ua]) [ua, va] = [va, ua];
    for (let k = 0; k < 3; k++) {
      uv[(tri + k) * 2] = p[k][ua] * scale;
      uv[(tri + k) * 2 + 1] = p[k][va] * scale;
    }
  }
  g.setAttribute('uv', new T.BufferAttribute(uv, 2));
}

/**
 * Smooth, welded normals for a deformed geometry (drops its UVs; they are re-projected later).
 * @param {import('three').BufferGeometry} g geometry
 * @returns {import('three').BufferGeometry} indexed geometry with smooth normals
 */
export function smoothNormals(g) {
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const welded = mergeVertices(g, 1e-4);
  welded.computeVertexNormals();
  return welded;
}

/**
 * Builds a curve through `points` with straight runs and rounded corners of `radius`.
 * @param {object} T three namespace
 * @param {number[][]} points polyline points [x, y, z]
 * @param {number} radius corner radius in metres
 * @param {boolean} [closed] join the last point back to the first
 * @returns {import('three').CurvePath} the path
 */
export function roundedPath(T, points, radius, closed = false) {
  const v = points.map((q) => new T.Vector3(q[0], q[1], q[2]));
  const path = new T.CurvePath();
  const n = v.length;
  const corner = (i) => {
    const prev = v[(i - 1 + n) % n];
    const here = v[i];
    const next = v[(i + 1) % n];
    const r = Math.min(radius, here.distanceTo(prev) / 2, here.distanceTo(next) / 2);
    return {
      inPoint: here.clone().add(prev.clone().sub(here).setLength(r)),
      outPoint: here.clone().add(next.clone().sub(here).setLength(r)),
      here
    };
  };
  if (closed) {
    const corners = v.map((_, i) => corner(i));
    corners.forEach((c, i) => {
      const nextCorner = corners[(i + 1) % n];
      path.add(new T.QuadraticBezierCurve3(c.inPoint, c.here, c.outPoint));
      path.add(new T.LineCurve3(c.outPoint, nextCorner.inPoint));
    });
    return path;
  }
  let start = v[0];
  for (let i = 1; i < n - 1; i++) {
    const c = corner(i);
    path.add(new T.LineCurve3(start, c.inPoint));
    path.add(new T.QuadraticBezierCurve3(c.inPoint, c.here, c.outPoint));
    start = c.outPoint;
  }
  path.add(new T.LineCurve3(start, v[n - 1]));
  return path;
}

/**
 * A tube along a curve whose radius tapers from r0 to r1 (trunks, branches, arms, stems).
 * @param {object} T three namespace
 * @param {import('three').Curve} curve centre line
 * @param {number} r0 radius at the start
 * @param {number} r1 radius at the end
 * @param {number} [steps] rings along the curve
 * @param {number} [radial] segments around
 * @returns {import('three').BufferGeometry} indexed geometry
 */
export function taperTube(T, curve, r0, r1, steps = 12, radial = 8) {
  const frames = curve.computeFrenetFrames(steps, false);
  const positions = [];
  const normals = [];
  const uvs = [];
  const index = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const centre = curve.getPointAt(t);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const n = frames.normals[i].clone().multiplyScalar(Math.cos(a)).add(frames.binormals[i].clone().multiplyScalar(Math.sin(a)));
      positions.push(centre.x + n.x * r, centre.y + n.y * r, centre.z + n.z * r);
      normals.push(n.x, n.y, n.z);
      uvs.push(j / radial, t);
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  return g;
}

/**
 * A rounded-rectangle shape centred on the origin.
 * @param {object} T three namespace
 * @param {number} w width
 * @param {number} h height
 * @param {number} r corner radius
 * @returns {import('three').Shape} the shape
 */
export function roundedRect(T, w, h, r) {
  const s = new T.Shape();
  const x = -w / 2;
  const y = -h / 2;
  const rr = Math.min(r, w / 2, h / 2);
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  s.quadraticCurveTo(x + w, y, x + w, y + rr);
  s.lineTo(x + w, y + h - rr);
  s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  s.lineTo(x + rr, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - rr);
  s.lineTo(x, y + rr);
  s.quadraticCurveTo(x, y, x + rr, y);
  return s;
}

/**
 * A pleated curtain panel: a sheet hanging from y = h down to 0, `w` wide, folded in soft
 * waves of `depth`, with the hem kicking out slightly.
 * @param {object} T three namespace
 * @param {number} w width once gathered
 * @param {number} h drop
 * @param {number} folds number of folds
 * @param {number} depth fold depth
 * @param {number} [seed] variation seed
 * @returns {import('three').BufferGeometry} geometry centred on x, back at z = 0
 */
export function pleatedPanel(T, w, h, folds, depth, seed = 1) {
  const rnd = random(seed);
  const phase = rnd() * Math.PI;
  const nx = Math.max(8, folds * 8);
  const g = new T.PlaneGeometry(w, h, nx, 8);
  g.translate(0, h / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const u = (x / w + 0.5) * folds * Math.PI * 2 + phase;
    const hem = 1 + 0.35 * (1 - y / h) ** 3;
    const z = -(Math.sin(u) * 0.5 + 0.5) * depth * hem - 0.004 * Math.sin(u * 2.3 + y * 3);
    pos.setZ(i, z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A corrugated sheet in the XY plane (shutter slats, garage panels): horizontal ribs of `pitch`
 * and `depth`, from y = 0 to h, centred on x.
 * @param {object} T three namespace
 * @param {number} w width
 * @param {number} h height
 * @param {number} pitch rib spacing
 * @param {number} depth rib depth
 * @returns {import('three').BufferGeometry} indexed geometry
 */
export function corrugated(T, w, h, pitch, depth) {
  const ribs = Math.max(1, Math.round(h / pitch));
  const rows = ribs * 6;
  const g = new T.PlaneGeometry(w, h, 1, rows);
  g.translate(0, h / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const phase = ((y / h) * ribs) % 1;
    const bump = phase < 0.75 ? Math.sin((phase / 0.75) * Math.PI) : 0;
    pos.setZ(i, -bump * depth);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Identity of a material apart from its colour, or null when it must stay separate
 * (transparent, alpha-tested, emissive, clear-coated, already vertex-coloured or painted).
 * @param {import('three').Material} m material
 * @returns {string|null} family key
 */
function tintKey(m) {
  if (!m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.vertexColors) return null;
  if (m.transparent || m.opacity < 1 || m.alphaTest > 0 || m.userData?.paint || m.userData?.lamp) return null;
  if (m.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0) return null;
  const tex = (t) => (t ? `${t.source.uuid}@${t.repeat.x},${t.repeat.y}` : '-');
  const textured = Boolean(m.map || m.roughnessMap);
  const roughness = textured ? m.roughness : Math.round(m.roughness * 10) / 10;
  const metalness = textured ? m.metalness : Math.round(m.metalness * 4) / 4;
  return [tex(m.map), tex(m.normalMap), tex(m.roughnessMap), tex(m.metalnessMap), m.normalScale ? m.normalScale.x : 0,
    roughness, metalness, m.side, m.envMapIntensity, m.flatShading].join('|');
}

/** Fiddle-leaf outline as [v, half-width] rows from stem to tip, in fractions of the leaf canvas
 *  (matches drawFiddleLeaf), so leaf geometry follows the painted leaf exactly. */
const FIDDLE_PROFILE = [[0.03, 0.012], [0.08, 0.081], [0.16, 0.163], [0.26, 0.24], [0.36, 0.299], [0.46, 0.344], [0.56, 0.388],
  [0.66, 0.415], [0.76, 0.411], [0.84, 0.375], [0.9, 0.313], [0.94, 0.236], [0.965, 0.14], [0.978, 0.03]];

/**
 * Collects parts and merges them into one mesh per material. Every helper returns `this` so
 * calls chain; `build()` returns the finished group.
 */
export class Parts {
  /**
   * @param {object} ctx kit context
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.T = ctx.THREE;
    this.buckets = new Map();
    this.objects = [];
    this.lights = [];
  }

  /**
   * Bevel segments for a corner radius at the current quality tier.
   * @param {number} r corner radius
   * @returns {number} segments
   */
  segments(r) {
    if (this.ctx.quality === 'low') return 1;
    if (r >= 0.03) return this.ctx.quality === 'high' ? 4 : 3;
    return r >= 0.008 ? 2 : 1;
  }

  /**
   * Adds a geometry (cloned) with a transform.
   * @param {import('three').BufferGeometry} geometry source geometry
   * @param {import('three').Material} material material
   * @param {number[]} [pos] position [x, y, z]
   * @param {number[]} [rot] rotation [rx, ry, rz] radians, order YXZ
   * @param {{ uv?: 'box'|'keep', uvScale?: number, color?: string|number, scale?: number[], after?: (g: import('three').BufferGeometry) => void }} [opts] options
   * @returns {Parts} this
   */
  add(geometry, material, pos = [0, 0, 0], rot = [0, 0, 0], opts = {}) {
    const T = this.T;
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const name of Object.keys(g.attributes)) {
      if (!KEPT_ATTRIBUTES.includes(name)) g.deleteAttribute(name);
    }
    g.clearGroups();
    if (opts.scale) g.scale(opts.scale[0], opts.scale[1], opts.scale[2]);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (opts.uv === 'keep') {
      if (!g.attributes.uv) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    } else {
      boxUV(T, g, opts.uvScale ?? 1);
    }
    if (opts.color !== undefined) {
      const c = new T.Color(opts.color);
      const colours = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < colours.length; i += 3) {
        colours[i] = c.r;
        colours[i + 1] = c.g;
        colours[i + 2] = c.b;
      }
      g.setAttribute('color', new T.Float32BufferAttribute(colours, 3));
    }
    const matrix = new T.Matrix4().compose(
      new T.Vector3(pos[0], pos[1], pos[2]),
      new T.Quaternion().setFromEuler(new T.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0, 'YXZ')),
      new T.Vector3(1, 1, 1)
    );
    g.applyMatrix4(matrix);
    if (opts.after) opts.after(g);
    if (!this.buckets.has(material)) this.buckets.set(material, []);
    this.buckets.get(material).push(g);
    return this;
  }

  /**
   * Rounded box standing on `pos` (pos is the bottom centre; rotation pivots there).
   * @param {import('three').Material} material material
   * @param {number[]} size [w, h, d]
   * @param {number} r edge radius
   * @param {number[]} pos bottom centre [x, y, z]
   * @param {number[]} [rot] rotation
   * @param {object} [opts] add() options
   * @returns {Parts} this
   */
  box(material, size, r, pos, rot, opts) {
    const [w, h, d] = size;
    const g = this.ctx.rounded(w, h, d, Math.max(0.001, r), this.segments(r));
    g.translate(0, h / 2, 0);
    return this.add(g, material, pos, rot, opts);
  }

  /**
   * Rounded box centred on `centre`.
   * @param {import('three').Material} material material
   * @param {number[]} size [w, h, d]
   * @param {number} r edge radius
   * @param {number[]} centre [x, y, z]
   * @param {number[]} [rot] rotation
   * @param {object} [opts] add() options
   * @returns {Parts} this
   */
  cbox(material, size, r, centre, rot, opts) {
    const g = this.ctx.rounded(size[0], size[1], size[2], Math.max(0.001, r), this.segments(r));
    return this.add(g, material, centre, rot, opts);
  }

  /**
   * Cylinder standing on `pos`.
   * @param {import('three').Material} material material
   * @param {number} rTop top radius
   * @param {number} rBottom bottom radius
   * @param {number} h height
   * @param {number[]} pos bottom centre
   * @param {number[]} [rot] rotation
   * @param {number} [radial] segments around
   * @param {object} [opts] add() options
   * @returns {Parts} this
   */
  cyl(material, rTop, rBottom, h, pos, rot, radial = 18, opts) {
    const g = new this.T.CylinderGeometry(rTop, rBottom, h, radial, 1);
    g.translate(0, h / 2, 0);
    return this.add(g, material, pos, rot, opts);
  }

  /**
   * Lathe from a profile of [radius, y] pairs, revolved about the local Y axis.
   * @param {import('three').Material} material material
   * @param {number[][]} profile [[r, y], ...] from bottom to top
   * @param {number[]} pos base position
   * @param {number[]} [rot] rotation
   * @param {number} [radial] segments around
   * @param {object} [opts] add() options (scale squashes it into an oval)
   * @returns {Parts} this
   */
  lathe(material, profile, pos, rot, radial = 28, opts) {
    const g = new this.T.LatheGeometry(profile.map(([r, y]) => new this.T.Vector2(Math.max(0, r), y)), radial);
    return this.add(g, material, pos, rot, opts);
  }

  /**
   * Tube along a polyline with rounded corners (metal frames, rails, handles).
   * @param {import('three').Material} material material
   * @param {number[][]} points [[x, y, z], ...]
   * @param {number} radius tube radius
   * @param {{ corner?: number, radial?: number, closed?: boolean }} [opts] corner radius etc.
   * @returns {Parts} this
   */
  tube(material, points, radius, opts = {}) {
    const T = this.T;
    const corner = opts.corner ?? radius * 3;
    const path = roundedPath(T, points, corner, opts.closed);
    const radial = opts.radial ?? 10;
    const pieces = path.curves
      .filter((curve) => curve.getLength() > 1e-5)
      .map((curve) => new T.TubeGeometry(curve, curve.isLineCurve3 ? 1 : (this.ctx.quality === 'low' ? 3 : 6), radius, radial, false).toNonIndexed());
    const merged = pieces.length === 1 ? pieces[0] : mergeGeometries(pieces, false);
    return this.add(merged, material, [0, 0, 0], [0, 0, 0], opts);
  }

  /**
   * Ellipsoid centred on `centre`.
   * @param {import('three').Material} material material
   * @param {number} r radius
   * @param {number[]} centre centre
   * @param {number[]} [scale] per-axis scale
   * @param {number[]} [rot] rotation
   * @param {number} [segs] width segments
   * @param {object} [opts] add() options
   * @returns {Parts} this
   */
  sphere(material, r, centre, scale = [1, 1, 1], rot, segs = 18, opts = {}) {
    const g = new this.T.SphereGeometry(r, segs, Math.max(8, Math.round(segs * 0.66)));
    return this.add(g, material, centre, rot, { ...opts, scale });
  }

  /**
   * Bevelled extrusion of a 2D shape (XY plane), centred on z.
   * @param {import('three').Material} material material
   * @param {import('three').Shape|import('three').Shape[]} shape outline(s)
   * @param {number} depth extrusion depth along z
   * @param {number} bevel bevel size
   * @param {number[]} pos position
   * @param {number[]} [rot] rotation
   * @param {object} [opts] add() options; `inset: true` keeps the outline exact at mid-depth
   *   (the bevel eats into the caps instead of growing the outline)
   * @returns {Parts} this
   */
  extrude(material, shape, depth, bevel, pos, rot, opts = {}) {
    const g = new this.T.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelOffset: opts.inset ? -bevel : 0,
      bevelSegments: this.ctx.quality === 'low' ? 1 : 2,
      curveSegments: this.ctx.quality === 'low' ? 6 : 10
    });
    g.translate(0, 0, -depth / 2);
    return this.add(g, material, pos, rot, opts);
  }

  /**
   * Soft cushion: a rounded box whose top and bottom crown, whose middle sags and whose sides
   * bulge, standing on `pos`.
   * @param {import('three').Material} material material
   * @param {number[]} size [w, h, d]
   * @param {number} r edge radius
   * @param {number[]} pos bottom centre
   * @param {number[]} [rot] rotation
   * @param {{ crown?: number, sag?: number, bulge?: number }} [shape] deformation in metres
   * @param {object} [opts] add() options (for example a vertex colour)
   * @returns {Parts} this
   */
  cushion(material, size, r, pos, rot, shape = {}, opts = {}) {
    const [w, h, d] = size;
    const seg = this.ctx.quality === 'low' ? 2 : 3;
    let g = this.ctx.rounded(w, h, d, Math.max(0.005, r), seg);
    const p = g.attributes.position;
    const crown = shape.crown ?? 0.01;
    const sag = shape.sag ?? 0;
    const bulge = shape.bulge ?? 0.008;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const nx = Math.max(-1, Math.min(1, x / (w / 2)));
      const ny = Math.max(-1, Math.min(1, y / (h / 2)));
      const nz = Math.max(-1, Math.min(1, z / (d / 2)));
      const middle = (1 - nx * nx) * (1 - nz * nz);
      const waist = 1 - ny * ny;
      let dy = ny * crown * middle;
      if (ny > 0) dy -= sag * ny * middle;
      p.setXYZ(i, x + nx * bulge * waist, y + dy, z + nz * bulge * waist);
    }
    g = smoothNormals(g);
    g.translate(0, h / 2, 0);
    return this.add(g, material, pos, rot, opts);
  }

  /**
   * One double-faced foliage card (bent slightly along its length), lit as if part of a round
   * crown centred on `centre` so clusters read as volume, not flat cards.
   * @param {import('three').Material} material foliage material
   * @param {number} w card width
   * @param {number} h card length
   * @param {number[]} pos position of the card's base
   * @param {number[]} rot rotation
   * @param {{ bend?: number, centre?: number[], soften?: number, uvRect?: number[] }} [opts] options
   * @returns {Parts} this
   */
  card(material, w, h, pos, rot, opts = {}) {
    const T = this.T;
    const front = new T.PlaneGeometry(w, h, 1, 3);
    front.translate(0, h / 2, 0);
    const bend = opts.bend ?? 0.15;
    const fp = front.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const t = fp.getY(i) / h;
      fp.setZ(i, bend * h * t * t);
    }
    if (opts.uvRect) {
      const [u0, v0, u1, v1] = opts.uvRect;
      const uv = front.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    }
    return this.sheet(front, material, pos, rot, opts);
  }

  /**
   * One leaf with its true outline (no transparent margin), cupped across the midrib and bent
   * along its length, mapped onto a leaf texture drawn to fill a w × h canvas.
   * @param {import('three').Material} material leaf material (opaque, see foliage(…, true))
   * @param {number} w width of the texture canvas in metres
   * @param {number} h length of the texture canvas in metres
   * @param {number[]} pos position of the leaf base
   * @param {number[]} rot rotation
   * @param {{ profile?: number[][], cup?: number, bend?: number, centre?: number[], soften?: number }} [opts]
   *   profile is [[v, half-width], ...] from base to tip in canvas fractions
   * @returns {Parts} this
   */
  leaf(material, w, h, pos, rot, opts = {}) {
    const T = this.T;
    const all = opts.profile || FIDDLE_PROFILE;
    const rows = this.ctx.quality === 'high' ? all : all.filter((_, i) => i % 2 === 0 || i === all.length - 1);
    const cup = opts.cup ?? 0.06;
    const bend = opts.bend ?? 0.15;
    const columns = 5;
    const position = [];
    const uv = [];
    const index = [];
    rows.forEach(([v, half], r) => {
      for (let c = 0; c < columns; c++) {
        const s = (c / (columns - 1)) * 2 - 1;
        position.push(s * half * w, v * h, cup * w * s * s + bend * h * v * v);
        uv.push(0.5 + s * half * 0.94, 0.5 + (v - 0.5) * 0.97);
        if (r > 0 && c > 0) {
          const a = (r - 1) * columns + c - 1;
          index.push(a, a + 1, a + columns + 1, a, a + columns + 1, a + columns);
        }
      }
    });
    const front = new T.BufferGeometry();
    front.setAttribute('position', new T.Float32BufferAttribute(position, 3));
    front.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    front.setIndex(index);
    return this.sheet(front, material, pos, rot, opts);
  }

  /**
   * One palm frond: a slim rachis with paired, drooping, lance-shaped leaflets, built as
   * geometry and tinted per leaflet through vertex colours.
   * @param {import('three').Material} material vertex-coloured material (tintedMaterial)
   * @param {number} length frond length in metres
   * @param {number[]} pos position of the frond base
   * @param {number[]} rot rotation
   * @param {{ bend?: number, centre?: number[], soften?: number, seed?: number }} [opts] options
   * @returns {Parts} this
   */
  frond(material, length, pos, rot, opts = {}) {
    const T = this.T;
    const high = this.ctx.quality === 'high';
    const pairs = high ? 24 : 16;
    const steps = high ? 3 : 2;
    const bend = opts.bend ?? 0.35;
    const rnd = random(opts.seed ?? 3);
    const position = [];
    const colour = [];
    const index = [];
    const base = new T.Color('#4e8034');
    const tip = new T.Color('#86a44c');
    const stem = new T.Color('#7b8f3f');
    const spine = (t) => [0, t * length, bend * length * t * t];
    const quad = (a, b, c, d, tone) => {
      const start = position.length / 3;
      for (const q of [a, b, c, d]) {
        position.push(q[0], q[1], q[2]);
        colour.push(tone.r, tone.g, tone.b);
      }
      index.push(start, start + 1, start + 2, start, start + 2, start + 3);
    };
    const rib = 0.006;
    for (let i = 0; i < 8; i++) {
      const p0 = spine(i / 8);
      const p1 = spine((i + 1) / 8);
      quad([p0[0] - rib, p0[1], p0[2]], [p0[0] + rib, p0[1], p0[2]], [p1[0] + rib, p1[1], p1[2]], [p1[0] - rib, p1[1], p1[2]], stem);
    }
    for (let i = 0; i < pairs; i++) {
      const t = 0.06 + (i / pairs) * 0.9;
      const at = spine(t);
      const len = length * 0.5 * (0.12 + 0.36 * Math.sin(Math.PI * (0.12 + t * 0.82)));
      const wide = length * 0.5 * 0.034 * (1 - t * 0.4);
      const tone = base.clone().lerp(tip, t * 0.6).multiplyScalar(0.85 + rnd() * 0.25);
      for (const side of [-1, 1]) {
        const angle = 0.95 + (rnd() - 0.5) * 0.2;
        const dir = [side * Math.sin(angle), Math.cos(angle)];
        const droop = 0.22 + rnd() * 0.12;
        const point = (s, offset) => {
          const along = s * len;
          return [
            at[0] + dir[0] * along - dir[1] * offset * side,
            at[1] + dir[1] * along + dir[0] * offset * side,
            at[2] + droop * along * s
          ];
        };
        for (let k = 0; k < steps; k++) {
          const s0 = k / steps;
          const s1 = (k + 1) / steps;
          const w0 = wide * Math.sin(Math.PI * (0.25 + 0.75 * s0));
          const w1 = k === steps - 1 ? 0.0005 : wide * Math.sin(Math.PI * (0.25 + 0.75 * s1));
          const a = point(s0, -w0);
          const b = point(s0, w0);
          const c = point(s1, w1);
          const d = point(s1, -w1);
          if (side > 0) quad(a, b, c, d, tone);
          else quad(b, a, d, c, tone);
        }
      }
    }
    const front = new T.BufferGeometry();
    front.setAttribute('position', new T.Float32BufferAttribute(position, 3));
    front.setAttribute('color', new T.Float32BufferAttribute(colour, 3));
    front.setIndex(index);
    return this.sheet(front, material, pos, rot, opts);
  }

  /**
   * Adds a thin sheet with both faces: the back reverses the winding and normals. With
   * `opts.centre`, normals lean away from that point (by `opts.soften`) so foliage shades as a
   * round crown rather than as flat cards.
   * @param {import('three').BufferGeometry} front indexed sheet facing +Z
   * @param {import('three').Material} material material
   * @param {number[]} pos position
   * @param {number[]} rot rotation
   * @param {{ centre?: number[], soften?: number }} opts options
   * @returns {Parts} this
   */
  sheet(front, material, pos, rot, opts) {
    const T = this.T;
    front.computeVertexNormals();
    const back = front.clone();
    const idx = back.index.array;
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    const bn = back.attributes.normal;
    for (let i = 0; i < bn.count; i++) bn.setXYZ(i, -bn.getX(i), -bn.getY(i), -bn.getZ(i));
    const centre = opts.centre ? new T.Vector3(...opts.centre) : null;
    const soften = opts.soften ?? 0.65;
    const after = (g) => {
      if (!centre) return;
      const ps = g.attributes.position;
      const ns = g.attributes.normal;
      const v = new T.Vector3();
      const n = new T.Vector3();
      for (let i = 0; i < ps.count; i++) {
        v.set(ps.getX(i), ps.getY(i), ps.getZ(i)).sub(centre).normalize();
        n.set(ns.getX(i), ns.getY(i), ns.getZ(i));
        if (n.dot(v) < 0) n.negate();
        n.lerp(v, soften).normalize();
        ns.setXYZ(i, n.x, n.y, n.z);
      }
    };
    const merged = mergeGeometries([front.toNonIndexed(), back.toNonIndexed()]);
    return this.add(merged, material, pos, rot, { uv: 'keep', after });
  }

  /**
   * Adds an unmerged object (lights, special meshes).
   * @param {import('three').Object3D} object object
   * @returns {Parts} this
   */
  object(object) {
    this.objects.push(object);
    return this;
  }

  /**
   * Records a light the engine may add for this kit (lamps). Kits do not add lights themselves.
   * @param {{ type: 'point'|'spot', position: number[], intensity: number, distance?: number, color?: string }} light light hint in kit space
   * @returns {Parts} this
   */
  light(light) {
    this.lights.push(light);
    return this;
  }

  /**
   * Folds buckets whose materials differ only in colour (same maps, roughness, metalness and
   * side) into one shared vertex-coloured copy, so a kit draws once per surface type rather than
   * once per colour. Colour is carried per vertex, so the look is unchanged.
   */
  foldTints() {
    const T = this.T;
    const families = new Map();
    for (const [material, list] of this.buckets) {
      const key = tintKey(material);
      if (!key) continue;
      if (!families.has(key)) families.set(key, []);
      families.get(key).push([material, list]);
    }
    for (const [key, members] of families) {
      if (members.length < 2) continue;
      const target = cached(this.ctx, `fold:${key}`, () => {
        const copy = members[0][0].clone();
        copy.color.set('#ffffff');
        copy.vertexColors = true;
        return copy;
      });
      if (!this.buckets.has(target)) this.buckets.set(target, []);
      for (const [material, list] of members) {
        for (const g of list) {
          const count = g.attributes.position.count;
          const colours = new Float32Array(count * 3);
          for (let i = 0; i < count; i++) {
            colours[i * 3] = material.color.r;
            colours[i * 3 + 1] = material.color.g;
            colours[i * 3 + 2] = material.color.b;
          }
          g.setAttribute('color', new T.Float32BufferAttribute(colours, 3));
          this.buckets.get(target).push(g);
        }
        this.buckets.delete(material);
      }
    }
  }

  /**
   * Merges every bucket into one mesh per material and returns the kit group.
   * @param {string} name kit id, used as the group name
   * @returns {import('three').Group} the kit
   */
  build(name) {
    const T = this.T;
    this.foldTints();
    const group = new T.Group();
    group.name = name;
    for (const [material, list] of this.buckets) {
      if (list.some((g) => g.attributes.color)) {
        for (const g of list) {
          if (!g.attributes.color) g.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
        }
      }
      const geometry = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!geometry) continue;
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      const mesh = new T.Mesh(geometry, material);
      const seeThrough = material.transparent || material.opacity < 1 || material.transmission > 0;
      mesh.castShadow = !seeThrough;
      mesh.receiveShadow = !seeThrough;
      group.add(mesh);
    }
    for (const object of this.objects) group.add(object);
    if (this.lights.length) group.userData.lights = this.lights;
    return group;
  }
}

/**
 * Starts a kit: returns a part collector and the finish factories.
 * @param {object} ctx kit context
 * @returns {{ p: Parts, f: object }} collector and finishes
 */
export function start(ctx) {
  return { p: new Parts(ctx), f: finishes(ctx) };
}

/**
 * Draws one fiddle-leaf-fig leaf filling the canvas (violin-shaped, glossy dark green).
 * @param {CanvasRenderingContext2D} g context
 * @param {number} w width
 * @param {number} h height
 */
function drawFiddleLeaf(g, w, h) {
  const cx = w / 2;
  const leaf = new Path2D();
  leaf.moveTo(cx, h * 0.98);
  leaf.bezierCurveTo(cx - w * 0.2, h * 0.85, cx - w * 0.3, h * 0.66, cx - w * 0.36, h * 0.5);
  leaf.bezierCurveTo(cx - w * 0.47, h * 0.3, cx - w * 0.44, h * 0.08, cx - w * 0.12, h * 0.03);
  leaf.bezierCurveTo(cx - w * 0.04, h * 0.02, cx + w * 0.04, h * 0.02, cx + w * 0.12, h * 0.03);
  leaf.bezierCurveTo(cx + w * 0.44, h * 0.08, cx + w * 0.47, h * 0.3, cx + w * 0.36, h * 0.5);
  leaf.bezierCurveTo(cx + w * 0.3, h * 0.66, cx + w * 0.2, h * 0.85, cx, h * 0.98);
  const fill = g.createLinearGradient(0, 0, w, h);
  fill.addColorStop(0, '#4f7f3a');
  fill.addColorStop(0.55, '#335f27');
  fill.addColorStop(1, '#244a1d');
  g.fillStyle = fill;
  g.fill(leaf);
  g.save();
  g.clip(leaf);
  g.strokeStyle = 'rgba(190, 215, 150, 0.55)';
  g.lineWidth = w * 0.018;
  g.beginPath();
  g.moveTo(cx, h);
  g.quadraticCurveTo(cx + w * 0.02, h * 0.5, cx, h * 0.05);
  g.stroke();
  g.lineWidth = w * 0.008;
  for (let i = 0; i < 7; i++) {
    const y = h * (0.85 - i * 0.11);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx, y);
      g.quadraticCurveTo(cx + s * w * 0.18, y - h * 0.04, cx + s * w * 0.4, y - h * 0.11);
      g.stroke();
    }
  }
  const sheen = g.createRadialGradient(cx - w * 0.15, h * 0.3, 1, cx - w * 0.15, h * 0.3, w * 0.5);
  sheen.addColorStop(0, 'rgba(255,255,255,0.18)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, w, h);
  g.restore();
}

/**
 * Draws a dense cluster of small leaves (hedges, shrubs, tree crowns) with alpha gaps.
 * @param {CanvasRenderingContext2D} g context
 * @param {number} w width
 * @param {number} h height
 * @param {string[]} palette leaf colours from dark to light
 * @param {number} seed variation seed
 */
function drawLeafCluster(g, w, h, palette, seed) {
  const rnd = random(seed);
  const count = 150;
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * 0.44;
    const x = w / 2 + Math.cos(a) * d * w;
    const y = h / 2 + Math.sin(a) * d * h;
    const size = w * (0.035 + rnd() * 0.04);
    const shade = Math.min(palette.length - 1, Math.floor((i / count) * palette.length + rnd() * 1.2));
    g.save();
    g.translate(x, y);
    g.rotate(rnd() * Math.PI * 2);
    g.fillStyle = palette[shade];
    g.beginPath();
    g.ellipse(0, 0, size, size * 0.48, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(20, 40, 10, 0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-size, 0);
    g.lineTo(size, 0);
    g.stroke();
    g.restore();
  }
}

/** Leaf colour palettes for cluster textures. */
const CLUSTER_PALETTES = {
  hedge: ['#1f3b17', '#2b4d1e', '#365f25', '#44702c', '#5a8636'],
  tree: ['#2a4a1c', '#3a6326', '#4d7a30', '#668f3d', '#86a85a'],
  shrub: ['#28461c', '#355d24', '#4a7531', '#5f8d3e', '#7aa04f']
};

/**
 * Foliage material for a leaf type (alpha-tested cards unless `solid`).
 * @param {object} ctx kit context
 * @param {'fiddle'|'hedge'|'tree'|'shrub'} kind leaf type
 * @param {boolean} [solid] opaque variant for leaf geometry cut to the leaf outline (no alpha test)
 * @returns {import('three').Material} cached material
 */
export function foliage(ctx, kind, solid = false) {
  return cached(ctx, `foliage:${kind}:${solid}`, () => {
    const T = ctx.THREE;
    const size = ctx.quality === 'low' ? 256 : 512;
    const draw = (g, w, h) => {
      if (kind === 'fiddle') drawFiddleLeaf(g, w, h);
      else drawLeafCluster(g, w, h, CLUSTER_PALETTES[kind] || CLUSTER_PALETTES.shrub, kind.length * 97);
    };
    const map = canvasTexture(ctx, `leaf:${kind}`, size, size, draw);
    return new T.MeshStandardMaterial({ map, alphaTest: solid ? 0 : 0.5, roughness: kind === 'fiddle' ? 0.62 : 0.78, metalness: 0, envMapIntensity: 0.6 });
  });
}

/**
 * Scatters foliage cards over an ellipsoidal crown.
 * @param {Parts} p collector
 * @param {import('three').Material} material foliage material
 * @param {number[]} centre crown centre
 * @param {number[]} radii crown radii [rx, ry, rz]
 * @param {number} count number of cards
 * @param {number} size card size
 * @param {number} seed variation seed
 */
export function crown(p, material, centre, radii, count, size, seed) {
  const rnd = random(seed);
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const depth = 0.65 + rnd() * 0.35;
    const x = centre[0] + Math.cos(a) * s * radii[0] * depth;
    const y = centre[1] + u * radii[1] * depth;
    const z = centre[2] + Math.sin(a) * s * radii[2] * depth;
    const k = size * (0.8 + rnd() * 0.45);
    p.card(material, k, k, [x, y - k * 0.4, z], [rnd() * 1.2 - 0.6, rnd() * Math.PI * 2, rnd() * 0.8 - 0.4], { centre, bend: 0.1 + rnd() * 0.15 });
  }
}
