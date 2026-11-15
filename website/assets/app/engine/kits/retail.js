/**
 * Retail kits: clothing rail, display table, cash and café counters, café table, mannequin,
 * full-length mirror, fitting room, pharmacy shelving, fascia sign boards and awnings.
 * Front faces −Z; origin at the floor centre of the footprint. Façade-mounted kits (signs,
 * awnings) put their back on z = 0, so the fixture point is the wall face.
 */
import { registerKit } from './index.js';
import { start, random, tintedMaterial, pleatedPanel, doubleSided, pictureMaterial, canvasTexture, cached, roundedRect } from './parts.js';
import { barStool } from './seating.js';
import { vase } from './decor.js';

/** Boutique garment colours (lawn suits, linen, denim, neutrals). */
const GARMENTS = ['#e9d8c4', '#c97b63', '#7f9a8b', '#2f3a4f', '#d9b65c', '#efe9e1', '#9b5b6a', '#6d8fb3', '#b8a58e', '#3d5a4c', '#e4b8b0', '#5c4a42'];

/**
 * Outline of a hanging garment (kurta / shirt) seen face-on, hanging from y = 0 downwards.
 * @param {object} T three namespace
 * @param {number} len garment length
 * @param {number} w shoulder width
 * @returns {import('three').Shape} the outline
 */
function garmentShape(T, len, w) {
  const s = new T.Shape();
  const hw = w / 2;
  s.moveTo(-0.07, 0);
  s.quadraticCurveTo(-hw * 0.7, -0.01, -hw, -0.05);
  s.lineTo(-hw - 0.07, -0.26);
  s.lineTo(-hw + 0.03, -0.29);
  s.lineTo(-hw + 0.03, -len * 0.55);
  s.quadraticCurveTo(-hw - 0.02, -len * 0.85, -hw - 0.03, -len);
  s.lineTo(hw + 0.03, -len);
  s.quadraticCurveTo(hw + 0.02, -len * 0.85, hw - 0.03, -len * 0.55);
  s.lineTo(hw - 0.03, -0.29);
  s.lineTo(hw + 0.07, -0.26);
  s.lineTo(hw, -0.05);
  s.quadraticCurveTo(hw * 0.7, -0.01, 0.07, 0);
  s.quadraticCurveTo(0, -0.06, -0.07, 0);
  return s;
}

/**
 * Hangs garments along a rail running along x at height y.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {object} ctx kit context
 * @param {number} x0 rail start
 * @param {number} x1 rail end
 * @param {number} y rail height
 * @param {number} z rail z
 * @param {number} seed variation
 */
function hangGarments(p, f, ctx, x0, x1, y, z, seed) {
  const T = p.T;
  const rnd = random(seed);
  const cloth = tintedMaterial(ctx, 0.88);
  const hanger = f.walnut();
  let x = x0 + 0.06;
  while (x < x1 - 0.05) {
    const len = 0.75 + rnd() * 0.4;
    const color = GARMENTS[Math.floor(rnd() * GARMENTS.length)];
    const yaw = Math.PI / 2 + (rnd() - 0.5) * 0.14;
    p.extrude(cloth, garmentShape(T, len, 0.38 + rnd() * 0.06), 0.006, 0.006, [x, y - 0.06, z], [0, yaw, (rnd() - 0.5) * 0.03], { color });
    p.tube(hanger, [[x, y - 0.05, z - 0.2], [x, y - 0.02, z], [x, y - 0.05, z + 0.2]], 0.005, { corner: 0.04, radial: 5 });
    p.tube(f.chrome(), [[x, y - 0.02, z], [x, y + 0.025, z], [x, y + 0.025, z - 0.02]], 0.0025, { corner: 0.01, radial: 4 });
    x += 0.045 + rnd() * 0.035;
  }
}

