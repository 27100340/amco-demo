/**
 * Opening infill kits: doors, windows, shutters, shopfronts, curtain wall and garage door.
 * Contract: params `{ width, height, thickness, role }`; the local origin is the bottom centre
 * of the opening on the wall mid-plane, x runs along the wall, y up and z across the thickness.
 * Infills stay inside width × height × thickness; architraves and trims may stand up to 2 cm
 * proud of each face and overlap the reveal edge by up to 2 cm.
 */
import { registerKit } from './index.js';
import { start, corrugated } from './parts.js';

/** How far trims may stand proud of the wall face or overlap the opening edge (m). */
const PROUD = 0.018;

/**
 * Reads the opening contract with sensible defaults.
 * @param {object} params kit parameters
 * @param {number} w default width
 * @param {number} h default height
 * @returns {{ w: number, h: number, t: number, role: string }} opening size
 */
function size(params, w, h) {
  return { w: params.width ?? w, h: params.height ?? h, t: params.thickness ?? 0.23, role: params.role || 'exterior' };
}

/**
 * A lining frame round the reveal (two jambs and a head) with architraves on both faces.
 * @param {import('./parts.js').Parts} p collector
 * @param {import('three').Material} mat frame material
 * @param {number} w opening width
 * @param {number} h opening height
 * @param {number} t wall thickness
 * @param {number} jamb jamb width inside the opening
 */
function lining(p, mat, w, h, t, jamb) {
  p.box(mat, [jamb, h, t], 0.003, [-w / 2 + jamb / 2, 0, 0]);
  p.box(mat, [jamb, h, t], 0.003, [w / 2 - jamb / 2, 0, 0]);
  p.box(mat, [w, jamb, t], 0.003, [0, h - jamb, 0]);
  const arch = jamb + PROUD;
  for (const sz of [-1, 1]) {
    const z = sz * (t / 2 + 0.008);
    p.box(mat, [arch, h, 0.016], 0.004, [-w / 2 + arch / 2 - PROUD, 0, z]);
    p.box(mat, [arch, h, 0.016], 0.004, [w / 2 - arch / 2 + PROUD, 0, z]);
    p.box(mat, [w + 2 * PROUD, arch, 0.016], 0.004, [0, h - arch + PROUD, z]);
  }
}

/**
 * Lever handles on both faces plus hinges.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {number} hx handle x (lock side)
 * @param {number} hingeX hinge x
 * @param {number} leafT leaf thickness
 * @param {number} leafH leaf height
 */
function ironmongery(p, f, hx, hingeX, leafT, leafH) {
  const metal = f.steel();
  const toward = Math.sign(hingeX - hx);
  for (const sz of [-1, 1]) {
    const z = sz * (leafT / 2);
    p.cyl(metal, 0.026, 0.026, 0.008, [hx, 1.0, z], [sz * Math.PI / 2, 0, 0], 20);
    p.tube(metal, [[hx, 1.0, z + sz * 0.008], [hx, 1.0, z + sz * 0.055], [hx + toward * 0.13, 1.0, z + sz * 0.055]], 0.009, { corner: 0.02 });
  }
  for (const y of [0.2, leafH / 2, leafH - 0.25]) p.cyl(metal, 0.008, 0.008, 0.1, [hingeX, y, 0], [0, 0, 0], 10);
}

/**
 * A door leaf with shallow raised rails and stiles on both faces.
 * @param {import('./parts.js').Parts} p collector
 * @param {import('three').Material} mat leaf material
 * @param {number} x leaf centre
 * @param {number} lw leaf width
 * @param {number} lh leaf height
 * @param {number} lt leaf thickness
 * @param {'shaker'|'grooved'} style face style
 */
function leaf(p, mat, x, lw, lh, lt, style) {
  const y0 = 0.008;
  p.box(mat, [lw, lh, lt], 0.004, [x, y0, 0]);
  for (const sz of [-1, 1]) {
    const z = sz * (lt / 2 + 0.0015);
    if (style === 'grooved') {
      for (let y = 0.35; y < lh - 0.2; y += 0.3) p.box(p.ctx.mat('metal-black'), [lw - 0.12, 0.006, 0.004], 0.001, [x, y0 + y, z - sz * 0.0015]);
      continue;
    }
    const b = 0.11;
    p.box(mat, [b, lh - 0.02, 0.006], 0.002, [x - lw / 2 + b / 2 + 0.01, y0 + 0.01, z]);
    p.box(mat, [b, lh - 0.02, 0.006], 0.002, [x + lw / 2 - b / 2 - 0.01, y0 + 0.01, z]);
    for (const y of [0.01, lh * 0.48, lh - b - 0.01]) p.box(mat, [lw - 2 * b - 0.02, b, 0.006], 0.002, [x, y0 + y, z]);
  }
}

