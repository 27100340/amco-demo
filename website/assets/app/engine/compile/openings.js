/**
 * Opening infills: doors, windows, shopfronts and garage doors from the kit registry, with a
 * simple but believable fallback when a kit is not registered.
 *
 * Kit frame for infills: origin at the bottom-centre of the opening in the wall mid-plane;
 * +X along the wall, +Y up, +Z towards the room side (−Z, the kit's front, faces outside; on a wall
 * between two rooms −Z faces the wall's right side). Params: `{ width, height, thickness, role,
 * type, sill, exterior }`.
 */
import * as THREE from 'three';
import { add, scale } from '../../model/geometry.js';
import { hasKit, buildKit } from '../kits/index.js';
import { toWorld, planDir } from './mesh-utils.js';

/** Frame profile (m). */
const FRAME = 0.05;
const FRAME_DEPTH = 0.07;

/**
 * Default kit id for an opening type.
 * @param {string} type opening type
 * @param {boolean} exterior true when the wall has an outside face
 * @returns {string|null}
 */
export function defaultStyle(type, exterior) {
  if (type === 'door') return exterior ? 'door.main' : 'door.panel';
  if (type === 'window') return 'window.casement';
  if (type === 'shopfront') return 'shopfront.glass';
  if (type === 'garage') return 'garage.door';
  return null;
}

/**
 * Sets shadow flags on a kit: glass never casts (so sunlight comes through windows).
 * @param {THREE.Object3D} object
 */
export function prepareShadows(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const seeThrough = materials.some((m) => m && (m.transparent || m.opacity < 1));
    child.castShadow = !seeThrough;
    child.receiveShadow = true;
  });
}

/** Adds a rounded box centred at (x, y, z) in the infill frame. */
function box(group, ctx, w, h, d, x, y, z, material, radius = 0.004) {
  const m = new THREE.Mesh(ctx.kitCtx.rounded(w, h, d, Math.min(radius, w / 2.5, h / 2.5, d / 2.5)), material);
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

/** Rectangular frame of four members inside the opening. */
function frameRing(group, ctx, w, h, profile, depth, material, z = 0) {
  box(group, ctx, profile, h, depth, -w / 2 + profile / 2, h / 2, z, material);
  box(group, ctx, profile, h, depth, w / 2 - profile / 2, h / 2, z, material);
  box(group, ctx, w - profile * 2, profile, depth, 0, h - profile / 2, z, material);
  box(group, ctx, w - profile * 2, profile, depth, 0, profile / 2, z, material);
}

/** Aluminium window with mullion, glass, marble inside sill board and a concrete drip sill. */
function fallbackWindow(ctx, w, h, thickness) {
  const group = new THREE.Group();
  const alu = ctx.mat('aluminium-dark');
  frameRing(group, ctx, w, h, FRAME, FRAME_DEPTH, alu);
  if (w > 1.1) box(group, ctx, FRAME * 0.8, h - FRAME * 2, FRAME_DEPTH * 0.9, 0, h / 2, 0, alu);
  if (h > 1.6) box(group, ctx, w - FRAME * 2, FRAME * 0.8, FRAME_DEPTH * 0.9, 0, h * 0.72, 0, alu);
  box(group, ctx, w - FRAME * 2, h - FRAME * 2, 0.006, 0, h / 2, 0, ctx.mat('glass'), 0.001);
  const half = thickness / 2;
  const inside = half - FRAME_DEPTH / 2 + 0.03;
  box(group, ctx, w + 0.08, 0.02, inside, 0, -0.01, FRAME_DEPTH / 2 + inside / 2, ctx.mat('marble'), 0.004);
  const outside = half - FRAME_DEPTH / 2 + 0.05;
  box(group, ctx, w + 0.1, 0.04, outside, 0, -0.02, -(FRAME_DEPTH / 2 + outside / 2), ctx.mat('concrete', { color: '#d9d6cf' }), 0.006);
  return group;
}

/** Door: hardwood frame, slab (wood outside, painted inside), architraves and chrome levers. */
function fallbackDoor(ctx, w, h, thickness, exterior) {
  const group = new THREE.Group();
  const wood = ctx.mat('walnut');
  const frameDepth = Math.min(thickness, 0.115);
  box(group, ctx, FRAME, h, frameDepth, -w / 2 + FRAME / 2, h / 2, 0, wood);
  box(group, ctx, FRAME, h, frameDepth, w / 2 - FRAME / 2, h / 2, 0, wood);
  box(group, ctx, w, FRAME, frameDepth, 0, h - FRAME / 2, 0, wood);
  const slab = exterior ? wood : ctx.mat('paint', { color: '#efede7', finish: 'silk' });
  const sw = w - FRAME * 2 - 0.006;
  const sh = h - FRAME - 0.012;
  box(group, ctx, sw, sh, 0.04, 0, 0.008 + sh / 2, 0, slab, 0.003);
  const chrome = ctx.mat('chrome');
  for (const side of [-1, 1]) {
    const z = side * 0.032;
    const x = sw / 2 - 0.09;
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.01, 24).rotateX(Math.PI / 2), chrome);
    rose.position.set(x, 1.0, z);
    group.add(rose);
    box(group, ctx, 0.13, 0.018, 0.02, x - 0.055, 1.0, side * 0.05, chrome, 0.008);
  }
  const trim = exterior ? wood : ctx.mat('paint', { color: '#f3f1ec', finish: 'silk' });
  const half = thickness / 2;
  for (const side of exterior ? [1] : [-1, 1]) {
    const z = side * (half + 0.008);
    box(group, ctx, 0.07, h + 0.07, 0.016, -w / 2 - 0.035, (h + 0.07) / 2, z, trim);
    box(group, ctx, 0.07, h + 0.07, 0.016, w / 2 + 0.035, (h + 0.07) / 2, z, trim);
    box(group, ctx, w + 0.14, 0.07, 0.016, 0, h + 0.035, z, trim);
  }
  return group;
}