registerKit('rail.clothing', {
  footprint: [1.4, 0.55],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const L = params.length ?? 1.4;
    const h = params.height ?? 1.62;
    const metal = params.finish === 'black' ? f.black() : f.brass();
    for (const sx of [-1, 1]) {
      const x = sx * (L / 2);
      p.tube(metal, [[x, 0.02, -0.25], [x, 0.02, 0.25]], 0.012);
      p.tube(metal, [[x, 0.02, 0], [x, h, 0]], 0.013);
      for (const sz of [-0.24, 0.24]) p.cyl(f.rubber(), 0.018, 0.018, 0.012, [x, 0, sz], [0, 0, 0], 12);
    }
    p.tube(metal, [[-L / 2, h, 0], [L / 2, h, 0]], 0.013);
    hangGarments(p, f, ctx, -L / 2, L / 2, h, 0, params.seed ?? 21);
    return p.build('rail.clothing');
  }
});

/**
 * Adds stacks of folded garments on a surface.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} ctx kit context
 * @param {number[][]} spots [[x, z], ...] stack positions
 * @param {number} y surface height
 * @param {number} seed variation
 */
function foldedStacks(p, ctx, spots, y, seed) {
  const cloth = tintedMaterial(ctx, 0.9);
  const rnd = random(seed);
  for (const [x, z] of spots) {
    const count = 3 + Math.floor(rnd() * 4);
    let h = y;
    const color = GARMENTS[Math.floor(rnd() * GARMENTS.length)];
    for (let i = 0; i < count; i++) {
      const t = 0.035 + rnd() * 0.01;
      const tone = i % 2 ? color : GARMENTS[(GARMENTS.indexOf(color) + i) % GARMENTS.length];
      p.cushion(cloth, [0.32, t, 0.26], 0.015, [x + (rnd() - 0.5) * 0.02, h, z + (rnd() - 0.5) * 0.02], [0, (rnd() - 0.5) * 0.08, 0], { crown: 0.004, bulge: 0.002 }, { color: tone });
      h += t;
    }
  }
}

registerKit('table.display', {
  footprint: [1.5, 0.85],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const top = f.oak();
    const legs = f.black();
    const table = (w, d, h, x, z) => {
      p.box(top, [w, 0.035, d], 0.008, [x, h - 0.035, z]);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) p.box(legs, [0.035, h - 0.035, 0.035], 0.006, [x + sx * (w / 2 - 0.06), 0, z + sz * (d / 2 - 0.06)]);
      }
    };
    table(1.5, 0.85, 0.82, 0, 0);
    table(0.9, 0.6, 0.55, 0.25, 0.05);
    foldedStacks(p, ctx, [[-0.5, -0.18], [-0.12, -0.2], [0.3, -0.2], [-0.45, 0.2], [0.5, 0.22]], 0.82, params.seed ?? 5);
    foldedStacks(p, ctx, [[0.05, -0.05], [0.45, 0.1]], 0.55, (params.seed ?? 5) + 3);
    vase(p, f, { x: 0.1, y: 0.82, z: 0.2, kind: 'bud', color: '#e4dccf' });
    p.box(f.lacquer('#1b1b1d', 0.4), [0.16, 0.11, 0.012], 0.003, [-0.2, 0.82, 0.18], [-0.25, 0.2, 0]);
    return p.build('table.display');
  }
});

registerKit('counter.cash', {
  footprint: [1.6, 0.6],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = params.w ?? 1.6;
    const d = 0.6;
    const h = 1.0;
    const body = params.finish === 'lacquer' ? f.lacquer(params.color || '#efe9e0', 0.4) : f.walnut();
    p.box(f.black(), [w - 0.06, 0.06, d - 0.08], 0.003, [0, 0, 0.02]);
    p.box(body, [w, h - 0.09, d - 0.03], 0.006, [0, 0.06, 0.015]);
    const n = Math.floor((w - 0.04) / 0.05);
    for (let i = 0; i < n; i++) p.cyl(body, 0.02, 0.02, h - 0.12, [-((n - 1) * 0.05) / 2 + i * 0.05, 0.075, -d / 2 + 0.015], [0, 0, 0], 10);
    p.box(f.marble(), [w + 0.04, 0.03, d + 0.03], 0.006, [0, h - 0.03, 0]);
    p.box(f.black(), [0.16, 0.012, 0.16], 0.004, [0.2, h, 0.08]);
    p.box(f.black(), [0.03, 0.16, 0.02], 0.006, [0.2, h, 0.12], [-0.2, 0, 0]);
    p.cbox(f.black(), [0.3, 0.21, 0.015], 0.006, [0.2, h + 0.22, 0.11], [-0.35, 0, 0]);
    p.cbox(f.lacquer('#0c0d10', 0.1), [0.28, 0.19, 0.018], 0.002, [0.2, h + 0.22, 0.11], [-0.35, 0, 0]);
    p.box(f.black(), [0.08, 0.04, 0.16], 0.012, [-0.15, h, -0.05], [0, 0.3, 0]);
    p.box(f.fabric('#d7c3a3'), [0.26, 0.32, 0.11], 0.004, [-0.5, h, 0.05]);
    for (const z of [-0.0075, 0.1075]) {
      p.tube(f.black(), [[-0.555, h + 0.29, z], [-0.555, h + 0.38, z], [-0.445, h + 0.38, z], [-0.445, h + 0.29, z]], 0.004, { corner: 0.035 });
    }
    vase(p, f, { x: w / 2 - 0.15, y: h, z: -0.05, kind: 'bud', color: '#d8cfc0' });
    return p.build('counter.cash');
  }
});