registerKit('door.panel', {
  footprint: [0.9, 0.12],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const { w, h, t } = size(params, 0.9, 2.1);
    const finish = params.finish === 'walnut' ? f.walnut() : f.lacquer(params.color || '#f1eee8', 0.5);
    const frame = params.finish === 'walnut' ? f.walnut() : f.lacquer(params.color || '#f1eee8', 0.5);
    const jamb = 0.04;
    lining(p, frame, w, h, t, jamb);
    const lw = w - 2 * jamb - 0.006;
    const lh = h - jamb - 0.012;
    const lt = Math.min(0.04, t - 0.02);
    leaf(p, finish, 0, lw, lh, lt, 'shaker');
    ironmongery(p, f, lw / 2 - 0.07, -lw / 2 + 0.01, lt, lh);
    return p.build('door.panel');
  }
});

registerKit('door.main', {
  footprint: [1.2, 0.25],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const { w, h, t } = size(params, 1.2, 2.4);
    const wood = f.walnut();
    const jamb = 0.06;
    lining(p, f.black(), w, h, t, jamb);
    const lt = Math.min(0.055, t - 0.02);
    const inner = w - 2 * jamb - 0.006;
    const lh = h - jamb - 0.012;
    const leaves = w >= 1.5 ? [[inner * 0.6, -inner / 2 + inner * 0.3], [inner * 0.4 - 0.004, inner / 2 - inner * 0.2]] : [[inner, 0]];
    leaves.forEach(([lw, x], i) => {
      leaf(p, wood, x, lw, lh, lt, 'grooved');
      if (i === 0) {
        const hx = x + lw / 2 - 0.1;
        for (const sz of [-1, 1]) {
          const z = sz * (lt / 2);
          p.tube(f.black(), [[hx, 0.6, z], [hx, 0.6, z + sz * 0.06], [hx, 1.8, z + sz * 0.06], [hx, 1.8, z]], 0.014, { corner: 0.03 });
        }
        p.box(f.black(), [0.07, 0.16, 0.012], 0.006, [hx - 0.09, 1.0, -lt / 2 - 0.006]);
        for (const y of [0.25, lh / 2, lh - 0.3]) p.cyl(f.black(), 0.009, 0.009, 0.12, [x - lw / 2 + 0.01, y, 0], [0, 0, 0], 10);
      }
    });
    return p.build('door.main');
  }
});

registerKit('door.glass', {
  footprint: [0.9, 0.1],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const { w, h } = size(params, 0.9, 2.4);
    const glass = f.glass();
    const steel = f.steel();
    const leafH = Math.min(h - 0.01, 2.2);
    const leaves = w >= 1.4 ? 2 : 1;
    const lw = (w - 0.01 * (leaves + 1)) / leaves;
    for (let i = 0; i < leaves; i++) {
      const x = -w / 2 + 0.01 + lw / 2 + i * (lw + 0.01);
      const hinge = leaves === 2 ? (i === 0 ? -1 : 1) : -1;
      p.box(glass, [lw, leafH - 0.01, 0.012], 0.002, [x, 0.01, 0]);
      for (const y of [0.01, leafH - 0.12]) p.box(steel, [0.2, 0.11, 0.03], 0.004, [x + hinge * (lw / 2 - 0.1), y, 0]);
      const hx = x - hinge * (lw / 2 - 0.1);
      for (const sz of [-1, 1]) {
        const z = sz * 0.006;
        p.tube(steel, [[hx, 0.7, z], [hx, 0.7, z + sz * 0.06], [hx, 1.5, z + sz * 0.06], [hx, 1.5, z]], 0.012, { corner: 0.03 });
      }
    }
    if (h - leafH > 0.08) {
      p.box(f.aluminium(), [w, 0.04, 0.05], 0.004, [0, leafH, 0]);
      p.box(glass, [w - 0.01, h - leafH - 0.04, 0.012], 0.002, [0, leafH + 0.04, 0]);
    }
    return p.build('door.glass');
  }
});

