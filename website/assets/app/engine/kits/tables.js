/**
 * Table kits: coffee, side, dining set, console, plus rugs and the TV unit.
 * Front faces −Z; origin at the floor centre of the footprint.
 */
import { registerKit } from './index.js';
import { start, pictureMaterial, random } from './parts.js';
import { diningChair } from './seating.js';

/**
 * Lathe profile of a round top with a softened edge.
 * @param {number} r radius
 * @param {number} t thickness
 * @returns {number[][]} profile
 */
function discProfile(r, t) {
  const e = Math.min(0.006, t / 3);
  return [[0, 0], [r - e, 0], [r, e], [r, t - e], [r - e, t], [0, t]];
}

registerKit('table.coffee', {
  footprint: [1.2, 0.65],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = params.w ?? 1.2;
    const d = params.d ?? 0.65;
    const h = 0.4;
    const frame = params.frame === 'black' ? f.black() : f.brass();
    const top = params.top === 'walnut' ? f.walnut() : f.marble();
    p.box(top, [w, 0.025, d], 0.008, [0, h - 0.025, 0]);
    const x = w / 2 - 0.04;
    const z = d / 2 - 0.04;
    const r = 0.009;
    p.tube(frame, [[-x, h - 0.03, -z], [x, h - 0.03, -z], [x, h - 0.03, z], [-x, h - 0.03, z]], r, { closed: true, corner: 0.02 });
    for (const [lx, lz] of [[-x, -z], [x, -z], [x, z], [-x, z]]) p.tube(frame, [[lx, 0, lz], [lx, h - 0.03, lz]], r);
    p.tube(frame, [[-x, 0.12, -z], [x, 0.12, -z], [x, 0.12, z], [-x, 0.12, z]], r, { closed: true, corner: 0.02 });
    p.box(f.walnut(), [w - 0.1, 0.018, d - 0.1], 0.004, [0, 0.13, 0]);
    p.box(f.ceramic('#d9d2c5'), [0.24, 0.035, 0.17], 0.006, [w * 0.18, h, 0.03], [0, 0.2, 0]);
    p.box(f.ceramic('#3e4a52'), [0.21, 0.03, 0.15], 0.006, [w * 0.18, h + 0.035, 0.03], [0, 0.32, 0]);
    p.lathe(f.ceramic('#c8b9a4'), [[0, 0], [0.09, 0], [0.12, 0.04], [0.125, 0.06], [0.118, 0.062], [0.11, 0.045], [0, 0.03]], [-w * 0.2, h, -0.02]);
    return p.build('table.coffee');
  }
});

registerKit('table.side', {
  footprint: [0.5, 0.5],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const top = params.top === 'walnut' ? f.walnut() : f.marble();
    p.lathe(f.walnut(), [[0, 0], [0.16, 0], [0.165, 0.012], [0.12, 0.03], [0.06, 0.1], [0.05, 0.3], [0.06, 0.5], [0.09, 0.53], [0, 0.53]], [0, 0, 0]);
    p.lathe(top, discProfile(0.25, 0.025), [0, 0.53, 0], [0, 0, 0], 40);
    return p.build('table.side');
  }
});

/**
 * Adds a rectangular dining table to a collector.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {number} w length
 * @param {number} d width
 */
function diningTable(p, f, w, d) {
  const wood = f.walnut();
  p.box(wood, [w, 0.04, d], 0.012, [0, 0.72, 0]);
  p.box(wood, [w - 0.2, 0.08, d - 0.2], 0.008, [0, 0.64, 0]);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) p.box(wood, [0.065, 0.66, 0.065], 0.01, [sx * (w / 2 - 0.12), 0, sz * (d / 2 - 0.12)]);
  }
  p.box(f.fabric('#c9b79c'), [0.38, 0.004, d + 0.02], 0.002, [0, 0.76, 0]);
  p.lathe(f.ceramic('#e8e3da'), [[0, 0], [0.07, 0], [0.13, 0.05], [0.15, 0.085], [0.145, 0.09], [0.125, 0.06], [0, 0.04]], [0, 0.764, 0]);
}

