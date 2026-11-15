/**
 * Office kits: workstation pod, task / executive / meeting chairs, meeting table, reception
 * desk, executive desk and filing storage.
 * Front faces −Z; origin at the floor centre of the footprint.
 */
import { registerKit } from './index.js';
import { start, roundedRect } from './parts.js';
import { vase } from './decor.js';

/**
 * Turns a local point (relative to a chair or desk at x/z with yaw) into kit space.
 * @param {number} x origin x
 * @param {number} z origin z
 * @param {number} yaw rotation about Y
 * @returns {(lx: number, ly: number, lz: number) => number[]} transform
 */
function frame(x, z, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return (lx, ly, lz) => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
}

/**
 * Adds a swivel office chair. Variants: 'task' (mesh-look fabric, black base), 'meeting'
 * (mid back, chrome four-star base) and 'executive' (high-back leather, chrome base).
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {'task'|'meeting'|'executive'} variant chair type
 * @param {object} params { color }
 * @param {number} x position x
 * @param {number} z position z
 * @param {number} yaw rotation (0 faces −Z)
 */
export function officeChair(p, f, variant, params, x, z, yaw) {
  const at = frame(x, z, yaw);
  const exec = variant === 'executive';
  const meeting = variant === 'meeting';
  const base = exec || meeting ? f.chrome() : f.black();
  const cover = exec ? f.leather(params.color || '#2a211c') : meeting ? f.fabric(params.color || '#5b6168') : f.fabric(params.color || '#2e3034');
  const legs = meeting ? 4 : 5;
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2 + 0.3;
    const reach = 0.3;
    p.box(base, [reach, 0.03, 0.045], 0.012, at(Math.cos(a) * reach * 0.5, 0.075, -Math.sin(a) * reach * 0.5), [0, yaw + a, -0.06]);
    if (!meeting) p.cyl(f.rubber(), 0.025, 0.025, 0.03, at(Math.cos(a) * reach, 0.0, -Math.sin(a) * reach), [0, 0, 0], 14);
    else p.cyl(f.rubber(), 0.018, 0.022, 0.06, at(Math.cos(a) * reach, 0.0, -Math.sin(a) * reach), [0, 0, 0], 12);
  }
  p.cyl(base, 0.04, 0.05, 0.05, at(0, 0.07, 0), [0, 0, 0], 20);
  p.cyl(f.chrome(), 0.016, 0.016, 0.26, at(0, 0.12, 0), [0, 0, 0], 14);
  p.cyl(f.black(), 0.028, 0.028, 0.16, at(0, 0.12, 0), [0, 0, 0], 16);
  const seatY = exec ? 0.43 : 0.42;
  p.box(f.black(), [0.36, 0.05, 0.36], 0.015, at(0, seatY - 0.045, 0), [0, yaw, 0]);
  p.cushion(cover, [0.5, exec ? 0.1 : 0.075, 0.48], 0.035, at(0, seatY, -0.01), [0, yaw, 0], { crown: 0.01, sag: 0.006, bulge: 0.006 });
  const backH = exec ? 0.75 : meeting ? 0.45 : 0.56;
  const backY = seatY + (exec ? 0.12 : 0.15);
  p.box(f.black(), [0.07, backY - seatY + 0.08, 0.03], 0.01, at(0, seatY - 0.02, 0.27), [0, yaw, 0]);
  p.cushion(cover, [exec ? 0.52 : 0.46, backH, exec ? 0.09 : 0.05], 0.035, at(0, backY, 0.26), [0.16, yaw, 0], { crown: exec ? 0.015 : 0.006, bulge: 0.006 });
  if (!exec && !meeting) p.box(f.black(), [0.46, 0.06, 0.03], 0.012, at(0, backY + 0.08, 0.3), [0.16, yaw, 0]);
  for (const sx of [-1, 1]) {
    const ax = sx * (exec ? 0.29 : 0.27);
    if (meeting || exec) {
      p.tube(f.chrome(), [at(ax, seatY + 0.01, 0.12), at(ax, seatY + 0.22, 0.12), at(ax, seatY + 0.22, -0.16), at(ax, seatY + 0.01, -0.12)], 0.011, { corner: 0.05 });
      p.box(cover, [0.06, 0.025, 0.24], 0.01, at(ax, seatY + 0.215, -0.02), [0, yaw, 0]);
    } else {
      p.box(f.black(), [0.03, 0.2, 0.05], 0.01, at(ax, seatY + 0.01, 0.04), [0, yaw, 0]);
      p.box(f.black(), [0.075, 0.03, 0.25], 0.012, at(ax, seatY + 0.2, 0.0), [0, yaw, 0]);
    }
  }
}