/**
 * A glazed aluminium sash: frame with glass, centred on (x, y0..y0+h) at depth z.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {number} x centre x
 * @param {number} y0 bottom
 * @param {number} w width
 * @param {number} h height
 * @param {number} z depth position
 * @param {number} b profile width
 * @param {number} d profile depth
 */
function sash(p, f, x, y0, w, h, z, b, d) {
  const al = f.aluminium();
  p.box(al, [w, b, d], 0.004, [x, y0, z]);
  p.box(al, [w, b, d], 0.004, [x, y0 + h - b, z]);
  p.box(al, [b, h - 2 * b, d], 0.004, [x - w / 2 + b / 2, y0 + b, z]);
  p.box(al, [b, h - 2 * b, d], 0.004, [x + w / 2 - b / 2, y0 + b, z]);
  p.box(f.glass(), [w - 2 * b + 0.01, h - 2 * b + 0.01, 0.008], 0.001, [x, y0 + b - 0.005, z]);
}

registerKit('door.glass-slider', {
  footprint: [2.4, 0.15],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const { w, h } = size(params, 2.4, 2.4);
    const al = f.aluminium();
    const fb = 0.05;
    const depth = 0.12;
    p.box(al, [w, fb, depth], 0.004, [0, 0, 0]);
    p.box(al, [w, fb, depth], 0.004, [0, h - fb, 0]);
    p.box(al, [fb, h - 2 * fb, depth], 0.004, [-w / 2 + fb / 2, fb, 0]);
    p.box(al, [fb, h - 2 * fb, depth], 0.004, [w / 2 - fb / 2, fb, 0]);
    const panels = w > 3.2 ? 4 : w > 2.6 ? 3 : 2;
    const inner = w - 2 * fb;
    const pw = inner / panels + 0.04;
    for (let i = 0; i < panels; i++) {
      const x = -inner / 2 + (inner / panels) * (i + 0.5);
      const z = i % 2 === 0 ? -0.028 : 0.028;
      sash(p, f, x, fb, pw, h - 2 * fb, z, 0.06, 0.045);
      const hx = x + (i % 2 === 0 ? pw / 2 - 0.03 : -pw / 2 + 0.03);
      p.box(f.aluminium(), [0.02, 0.3, 0.02], 0.006, [hx, 0.95, z - Math.sign(z) * 0.032]);
    }
    return p.build('door.glass-slider');
  }
});

/**
 * Builds an aluminium window: outer frame, mullions, an optional top light and glazed sashes.
 * @param {object} ctx kit context
 * @param {object} params opening contract
 * @param {boolean} opening whether sashes open (casement handles and sash frames)
 * @param {string} name kit id
 * @returns {import('three').Group} the window
 */
function aluminiumWindow(ctx, params, opening, name) {
  const { p, f } = start(ctx);
  const { w, h, t } = size(params, 1.5, 1.5);
  const al = f.aluminium();
  const b = 0.05;
  const d = Math.min(0.08, t - 0.02);
  const z = 0;
  p.box(al, [w, b, d], 0.004, [0, 0, z]);
  p.box(al, [w, b, d], 0.004, [0, h - b, z]);
  p.box(al, [b, h - 2 * b, d], 0.004, [-w / 2 + b / 2, b, z]);
  p.box(al, [b, h - 2 * b, d], 0.004, [w / 2 - b / 2, b, z]);
  const cols = opening ? (w >= 2.0 ? 3 : w >= 1.0 ? 2 : 1) : Math.max(1, Math.round(w / 1.5));
  const top = h > 1.7 ? 0.45 : 0;
  const inner = w - 2 * b;
  const cw = inner / cols;
  for (let i = 1; i < cols; i++) p.box(al, [b, h - 2 * b, d], 0.004, [-inner / 2 + cw * i, b, z]);
  if (top) {
    p.box(al, [inner, b, d], 0.004, [0, h - b - top, z]);
    p.box(f.glass(), [inner, top - b + 0.01, 0.008], 0.001, [0, h - b - top + b - 0.005, z]);
  }
  const sashH = h - 2 * b - (top ? top : 0);
  for (let i = 0; i < cols; i++) {
    const x = -inner / 2 + cw * (i + 0.5);
    if (opening) {
      sash(p, f, x, b, cw - (i > 0 ? b / 2 : 0) - (i < cols - 1 ? b / 2 : 0), sashH, z - 0.005, 0.045, d - 0.01);
      const side = i % 2 === 0 ? 1 : -1;
      p.box(f.aluminium(), [0.022, 0.12, 0.018], 0.006, [x + side * (cw / 2 - 0.07), b + sashH * 0.45, z + d / 2 + 0.006]);
    } else {
      p.box(f.glass(), [cw - b + 0.01, sashH + 0.01, 0.008], 0.001, [x, b - 0.005, z]);
    }
  }
  p.box(f.marble('#e7e3dc'), [w + 0.02, 0.025, t / 2 + PROUD - d / 2], 0.004, [0, -0.012, -(d / 2 + (t / 2 + PROUD - d / 2) / 2)]);
  return p.build(name);
}

