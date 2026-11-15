/**
 * Bedroom kits: king and single beds with draped bedding, and the nightstand.
 * Front (the foot of the bed) faces −Z; origin at the floor centre of the footprint.
 */
import { registerKit } from './index.js';
import { start, doubleSided, random } from './parts.js';
import { tableLamp } from './lighting.js';

/**
 * Folds a flat coordinate past an edge into a soft roll then a vertical drop.
 * @param {number} u coordinate across the bed
 * @param {number} half half-width of the flat top
 * @param {number} radius roll radius
 * @returns {{ u: number, drop: number }} new coordinate and how far it fell
 */
function fold(u, half, radius) {
  const e = Math.abs(u) - half;
  if (e <= 0) return { u, drop: 0 };
  const s = Math.sign(u);
  const arc = (Math.PI / 2) * radius;
  if (e < arc) {
    const a = e / radius;
    return { u: s * (half + radius * Math.sin(a)), drop: radius * (1 - Math.cos(a)) };
  }
  return { u: s * (half + radius), drop: radius + (e - arc) };
}

/**
 * A duvet draped over a mattress top: flat over the bed, rolling over both sides and the foot.
 * @param {object} T three namespace
 * @param {number} mw mattress width
 * @param {number} cover length of mattress covered (from the foot)
 * @param {number} drop how far it hangs down
 * @param {number} seed wrinkle seed
 * @returns {import('three').BufferGeometry} geometry with the top at y = 0, foot edge at z = 0
 */
function duvet(T, mw, cover, drop, seed) {
  const rnd = random(seed);
  const phase = [rnd() * 6, rnd() * 6, rnd() * 6];
  const width = mw + 2 * drop + 0.1;
  const length = cover + drop + 0.05;
  const g = new T.PlaneGeometry(width, length, 64, 48);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const radius = 0.07;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i);
    const v = pos.getZ(i) + length / 2;
    const across = fold(u, mw / 2 + 0.015, radius);
    const along = v < drop + 0.05 ? fold(drop + 0.05 - v, 0.0001, radius) : { u: 0, drop: 0 };
    const z = v < drop + 0.05 ? -along.u : v - drop - 0.05;
    const top = across.drop === 0 && along.drop === 0;
    const puff = top ? 0.035 * Math.sqrt(Math.max(0, 1 - (u / (mw / 2)) ** 2)) : 0.035 * Math.max(0, 1 - across.drop / 0.08);
    const wrinkle = 0.006 * Math.sin(u * 7 + phase[0]) * Math.sin(z * 5 + phase[1]) + 0.004 * Math.sin((u + z) * 13 + phase[2]);
    const hang = Math.min(across.drop + along.drop, drop);
    pos.setXYZ(i, across.u, puff + wrinkle - hang, z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Builds a bed with an upholstered headboard and base, mattress, duvet, pillows and a throw.
 * @param {object} ctx kit context
 * @param {object} params { color (frame), linen, accent }
 * @param {{ mw: number, ml: number, frameW: number, headH: number, pillows: number, channels: number, name: string }} o sizes
 * @returns {import('three').Group} the bed
 */
function bed(ctx, params, o) {
  const { p, f } = start(ctx);
  const T = p.T;
  const frame = f.fabric(params.color || '#9c9488');
  const linen = f.fabric(params.linen || '#f1eee8');
  const accent = f.fabric(params.accent || '#8a6f5a');
  const frameL = o.ml + 0.12;
  const zHead = frameL / 2;
  const legH = 0.08;
  const baseTop = 0.34;
  const matTop = baseTop + 0.22;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) p.cyl(f.black(), 0.02, 0.016, legH, [sx * (o.frameW / 2 - 0.08), 0, sz * (frameL / 2 - 0.1)], [0, 0, 0], 12);
  }
  p.box(frame, [o.frameW, baseTop - legH, frameL], 0.035, [0, legH, 0]);
  p.box(frame, [o.frameW + 0.04, 0.42, 0.09], 0.03, [0, 0.12, zHead - 0.045]);
  const cw = (o.frameW + 0.04) / o.channels;
  for (let i = 0; i < o.channels; i++) {
    const x = -(o.frameW + 0.04) / 2 + cw * (i + 0.5);
    p.cushion(frame, [cw - 0.004, o.headH - 0.5, 0.09], 0.04, [x, 0.5, zHead - 0.07], [0, 0, 0], { crown: 0.012, bulge: 0.006 });
  }
  p.box(linen, [o.mw, matTop - baseTop + 0.02, o.ml], 0.06, [0, baseTop - 0.02, -0.03]);
  const footZ = -0.03 - o.ml / 2;
  const cover = o.ml * 0.72;
  const drape = doubleSided(ctx, f.fabric(params.duvet || '#e9e4dc'), `duvet:${params.duvet || ''}`);
  p.add(duvet(T, o.mw, cover, matTop - 0.22, o.mw * 10), drape, [0, matTop + 0.004, footZ]);
  p.cushion(f.fabric(params.duvet || '#e9e4dc'), [o.mw + 0.08, 0.07, 0.3], 0.03, [0, matTop - 0.005, footZ + cover - 0.1], [0, 0, 0], { crown: 0.015, bulge: 0.01 });
  p.cushion(accent, [o.mw + 0.12, 0.035, 0.42], 0.015, [0, matTop + 0.03, footZ + 0.32], [0, 0, 0], { crown: 0.008, bulge: 0.006 });
  const pw = o.mw / o.pillows;
  for (let i = 0; i < o.pillows; i++) {
    const x = -o.mw / 2 + pw * (i + 0.5);
    p.cushion(linen, [pw - 0.08, 0.5, 0.15], 0.06, [x, matTop - 0.02, zHead - 0.24], [0.42, 0, 0], { crown: 0.028, bulge: 0.012 });
  }
  const deco = o.pillows > 1 ? [-0.25, 0.25] : [0];
  deco.forEach((x, k) => {
    p.cushion(accent, [0.45, 0.45, 0.13], 0.06, [x, matTop - 0.01, zHead - 0.44], [0.36, k ? -0.12 : 0.12, 0], { crown: 0.03, bulge: 0.015 });
  });
  return p.build(o.name);
}

