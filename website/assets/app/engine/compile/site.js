/**
 * The site: open ground, ground polygons (lawn, paving, road, gravel), the boundary wall with its
 * coping and gates, and the street with kerbs and footpaths. Buildings without a site get a paved
 * apron and lawn.
 */
import * as THREE from 'three';
import { wallFootprints, sub, add, scale, normalize, leftNormal, distance, polygonArea, projectOnSegment } from '../../model/geometry.js';
import { hasKit, buildKit } from '../kits/index.js';
import { QuadBuilder, addFace, extrudePolygons, toWorld, planDir, mesh, GROUND_Y } from './mesh-utils.js';
import { prepareShadows } from './openings.js';

/** Stacking order of ground materials (higher draws on top). */
const GROUND_ORDER = { lawn: 0, gravel: 1, paving: 2, road: 3 };
const GROUND_MATERIAL = { lawn: 'lawn', gravel: 'gravel', paving: 'paving', road: 'asphalt' };
const COPING_H = 0.06;
const FOOTPATH = 2.2;
/** Side of the open ground plane (m). */
const GROUND_SIZE = 900;
const GROUND_CELLS = 180;
/**
 * Surroundings: a narrow verge of lawn up to `LAWN_REACH` metres from the plot, blending by
 * `FIELD_REACH` into plain, pale ground (sRGB `FIELD_COLOUR`) that the distance haze carries to the
 * horizon, so the property reads as the subject of the picture rather than a field of grass.
 */
const LAWN_REACH = 0.6;
const FIELD_REACH = 7;
const FIELD_COLOUR = '#a8a6a0';
/** Distance the street runs past the plot on each side (m); the haze swallows its ends. */
const STREET_MARGIN = 240;

/**
 * Splits the boundary into solid wall pieces between the gates.
 * @returns {{ pieces: object[], gates: { at: [number, number], width: number, dir: [number, number], style?: string }[] }}
 */
function boundaryPieces(boundary, wall, gateSpans) {
  const pieces = [];
  let s = 0;
  boundary.forEach((p, i) => {
    const q = boundary[(i + 1) % boundary.length];
    const len = distance(p, q);
    const d = normalize(sub(q, p));
    const cuts = gateSpans
      .filter((g) => g.end > s && g.start < s + len)
      .map((g) => [Math.max(0, g.start - s), Math.min(len, g.end - s)])
      .sort((x, y) => x[0] - y[0]);
    let from = 0;
    const push = (t0, t1) => {
      if (t1 - t0 < 0.05) return;
      pieces.push({ id: `bw${i}-${pieces.length}`, level: 'site', a: add(p, scale(d, t0)), b: add(p, scale(d, t1)), thickness: wall.thickness || 0.23, openings: [] });
    };
    for (const [c0, c1] of cuts) {
      push(from, c0);
      from = c1;
    }
    push(from, len);
    s += len;
  });
  return pieces;
}

/**
 * Where along the boundary (arc length) a plan point lies, and the edge direction there.
 * @returns {{ s: number, dir: [number, number] }}
 */
function boundaryAt(boundary, point) {
  let best = { gap: Infinity, s: 0, dir: [1, 0] };
  let travelled = 0;
  boundary.forEach((p, i) => {
    const q = boundary[(i + 1) % boundary.length];
    const len = distance(p, q);
    const hit = projectOnSegment(point, p, q);
    const t = Math.min(1, Math.max(0, hit.t));
    const c = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    const gap = distance(point, c);
    if (gap < best.gap) best = { gap, s: travelled + t * len, dir: normalize(sub(q, p)) };
    travelled += len;
  });
  return best;
}

/** Simple sliding MS gate: square-tube frame with vertical bars. */
function fallbackGate(ctx, width, height) {
  const group = new THREE.Group();
  const metal = ctx.mat('metal-black');
  const tube = 0.05;
  const add3 = (w, h, d, x, y) => {
    const m = new THREE.Mesh(ctx.kitCtx.rounded(w, h, d, 0.006), metal);
    m.position.set(x, y, 0);
    group.add(m);
  };
  const w = width - 0.04;
  const h = height - 0.08;
  add3(tube, h, tube, -w / 2 + tube / 2, 0.06 + h / 2);
  add3(tube, h, tube, w / 2 - tube / 2, 0.06 + h / 2);
  add3(w, tube, tube, 0, 0.06 + tube / 2);
  add3(w, tube, tube, 0, 0.06 + h - tube / 2);
  add3(w, tube * 0.8, tube * 0.8, 0, 0.06 + h * 0.55);
  const bars = Math.max(2, Math.floor(w / 0.11));
  for (let i = 1; i < bars; i++) add3(0.022, h - tube, 0.022, -w / 2 + (i * w) / bars, 0.06 + h / 2);
  const rail = new THREE.Mesh(ctx.kitCtx.rounded(width + 0.4, 0.03, 0.06, 0.005), ctx.mat('brushed-steel'));
  rail.position.set(0.2, 0.015, 0);
  group.add(rail);
  return group;
}