registerKit('counter.cafe', {
  footprint: [2.6, 0.75],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = params.w ?? 2.6;
    const d = 0.7;
    const h = 1.05;
    const front = f.lacquer(params.color || '#28463b', 0.45);
    p.box(f.black(), [w - 0.06, 0.08, d - 0.1], 0.003, [0, 0, 0.03]);
    p.box(front, [w, h - 0.11, d - 0.04], 0.006, [0, 0.08, 0.02]);
    const n = Math.floor((w - 0.04) / 0.08);
    for (let i = 0; i < n; i++) p.box(front, [0.07, h - 0.16, 0.02], 0.008, [-((n - 1) * 0.08) / 2 + i * 0.08, 0.1, -d / 2 + 0.005]);
    p.tube(f.brass(), [[-w / 2 + 0.1, 0.22, -d / 2 - 0.08], [w / 2 - 0.1, 0.22, -d / 2 - 0.08]], 0.022);
    for (const x of [-w / 2 + 0.25, 0, w / 2 - 0.25]) p.tube(f.brass(), [[x, 0.22, -d / 2 - 0.08], [x, 0.22, -d / 2]], 0.012);
    p.box(f.marble(), [w + 0.04, 0.03, d + 0.04], 0.006, [0, h - 0.03, 0]);
    const cx = -w / 2 + 0.5;
    p.box(f.steel(), [0.8, 0.06, 0.5], 0.008, [cx, h, 0.05]);
    p.box(f.glass(), [0.8, 0.42, 0.5], 0.03, [cx, h + 0.06, 0.05]);
    const pastry = tintedMaterial(ctx, 0.7);
    const rnd = random(8);
    for (const y of [h + 0.07, h + 0.27]) {
      p.box(f.glass(), [0.74, 0.008, 0.44], 0.003, [cx, y - 0.008, 0.05]);
      for (let i = 0; i < 7; i++) {
        p.sphere(pastry, 0.035, [cx - 0.3 + i * 0.1, y + 0.02, 0.05 + (rnd() - 0.5) * 0.2], [1.2, 0.55, 1], [0, rnd() * 3, 0], 10, { color: ['#b5763c', '#d9a65e', '#8a4f2a', '#e3c48e'][i % 4] });
      }
    }
    const mx = w / 2 - 0.65;
    p.box(f.steel(), [0.7, 0.4, 0.5], 0.02, [mx, h, 0.1]);
    p.box(f.lacquer('#121315', 0.3), [0.66, 0.06, 0.46], 0.01, [mx, h + 0.4, 0.1]);
    for (const gx of [-0.15, 0.15]) {
      p.cyl(f.chrome(), 0.035, 0.035, 0.05, [mx + gx, h + 0.24, -0.16], [0, 0, 0], 16);
      p.tube(f.black(), [[mx + gx, h + 0.24, -0.16], [mx + gx, h + 0.24, -0.32]], 0.012);
      p.box(f.lacquer('#f4f2ee', 0.3), [0.16, 0.012, 0.18], 0.004, [mx + gx, h + 0.07, -0.18]);
    }
    p.lathe(f.ceramic('#f3f1ec'), [[0, 0], [0.035, 0], [0.042, 0.075], [0.038, 0.075], [0, 0.005]], [mx, h + 0.07, -0.19], [0, 0, 0], 16);
    p.box(f.black(), [0.18, 0.35, 0.22], 0.02, [w / 2 - 0.15, h, 0.15]);
    p.lathe(f.glass(), [[0, 0], [0.07, 0], [0.09, 0.14], [0.08, 0.16], [0, 0.16]], [w / 2 - 0.15, h + 0.35, 0.15], [0, 0, 0], 20);
    for (let i = 0; i < 4; i++) p.lathe(f.ceramic(), [[0, 0], [0.04, 0], [0.045, 0.08], [0.04, 0.08], [0, 0.006]], [0.1 + (i % 2) * 0.1, h + Math.floor(i / 2) * 0.08, 0.2], [0, 0, 0], 16);
    return p.build('counter.cafe');
  }
});

