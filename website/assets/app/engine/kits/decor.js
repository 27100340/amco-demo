/**
 * Decor kits: plants, framed art, books, vases, the round wall mirror, curtains and blinds.
 * Front faces −Z; origin at the floor centre of the footprint. Wall-hung kits put their back
 * on z = 0, so the fixture point is the wall face. Kits that sit on furniture take an
 * `elevation` parameter (the height of the surface they stand on).
 */
import { registerKit } from './index.js';
import { start, random, tintedMaterial, foliage, crown, taperTube, pictureMaterial, pleatedPanel, doubleSided, cached } from './parts.js';

/** Muted book-cover colours. */
const BOOK_COLOURS = ['#2f3b4c', '#8c3b2e', '#d9cfbd', '#4a5a48', '#b98d4e', '#1f2326', '#a8a29a', '#6d4c3d', '#e3dccf', '#3c5a6b', '#7a6a55', '#c4b59a'];

/**
 * Adds a row (or a lying stack) of books with spines facing −Z.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} ctx kit context
 * @param {{ x: number, y: number, z: number, length: number, seed?: number, lean?: boolean, stack?: boolean }} o placement
 */
export function books(p, ctx, o) {
  const mat = tintedMaterial(ctx, 0.7);
  const rnd = random(o.seed ?? 1);
  const pick = () => BOOK_COLOURS[Math.floor(rnd() * BOOK_COLOURS.length)];
  if (o.stack) {
    let y = o.y;
    const count = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < count; i++) {
      const t = 0.025 + rnd() * 0.025;
      p.box(mat, [0.2 + rnd() * 0.08, t, 0.15 + rnd() * 0.05], 0.003, [o.x, y, o.z], [0, (rnd() - 0.5) * 0.25, 0], { color: pick() });
      y += t;
    }
    return;
  }
  let x = o.x - o.length / 2;
  const end = o.x + o.length / 2;
  while (x < end - 0.02) {
    const t = Math.min(end - x, 0.018 + rnd() * 0.035);
    const h = 0.18 + rnd() * 0.1;
    const d = 0.14 + rnd() * 0.06;
    const leaning = o.lean && x + t > end - 0.12;
    const rot = leaning ? [0, 0, -0.32] : [0, 0, 0];
    p.box(mat, [t - 0.002, h, d], 0.003, [x + t / 2, o.y, o.z - 0.1 + d / 2 + rnd() * 0.01], rot, { color: pick() });
    x += t;
  }
}

/** Vase lathe profiles, [radius, height] pairs. */
const VASES = {
  bud: [[0, 0], [0.035, 0], [0.05, 0.05], [0.045, 0.14], [0.018, 0.2], [0.02, 0.22], [0, 0.22]],
  jar: [[0, 0], [0.07, 0], [0.1, 0.06], [0.105, 0.13], [0.07, 0.2], [0.045, 0.22], [0.05, 0.24], [0, 0.24]],
  round: [[0, 0], [0.05, 0], [0.1, 0.05], [0.115, 0.12], [0.09, 0.2], [0.04, 0.24], [0.045, 0.26], [0, 0.26]],
  tall: [[0, 0], [0.09, 0], [0.13, 0.12], [0.135, 0.35], [0.09, 0.55], [0.06, 0.62], [0.065, 0.65], [0, 0.65]]
};

/**
 * Adds a ceramic vase.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {{ x: number, y: number, z: number, kind?: string, color?: string }} o placement
 */
export function vase(p, f, o) {
  p.lathe(f.ceramic(o.color || '#d6cbb8'), VASES[o.kind] || VASES.jar, [o.x, o.y, o.z], [0, 0, 0], 32);
}

/**
 * Adds a planter pot with soil.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {number} r top radius
 * @param {number} h height
 * @param {string} color pot colour
 * @param {number} [y] base height
 */
export function pot(p, f, r, h, color, y = 0) {
  p.lathe(f.ceramic(color), [[0, 0], [r * 0.78, 0], [r * 0.8, 0.01], [r, h - 0.01], [r, h], [r - 0.012, h], [r * 0.95, h - 0.04], [0, h - 0.04]], [0, y, 0], [0, 0, 0], 32);
  p.cyl(f.ceramic('#3b2e24'), r * 0.94, r * 0.94, 0.01, [0, y + h - 0.05, 0], [0, 0, 0], 28);
}

/**
 * Builds a fiddle-leaf fig in a tall pot.
 * @param {object} ctx kit context
 * @param {object} params { height, pot, seed }
 * @returns {import('three').Group} the plant
 */