/**
 * The boundary wall: faces painted with `site:inner` / `site:outer`, square ends at gates, coping.
 */
function buildBoundary(site, ctx, group) {
  const boundary = site.boundary;
  const wall = site.boundaryWall;
  const height = wall.height || 2.1;
  const thickness = wall.thickness || 0.23;
  const anticlockwise = polygonArea(boundary) > 0;
  const gates = (wall.gates || []).map((g) => {
    const at = boundaryAt(boundary, g.at);
    return { ...g, s: at.s, dir: at.dir, start: at.s - g.width / 2, end: at.s + g.width / 2 };
  });
  const pieces = boundaryPieces(boundary, wall, gates);
  const prints = wallFootprints(pieces);
  const coping = wallFootprints(pieces.map((p) => ({ ...p, thickness: thickness + 0.06 })));
  const inner = new QuadBuilder();
  const outer = new QuadBuilder();
  const degree = new Map();
  const key = (p) => `${Math.round(p[0] * 500)},${Math.round(p[1] * 500)}`;
  for (const p of pieces) for (const end of [p.a, p.b]) degree.set(key(end), (degree.get(key(end)) || 0) + 1);
  const y0 = GROUND_Y - 0.01;
  for (const piece of pieces) {
    const fp = prints.get(piece.id);
    const d = normalize(sub(piece.b, piece.a));
    const left = leftNormal(d);
    for (const side of ['L', 'R']) {
      const n = side === 'L' ? left : scale(left, -1);
      const isInner = (side === 'L') === anticlockwise;
      const face = fp[side];
      const len = distance(face[0], face[1]);
      const fd = normalize(sub(face[1], face[0]));
      addFace(isInner ? inner : outer, (t, y) => toWorld(add(face[0], scale(fd, t)), y), planDir(n), 0, len, y0, height, [], side === 'R');
    }
    const ends = [[piece.a, fp.L[0], fp.R[0], scale(d, -1)], [piece.b, fp.L[1], fp.R[1], d]];
    for (const [node, l, r, dir] of ends) {
      if ((degree.get(key(node)) || 0) > 1) continue;
      const width = distance(l, r);
      outer.quad([toWorld(l, y0), toWorld(r, y0), toWorld(r, height), toWorld(l, height)], planDir(dir), [[0, y0], [width, y0], [width, height], [0, height]]);
    }
  }
  for (const [builder, id] of [[inner, 'site:inner'], [outer, 'site:outer']]) {
    if (builder.isEmpty()) continue;
    const paintable = ctx.surfacesById.has(id);
    const m = mesh(builder.build(), paintable ? ctx.surfaceMaterial(id) : ctx.mat('render'), `boundary-${id}`);
    if (paintable) {
      m.userData.surfaceId = id;
      ctx.addSurfaceMesh(id, m);
    }
    group.add(m);
  }
  const cap = extrudePolygons(pieces.map((p) => coping.get(p.id).polygon), height, height + COPING_H);
  if (cap) group.add(mesh(cap, ctx.mat('concrete', { color: '#d6d2ca' }), 'boundary-coping'));

  for (const gate of gates) {
    const params = { width: gate.width, height: height - 0.05, thickness, role: 'gate' };
    let object = null;
    const style = gate.style || 'gate.sliding';
    if (hasKit(style)) {
      try {
        object = buildKit(style, params, ctx.kitCtx);
      } catch (error) {
        console.error(error);
      }
    }
    if (!object) object = fallbackGate(ctx, gate.width, height - 0.05);
    const inward = anticlockwise ? leftNormal(gate.dir) : scale(leftNormal(gate.dir), -1);
    const z = planDir(inward).normalize();
    const y = new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3().crossVectors(y, z);
    const holder = new THREE.Group();
    holder.matrixAutoUpdate = false;
    const centre = boundary.length ? pointAt(boundary, gate.s) : gate.at;
    holder.matrix.makeBasis(x, y, z).setPosition(toWorld(centre, y0));
    holder.add(object);
    prepareShadows(holder);
    group.add(holder);
  }
}