/**
 * Adds a black metal café chair with an oak seat and back.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {number} x position x
 * @param {number} z position z
 * @param {number} yaw rotation (0 faces −Z)
 */
function cafeChair(p, f, x, z, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const at = (lx, ly, lz) => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
  const metal = f.black();
  for (const lx of [-0.19, 0.19]) {
    p.tube(metal, [at(lx, 0, -0.2), at(lx, 0.45, -0.19)], 0.011);
    p.tube(metal, [at(lx, 0, 0.21), at(lx, 0.45, 0.19), at(lx, 0.82, 0.24)], 0.011, { corner: 0.08 });
  }
  p.tube(metal, [at(-0.19, 0.44, -0.19), at(0.19, 0.44, -0.19), at(0.19, 0.44, 0.19), at(-0.19, 0.44, 0.19)], 0.01, { closed: true, corner: 0.03 });
  p.box(f.oak(), [0.43, 0.025, 0.42], 0.008, [x, 0.45, z], [0, yaw, 0]);
  p.box(f.oak(), [0.4, 0.1, 0.02], 0.008, at(0, 0.69, 0.225), [0.12, yaw, 0]);
}

registerKit('table.cafe', {
  footprint: [1.5, 0.7],
  build(params, ctx) {
    const { p, f } = start(ctx);
    p.lathe(f.black(), [[0, 0], [0.22, 0], [0.22, 0.015], [0.04, 0.03], [0.03, 0.7], [0.08, 0.72], [0, 0.72]], [0, 0, 0], [0, 0, 0], 32);
    p.lathe(f.marble(), [[0, 0], [0.295, 0], [0.3, 0.008], [0.3, 0.018], [0.295, 0.025], [0, 0.025]], [0, 0.72, 0], [0, 0, 0], 48);
    p.lathe(f.ceramic(), [[0, 0], [0.04, 0], [0.045, 0.08], [0.04, 0.08], [0, 0.006]], [0.08, 0.745, 0.05], [0, 0, 0], 16);
    if (params.chairs !== false) {
      cafeChair(p, f, -0.55, 0, Math.PI / 2);
      cafeChair(p, f, 0.55, 0, -Math.PI / 2);
    }
    return p.build('table.cafe');
  }
});