registerKit('table.dining-6', {
  footprint: [1.9, 1.8],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = 1.9;
    const d = 0.95;
    diningTable(p, f, w, d);
    if (params.chairs !== false) {
      for (const x of [-0.62, 0, 0.62]) {
        diningChair(p, f, params, x, d / 2 + 0.15, 0);
        diningChair(p, f, params, x, -d / 2 - 0.15, Math.PI);
      }
    }
    return p.build('table.dining-6');
  }
});

registerKit('table.dining-4', {
  footprint: [1.4, 1.7],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = 1.4;
    const d = 0.85;
    diningTable(p, f, w, d);
    if (params.chairs !== false) {
      for (const x of [-0.34, 0.34]) {
        diningChair(p, f, params, x, d / 2 + 0.15, 0);
        diningChair(p, f, params, x, -d / 2 - 0.15, Math.PI);
      }
    }
    return p.build('table.dining-4');
  }
});

registerKit('console.table', {
  footprint: [1.2, 0.35],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = params.w ?? 1.2;
    const metal = f.brass();
    p.box(f.walnut(), [w, 0.035, 0.35], 0.008, [0, 0.765, 0]);
    p.box(f.walnut(), [w - 0.06, 0.1, 0.3], 0.006, [0, 0.665, 0.01]);
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.05);
      p.tube(metal, [[x, 0, -0.13], [x, 0.765, -0.13], [x, 0.765, 0.13], [x, 0, 0.13]], 0.009, { corner: 0.02 });
      p.tube(metal, [[x, 0.12, -0.13], [x, 0.12, 0.13]], 0.007);
    }
    p.lathe(f.ceramic('#2f3b3a'), [[0, 0], [0.05, 0], [0.08, 0.06], [0.085, 0.16], [0.05, 0.26], [0.03, 0.3], [0.035, 0.32], [0, 0.32]], [-w * 0.3, 0.8, 0]);
    p.box(f.ceramic('#d4cbbd'), [0.26, 0.04, 0.18], 0.006, [w * 0.25, 0.8, 0]);
    p.box(f.ceramic('#8c5a3c'), [0.22, 0.035, 0.16], 0.006, [w * 0.25, 0.84, 0], [0, 0.15, 0]);
    return p.build('console.table');
  }
});

/** Rug palettes by pattern. */
const RUG = {
  persian: { field: '#6f2a26', ground: '#dccfb4', border: '#27324a', gold: '#a9844d', teal: '#3f5f5a' },
  border: { field: '#cfc6b6', ground: '#e9e3d7', border: '#6f6a60', gold: '#a39a8a' },
  abstract: { field: '#d8cfc0', ground: '#ece6da', border: '#8a7f70', gold: '#b46f4c' },
  plain: { field: '#bdb3a3', ground: '#bdb3a3', border: '#bdb3a3', gold: '#bdb3a3' }
};

/**
 * Paints a rug design.
 * @param {CanvasRenderingContext2D} g context
 * @param {number} w width
 * @param {number} h height
 * @param {string} pattern persian|border|abstract|plain
 * @param {string} [colour] field colour override
 */
function drawRug(g, w, h, pattern, colour) {
  const c = { ...(RUG[pattern] || RUG.border) };
  if (colour) c.field = colour;
  g.fillStyle = pattern === 'persian' ? c.border : c.ground;
  g.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  if (pattern === 'persian') {
    drawPersian(g, w, h, c);
  } else if (pattern === 'border') {
    g.fillStyle = c.field;
    g.fillRect(m * 0.04, m * 0.04, w - m * 0.08, h - m * 0.08);
    g.strokeStyle = c.border;
    g.lineWidth = m * 0.012;
    g.strokeRect(m * 0.08, m * 0.08, w - m * 0.16, h - m * 0.16);
  } else if (pattern === 'abstract') {
    g.fillStyle = c.field;
    g.fillRect(0, 0, w, h);
    const rnd = random(11);
    const tones = ['#b9ad9b', '#8f8577', '#c58a68', '#e6dfd2', '#6d756b'];
    for (let i = 0; i < 9; i++) {
      g.fillStyle = tones[i % tones.length];
      g.globalAlpha = 0.55;
      g.beginPath();
      const x = rnd() * w;
      const y = rnd() * h;
      g.ellipse(x, y, m * (0.12 + rnd() * 0.25), m * (0.06 + rnd() * 0.14), rnd() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  const rnd = random(3);
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 26;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n));
  }
  g.putImageData(img, 0, 0);
}