registerKit('chair.task', {
  footprint: [0.65, 0.65],
  build(params, ctx) {
    const { p, f } = start(ctx);
    officeChair(p, f, 'task', params, 0, 0, 0);
    return p.build('chair.task');
  }
});

registerKit('chair.meeting', {
  footprint: [0.62, 0.62],
  build(params, ctx) {
    const { p, f } = start(ctx);
    officeChair(p, f, 'meeting', params, 0, 0, 0);
    return p.build('chair.meeting');
  }
});

registerKit('chair.executive', {
  footprint: [0.68, 0.68],
  build(params, ctx) {
    const { p, f } = start(ctx);
    officeChair(p, f, 'executive', params, 0, 0, 0);
    return p.build('chair.executive');
  }
});

/**
 * Adds a monitor on a stand facing −Z in its local frame.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {(lx: number, ly: number, lz: number) => number[]} at local frame
 * @param {number} yaw frame rotation
 * @param {number} y desk top height
 * @param {number} [w] panel width
 */
function monitor(p, f, at, yaw, y, w = 0.56) {
  const h = w * 0.58;
  const screen = f.lacquer('#0c0d10', 0.1);
  p.box(f.black(), [0.22, 0.012, 0.18], 0.005, at(0, y, 0.06), [0, yaw, 0]);
  p.box(f.black(), [0.04, 0.24, 0.025], 0.008, at(0, y, 0.11), [0, yaw, 0]);
  p.box(f.black(), [w, h, 0.03], 0.006, at(0, y + 0.13, 0.08), [0, yaw, 0]);
  p.box(screen, [w - 0.016, h - 0.03, 0.002], 0.001, at(0, y + 0.145, 0.064), [0, yaw, 0]);
}

/**
 * Adds keyboard, mouse and a few desk items in front of a monitor.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {(lx: number, ly: number, lz: number) => number[]} at local frame
 * @param {number} yaw frame rotation
 * @param {number} y desk top height
 * @param {number} seed variation
 */
function deskItems(p, f, at, yaw, y, seed) {
  p.box(f.lacquer('#e9e8e4', 0.5), [0.42, 0.015, 0.13], 0.005, at(0, y, -0.12), [0, yaw, 0]);
  p.box(f.lacquer('#e9e8e4', 0.4), [0.06, 0.02, 0.1], 0.01, at(0.3, y, -0.12), [0, yaw, 0]);
  if (seed % 2 === 0) p.lathe(f.ceramic(seed % 4 === 0 ? '#3d5a6b' : '#d8cfc0'), [[0, 0], [0.04, 0], [0.042, 0.1], [0.038, 0.1], [0, 0.005]], at(-0.45, y, 0.05), [0, 0, 0], 20);
  if (seed % 3 === 0) p.box(f.fabric('#2f3b4c'), [0.21, 0.015, 0.3], 0.004, at(-0.42, y, -0.12), [0, yaw + 0.2, 0]);
}

registerKit('desk.workstation-pod', {
  footprint: [2.9, 2.7],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const deskW = 1.4;
    const deskD = 0.7;
    const W = deskW * 2;
    const y = 0.72;
    const top = params.top === 'white' ? f.lacquer('#f1efea', 0.5) : f.oak();
    const steel = f.lacquer('#f4f3f0', 0.45);
    const screen = f.fabric(params.screen || '#6f7f78');
    for (const sz of [-1, 1]) p.box(top, [W, 0.025, deskD], 0.004, [0, y, sz * deskD / 2]);
    for (const lx of [-W / 2 + 0.05, 0, W / 2 - 0.05]) {
      p.tube(steel, [[lx, 0, -deskD + 0.06], [lx, y, -deskD + 0.06], [lx, y, deskD - 0.06], [lx, 0, deskD - 0.06]], 0.018, { corner: 0.03 });
      p.box(steel, [0.06, 0.012, 2 * deskD - 0.1], 0.004, [lx, 0, 0]);
    }
    p.box(steel, [W - 0.1, 0.08, 0.02], 0.006, [0, y - 0.1, 0]);
    p.box(screen, [W - 0.02, 0.42, 0.03], 0.012, [0, y + 0.025, 0]);
    p.box(f.aluminium(), [W - 0.01, 0.012, 0.035], 0.004, [0, y + 0.445, 0]);
    p.box(screen, [0.025, 0.3, deskD - 0.05], 0.01, [0, y + 0.025, -deskD / 2 - 0.01]);
    p.box(screen, [0.025, 0.3, deskD - 0.05], 0.01, [0, y + 0.025, deskD / 2 + 0.01]);
    let seed = 0;
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) {
        const yaw = sz < 0 ? 0 : Math.PI;
        const at = frame(sx * deskW / 2, sz * 0.38, yaw);
        monitor(p, f, at, yaw, y + 0.025);
        deskItems(p, f, at, yaw, y + 0.025, seed);
        p.box(steel, [0.4, 0.58, 0.55], 0.008, [sx * (deskW - 0.3), 0.03, sz * 0.36]);
        for (let k = 0; k < 3; k++) p.box(f.aluminium(), [0.14, 0.012, 0.012], 0.004, [sx * (deskW - 0.3), 0.18 + k * 0.17, sz * (0.36 + 0.285)]);
        if (params.chairs !== false) {
          const chairZ = sz * (deskD + 0.32);
          officeChair(p, f, 'task', params, sx * deskW / 2 + sx * 0.05, chairZ, sz < 0 ? Math.PI : 0);
        }
        seed += 1;
      }
    }
    return p.build('desk.workstation-pod');
  }
});

