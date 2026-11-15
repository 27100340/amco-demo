/**
 * Kitchen and bathroom kits: fitted kitchen run, island, fridge, vanity, WC and shower.
 * Front faces −Z; the back of wall-fitted kits sits on z = +depth/2 (against the wall).
 * Origin at the floor centre of the footprint.
 */
import { registerKit } from './index.js';
import { start, roundedRect } from './parts.js';
import { barStool } from './seating.js';
import { vase } from './decor.js';

/** Fitted-kitchen dimensions (m). */
const K = { depth: 0.6, plinth: 0.1, top: 0.9, slab: 0.03, gap: 0.003, wallBottom: 1.45, wallTop: 2.2, wallDepth: 0.35 };

/**
 * A horizontal bar pull on a front.
 * @param {import('./parts.js').Parts} p collector
 * @param {import('three').Material} metal handle material
 * @param {number} x centre x
 * @param {number} y centre y
 * @param {number} z front face z
 * @param {number} len length
 */
function pull(p, metal, x, y, z, len) {
  p.tube(metal, [[x - len / 2, y, z], [x - len / 2, y, z - 0.028], [x + len / 2, y, z - 0.028], [x + len / 2, y, z]], 0.006, { corner: 0.01, radial: 8 });
}

/**
 * A row of base cabinet fronts: drawers, doors or an oven.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {import('three').Material} front front material
 * @param {number} x module centre
 * @param {number} w module width
 * @param {number} zf front face z
 * @param {'drawers'|'door'|'doors'|'oven'} kind front layout
 */
function baseFront(p, f, front, x, w, zf, kind) {
  const metal = f.steel();
  const y0 = K.plinth + K.gap;
  const h = K.top - K.slab - K.plinth - 2 * K.gap;
  const fw = w - K.gap * 2;
  const t = 0.019;
  if (kind === 'drawers' || kind === 'oven') {
    const rows = kind === 'oven' ? [0.14, h - 0.14 - K.gap] : [h * 0.3, h * 0.33, h - h * 0.63 - 2 * K.gap];
    let y = y0;
    rows.forEach((rh, i) => {
      const oven = kind === 'oven' && i === 1;
      p.box(oven ? f.lacquer('#121315', 0.12) : front, [fw, rh, t], 0.003, [x, y, zf + t / 2]);
      pull(p, metal, x, y + rh - (oven ? 0.05 : 0.045), zf, oven ? fw * 0.75 : Math.min(0.32, fw * 0.6));
      if (oven) p.box(f.lacquer('#2a2c2f', 0.3), [fw * 0.8, 0.05, 0.004], 0.001, [x, y + rh - 0.12, zf - 0.001]);
      y += rh + K.gap;
    });
    return;
  }
  const leaves = kind === 'doors' ? 2 : 1;
  const lw = (fw - (leaves - 1) * K.gap) / leaves;
  for (let i = 0; i < leaves; i++) {
    const lx = x - fw / 2 + lw / 2 + i * (lw + K.gap);
    p.box(front, [lw, h, t], 0.003, [lx, y0, zf + t / 2]);
    pull(p, metal, lx + (leaves === 2 ? (i === 0 ? lw / 2 - 0.06 : -lw / 2 + 0.06) : 0), y0 + h - 0.06, zf, leaves === 2 ? 0.16 : 0.22);
  }
}

/**
 * An undermount steel sink bowl with a gooseneck mixer.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {number} x centre x
 * @param {number} z centre z
 * @param {number} w bowl width
 * @param {number} d bowl depth (front to back)
 */