registerKit('mannequin', {
  footprint: [0.5, 0.35],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const T = p.T;
    const body = f.lacquer('#f1eee8', 0.35);
    const dress = f.fabric(params.color || '#9b5b6a');
    p.lathe(f.chrome(), [[0, 0], [0.18, 0], [0.18, 0.012], [0, 0.015]], [0, 0, 0], [0, 0, 0], 32);
    p.cyl(f.chrome(), 0.008, 0.008, 0.5, [0, 0.01, 0.03], [0, 0, 0], 8);
    for (const sx of [-1, 1]) {
      p.lathe(body, [[0, 0], [0.032, 0.01], [0.036, 0.1], [0.045, 0.35], [0.055, 0.5], [0.07, 0.75], [0.07, 0.8], [0, 0.8]], [sx * 0.08, 0.015, 0], [0, 0, sx * 0.02], 18);
    }
    p.lathe(dress, [[0.24, 0], [0.24, 0.02], [0.17, 0.35], [0.13, 0.55], [0.15, 0.68], [0.15, 0.78], [0.1, 0.83], [0.055, 0.86], [0, 0.86]], [0, 0.6, 0], [0, 0, 0], 36, { scale: [1, 1, 0.72] });
    p.lathe(body, [[0, 0], [0.05, 0], [0.045, 0.08], [0, 0.09]], [0, 1.44, 0], [0, 0, 0], 16);
    p.sphere(body, 0.095, [0, 1.6, -0.01], [0.82, 1.18, 0.95]);
    for (const sx of [-1, 1]) {
      const curve = new T.CatmullRomCurve3([new T.Vector3(sx * 0.18, 1.38, 0), new T.Vector3(sx * 0.21, 1.12, 0.01), new T.Vector3(sx * 0.22, 0.88, -0.03)]);
      p.add(new T.TubeGeometry(curve, 12, 0.032, 10, false), body);
      p.sphere(body, 0.035, [sx * 0.22, 0.86, -0.03], [0.7, 1.4, 1]);
      p.sphere(dress, 0.05, [sx * 0.17, 1.39, 0], [1.2, 0.8, 1]);
    }
    return p.build('mannequin');
  }
});

registerKit('mirror.full', {
  footprint: [0.7, 0.45],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = 0.66;
    const h = 1.85;
    const lean = 0.09;
    const metal = params.frame === 'black' ? f.black() : f.brass();
    const centre = [0, h / 2, 0.08];
    p.extrude(metal, frameShape(p.T, w, h, 0.025), 0.03, 0.003, centre, [lean, Math.PI, 0]);
    p.extrude(f.mirror(), roundedRect(p.T, w - 0.05, h - 0.05, 0.25), 0.006, 0, [0, h / 2, 0.082], [lean, Math.PI, 0]);
    return p.build('mirror.full');
  }
});

/**
 * Arched mirror frame outline (rounded top) with a matching hole.
 * @param {object} T three namespace
 * @param {number} w width
 * @param {number} h height
 * @param {number} b border
 * @returns {import('three').Shape} frame shape
 */
function frameShape(T, w, h, b) {
  const outer = roundedRect(T, w, h, 0.27);
  const inner = roundedRect(T, w - 2 * b, h - 2 * b, 0.25);
  outer.holes.push(new T.Path(inner.getPoints(24).reverse()));
  return outer;
}

registerKit('fitting.room', {
  footprint: [1.2, 1.2],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const T = p.T;
    const w = 1.2;
    const d = 1.2;
    const h = 2.3;
    const panel = f.lacquer(params.color || '#e8e2d8', 0.5);
    for (const sx of [-1, 1]) p.box(panel, [0.04, h, d], 0.008, [sx * (w / 2 - 0.02), 0, 0]);
    p.box(panel, [w, h, 0.04], 0.008, [0, 0, d / 2 - 0.02]);
    p.box(panel, [w, 0.04, d], 0.008, [0, h, 0]);
    p.tube(f.chrome(), [[-w / 2 + 0.04, h - 0.08, -d / 2 + 0.05], [w / 2 - 0.04, h - 0.08, -d / 2 + 0.05]], 0.012);
    const curtain = doubleSided(ctx, f.fabric(params.curtain || '#4b5a52'), `curtain:${params.curtain || 'fit'}`);
    p.add(pleatedPanel(T, w * 0.55, h - 0.12, 7, 0.07, 3), curtain, [-w * 0.2, 0.02, -d / 2 + 0.06]);
    p.extrude(f.mirror(), roundedRect(T, 0.55, 1.5, 0.02), 0.006, 0, [0, 1.15, d / 2 - 0.045], [0, 0, 0]);
    p.lathe(f.oak(), [[0, 0], [0.16, 0], [0.17, 0.02], [0.16, 0.035], [0, 0.035]], [0.3, 0.42, 0.25], [0, 0, 0], 32);
    for (let i = 0; i < 3; i++) p.cyl(f.oak(), 0.012, 0.016, 0.42, [0.3 + Math.cos(i * 2.1) * 0.11, 0, 0.25 + Math.sin(i * 2.1) * 0.11], [0, 0, 0], 8);
    for (const hx of [-0.3, -0.15]) p.tube(f.brass(), [[hx, 1.7, d / 2 - 0.04], [hx, 1.7, d / 2 - 0.1], [hx, 1.74, d / 2 - 0.1]], 0.008, { corner: 0.02 });
    return p.build('fitting.room');
  }
});