registerKit('window.casement', {
  footprint: [1.5, 0.1],
  build: (params, ctx) => aluminiumWindow(ctx, params, true, 'window.casement')
});

registerKit('window.fixed', {
  footprint: [1.2, 0.1],
  build: (params, ctx) => aluminiumWindow(ctx, params, false, 'window.fixed')
});

/**
 * A rolling shutter: guides, a closed head box and a corrugated curtain down to `open`.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {number} w opening width
 * @param {number} h opening height
 * @param {number} t wall thickness
 * @param {number} drop how far the curtain comes down from the box (0 = rolled up)
 * @param {number} z curtain depth position
 */
function rollingShutter(p, f, w, h, t, drop, z) {
  const box = 0.3;
  const al = f.aluminium();
  p.box(al, [w, box, Math.min(t, 0.28)], 0.01, [0, h - box, 0]);
  for (const sx of [-1, 1]) p.box(al, [0.05, h - box, 0.07], 0.004, [sx * (w / 2 - 0.025), 0, z]);
  if (drop <= 0.01) return;
  const sheet = corrugated(p.T, w - 0.06, drop, 0.075, 0.012);
  p.add(sheet, f.steel(), [0, h - box - drop, z], [0, 0, 0]);
  p.add(sheet, f.steel(), [0, h - box - drop, z], [0, Math.PI, 0]);
  p.box(al, [w - 0.06, 0.05, 0.05], 0.006, [0, h - box - drop, z]);
  p.box(f.black(), [0.12, 0.03, 0.02], 0.006, [0, h - box - drop + 0.12, z - 0.035]);
}

registerKit('shutter.rolling', {
  footprint: [3, 0.25],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const { w, h, t } = size(params, 3, 2.7);
    rollingShutter(p, f, w, h, t, h - 0.3, 0);
    return p.build('shutter.rolling');
  }
});

