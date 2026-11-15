/**
 * Seating kits: sofas, armchair, ottoman, dining chair and bar stool.
 * Front faces −Z; origin at the floor centre of the footprint.
 */
import { registerKit } from './index.js';
import { start } from './parts.js';

/** Default upholstery colours (warm greige, sage accent). */
const UPHOLSTERY = '#c4bcae';
const ACCENT = '#7c8a7a';

/**
 * Tapered wooden or slim metal legs at the given floor points.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {number[][]} points [[x, z], ...]
 * @param {number} h leg height
 * @param {'walnut'|'oak'|'black'|'brass'} kind leg finish
 */
export function legs(p, f, points, h, kind = 'walnut') {
  const mat = kind === 'black' ? f.black() : kind === 'brass' ? f.brass() : kind === 'oak' ? f.oak() : f.walnut();
  const [top, bottom] = kind === 'black' || kind === 'brass' ? [0.012, 0.01] : [0.021, 0.014];
  for (const [x, z] of points) p.cyl(mat, top, bottom, h, [x, 0, z], [0, 0, 0], 14);
}

/**
 * Builds an upholstered sofa or armchair (optionally with a chaise on the +x end).
 * @param {object} ctx kit context
 * @param {object} params { color, accent, legs, cushions }
 * @param {{ width: number, seats: number, depth?: number, armW?: number, armTop?: number, chaise?: number, name: string }} o layout
 * @returns {import('three').Group} the sofa
 */
function sofa(ctx, params, o) {
  const { p, f } = start(ctx);
  const fabric = f.fabric(params.color || UPHOLSTERY);
  const accent = f.fabric(params.accent || ACCENT);
  const W = o.width;
  const D = o.depth ?? 0.94;
  const armW = o.armW ?? 0.16;
  const armTop = o.armTop ?? 0.62;
  const legH = 0.11;
  const baseTop = 0.27;
  const seatTop = 0.445;
  const backTop = 0.74;
  const backT = 0.17;
  const Lc = o.chaise ?? D;
  const zBack = Lc / 2;
  const zMain = zBack - D / 2;
  const legInset = 0.07;
  const legPoints = [
    [-W / 2 + legInset, zBack - legInset], [W / 2 - legInset, zBack - legInset],
    [-W / 2 + legInset, zBack - D + legInset], [W / 2 - legInset, zBack - Lc + legInset]
  ];
  if (o.chaise) legPoints.push([W / 2 - armW - 0.5, zBack - Lc + legInset]);
  legs(p, f, legPoints, legH, params.legs || 'walnut');

  p.box(fabric, [W - 0.02, baseTop - legH, D - 0.03], 0.03, [0, legH, zMain]);
  const Wi = W - 2 * armW;
  const cw = Wi / o.seats;
  if (o.chaise) {
    const chaiseLen = Lc - D + 0.05;
    p.box(fabric, [cw + armW - 0.02, baseTop - legH, chaiseLen], 0.03, [W / 2 - (cw + armW) / 2, legH, zBack - D - chaiseLen / 2 + 0.06]);
  }

  const armShape = { crown: 0.006, bulge: 0.005 };
  p.cushion(fabric, [armW, armTop - legH, D], 0.06, [-W / 2 + armW / 2, legH, zMain], [0, 0, 0], armShape);
  p.cushion(fabric, [armW, armTop - legH, Lc], 0.06, [W / 2 - armW / 2, legH, zBack - Lc / 2], [0, 0, 0], armShape);
  p.box(fabric, [Wi + 0.04, backTop - baseTop, backT], 0.05, [0, baseTop, zBack - backT / 2], [-0.04, 0, 0]);

  for (let i = 0; i < o.seats; i++) {
    const x = -Wi / 2 + cw * (i + 0.5);
    const isChaise = o.chaise && i === o.seats - 1;
    const depth = (isChaise ? Lc : D) - backT - 0.015;
    p.cushion(fabric, [cw - 0.006, seatTop - baseTop, depth], 0.055, [x, baseTop, zBack - backT - depth / 2], [0, 0, 0], { crown: 0.012, sag: 0.016, bulge: 0.01 });
    p.cushion(fabric, [cw - 0.012, 0.5, 0.19], 0.07, [x, seatTop - 0.035, zBack - backT - 0.075], [0.21, 0, 0], { crown: 0.02, sag: 0.006, bulge: 0.012 });
  }
  if (params.cushions !== false && o.seats > 1) {
    const s = 0.44;
    const pillow = { crown: 0.03, bulge: 0.015 };
    p.cushion(accent, [s, s, 0.12], 0.055, [-Wi / 2 + 0.3, seatTop - 0.02, zBack - backT - 0.26], [0.32, 0.25, 0.05], pillow);
    p.cushion(accent, [s, s, 0.12], 0.055, [Wi / 2 - 0.3, seatTop - 0.02, zBack - backT - 0.26], [0.32, -0.25, -0.05], pillow);
    if (W > 2.4) {
      p.cushion(fabric, [0.4, 0.4, 0.11], 0.05, [-Wi / 2 + 0.62, seatTop - 0.02, zBack - backT - 0.28], [0.34, 0.12, 0.03], pillow);
    }
  }
  return p.build(o.name);
}