/** Pharmacy pack colours. */
const PACKS = ['#ffffff', '#f2f4f5', '#e3edf5', '#2d6cb5', '#e5f2e7', '#3b9b5a', '#d94b3d', '#f4e7c6', '#7c4d9e', '#ffffff', '#f6c343'];

registerKit('shelving.retail', {
  footprint: [1.2, 0.45],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = params.w ?? 1.2;
    const h = 2.1;
    const d = 0.42;
    const body = f.lacquer('#f3f2ef', 0.45);
    p.box(body, [w, h, 0.03], 0.004, [0, 0, d / 2 - 0.015]);
    for (const sx of [-1, 1]) p.box(body, [0.03, h, d], 0.004, [sx * (w / 2 - 0.015), 0, 0]);
    p.box(f.black(), [w, 0.1, d], 0.004, [0, 0, 0]);
    const packs = tintedMaterial(ctx, 0.55);
    const rnd = random(params.seed ?? 13);
    const shelves = [0.1, 0.48, 0.86, 1.24, 1.62];
    shelves.forEach((y) => {
      p.box(body, [w - 0.06, 0.02, d - 0.04], 0.003, [0, y, -0.01]);
      p.box(f.lacquer('#2f8f5a', 0.4), [w - 0.06, 0.035, 0.008], 0.002, [0, y - 0.01, -d / 2 + 0.006]);
      let x = -w / 2 + 0.05;
      while (x < w / 2 - 0.08) {
        const bw = 0.05 + rnd() * 0.08;
        const bh = 0.08 + rnd() * 0.14;
        const color = PACKS[Math.floor(rnd() * PACKS.length)];
        const rows = 2;
        for (let r = 0; r < rows; r++) p.box(packs, [bw - 0.006, bh, 0.12], 0.004, [x + bw / 2, y + 0.02, -d / 2 + 0.1 + r * 0.13], [0, 0, 0], { color });
        x += bw;
      }
    });
    p.box(f.lacquer('#2f8f5a', 0.45), [w, 0.3, 0.04], 0.006, [0, h - 0.3, -d / 2 + 0.25]);
    return p.build('shelving.retail');
  }
});

/** Fascia sign styles. */
const SIGNS = {
  boutique: { bg: '#1c1b1d', fg: '#d7b77a', font: '400 {s}px "Instrument Serif", Georgia, serif', rule: '#d7b77a' },
  cafe: { bg: '#23443a', fg: '#f3e7cf', font: '600 {s}px "Instrument Sans", "Segoe UI", Arial, sans-serif', rule: '#c9a35a' },
  pharmacy: { bg: '#f7f8f6', fg: '#1f7a46', font: '700 {s}px "Instrument Sans", "Segoe UI", Arial, sans-serif', rule: '#1f7a46', cross: true },
  plain: { bg: '#2c2f33', fg: '#f5f3ee', font: '600 {s}px "Instrument Sans", "Segoe UI", Arial, sans-serif', rule: '#f5f3ee' }
};

/**
 * Paints a fascia sign.
 * @param {CanvasRenderingContext2D} g context
 * @param {number} w width
 * @param {number} h height
 * @param {string} text sign text
 * @param {object} style colours and font
 */
function drawSign(g, w, h, text, style) {
  g.fillStyle = style.bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = style.rule;
  g.lineWidth = h * 0.02;
  g.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16);
  let size = h * 0.5;
  g.font = style.font.replace('{s}', String(Math.round(size)));
  const room = w - h * (style.cross ? 1.6 : 0.6);
  const measured = g.measureText(text).width;
  if (measured > room) {
    size *= room / measured;
    g.font = style.font.replace('{s}', String(Math.round(size)));
  }
  g.fillStyle = style.fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const cx = style.cross ? w / 2 + h * 0.4 : w / 2;
  g.fillText(text, cx, h * 0.53);
  if (style.cross) {
    const s = h * 0.5;
    const x = w / 2 - g.measureText(text).width / 2 - h * 0.2 + h * 0.4 - s;
    g.fillStyle = '#2bb35f';
    g.fillRect(x + s * 0.33, h / 2 - s / 2, s * 0.34, s);
    g.fillRect(x, h / 2 - s * 0.17, s, s * 0.34);
  }
}