/**
 * Draws a small eight-petal rosette.
 * @param {CanvasRenderingContext2D} g context
 * @param {number} x centre x
 * @param {number} y centre y
 * @param {number} r radius
 * @param {string} petal petal colour
 * @param {string} heart centre colour
 */
function rosette(g, x, y, r, petal, heart) {
  g.fillStyle = petal;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    g.beginPath();
    g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.42, r * 0.2, a, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = heart;
  g.beginPath();
  g.arc(x, y, r * 0.28, 0, Math.PI * 2);
  g.fill();
}

/**
 * Draws a scalloped lozenge (medallion layer) centred on (x, y).
 * @param {CanvasRenderingContext2D} g context
 * @param {number} x centre x
 * @param {number} y centre y
 * @param {number} rx half width
 * @param {number} ry half height
 * @param {string} fill colour
 */
function lozenge(g, x, y, rx, ry, fill) {
  g.fillStyle = fill;
  g.beginPath();
  const n = 64;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2;
    const diamond = 1 / (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a)));
    const scallop = 1 + 0.06 * Math.cos(a * 16);
    g.lineTo(x + Math.cos(a) * rx * diamond * scallop, y + Math.sin(a) * ry * diamond * scallop);
  }
  g.fill();
}

/**
 * Paints a traditional Persian-style carpet: guard stripes, a rosette border, a lattice field,
 * a layered central medallion and corner spandrels, in muted madder, indigo and ivory.
 * @param {CanvasRenderingContext2D} g context
 * @param {number} w width
 * @param {number} h height
 * @param {{ field: string, ground: string, border: string, gold: string, teal: string }} c palette
 */
function drawPersian(g, w, h, c) {
  const m = Math.min(w, h);
  g.fillStyle = c.border;
  g.fillRect(0, 0, w, h);
  g.lineWidth = m * 0.006;
  for (const [inset, colour] of [[0.022, c.ground], [0.04, c.gold], [0.128, c.gold], [0.142, c.ground]]) {
    g.strokeStyle = colour;
    g.strokeRect(m * inset, m * inset, w - 2 * m * inset, h - 2 * m * inset);
  }
  const band = m * 0.084;
  const step = m * 0.075;
  for (let x = band + step / 2; x < w - band; x += step) {
    rosette(g, x, band, m * 0.024, x % (2 * step) < step ? c.ground : c.gold, c.field);
    rosette(g, x, h - band, m * 0.024, x % (2 * step) < step ? c.ground : c.gold, c.field);
  }
  for (let y = band + step / 2; y < h - band; y += step) {
    rosette(g, band, y, m * 0.024, c.gold, c.field);
    rosette(g, w - band, y, m * 0.024, c.gold, c.field);
  }
  const fx = m * 0.15;
  g.fillStyle = c.field;
  g.fillRect(fx, fx, w - 2 * fx, h - 2 * fx);
  g.save();
  g.beginPath();
  g.rect(fx, fx, w - 2 * fx, h - 2 * fx);
  g.clip();
  g.strokeStyle = 'rgba(40, 12, 10, 0.35)';
  g.lineWidth = m * 0.004;
  const cell = m * 0.1;
  for (let d = -h; d < w + h; d += cell) {
    g.beginPath();
    g.moveTo(d, 0);
    g.lineTo(d + h, h);
    g.moveTo(d, h);
    g.lineTo(d + h, 0);
    g.stroke();
  }
  for (let y = fx + cell / 2; y < h - fx; y += cell) {
    for (let x = fx + cell / 2; x < w - fx; x += cell) {
      const tone = ((x + y) / cell) % 3 < 1 ? c.gold : ((x + y) / cell) % 3 < 2 ? c.ground : c.teal;
      rosette(g, x, y, m * 0.014, tone, c.border);
    }
  }
  for (const [x, y] of [[fx, fx], [w - fx, fx], [fx, h - fx], [w - fx, h - fx]]) {
    lozenge(g, x, y, m * 0.2, m * 0.2, c.ground);
    lozenge(g, x, y, m * 0.17, m * 0.17, c.border);
    lozenge(g, x, y, m * 0.1, m * 0.1, c.gold);
  }
  g.restore();
  const cx = w / 2;
  const cy = h / 2;
  const rx = (w - 2 * fx) * 0.26;
  const ry = (h - 2 * fx) * 0.3;
  for (const [k, colour] of [[1, c.ground], [0.86, c.border], [0.66, c.field], [0.5, c.gold], [0.34, c.teal], [0.2, c.ground]]) {
    lozenge(g, cx, cy, rx * k, ry * k, colour);
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    rosette(g, cx + Math.cos(a) * rx * 0.58, cy + Math.sin(a) * ry * 0.58, m * 0.02, c.ground, c.field);
  }
  rosette(g, cx, cy, m * 0.035, c.field, c.gold);
}