function sink(p, f, x, z, w, d) {
  const steel = f.steel();
  const top = K.top - 0.004;
  const depth = 0.2;
  p.box(steel, [w, 0.01, d], 0.004, [x, top - depth, z]);
  p.box(steel, [w, depth, 0.01], 0.003, [x, top - depth, z - d / 2]);
  p.box(steel, [w, depth, 0.01], 0.003, [x, top - depth, z + d / 2]);
  p.box(steel, [0.01, depth, d], 0.003, [x - w / 2, top - depth, z]);
  p.box(steel, [0.01, depth, d], 0.003, [x + w / 2, top - depth, z]);
  p.cyl(f.chrome(), 0.028, 0.028, 0.004, [x, top - depth + 0.01, z], [0, 0, 0], 20);
  const tz = z + d / 2 + 0.06;
  p.cyl(f.chrome(), 0.025, 0.028, 0.06, [x, K.top, tz], [0, 0, 0], 20);
  p.tube(f.chrome(), [[x, K.top + 0.05, tz], [x, K.top + 0.38, tz], [x, K.top + 0.38, tz - 0.22], [x, K.top + 0.26, tz - 0.22]], 0.012, { corner: 0.07, radial: 12 });
  p.box(f.chrome(), [0.012, 0.012, 0.09], 0.004, [x + 0.04, K.top + 0.1, tz - 0.02], [0.4, 0, 0]);
}

/**
 * A built-in gas hob: black glass with brass burners and cast-iron pan supports.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {number} x centre x
 * @param {number} z centre z
 */
function hob(p, f, x, z) {
  const T = p.T;
  const glass = f.lacquer('#0d0e10', 0.1);
  const iron = f.black();
  const brass = f.brass();
  p.box(glass, [0.76, 0.008, 0.5], 0.003, [x, K.top, z]);
  const spots = [[-0.2, -0.1, 0.06], [0.2, -0.1, 0.05], [-0.2, 0.12, 0.05], [0.2, 0.12, 0.07], [0, 0.01, 0.045]];
  for (const [bx, bz, r] of spots) {
    p.lathe(brass, [[0, 0], [r, 0], [r, 0.012], [r * 0.7, 0.02], [0, 0.022]], [x + bx, K.top + 0.008, z + bz], [0, 0, 0], 20);
    p.add(new T.TorusGeometry(r + 0.045, 0.006, 6, 24), iron, [x + bx, K.top + 0.04, z + bz], [Math.PI / 2, 0, 0]);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      p.box(iron, [0.075, 0.012, 0.012], 0.004, [x + bx + Math.cos(a) * (r + 0.03), K.top + 0.008, z + bz + Math.sin(a) * (r + 0.03)], [0, -a, 0]);
    }
  }
  for (let k = 0; k < 5; k++) p.cyl(f.steel(), 0.02, 0.022, 0.025, [x - 0.3 + k * 0.15, K.top + 0.008, z - 0.225], [0, 0, 0], 16);
}

/**
 * A T-shaped chimney hood above a hob.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {number} x centre x
 * @param {number} zBack wall face z
 * @param {number} ceiling ceiling height
 */
function hood(p, f, x, zBack, ceiling) {
  const steel = f.steel();
  p.box(steel, [0.9, 0.07, 0.5], 0.008, [x, 1.62, zBack - 0.25]);
  p.box(f.lacquer('#1b1c1e', 0.4), [0.84, 0.004, 0.44], 0.001, [x, 1.618, zBack - 0.25]);
  p.box(steel, [0.3, ceiling - 1.69, 0.26], 0.006, [x, 1.69, zBack - 0.13]);
}