/**
 * Plan point at arc length `s` along a closed boundary.
 * @returns {[number, number]}
 */
function pointAt(boundary, s) {
  let travelled = 0;
  for (let i = 0; i < boundary.length; i++) {
    const p = boundary[i];
    const q = boundary[(i + 1) % boundary.length];
    const len = distance(p, q);
    if (s <= travelled + len) {
      const t = (s - travelled) / len;
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    }
    travelled += len;
  }
  return boundary[0];
}

/**
 * Street along one side of the plot: footpath with kerb, road with a dashed centre line and the
 * far footpath.
 */
function buildStreet(site, box, ctx, group) {
  const side = site.street.side || 'south';
  const width = site.street.width || 9;
  const margin = STREET_MARGIN;
  const along = side === 'south' || side === 'north' ? [box.minX - margin, box.maxX + margin] : [box.minY - margin, box.maxY + margin];
  const sign = side === 'south' || side === 'west' ? -1 : 1;
  const edge = side === 'south' ? box.minY : side === 'north' ? box.maxY : side === 'west' ? box.minX : box.maxX;
  const strip = (from, to) => {
    const a = Math.min(from, to);
    const b = Math.max(from, to);
    if (side === 'south' || side === 'north') return [[along[0], a], [along[1], a], [along[1], b], [along[0], b]];
    return [[a, along[0]], [b, along[0]], [b, along[1]], [a, along[1]]];
  };
  const near = edge + sign * FOOTPATH;
  const far = near + sign * width;
  const kerbTop = GROUND_Y + 0.13;
  const road = GROUND_Y + 0.008;
  const add1 = (polygon, y0, y1, id, opts) => {
    const g = extrudePolygons([polygon], y0, y1);
    if (g) group.add(mesh(g, ctx.mat(id, opts), `street-${id}`, { cast: false }));
  };
  add1(strip(edge, near), GROUND_Y - 0.05, kerbTop, 'paving');
  add1(strip(near, near + sign * 0.15), GROUND_Y - 0.05, kerbTop + 0.005, 'concrete', { color: '#cbc7bf' });
  add1(strip(near + sign * 0.15, far - sign * 0.15), GROUND_Y - 0.05, road, 'asphalt');
  add1(strip(far - sign * 0.15, far), GROUND_Y - 0.05, kerbTop + 0.005, 'concrete', { color: '#cbc7bf' });
  add1(strip(far, far + sign * FOOTPATH), GROUND_Y - 0.05, kerbTop, 'paving');
  const centre = (near + far) / 2;
  const dashes = [];
  for (let t = along[0]; t < along[1]; t += 6) {
    if (side === 'south' || side === 'north') dashes.push([[t, centre - 0.06], [t + 3, centre - 0.06], [t + 3, centre + 0.06], [t, centre + 0.06]]);
    else dashes.push([[centre - 0.06, t], [centre + 0.06, t], [centre + 0.06, t + 3], [centre - 0.06, t + 3]]);
  }
  const lines = extrudePolygons(dashes, road, road + 0.003);
  if (lines) group.add(mesh(lines, ctx.mat('paint', { color: '#ece9e1', finish: 'matt' }), 'street-markings', { cast: false }));
}

/**
 * Lets the ground material blend from its lawn texture to a flat field colour by a per-vertex
 * weight (`field` attribute, 0 = lawn, 1 = field); the grass relief fades out with it.
 * @param {THREE.MeshStandardMaterial} material
 * @param {THREE.Color} colour field colour (linear)
 */
function blendToField(material, colour) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.fieldColour = { value: colour };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float field;\nvarying float vField;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvField = field;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 fieldColour;\nvarying float vField;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, fieldColour, vField);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, vField));');
  };
  material.customProgramCacheKey = () => 'amco-ground-field';
}

/**
 * The open ground around the plot: a verge of mown lawn (the `lawn` texture, UVs in metres) right
 * outside the plot that blends into plain, pale ground, which the distance haze then fades into
 * the horizon. A gentle, non-repeating tint keeps both from reading as a tiled pattern.
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} plot world rectangle of the plot
 * @returns {THREE.Mesh}
 */