registerKit('table.meeting', {
  footprint: [3.7, 2.5],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const seats = Math.max(4, Math.round((params.seats ?? 8) / 2) * 2);
    const perSide = seats / 2;
    const L = perSide * 0.75 + 0.6;
    const D = 1.2;
    const y = 0.74;
    const wood = f.walnut();
    p.extrude(wood, roundedRect(p.T, L, D, 0.35), 0.03, 0.006, [0, y + 0.015, 0], [-Math.PI / 2, 0, 0]);
    for (const sx of [-1, 1]) p.box(f.black(), [0.08, y - 0.005, D * 0.6], 0.012, [sx * (L / 2 - 0.55), 0, 0]);
    p.box(f.black(), [L - 1.2, 0.08, 0.1], 0.01, [0, y - 0.09, 0]);
    p.box(f.aluminium(), [0.36, 0.006, 0.12], 0.003, [0, y + 0.03, 0]);
    p.lathe(f.black(), [[0, 0], [0.11, 0], [0.12, 0.01], [0.08, 0.035], [0, 0.04]], [L * 0.2, y + 0.036, 0], [0, 0, 0], 3);
    vase(p, f, { x: -L * 0.2, y: y + 0.036, z: 0, kind: 'bud', color: '#e9e4da' });
    if (params.chairs !== false) {
      for (let i = 0; i < perSide; i++) {
        const x = (i - (perSide - 1) / 2) * 0.75;
        officeChair(p, f, 'meeting', params, x, -D / 2 - 0.3, Math.PI);
        officeChair(p, f, 'meeting', params, x, D / 2 + 0.3, 0);
      }
    }
    return p.build('table.meeting');
  }
});

registerKit('desk.reception', {
  footprint: [2.6, 1.5],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const W = params.w ?? 2.6;
    const zf = -0.75;
    const solid = f.lacquer(params.color || '#efece6', 0.35);
    const slat = f.walnut();
    p.box(solid, [W, 1.08, 0.04], 0.01, [0, 0.02, zf + 0.04]);
    p.box(solid, [W + 0.04, 0.03, 0.34], 0.008, [0, 1.1, zf + 0.12]);
    const count = Math.floor((W - 0.1) / 0.055);
    for (let i = 0; i < count; i++) {
      const x = -((count - 1) * 0.055) / 2 + i * 0.055;
      p.box(slat, [0.04, 0.96, 0.025], 0.012, [x, 0.08, zf + 0.005]);
    }
    p.box(f.black(), [W - 0.02, 0.02, 0.06], 0.005, [0, 0, zf + 0.04]);
    p.box(f.led(), [W - 0.08, 0.008, 0.02], 0.003, [0, 1.088, zf + 0.0]);
    for (const sx of [-1, 1]) p.box(solid, [0.04, 1.08, 0.7], 0.008, [sx * (W / 2 - 0.02), 0.02, zf + 0.38]);
    p.box(solid, [W - 0.08, 0.03, 0.66], 0.006, [0, 0.72, zf + 0.42]);
    const at = frame(0.35, zf + 0.5, Math.PI);
    monitor(p, f, at, Math.PI, 0.75);
    deskItems(p, f, at, Math.PI, 0.75, 4);
    p.box(f.black(), [0.18, 0.06, 0.2], 0.02, [-0.5, 0.75, zf + 0.45], [0.2, 0.3, 0]);
    vase(p, f, { x: -W / 2 + 0.25, y: 1.13, z: zf + 0.12, kind: 'bud', color: '#c9bfae' });
    if (params.chair !== false) officeChair(p, f, 'task', params, 0.3, zf + 1.15, 0);
    return p.build('desk.reception');
  }
});