registerKit('kitchen.run', {
  footprint: [3.6, 0.62],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const L = params.length ?? 3.6;
    const ceiling = params.ceiling ?? 2.7;
    const zBack = 0.31;
    const zFront = zBack - K.depth;
    const front = params.finish === 'walnut' ? f.walnut() : f.lacquer(params.color || '#cfc8bb', 0.5);
    const upper = f.lacquer(params.upperColor || '#efebe4', 0.45);
    const carcass = f.lacquer('#e9e5de', 0.6);
    const top = params.worktop === 'concrete' ? f.concrete('#9a9893') : f.marble();
    p.box(f.black(), [L, K.plinth, K.depth - 0.07], 0.003, [0, 0, zBack - (K.depth - 0.07) / 2]);
    p.box(carcass, [L, K.top - K.slab - K.plinth, K.depth - 0.03], 0.003, [0, K.plinth, zBack - (K.depth - 0.03) / 2]);
    const n = Math.max(2, Math.round(L / 0.6));
    const mw = L / n;
    const sinkAt = Math.max(0, Math.floor(n * 0.25));
    const hobAt = Math.min(n - 1, Math.max(sinkAt + 1, Math.floor(n * 0.68)));
    const moduleX = (i) => -L / 2 + mw * (i + 0.5);
    const zf = zFront + 0.012;
    for (let i = 0; i < n; i++) {
      const kind = i === hobAt ? 'oven' : i === sinkAt ? 'doors' : (i % 2 === 0 ? 'drawers' : 'door');
      baseFront(p, f, front, moduleX(i), mw, zf, kind);
    }
    const sx = moduleX(sinkAt);
    const sw = Math.min(0.5, mw - 0.12);
    const sd = 0.4;
    const sz = zBack - 0.33;
    const y = K.top - K.slab;
    const left = sx - sw / 2 + L / 2;
    const right = L / 2 - (sx + sw / 2);
    p.box(top, [left, K.slab, K.depth + 0.02], 0.004, [-L / 2 + left / 2, y, zBack - (K.depth + 0.02) / 2]);
    p.box(top, [right, K.slab, K.depth + 0.02], 0.004, [L / 2 - right / 2, y, zBack - (K.depth + 0.02) / 2]);
    const frontStrip = sz - sd / 2 - (zBack - K.depth - 0.02);
    p.box(top, [sw + 0.01, K.slab, frontStrip], 0.004, [sx, y, zBack - K.depth - 0.02 + frontStrip / 2]);
    const backStrip = zBack - (sz + sd / 2);
    p.box(top, [sw + 0.01, K.slab, backStrip], 0.004, [sx, y, zBack - backStrip / 2]);
    sink(p, f, sx, sz, sw, sd);
    const hx = moduleX(hobAt);
    hob(p, f, hx, zBack - 0.3);
    hood(p, f, hx, zBack, ceiling);
    p.box(params.splash === 'tile' ? f.porcelain('#e8e4dc') : top, [L, K.wallBottom - K.top, 0.012], 0.002, [0, K.top, zBack - 0.006]);
    if (params.upper !== false) {
      const wallH = Math.min(K.wallTop, ceiling - 0.05) - K.wallBottom;
      const hoodGap = 0.95;
      const runs = [[-L / 2, hx - hoodGap / 2], [hx + hoodGap / 2, L / 2]].filter(([a, b]) => b - a > 0.25);
      for (const [a, b] of runs) {
        const len = b - a;
        const cx = (a + b) / 2;
        const zc = zBack - K.wallDepth / 2;
        p.box(carcass, [len, wallH, K.wallDepth - 0.02], 0.003, [cx, K.wallBottom, zc + 0.01]);
        const doors = Math.max(1, Math.round(len / 0.5));
        const dw = len / doors;
        for (let i = 0; i < doors; i++) {
          const dx = a + dw * (i + 0.5);
          p.box(upper, [dw - K.gap * 2, wallH - K.gap * 2, 0.019], 0.003, [dx, K.wallBottom + K.gap, zBack - K.wallDepth + 0.0095]);
          pull(p, f.steel(), dx + (i % 2 === 0 ? dw / 2 - 0.06 : -dw / 2 + 0.06), K.wallBottom + 0.05, zBack - K.wallDepth, 0.14);
        }
        p.box(f.led(), [len - 0.04, 0.006, 0.02], 0.002, [cx, K.wallBottom - 0.006, zBack - K.wallDepth + 0.04]);
      }
      p.light({ type: 'point', position: [0, K.wallBottom - 0.1, zBack - 0.2], intensity: 0.5, distance: 2.5, color: '#fff1dc' });
    }
    p.lathe(f.steel(), [[0, 0], [0.08, 0], [0.09, 0.03], [0.085, 0.17], [0.05, 0.2], [0, 0.205]], [L / 2 - 0.35, K.top, zBack - 0.22], [0, 0, 0], 24);
    p.box(f.oak(), [0.42, 0.3, 0.02], 0.008, [-L / 2 + 0.35, K.top, zBack - 0.03], [-0.12, 0.1, 0]);
    vase(p, f, { x: sx + 0.42, y: K.top, z: zBack - 0.12, kind: 'jar', color: '#efe9dd' });
    return p.build('kitchen.run');
  }
});