registerKit('bed.king', {
  footprint: [2.14, 2.2],
  build: (params, ctx) => bed(ctx, params, { mw: 1.95, ml: 2.05, frameW: 2.1, headH: 1.3, pillows: 2, channels: 9, name: 'bed.king' })
});

registerKit('bed.single', {
  footprint: [1.09, 2.05],
  build: (params, ctx) => bed(ctx, params, { mw: 0.99, ml: 1.93, frameW: 1.05, headH: 1.05, pillows: 1, channels: 4, name: 'bed.single' })
});

registerKit('nightstand', {
  footprint: [0.5, 0.42],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const body = params.wood === 'oak' ? f.oak() : f.walnut();
    const front = f.lacquer(params.color || '#e9e3d9', 0.5);
    const w = 0.5;
    const d = 0.4;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) p.cyl(f.brass(), 0.012, 0.01, 0.13, [sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05)], [0, 0, 0], 10);
    }
    p.box(body, [w, 0.42, d], 0.01, [0, 0.13, 0]);
    for (const y of [0.15, 0.345]) {
      p.box(front, [w - 0.03, 0.185, 0.02], 0.004, [0, y, -d / 2 - 0.006]);
      p.box(f.brass(), [0.1, 0.012, 0.014], 0.005, [0, y + 0.135, -d / 2 - 0.02]);
    }
    if (params.lamp !== false) tableLamp(p, f, { x: 0.06, y: 0.55, z: 0.03, shade: params.shade });
    p.box(f.ceramic('#4c5a63'), [0.16, 0.028, 0.22], 0.005, [-0.12, 0.55, -0.04], [0, 0.18, 0]);
    return p.build('nightstand');
  }
});