function fiddle(ctx, params) {
  const { p, f } = start(ctx);
  const T = p.T;
  const height = params.height ?? 1.7;
  const potH = 0.42;
  pot(p, f, 0.22, potH, params.pot || '#e9e5de');
  const rnd = random(params.seed ?? 5);
  const bark = f.walnut();
  const leaf = foliage(ctx, 'fiddle', true);
  const stems = 3;
  for (let s = 0; s < stems; s++) {
    const a = (s / stems) * Math.PI * 2 + rnd();
    const top = height * (0.75 + rnd() * 0.25);
    const lean = 0.08 + rnd() * 0.1;
    const curve = new T.CatmullRomCurve3([
      new T.Vector3(Math.cos(a) * 0.03, potH - 0.05, Math.sin(a) * 0.03),
      new T.Vector3(Math.cos(a) * lean * 0.5, potH + (top - potH) * 0.45, Math.sin(a) * lean * 0.5),
      new T.Vector3(Math.cos(a) * lean, top, Math.sin(a) * lean)
    ]);
    p.add(taperTube(T, curve, 0.018, 0.008, 10, 7), bark);
    const leaves = 14 + Math.floor(rnd() * 5);
    for (let i = 0; i < leaves; i++) {
      const t = 0.3 + (i / leaves) * 0.7;
      const at = curve.getPointAt(t);
      const yaw = rnd() * Math.PI * 2;
      const size = 0.28 + rnd() * 0.12;
      const tilt = 0.55 + rnd() * 0.7;
      p.leaf(leaf, size * 0.8, size, [at.x, at.y, at.z], [tilt, yaw, (rnd() - 0.5) * 0.6], { centre: [0, height * 0.75, 0], bend: -0.12, cup: -0.05, soften: 0.45 });
    }
  }
  return p.build('plant.floor');
}

/**
 * Builds an areca palm: arching fronds rising from a pot.
 * @param {object} ctx kit context
 * @param {object} params { height, pot, seed }
 * @returns {import('three').Group} the plant
 */
function areca(ctx, params) {
  const { p, f } = start(ctx);
  const T = p.T;
  const height = params.height ?? 1.8;
  const potH = 0.45;
  pot(p, f, 0.24, potH, params.pot || '#3a3d40');
  const rnd = random(params.seed ?? 9);
  const leaflets = tintedMaterial(ctx, 0.7);
  const stemMat = f.fabric('#7d8f45');
  const count = 11;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd() * 0.4;
    const reach = 0.06 + rnd() * 0.08;
    const top = potH + (height - potH) * (0.22 + rnd() * 0.24);
    const base = new T.Vector3(Math.cos(a) * 0.04, potH - 0.04, Math.sin(a) * 0.04);
    const tip = new T.Vector3(Math.cos(a) * reach, top, Math.sin(a) * reach);
    const curve = new T.CatmullRomCurve3([base, base.clone().lerp(tip, 0.5).setY(base.y + (top - base.y) * 0.55), tip]);
    p.add(taperTube(T, curve, 0.008, 0.005, 6, 5), stemMat);
    const len = 0.52 + rnd() * 0.12;
    p.frond(leaflets, len, [tip.x, tip.y - 0.05, tip.z], [0.14 + rnd() * 0.2, -a + Math.PI / 2, (rnd() - 0.5) * 0.3], { centre: [0, height * 0.65, 0], bend: 0.26, soften: 0.4, seed: (params.seed ?? 9) * 31 + i });
  }
  return p.build('plant.floor');
}

registerKit('plant.floor', {
  footprint: [0.7, 0.7],
  build: (params, ctx) => (params.species === 'areca' ? areca(ctx, params) : fiddle(ctx, params))
});

registerKit('plant.small', {
  footprint: [0.3, 0.3],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const y = params.elevation ?? 0;
    const T = p.T;
    p.lathe(f.ceramic(params.pot || '#d8cfc2'), [[0, 0], [0.06, 0], [0.075, 0.02], [0.08, 0.13], [0.072, 0.13], [0, 0.11]], [0, y, 0], [0, 0, 0], 28);
    const g = new T.SphereGeometry(0.07, 10, 6);
    p.add(g, f.ceramic('#3b2e24'), [0, y + 0.1, 0], [0, 0, 0], { scale: [1, 0.25, 1] });
    crown(p, foliage(ctx, 'shrub'), [0, y + 0.25, 0], [0.15, 0.13, 0.15], 26, 0.16, params.seed ?? 4);
    return p.build('plant.small');
  }
});