registerKit('sign.fascia', {
  footprint: [4.8, 0.1],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = params.width ?? 4.8;
    const h = params.height ?? 0.85;
    const y = params.y ?? 3.4;
    const text = params.text || 'Shop';
    const style = SIGNS[params.style] || SIGNS.plain;
    const px = ctx.quality === 'low' ? 1024 : 2048;
    const ph = Math.round((px * h) / w);
    const key = `sign:${params.style}:${text}:${w}x${h}`;
    const map = canvasTexture(ctx, key, px, ph, (g, cw, ch) => drawSign(g, cw, ch, text, style));
    const face = cached(ctx, `signface:${key}`, () => new p.T.MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: 0.18, roughness: 0.45, metalness: 0 }));
    p.box(f.aluminium(), [w + 0.04, h + 0.04, 0.07], 0.01, [0, y - 0.02, -0.035]);
    p.add(new p.T.PlaneGeometry(w, h), face, [0, y + h / 2, -0.0715], [0, Math.PI, 0], { uv: 'keep' });
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * (w / 3);
      p.tube(f.black(), [[x, y + h + 0.03, -0.02], [x, y + h + 0.03, -0.22], [x, y + h + 0.0, -0.24]], 0.01, { corner: 0.03 });
      p.lathe(f.black(), [[0.035, 0], [0.03, 0.02], [0.012, 0.05], [0, 0.055]], [x, y + h + 0.005, -0.24], [Math.PI, 0, 0], 12);
    }
    p.light({ type: 'spot', position: [0, y + h, -0.3], intensity: 0.8, distance: 3, color: '#fff1dc' });
    return p.build('sign.fascia');
  }
});


registerKit('awning', {
  footprint: [4.8, 1.0],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const T = p.T;
    const w = params.width ?? 4.8;
    const depth = params.depth ?? 1.0;
    const y = params.y ?? 3.05;
    const drop = 0.35;
    const colours = params.stripes || [params.color || '#2f3a35', params.color2 || params.color || '#2f3a35'];
    const key = `awning:${colours.join(',')}`;
    const cloth = cached(ctx, key, () => {
      const map = canvasTexture(ctx, key, 256, 32, (g, cw, ch) => {
        const n = 16;
        for (let i = 0; i < n; i++) {
          g.fillStyle = colours[i % 2];
          g.fillRect((i / n) * cw, 0, cw / n + 1, ch);
        }
      });
      map.wrapS = T.RepeatWrapping;
      map.repeat.set(Math.max(1, Math.round(w / 2)), 1);
      return new T.MeshStandardMaterial({ map, roughness: 0.9, side: T.DoubleSide });
    });
    const slope = new T.PlaneGeometry(w, Math.hypot(depth, drop), 1, 1);
    p.add(slope, cloth, [0, y - drop / 2, -depth / 2], [Math.atan2(depth, drop), 0, 0], { uv: 'keep' });
    const valance = new T.PlaneGeometry(w, 0.22, 48, 1);
    const vp = valance.attributes.position;
    for (let i = 0; i < vp.count; i++) {
      if (vp.getY(i) < 0) vp.setY(i, -0.11 + 0.04 * Math.abs(Math.sin((vp.getX(i) / w) * Math.PI * 12)));
    }
    p.add(valance, cloth, [0, y - drop - 0.11 + 0.01, -depth], [0, Math.PI, 0], { uv: 'keep' });
    const metal = f.black();
    p.tube(metal, [[-w / 2, y, -0.03], [w / 2, y, -0.03]], 0.02);
    p.tube(metal, [[-w / 2, y - drop, -depth], [w / 2, y - drop, -depth]], 0.016);
    for (const x of [-w / 2 + 0.05, 0, w / 2 - 0.05]) p.tube(metal, [[x, y - 0.55, 0], [x, y - drop, -depth]], 0.012);
    return p.build('awning');
  }
});