registerKit('kitchen.island', {
  footprint: [2.0, 1.0],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = params.w ?? 2.0;
    const d = 1.0;
    const top = f.marble();
    const front = params.finish === 'walnut' ? f.walnut() : f.lacquer(params.color || '#cfc8bb', 0.5);
    const inner = w - 0.06;
    p.box(f.black(), [inner - 0.1, K.plinth, 0.5], 0.003, [0, 0, -d / 2 + 0.33]);
    p.box(f.lacquer('#e9e5de', 0.6), [inner, K.top - K.slab - K.plinth, 0.58], 0.003, [0, K.plinth, -d / 2 + 0.33]);
    const n = Math.max(2, Math.round(inner / 0.6));
    const mw = inner / n;
    for (let i = 0; i < n; i++) baseFront(p, f, front, -inner / 2 + mw * (i + 0.5), mw, -d / 2 + 0.03, i % 2 === 0 ? 'drawers' : 'doors');
    p.box(front, [inner, K.top - K.slab - 0.02, 0.02], 0.004, [0, 0.02, -d / 2 + 0.63]);
    p.box(top, [w, K.slab, d], 0.004, [0, K.top - K.slab, 0]);
    for (const sx of [-1, 1]) p.box(top, [K.slab, K.top - K.slab, d], 0.004, [sx * (w / 2 - K.slab / 2), 0, 0]);
    p.lathe(f.ceramic('#e6e0d4'), [[0, 0], [0.08, 0], [0.16, 0.06], [0.18, 0.1], [0.172, 0.1], [0.15, 0.065], [0, 0.05]], [-0.3, K.top, -0.1]);
    for (const [ox, oz, c] of [[-0.33, -0.1, '#d9862f'], [-0.27, -0.06, '#c7b23a'], [-0.3, -0.14, '#d9862f']]) p.sphere(f.ceramic(c), 0.04, [ox, K.top + 0.09, oz]);
    const stools = params.stools ?? 3;
    for (let i = 0; i < stools; i++) barStool(p, f, { height: 0.65 }, (i - (stools - 1) / 2) * 0.55, d / 2 + 0.22);
    return p.build('kitchen.island');
  }
});

registerKit('fridge', {
  footprint: [0.91, 0.72],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = 0.91;
    const h = 1.78;
    const d = 0.72;
    const steel = ctx.mat('brushed-steel', { repeat: [6, 6] });
    p.box(f.black(), [w - 0.04, 0.06, d - 0.1], 0.003, [0, 0, 0.04]);
    p.box(f.lacquer('#2b2d30', 0.4), [w, h - 0.06, d - 0.06], 0.01, [0, 0.06, 0.03]);
    for (const sx of [-1, 1]) {
      p.box(steel, [w / 2 - 0.004, h - 0.07, 0.05], 0.012, [sx * (w / 4), 0.065, -d / 2 + 0.025]);
      p.tube(f.chrome(), [[sx * 0.03, 0.72, -d / 2], [sx * 0.03, 0.72, -d / 2 - 0.045], [sx * 0.03, 1.5, -d / 2 - 0.045], [sx * 0.03, 1.5, -d / 2]], 0.011, { corner: 0.02 });
    }
    p.box(f.lacquer('#151618', 0.15), [0.24, 0.36, 0.006], 0.004, [-w / 4, 1.0, -d / 2 - 0.002]);
    return p.build('fridge');
  }
});