registerKit('sofa.3-seat', {
  footprint: [2.2, 0.94],
  build: (params, ctx) => sofa(ctx, params, { width: 2.2, seats: 3, name: 'sofa.3-seat' })
});

registerKit('sofa.2-seat', {
  footprint: [1.65, 0.92],
  build: (params, ctx) => sofa(ctx, params, { width: 1.65, seats: 2, depth: 0.92, name: 'sofa.2-seat' })
});

registerKit('sofa.l-shape', {
  footprint: [2.85, 1.7],
  build: (params, ctx) => sofa(ctx, params, { width: 2.85, seats: 3, chaise: 1.7, name: 'sofa.l-shape' })
});

registerKit('armchair.lounge', {
  footprint: [0.86, 0.88],
  build: (params, ctx) => sofa(ctx, { cushions: false, ...params }, { width: 0.86, seats: 1, depth: 0.88, armW: 0.13, armTop: 0.6, name: 'armchair.lounge' })
});

registerKit('ottoman', {
  footprint: [0.85, 0.55],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const fabric = f.fabric(params.color || UPHOLSTERY);
    legs(p, f, [[-0.36, -0.21], [0.36, -0.21], [-0.36, 0.21], [0.36, 0.21]], 0.1, params.legs || 'walnut');
    p.box(fabric, [0.85, 0.12, 0.55], 0.03, [0, 0.1, 0]);
    p.cushion(fabric, [0.84, 0.2, 0.54], 0.06, [0, 0.21, 0], [0, 0, 0], { crown: 0.012, sag: 0.008, bulge: 0.008 });
    return p.build('ottoman');
  }
});

/**
 * Adds an upholstered dining chair (seat 0.47 m) to a collector, at x/z with yaw.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {object} params { color, wood }
 * @param {number} x position x
 * @param {number} z position z
 * @param {number} yaw rotation about Y (0 faces −Z)
 */
export function diningChair(p, f, params, x, z, yaw) {
  const wood = params.wood === 'oak' ? f.oak() : f.walnut();
  const fabric = f.fabric(params.color || '#d8d0c2');
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const at = (lx, ly, lz) => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
  const leg = 0.036;
  for (const lx of [-0.2, 0.2]) {
    p.box(wood, [leg, 0.43, leg], 0.008, at(lx, 0, -0.2), [0, yaw, 0]);
    p.box(wood, [leg, 0.92, leg], 0.008, at(lx, 0, 0.21), [0.07, yaw, 0]);
  }
  p.box(wood, [0.42, 0.05, 0.42], 0.006, at(0, 0.36, 0), [0, yaw, 0]);
  p.cushion(fabric, [0.47, 0.075, 0.47], 0.03, at(0, 0.405, -0.005), [0, yaw, 0], { crown: 0.008, sag: 0.004, bulge: 0.004 });
  p.cushion(fabric, [0.36, 0.33, 0.055], 0.024, at(0, 0.53, 0.232), [0.09, yaw, 0], { crown: 0.006, bulge: 0.004 });
  p.box(wood, [0.42, 0.04, 0.03], 0.008, at(0, 0.88, 0.268), [0.07, yaw, 0]);
}

registerKit('chair.dining', {
  footprint: [0.47, 0.55],
  build(params, ctx) {
    const { p, f } = start(ctx);
    diningChair(p, f, params, 0, 0, 0);
    return p.build('chair.dining');
  }
});

/**
 * Adds a bar or counter stool to a collector.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {object} params { height (seat height), color }
 * @param {number} x position x
 * @param {number} z position z
 */
export function barStool(p, f, params, x, z) {
  const T = p.T;
  const h = params.height ?? 0.75;
  const metal = f.black();
  const seat = params.color ? f.leather(params.color) : f.leather('#5a3d2b');
  p.lathe(seat, [[0, 0], [0.16, 0], [0.19, 0.012], [0.2, 0.035], [0.195, 0.055], [0.17, 0.066], [0, 0.07]], [x, h - 0.065, z]);
  p.cyl(f.walnut(), 0.15, 0.13, 0.02, [x, h - 0.085, z], [0, 0, 0], 24);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const top = [x + Math.cos(a) * 0.11, h - 0.085, z + Math.sin(a) * 0.11];
    const foot = [x + Math.cos(a) * 0.21, 0, z + Math.sin(a) * 0.21];
    p.tube(metal, [top, foot], 0.011, { radial: 8 });
  }
  const ringY = Math.min(0.32, h * 0.4);
  const ringR = 0.11 + (0.21 - 0.11) * (1 - ringY / (h - 0.085));
  p.add(new T.TorusGeometry(ringR, 0.008, 6, 36), metal, [x, ringY, z], [Math.PI / 2, 0, 0]);
}

registerKit('stool.bar', {
  footprint: [0.42, 0.42],
  build(params, ctx) {
    const { p, f } = start(ctx);
    barStool(p, f, params, 0, 0);
    return p.build('stool.bar');
  }
});