/** Art print palettes. */
const ART = [
  ['#efe8dc', '#c0603f', '#d9a441', '#6d7f6a', '#2d3440'],
  ['#ece6da', '#2f4858', '#86a3a0', '#d6b48a', '#a14b3b'],
  ['#f1ece3', '#3a3a38', '#b8a68c', '#e0c9a6', '#7d8471'],
  ['#e9e2d4', '#b5523b', '#e2b98e', '#3d5a4c', '#efe0c4']
];

/**
 * Paints an abstract print.
 * @param {CanvasRenderingContext2D} g context
 * @param {number} w width
 * @param {number} h height
 * @param {number} seed design seed
 */
function drawArt(g, w, h, seed) {
  const rnd = random(seed * 31 + 7);
  const pal = ART[seed % ART.length];
  g.fillStyle = pal[0];
  g.fillRect(0, 0, w, h);
  const style = seed % 3;
  if (style === 0) {
    for (let i = 0; i < 4; i++) {
      g.fillStyle = pal[1 + (i % 4)];
      g.beginPath();
      const r = Math.min(w, h) * (0.18 + rnd() * 0.22);
      g.arc(w * (0.25 + rnd() * 0.5), h * (0.3 + rnd() * 0.5), r, Math.PI * (rnd() > 0.5 ? 1 : 0), Math.PI * (rnd() > 0.5 ? 2 : 1));
      g.fill();
    }
    g.fillStyle = pal[4];
    g.fillRect(w * 0.12, h * 0.78, w * 0.76, h * 0.012);
  } else if (style === 1) {
    const bands = 3;
    for (let i = 0; i < bands; i++) {
      g.fillStyle = pal[1 + i];
      g.globalAlpha = 0.85;
      const y = h * (0.1 + i * 0.28);
      g.fillRect(w * 0.1 + rnd() * 6, y + rnd() * 6, w * 0.8, h * 0.24);
    }
    g.globalAlpha = 1;
  } else {
    g.strokeStyle = pal[4];
    g.lineWidth = Math.max(2, w * 0.006);
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(w * 0.1, h * (0.35 + i * 0.12));
      g.bezierCurveTo(w * 0.35, h * (0.15 + rnd() * 0.3), w * 0.6, h * (0.55 + rnd() * 0.3), w * 0.9, h * (0.4 + i * 0.1));
      g.stroke();
    }
    g.fillStyle = pal[1];
    g.beginPath();
    g.arc(w * 0.68, h * 0.3, Math.min(w, h) * 0.12, 0, Math.PI * 2);
    g.fill();
  }
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

registerKit('art.frame', {
  footprint: [1.0, 0.04],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = params.w ?? 1.0;
    const h = params.h ?? 0.75;
    const cy = params.y ?? 1.55;
    const seed = params.seed ?? 1;
    const frame = params.frame === 'oak' ? f.oak() : params.frame === 'brass' ? f.brass() : f.lacquer('#1f1f21', 0.5);
    const b = 0.025;
    const d = 0.035;
    const z = -d / 2;
    p.cbox(frame, [w, b, d], 0.004, [0, cy + h / 2 - b / 2, z]);
    p.cbox(frame, [w, b, d], 0.004, [0, cy - h / 2 + b / 2, z]);
    p.cbox(frame, [b, h - 2 * b, d], 0.004, [-w / 2 + b / 2, cy, z]);
    p.cbox(frame, [b, h - 2 * b, d], 0.004, [w / 2 - b / 2, cy, z]);
    p.cbox(f.lacquer('#f4f1ea', 0.5), [w - 2 * b, h - 2 * b, 0.004], 0.001, [0, cy, -0.012]);
    const mat = 0.05 * Math.min(1, w);
    const pw = w - 2 * b - 2 * mat;
    const ph = h - 2 * b - 2 * mat;
    const px = ctx.quality === 'low' ? 256 : 512;
    const art = pictureMaterial(ctx, `art:${seed}:${pw.toFixed(2)}x${ph.toFixed(2)}`, px, Math.round((px * ph) / pw), (g, cw, ch) => drawArt(g, cw, ch, seed), { roughness: 0.9 });
    p.add(new p.T.PlaneGeometry(pw, ph), art, [0, cy, -0.0145], [0, Math.PI, 0], { uv: 'keep' });
    return p.build('art.frame');
  }
});


registerKit('books.row', {
  footprint: [0.6, 0.2],
  build(params, ctx) {
    const { p } = start(ctx);
    books(p, ctx, { x: 0, y: params.elevation ?? 0, z: 0, length: params.length ?? 0.6, seed: params.seed ?? 2, lean: params.lean !== false, stack: params.stack });
    return p.build('books.row');
  }
});