registerKit('desk.executive', {
  footprint: [1.9, 2.4],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const W = 1.8;
    const D = 0.85;
    const y = 0.73;
    const wood = f.walnut();
    p.box(wood, [W, 0.04, D], 0.01, [0, y, 0]);
    p.box(wood, [0.45, y, D - 0.05], 0.006, [W / 2 - 0.25, 0, 0]);
    for (let k = 0; k < 3; k++) {
      p.box(f.lacquer('#2b2622', 0.45), [0.43, 0.2, 0.012], 0.003, [W / 2 - 0.25, 0.04 + k * 0.225, D / 2 - 0.006]);
      p.box(f.brass(), [0.14, 0.01, 0.012], 0.004, [W / 2 - 0.25, 0.2 + k * 0.225, D / 2 + 0.006]);
    }
    p.box(f.black(), [0.05, y, D - 0.1], 0.008, [-W / 2 + 0.06, 0, 0]);
    p.box(wood, [W - 0.5, 0.4, 0.025], 0.005, [-0.2, 0.3, -D / 2 + 0.06]);
    p.box(f.leather('#2a211c'), [0.7, 0.004, 0.42], 0.002, [-0.15, y + 0.04, 0.12]);
    const at = frame(-0.15, 0.1, Math.PI);
    monitor(p, f, at, Math.PI, y + 0.04, 0.6);
    p.box(f.aluminium(), [0.32, 0.012, 0.22], 0.004, [0.5, y + 0.04, 0.12], [0, 0.25, 0]);
    p.cyl(f.black(), 0.035, 0.035, 0.1, [-0.7, y + 0.04, -0.2], [0, 0, 0], 16);
    p.tube(f.black(), [[0.62, y + 0.04, -0.25], [0.62, y + 0.42, -0.2], [0.45, y + 0.48, -0.1]], 0.008, { corner: 0.08 });
    p.lathe(f.black(), [[0.075, 0], [0.07, 0.01], [0.03, 0.08], [0, 0.085]], [0.45, y + 0.4, -0.1], [0, 0, 0], 20);
    p.cyl(f.black(), 0.07, 0.075, 0.015, [0.62, y + 0.04, -0.25], [0, 0, 0], 20);
    if (params.chair !== false) officeChair(p, f, 'executive', params, -0.15, D / 2 + 0.45, 0);
    if (params.visitors !== false) {
      for (const sx of [-0.45, 0.35]) officeChair(p, f, 'meeting', { color: '#7a6f63' }, sx, -D / 2 - 0.5, Math.PI);
    }
    return p.build('desk.executive');
  }
});

registerKit('storage.filing', {
  footprint: [0.8, 0.47],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const units = Math.max(1, Math.round((params.w ?? 0.8) / 0.8));
    const w = 0.8;
    const h = params.h ?? 1.02;
    const d = 0.45;
    const body = params.finish === 'walnut' ? f.walnut() : f.lacquer(params.color || '#ecebe7', 0.45);
    for (let u = 0; u < units; u++) {
      const x = (u - (units - 1) / 2) * (w + 0.004);
      p.box(f.black(), [w - 0.04, 0.05, d - 0.06], 0.003, [x, 0, 0.02]);
      p.box(body, [w, h - 0.05, d], 0.006, [x, 0.05, 0]);
      const rows = Math.max(2, Math.round((h - 0.07) / 0.32));
      const rh = (h - 0.07) / rows;
      for (let r = 0; r < rows; r++) {
        p.box(body, [w - 0.01, rh - 0.006, 0.02], 0.004, [x, 0.055 + r * rh, -d / 2 - 0.01]);
        p.box(f.aluminium(), [0.22, 0.03, 0.012], 0.006, [x, 0.055 + r * rh + rh - 0.07, -d / 2 - 0.024]);
      }
    }
    if (params.decor !== false) {
      vase(p, f, { x: -0.2, y: h, z: 0, kind: 'round', color: '#3e4a4a' });
      p.box(f.ceramic('#e2dbcf'), [0.28, 0.06, 0.22], 0.008, [0.18, h, 0]);
    }
    return p.build('storage.filing');
  }
});
