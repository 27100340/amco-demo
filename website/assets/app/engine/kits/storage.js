/**
 * Storage kits: wardrobes, dressing table and open shelving.
 * Front faces −Z; origin at the floor centre of the footprint.
 */
import { registerKit } from './index.js';
import { start } from './parts.js';
import { books, vase } from './decor.js';

/** Gap between door and drawer fronts (m). */
const GAP = 0.003;

/**
 * A vertical bar handle standing off a door front.
 * @param {import('./parts.js').Parts} p collector
 * @param {import('three').Material} metal handle material
 * @param {number} x handle x
 * @param {number} y0 bottom
 * @param {number} y1 top
 * @param {number} z door front face z
 */
export function barHandle(p, metal, x, y0, y1, z) {
  p.tube(metal, [[x, y0, z], [x, y0, z - 0.03], [x, y1, z - 0.03], [x, y1, z]], 0.0065, { corner: 0.012, radial: 8 });
}

/**
 * Builds a full-height hinged wardrobe.
 * @param {object} ctx kit context
 * @param {object} params { color (door colour), finish: 'lacquer'|'walnut' }
 * @param {number} doors number of doors
 * @param {number} w width
 * @param {string} name kit id
 * @returns {import('three').Group} the wardrobe
 */
function wardrobe(ctx, params, doors, w, name) {
  const { p, f } = start(ctx);
  const h = 2.25;
  const d = 0.6;
  const plinth = 0.08;
  const body = f.lacquer(params.body || '#e4ded3', 0.55);
  const front = params.finish === 'walnut' ? f.walnut() : f.lacquer(params.color || '#d8d0c3', 0.5);
  const metal = f.steel();
  p.box(f.black(), [w - 0.04, plinth, d - 0.08], 0.003, [0, 0, 0.03]);
  p.box(body, [w, h - plinth, d - 0.02], 0.004, [0, plinth, 0.01]);
  const dw = (w - GAP * (doors + 1)) / doors;
  const zf = -d / 2 + 0.0095;
  for (let i = 0; i < doors; i++) {
    const x = -w / 2 + GAP + dw / 2 + i * (dw + GAP);
    p.box(front, [dw, h - plinth - GAP * 2, 0.019], 0.003, [x, plinth + GAP, zf]);
    const pairLeft = i % 2 === 0 && i + 1 < doors;
    const hx = pairLeft ? x + dw / 2 - 0.045 : x - dw / 2 + 0.045;
    barHandle(p, metal, hx, 0.85, 1.45, zf - 0.0095);
  }
  return p.build(name);
}

registerKit('wardrobe.2door', {
  footprint: [1.0, 0.6],
  build: (params, ctx) => wardrobe(ctx, params, 2, 1.0, 'wardrobe.2door')
});

registerKit('wardrobe.3door', {
  footprint: [1.5, 0.6],
  build: (params, ctx) => wardrobe(ctx, params, 3, 1.5, 'wardrobe.3door')
});

registerKit('dresser', {
  footprint: [1.2, 0.45],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = 1.2;
    const d = 0.45;
    const body = f.walnut();
    const front = f.lacquer(params.color || '#e7e1d6', 0.5);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) p.cyl(f.black(), 0.013, 0.01, 0.16, [sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06)], [0, 0, 0], 10);
    }
    p.box(body, [w, 0.62, d], 0.01, [0, 0.16, 0]);
    const rowH = (0.6 - GAP * 4) / 3;
    for (let r = 0; r < 3; r++) {
      const y = 0.17 + r * (rowH + GAP);
      for (const sx of [-1, 1]) {
        p.box(front, [w / 2 - 0.02, rowH, 0.02], 0.004, [sx * (w / 4 - 0.003), y, -d / 2 - 0.006]);
        p.box(f.brass(), [0.12, 0.012, 0.014], 0.005, [sx * (w / 4 - 0.003), y + rowH - 0.04, -d / 2 - 0.02]);
      }
    }
    const top = 0.78;
    const T = p.T;
    p.add(new T.TorusGeometry(0.4, 0.012, 10, 64), f.brass(), [0, top + 0.43, d / 2 - 0.04], [0, 0, 0]);
    p.add(new T.CircleGeometry(0.395, 64), f.mirror(), [0, top + 0.43, d / 2 - 0.042], [0, Math.PI, 0]);
    p.box(f.brass(), [0.04, 0.05, 0.08], 0.008, [0, top, d / 2 - 0.05]);
    vase(p, f, { x: 0.38, y: top, z: 0.02, kind: 'bud', color: '#c9bfae' });
    p.lathe(f.glass(), [[0, 0], [0.025, 0], [0.028, 0.08], [0.012, 0.1], [0.012, 0.12], [0, 0.12]], [-0.36, top, -0.02]);
    p.lathe(f.ceramic('#b99a7c'), [[0, 0], [0.022, 0], [0.024, 0.11], [0.008, 0.12], [0.008, 0.14], [0, 0.14]], [-0.3, top, 0.04]);
    p.box(f.ceramic('#d8cfc0'), [0.25, 0.015, 0.14], 0.004, [-0.1, top, 0]);
    return p.build('dresser');
  }
});

registerKit('shelving.open', {
  footprint: [1.2, 0.35],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = params.w ?? 1.2;
    const h = params.h ?? 2.0;
    const d = 0.35;
    const metal = f.black();
    const shelf = f.walnut();
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) p.box(metal, [0.02, h, 0.02], 0.003, [sx * (w / 2 - 0.01), 0, sz * (d / 2 - 0.01)]);
    }
    const levels = [0.08, 0.5, 0.9, 1.3, 1.7, h - 0.025];
    levels.forEach((y) => p.box(shelf, [w, 0.025, d], 0.004, [0, y, 0]));
    const seed = params.seed ?? 3;
    books(p, ctx, { x: -w * 0.18, y: 0.525, z: 0, length: w * 0.55, seed });
    vase(p, f, { x: w * 0.3, y: 0.525, z: 0, kind: 'jar', color: '#d4c8b4' });
    books(p, ctx, { x: w * 0.22, y: 0.925, z: 0, length: w * 0.4, seed: seed + 1, lean: true });
    p.box(f.ceramic('#ece6db'), [0.22, 0.22, 0.25], 0.01, [-w * 0.28, 0.925, 0]);
    books(p, ctx, { x: 0, y: 1.325, z: 0, length: w * 0.75, seed: seed + 2 });
    vase(p, f, { x: -w * 0.25, y: 1.725, z: 0, kind: 'round', color: '#3f4b4a' });
    books(p, ctx, { x: w * 0.2, y: 1.725, z: 0, length: w * 0.35, seed: seed + 3, stack: true });
    books(p, ctx, { x: -w * 0.2, y: 0.105, z: 0, length: w * 0.4, seed: seed + 4, stack: true });
    p.box(f.fabric('#9b8f7c'), [0.38, 0.3, 0.28], 0.03, [w * 0.24, 0.105, 0]);
    return p.build('shelving.open');
  }
});