registerKit('vase', {
  footprint: [0.27, 0.27],
  build(params, ctx) {
    const { p, f } = start(ctx);
    vase(p, f, { x: 0, y: params.elevation ?? 0, z: 0, kind: params.kind || 'tall', color: params.color });
    if ((params.kind || 'tall') === 'tall' && params.stems !== false) {
      const T = p.T;
      const rnd = random(params.seed ?? 6);
      const y0 = (params.elevation ?? 0) + 0.6;
      for (let i = 0; i < 7; i++) {
        const a = rnd() * Math.PI * 2;
        const lean = 0.1 + rnd() * 0.25;
        const h = 0.55 + rnd() * 0.4;
        const curve = new T.QuadraticBezierCurve3(new T.Vector3(0, y0, 0), new T.Vector3(Math.cos(a) * lean * 0.3, y0 + h * 0.6, Math.sin(a) * lean * 0.3), new T.Vector3(Math.cos(a) * lean, y0 + h, Math.sin(a) * lean));
        p.add(taperTube(T, curve, 0.004, 0.002, 8, 4), f.walnut());
        p.lathe(f.fabric('#d8c7a6'), [[0, 0], [0.025, 0.05], [0.03, 0.14], [0.012, 0.24], [0, 0.26]], [Math.cos(a) * lean, y0 + h - 0.05, Math.sin(a) * lean], [Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4], 8);
      }
    }
    return p.build('vase');
  }
});

registerKit('mirror.round', {
  footprint: [0.9, 0.04],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const r = (params.d ?? 0.9) / 2;
    const cy = params.y ?? 1.55;
    const T = p.T;
    p.add(new T.TorusGeometry(r, 0.014, 10, 72), f.brass(), [0, cy, -0.02]);
    p.add(new T.CircleGeometry(r - 0.004, 72), f.mirror(), [0, cy, -0.018], [0, Math.PI, 0]);
    return p.build('mirror.round');
  }
});

/**
 * A sheer voile material (semi-transparent, double-sided).
 * @param {object} ctx kit context
 * @returns {import('three').Material} cached material
 */
function sheer(ctx) {
  return cached(ctx, 'sheer', () => new ctx.THREE.MeshStandardMaterial({
    color: '#f5f2ec', roughness: 0.9, transparent: true, opacity: 0.62, side: ctx.THREE.DoubleSide, depthWrite: false
  }));
}

registerKit('curtain.pair', {
  footprint: [2.4, 0.18],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const T = p.T;
    const w = params.width ?? 2.4;
    const h = params.height ?? 2.8;
    const drape = doubleSided(ctx, f.fabric(params.color || '#c9bda8'), `drape:${params.color || ''}`);
    const rodY = h - 0.04;
    const rodLen = w + 0.3;
    p.add(pleatedPanel(T, w, h - 0.08, Math.max(6, Math.round(w * 6)), 0.03, 7), sheer(ctx), [0, 0.03, -0.04]);
    const panel = Math.max(0.35, w * 0.2);
    for (const sx of [-1, 1]) {
      p.add(pleatedPanel(T, panel, h - 0.1, 6, 0.09, sx > 0 ? 11 : 5), drape, [sx * (rodLen / 2 - panel / 2 - 0.06), 0.015, -0.09]);
      p.sphere(f.brass(), 0.025, [sx * (rodLen / 2 + 0.02), rodY, -0.13]);
      p.tube(f.brass(), [[sx * (rodLen / 2 - 0.1), rodY, 0], [sx * (rodLen / 2 - 0.1), rodY, -0.13]], 0.008);
    }
    p.tube(f.brass(), [[-rodLen / 2, rodY, -0.13], [rodLen / 2, rodY, -0.13]], 0.012);
    return p.build('curtain.pair');
  }
});

registerKit('blind.roller', {
  footprint: [1.5, 0.08],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = params.width ?? 1.5;
    const h = params.height ?? 1.6;
    const sill = params.sill ?? 0.9;
    const drop = Math.max(0.15, Math.min(1, params.drop ?? 0.45)) * h;
    const top = sill + h;
    p.box(f.aluminium(), [w + 0.06, 0.08, 0.08], 0.015, [0, top, -0.04]);
    p.box(f.fabric(params.color || '#d9d2c4'), [w, drop, 0.003], 0.001, [0, top - drop, -0.05]);
    p.box(f.aluminium(), [w + 0.01, 0.025, 0.015], 0.006, [0, top - drop - 0.02, -0.05]);
    p.tube(f.chrome(), [[w / 2 - 0.04, top, -0.02], [w / 2 - 0.04, top - drop * 0.9, -0.02]], 0.0025, { radial: 4 });
    return p.build('blind.roller');
  }
});