registerKit('shopfront.glass', {
  footprint: [4.8, 0.25],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const { w, h, t } = size(params, 4.8, 3.3);
    const glass = f.glass();
    const al = f.aluminium();
    const steel = f.steel();
    rollingShutter(p, f, w, h, t, 0, -t / 2 + 0.05);
    const top = h - 0.3;
    const zg = 0.02;
    const inner = w - 0.12;
    p.box(al, [inner, 0.05, 0.06], 0.004, [0, 0, zg]);
    p.box(al, [inner, 0.06, 0.06], 0.004, [0, top - 0.06, zg]);
    const doorW = Math.min(1.8, inner * 0.4);
    const doorH = Math.min(2.4, top - 0.4);
    const doorX = params.door === 'left' ? -inner / 2 + doorW / 2 + 0.6 : 0;
    p.box(al, [doorW + 0.04, 0.05, 0.06], 0.004, [doorX, doorH, zg]);
    p.box(glass, [doorW, top - 0.06 - doorH - 0.05, 0.012], 0.002, [doorX, doorH + 0.05, zg]);
    for (const s of [-1, 1]) {
      const lx = doorX + s * doorW / 4;
      p.box(glass, [doorW / 2 - 0.006, doorH - 0.02, 0.012], 0.002, [lx, 0.01, zg]);
      for (const y of [0.01, doorH - 0.11]) p.box(steel, [0.18, 0.1, 0.03], 0.004, [lx - s * (doorW / 4 - 0.1), y, zg]);
      const hx = doorX + s * 0.08;
      for (const sz of [-1, 1]) p.tube(steel, [[hx, 0.6, zg + sz * 0.006], [hx, 0.6, zg + sz * 0.06], [hx, 1.8, zg + sz * 0.06], [hx, 1.8, zg + sz * 0.006]], 0.014, { corner: 0.03 });
    }
    const left = doorX - doorW / 2 - 0.02 - (-inner / 2);
    const right = inner / 2 - (doorX + doorW / 2 + 0.02);
    for (const [x0, len] of [[-inner / 2, left], [doorX + doorW / 2 + 0.02, right]]) {
      if (len < 0.1) continue;
      const panes = Math.max(1, Math.round(len / 1.3));
      const pw = len / panes;
      for (let i = 0; i < panes; i++) {
        const x = x0 + pw * (i + 0.5);
        p.box(f.black(), [pw - 0.004, 0.15, 0.08], 0.004, [x, 0.05, zg]);
        p.box(glass, [pw - 0.006, top - 0.06 - 0.2, 0.012], 0.002, [x, 0.2, zg]);
      }
    }
    return p.build('shopfront.glass');
  }
});

registerKit('curtainwall', {
  footprint: [6, 0.2],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const { w, h, t } = size(params, 6, 3.4);
    const al = f.aluminium();
    const glass = p.ctx.mat('glass', { color: params.tint || '#b4c6cc' });
    const spandrel = f.lacquer('#2b3237', 0.12);
    const d = Math.min(0.16, t);
    const b = 0.06;
    const bays = Math.max(1, Math.round(w / 1.5));
    const bw = w / bays;
    const transom = h > 2.9 ? h - 0.55 : null;
    p.box(al, [w, b, d], 0.004, [0, 0, 0]);
    p.box(al, [w, b, d], 0.004, [0, h - b, 0]);
    if (transom) p.box(al, [w, b, d], 0.004, [0, transom, 0]);
    for (let i = 0; i <= bays; i++) {
      const x = Math.min(w / 2 - b / 2, Math.max(-w / 2 + b / 2, -w / 2 + i * bw));
      p.box(al, [b, h - 2 * b, d], 0.004, [x, b, 0]);
      p.box(al, [0.05, h - 2 * b, 0.03], 0.006, [x, b, -d / 2 - 0.012]);
    }
    for (let i = 0; i < bays; i++) {
      const x = -w / 2 + bw * (i + 0.5);
      const visionTop = transom ?? h - b;
      p.box(glass, [bw - b + 0.01, visionTop - b + 0.01, 0.012], 0.001, [x, b - 0.005, -0.02]);
      if (transom) p.box(spandrel, [bw - b + 0.01, h - b - transom - b + 0.01, 0.012], 0.002, [x, transom + b - 0.005, -0.02]);
    }
    return p.build('curtainwall');
  }
});

registerKit('garage.door', {
  footprint: [2.7, 0.15],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const { w, h } = size(params, 2.7, 2.3);
    const panel = params.finish === 'walnut' ? f.walnut() : f.lacquer(params.color || '#e9e7e2', 0.45);
    const trim = f.aluminium();
    for (const sx of [-1, 1]) p.box(trim, [0.06, h, 0.1], 0.006, [sx * (w / 2 - 0.03), 0, 0]);
    p.box(trim, [w, 0.08, 0.1], 0.006, [0, h - 0.08, 0]);
    const rows = Math.max(3, Math.round((h - 0.08) / 0.55));
    const rh = (h - 0.08) / rows;
    for (let r = 0; r < rows; r++) {
      p.box(panel, [w - 0.12, rh - 0.006, 0.045], 0.012, [0, r * rh + 0.003, 0]);
      for (const k of [0.33, 0.66]) p.box(f.lacquer('#cfccc5', 0.5), [w - 0.16, 0.008, 0.004], 0.002, [0, r * rh + rh * k, -0.024]);
    }
    p.box(f.black(), [0.16, 0.035, 0.03], 0.01, [0, 0.45, -0.035]);
    return p.build('garage.door');
  }
});