registerKit('bath.vanity', {
  footprint: [0.9, 0.5],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = params.w ?? 0.9;
    const d = 0.48;
    const zBack = 0.25;
    const body = params.finish === 'lacquer' ? f.lacquer(params.color || '#d9d2c6', 0.5) : f.walnut();
    p.box(body, [w, 0.42, d - 0.02], 0.006, [0, 0.4, zBack - (d - 0.02) / 2]);
    p.box(f.black(), [w - 0.06, 0.008, 0.01], 0.002, [0, 0.6, zBack - d + 0.012]);
    p.box(f.marble(), [w + 0.02, 0.025, d], 0.004, [0, 0.82, zBack - d / 2]);
    p.lathe(f.ceramic(), [[0, 0], [0.12, 0], [0.18, 0.04], [0.2, 0.11], [0.195, 0.115], [0.17, 0.06], [0.1, 0.03], [0, 0.03]], [0, 0.845, zBack - d / 2 + 0.02], [0, 0, 0], 40, { scale: [1.15, 1, 0.9] });
    p.tube(f.chrome(), [[0, 0.845, zBack - 0.05], [0, 1.12, zBack - 0.05], [0, 1.12, zBack - 0.17], [0, 1.08, zBack - 0.17]], 0.011, { corner: 0.05 });
    if (params.mirror !== false) {
      const mw = Math.min(0.8, w);
      p.extrude(f.mirror(), roundedRect(p.T, mw, 0.9, 0.05), 0.012, 0.002, [0, 1.62, zBack - 0.03]);
      p.extrude(f.led(), roundedRect(p.T, mw - 0.06, 0.86, 0.04), 0.006, 0, [0, 1.62, zBack - 0.018]);
    }
    p.add(new p.T.TorusGeometry(0.09, 0.008, 8, 32), f.chrome(), [w / 2 + 0.15, 1.15, zBack - 0.03]);
    p.box(f.fabric('#e8e1d4'), [0.16, 0.26, 0.04], 0.015, [w / 2 + 0.15, 0.92, zBack - 0.035]);
    return p.build('bath.vanity');
  }
});

registerKit('bath.wc', {
  footprint: [0.38, 0.56],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const zBack = 0.28;
    const china = f.ceramic();
    p.lathe(china, [[0, 0.03], [0.16, 0.03], [0.19, 0.12], [0.185, 0.22], [0.17, 0.23], [0.15, 0.2], [0, 0.12]], [0, 0.18, 0.02], [0, 0, 0], 36, { scale: [1, 1, 1.4] });
    p.box(china, [0.36, 0.18, 0.18], 0.06, [0, 0.22, zBack - 0.09]);
    p.lathe(f.ceramic('#f7f6f2'), [[0.13, 0], [0.185, 0], [0.19, 0.012], [0.18, 0.024], [0.13, 0.024], [0.125, 0.012]], [0, 0.415, 0.02], [0, 0, 0], 36, { scale: [1, 1, 1.4] });
    p.box(f.ceramic('#f7f6f2'), [0.36, 0.03, 0.08], 0.012, [0, 0.415, zBack - 0.06]);
    p.box(f.chrome(), [0.22, 0.15, 0.008], 0.004, [0, 1.0, zBack - 0.004]);
    p.box(f.chrome(), [0.1, 0.1, 0.012], 0.006, [-0.1, 0.42, zBack - 0.006]);
    return p.build('bath.wc');
  }
});

registerKit('bath.shower', {
  footprint: [0.9, 0.9],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const s = params.size ?? 0.9;
    p.box(f.porcelain('#6c6862'), [s, 0.02, s], 0.004, [0, 0, 0]);
    p.box(f.steel(), [0.6, 0.004, 0.06], 0.002, [0, 0.02, s / 2 - 0.12]);
    p.box(f.glass(), [s * 0.7, 2.0, 0.01], 0.002, [-s * 0.15, 0.02, -s / 2 + 0.005]);
    p.box(f.chrome(), [0.02, 2.0, 0.03], 0.005, [-s / 2, 0.02, -s / 2 + 0.005]);
    p.tube(f.chrome(), [[s * 0.2, 2.0, -s / 2 + 0.005], [s * 0.2, 2.0, s / 2]], 0.01);
    p.tube(f.chrome(), [[0, 2.25, s / 2], [0, 2.25, s / 2 - 0.3]], 0.012);
    p.box(f.chrome(), [0.3, 0.012, 0.3], 0.004, [0, 2.225, s / 2 - 0.42]);
    p.cyl(f.chrome(), 0.07, 0.07, 0.012, [0, 1.1, s / 2 - 0.006], [Math.PI / 2, 0, 0], 28);
    p.box(f.chrome(), [0.02, 0.02, 0.07], 0.006, [0, 1.11, s / 2 - 0.045]);
    return p.build('bath.shower');
  }
});