/** Shopfront: slim aluminium frame, full-height glass and a glass door with a pull handle. */
function fallbackShopfront(ctx, w, h) {
  const group = new THREE.Group();
  const alu = ctx.mat('aluminium-dark');
  const glass = ctx.mat('glass');
  frameRing(group, ctx, w, h, 0.04, 0.06, alu);
  const doorW = w > 2 ? 1 : 0;
  if (doorW) {
    box(group, ctx, 0.04, h - 0.08, 0.06, -doorW / 2 - 0.02, h / 2, 0, alu);
    box(group, ctx, 0.04, h - 0.08, 0.06, doorW / 2 + 0.02, h / 2, 0, alu);
    box(group, ctx, doorW, 0.04, 0.06, 0, 2.2, 0, alu);
    box(group, ctx, 0.025, 0.9, 0.025, doorW / 2 - 0.12, 1.05, -0.05, ctx.mat('brushed-steel'), 0.012);
  }
  box(group, ctx, w - 0.08, h - 0.08, 0.01, 0, h / 2, 0, glass, 0.002);
  return group;
}

/** Garage or shop shutter: brushed steel slats with a bottom rail. */
function fallbackShutter(ctx, w, h) {
  const group = new THREE.Group();
  const steel = ctx.mat('brushed-steel', { repeat: [1, 8] });
  const slats = Math.max(4, Math.round(h / 0.1));
  for (let i = 0; i < slats; i++) {
    box(group, ctx, w - 0.02, h / slats - 0.006, 0.03, 0, (i + 0.5) * (h / slats), 0, steel, 0.004);
  }
  box(group, ctx, w, 0.05, 0.05, 0, 0.025, 0, ctx.mat('aluminium-dark'));
  return group;
}

/**
 * Builds the infill of one opening in its wall.
 * @param {import('../../model/schema.js').Wall} wall noded wall
 * @param {import('../../model/schema.js').Opening} opening
 * @param {{ level: object, d: [number, number], half: number, extSide: 'L'|'R'|null, roomSide: 'L'|'R', sides: object }} info
 * @param {object} ctx compile context
 * @returns {{ object: THREE.Object3D|null, windowLight: object|null }}
 */
export function buildOpening(wall, opening, info, ctx) {
  const { level, d, half, extSide, roomSide, sides } = info;
  const sill = Math.max(0, opening.sill ?? 0);
  const width = opening.width;
  const height = opening.height;
  const exterior = Boolean(extSide);
  const centre = add(wall.a, scale(d, opening.at));
  const insideSide = extSide ? roomSide : 'L';
  const z = planDir(sides[insideSide].n).normalize();
  const y = new THREE.Vector3(0, 1, 0);
  const x = new THREE.Vector3().crossVectors(y, z);
  const origin = toWorld(centre, level.elevation + sill);

  const style = opening.style || defaultStyle(opening.type, exterior);
  let object = null;
  const params = { width, height, thickness: wall.thickness, role: wall.role || 'interior', type: opening.type, sill, exterior };
  if (style && hasKit(style)) {
    try {
      object = buildKit(style, params, ctx.kitCtx);
    } catch (error) {
      console.error(error);
      object = null;
    }
  }
  if (!object) {
    if (opening.type === 'window') object = fallbackWindow(ctx, width, height, wall.thickness);
    else if (opening.type === 'door') object = fallbackDoor(ctx, width, height, wall.thickness, exterior);
    else if (opening.type === 'shopfront') object = fallbackShopfront(ctx, width, height);
    else if (opening.type === 'garage') object = fallbackShutter(ctx, width, height);
  }
  if (object) {
    const holder = new THREE.Group();
    holder.name = `opening-${opening.id}`;
    holder.matrixAutoUpdate = false;
    holder.matrix.makeBasis(x, y, z).setPosition(origin);
    holder.add(object);
    prepareShadows(holder);
    object = holder;
  }

  let windowLight = null;
  const room = sides[roomSide].room;
  if (extSide && room && room !== 'exterior' && (opening.type === 'window' || opening.type === 'shopfront')) {
    const n = planDir(sides[roomSide].n).normalize();
    windowLight = {
      room,
      position: toWorld(add(centre, scale(sides[roomSide].n, half)), level.elevation + sill + height / 2),
      normal: n,
      width,
      height
    };
  }
  return { object, windowLight };
}