registerKit('rug.rect', {
  footprint: [2.4, 1.7],
  build(params, ctx) {
    const { p } = start(ctx);
    const w = params.w ?? 2.4;
    const d = params.d ?? 1.7;
    const pattern = params.pattern || params.material || 'border';
    const px = ctx.quality === 'low' ? 512 : 1024;
    const ph = Math.max(64, Math.round((px * d) / w));
    const mat = pictureMaterial(ctx, `rug:${pattern}:${params.color || ''}:${w}x${d}`, px, ph, (g, cw, ch) => drawRug(g, cw, ch, pattern, params.color), { roughness: 1 });
    p.box(mat, [w, 0.012, d], 0.004, [0, 0, 0], [0, 0, 0], { uv: 'keep' });
    return p.build('rug.rect');
  }
});

registerKit('tv.unit', {
  footprint: [1.8, 0.45],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = params.w ?? 1.8;
    const d = 0.42;
    const z = 0.225 - d / 2;
    const front = f.lacquer(params.color || '#e7e1d6', 0.5);
    legs(p, f, w, d, z);
    p.box(f.walnut(), [w, 0.03, d], 0.006, [0, 0.42, z]);
    p.box(f.walnut(), [w, 0.03, d], 0.006, [0, 0.1, z]);
    for (const sx of [-1, 1]) p.box(f.walnut(), [0.03, 0.3, d], 0.006, [sx * (w / 2 - 0.015), 0.12, z]);
    const n = 3;
    const doorW = (w - 0.06) / n;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.03 + doorW * (i + 0.5);
      p.box(front, [doorW - 0.004, 0.29, 0.02], 0.004, [x, 0.13, z - d / 2 + 0.01]);
      p.box(f.brass(), [0.12, 0.01, 0.012], 0.004, [x, 0.38, z - d / 2 - 0.004]);
    }
    p.box(f.black(), [0.95, 0.06, 0.09], 0.02, [0, 0.45, z + 0.05]);
    p.lathe(f.ceramic('#c9bfae'), [[0, 0], [0.05, 0], [0.075, 0.08], [0.07, 0.2], [0.04, 0.27], [0.045, 0.3], [0, 0.3]], [w * 0.36, 0.45, z]);
    p.box(f.ceramic('#9a8a73'), [0.22, 0.04, 0.16], 0.006, [-w * 0.34, 0.45, z]);
    p.box(f.ceramic('#3b4650'), [0.2, 0.035, 0.15], 0.006, [-w * 0.34, 0.49, z], [0, 0.2, 0]);
    if (params.tv !== false) {
      const screen = f.lacquer('#08090b', 0.12);
      const tw = 1.45;
      const th = 0.84;
      p.box(f.black(), [tw + 0.012, th + 0.012, 0.028], 0.004, [0, 1.25 - th / 2, 0.2]);
      p.box(screen, [tw, th, 0.004], 0.001, [0, 1.25 - th / 2 + 0.006, 0.184]);
    }
    return p.build('tv.unit');
  }
});

/**
 * Four short black legs under a cabinet.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {number} w cabinet width
 * @param {number} d cabinet depth
 * @param {number} z cabinet centre z
 */
function legs(p, f, w, d, z) {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) p.cyl(f.black(), 0.014, 0.011, 0.1, [sx * (w / 2 - 0.08), 0, z + sz * (d / 2 - 0.06)], [0, 0, 0], 12);
  }
}