function groundPlane(plot, ctx) {
  const plane = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_CELLS, GROUND_CELLS).rotateX(-Math.PI / 2);
  plane.translate((plot.minX + plot.maxX) / 2, GROUND_Y - 0.004, (plot.minZ + plot.maxZ) / 2);
  const material = ctx.mat('lawn').clone();
  const pos = plane.attributes.position;
  const uv = plane.attributes.uv;
  const colours = new Float32Array(pos.count * 3);
  const weights = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    uv.setXY(i, x, -z);
    const dx = Math.max(plot.minX - x, 0, x - plot.maxX);
    const dz = Math.max(plot.minZ - z, 0, z - plot.maxZ);
    const t = THREE.MathUtils.smoothstep(Math.hypot(dx, dz), LAWN_REACH, FIELD_REACH);
    const wave = Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2.1) * 0.5 + Math.sin(z * 0.13 + Math.cos(x * 0.05) * 1.7) * 0.5;
    const broad = Math.sin(x * 0.021 + Math.cos(z * 0.017) * 2.3) * Math.sin(z * 0.019 - Math.sin(x * 0.013) * 1.9);
    const ripple = Math.sin(x * 0.33 + Math.sin(z * 0.27) * 1.3) * Math.sin(z * 0.29 + Math.cos(x * 0.21) * 1.1);
    const k = 0.95 + wave * 0.04 + ripple * 0.03 * (1 - t) + broad * 0.05 * t;
    colours[i * 3] = k * (1 + wave * 0.03 * (1 - t));
    colours[i * 3 + 1] = k;
    colours[i * 3 + 2] = k * (1 - wave * 0.04 * (1 - t));
    weights[i] = t;
  }
  plane.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  plane.setAttribute('field', new THREE.Float32BufferAttribute(weights, 1));
  material.vertexColors = true;
  blendToField(material, new THREE.Color(FIELD_COLOUR));
  const ground = mesh(plane, material, 'ground', { cast: false });
  ground.userData.ownMaterial = true;
  return ground;
}

/**
 * Compiles the site.
 * @param {import('../../model/schema.js').Building} building
 * @param {THREE.Box3} buildingBox world bounds of the building
 * @param {object} ctx compile context
 * @returns {THREE.Group}
 */
export function compileSite(building, buildingBox, ctx) {
  const group = new THREE.Group();
  group.name = 'site';
  const site = building.site;
  const plot = { minX: buildingBox.min.x, maxX: buildingBox.max.x, minZ: buildingBox.min.z, maxZ: buildingBox.max.z };
  if (site && Array.isArray(site.boundary) && site.boundary.length >= 3) {
    plot.minX = Math.min(...site.boundary.map((p) => p[0]));
    plot.maxX = Math.max(...site.boundary.map((p) => p[0]));
    plot.minZ = -Math.max(...site.boundary.map((p) => p[1]));
    plot.maxZ = -Math.min(...site.boundary.map((p) => p[1]));
  }
  group.add(groundPlane(plot, ctx));

  if (!site || !Array.isArray(site.boundary) || site.boundary.length < 3) {
    const pad = 1.2;
    const minX = buildingBox.min.x - pad;
    const maxX = buildingBox.max.x + pad;
    const minY = -buildingBox.max.z - pad;
    const maxY = -buildingBox.min.z + pad;
    const apron = extrudePolygons([[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]]], GROUND_Y - 0.02, GROUND_Y + 0.006);
    if (apron) group.add(mesh(apron, ctx.mat('paving'), 'apron', { cast: false }));
    return group;
  }

  const sorted = [...(site.ground || [])].sort((a, b) => (GROUND_ORDER[a.material] ?? 0) - (GROUND_ORDER[b.material] ?? 0));
  sorted.forEach((patch) => {
    const rank = GROUND_ORDER[patch.material] ?? 0;
    const top = GROUND_Y + 0.003 + rank * 0.003;
    const geometry = extrudePolygons([patch.polygon], top - 0.03, top);
    if (geometry) group.add(mesh(geometry, ctx.mat(GROUND_MATERIAL[patch.material] || patch.material), `ground-${patch.material}`, { cast: false }));
  });

  if (site.boundaryWall) buildBoundary(site, ctx, group);
  if (site.street) {
    const xs = site.boundary.map((p) => p[0]);
    const ys = site.boundary.map((p) => p[1]);
    buildStreet(site, { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }, ctx, group);
  }
  return group;
}
