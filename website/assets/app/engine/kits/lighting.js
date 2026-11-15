/**
 * Lighting kits: floor, table and pendant lamps, and the ceiling fan. Lamps glow through an
 * emissive shade and record a light hint in `group.userData.lights` for the engine; they do not
 * add lights themselves. Ceiling-hung kits take `ceiling` (clear height, default 3.0).
 * Front faces −Z; origin at the floor centre of the footprint.
 */
import { registerKit } from './index.js';
import { start, cached } from './parts.js';

/** Warm lamp colour (about 2700 K). */
const WARM = '#ffc98f';

/**
 * A softly glowing fabric shade material (lamp switched on).
 * @param {object} ctx kit context
 * @param {string} color shade colour
 * @returns {import('three').Material} cached material
 */
function glowShade(ctx, color) {
  return cached(ctx, `shade:${color}`, () => new ctx.THREE.MeshStandardMaterial({
    color, roughness: 0.95, emissive: WARM, emissiveIntensity: 0.55, side: ctx.THREE.DoubleSide
  }));
}

/**
 * Lathe profile of a thin-walled drum or tapered shade.
 * @param {number} rb bottom radius
 * @param {number} rt top radius
 * @param {number} h height
 * @returns {number[][]} closed thin-wall profile
 */
function shadeProfile(rb, rt, h) {
  const t = 0.004;
  return [[rb - t, 0], [rb, 0], [rt, h], [rt - t, h], [rb - t, 0.001]];
}

/**
 * Adds a table lamp (ceramic base, brass stem, linen shade) standing on a surface.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {{ x: number, y: number, z: number, shade?: string, base?: string }} o placement and colours
 */
export function tableLamp(p, f, o) {
  const { x, y, z } = o;
  p.lathe(f.ceramic(o.base || '#cbbfae'), [[0, 0], [0.06, 0], [0.085, 0.04], [0.095, 0.12], [0.08, 0.2], [0.03, 0.25], [0.02, 0.26], [0, 0.26]], [x, y, z], [0, 0, 0], 32);
  p.cyl(f.brass(), 0.006, 0.006, 0.16, [x, y + 0.26, z], [0, 0, 0], 8);
  p.lathe(glowShade(p.ctx, o.shade || '#efe6d6'), shadeProfile(0.17, 0.13, 0.22), [x, y + 0.3, z], [0, 0, 0], 40);
  p.light({ type: 'point', position: [x, y + 0.4, z], intensity: 0.6, distance: 3.5, color: WARM });
}

registerKit('lamp.table', {
  footprint: [0.34, 0.34],
  build(params, ctx) {
    const { p, f } = start(ctx);
    tableLamp(p, f, { x: 0, y: params.elevation ?? 0, z: 0, shade: params.shade, base: params.base });
    return p.build('lamp.table');
  }
});

registerKit('lamp.floor', {
  footprint: [0.45, 0.45],
  build(params, ctx) {
    const { p, f } = start(ctx);
    p.lathe(f.marble('#efedea'), [[0, 0], [0.14, 0], [0.15, 0.008], [0.15, 0.02], [0.14, 0.028], [0.03, 0.03], [0, 0.03]], [0, 0, 0], [0, 0, 0], 40);
    p.cyl(f.brass(), 0.009, 0.011, 1.4, [0, 0.03, 0], [0, 0, 0], 10);
    p.lathe(f.brass(), [[0, 0], [0.02, 0], [0.02, 0.05], [0.009, 0.06], [0, 0.06]], [0, 1.4, 0], [0, 0, 0], 16);
    p.lathe(glowShade(ctx, params.shade || '#efe6d6'), shadeProfile(0.23, 0.22, 0.34), [0, 1.3, 0], [0, 0, 0], 44);
    p.light({ type: 'point', position: [0, 1.5, 0], intensity: 0.9, distance: 5, color: WARM });
    return p.build('lamp.floor');
  }
});

/** Pendant shade profiles. */
const PENDANTS = {
  dome: [[0.2, 0], [0.198, 0.004], [0.17, 0.09], [0.1, 0.17], [0.03, 0.2], [0, 0.205], [0, 0.2], [0.028, 0.195], [0.096, 0.166], [0.165, 0.088], [0.194, 0.002]],
  cone: [[0.13, 0], [0.128, 0.004], [0.05, 0.26], [0.02, 0.27], [0, 0.272], [0, 0.268], [0.018, 0.266], [0.047, 0.256], [0.124, 0.003]]
};

registerKit('lamp.pendant', {
  footprint: [0.4, 0.4],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const ceiling = params.ceiling ?? 3.0;
    const drop = params.drop ?? 0.85;
    const count = params.count ?? 1;
    const spacing = params.spacing ?? 0.6;
    const style = params.style || 'dome';
    const metal = params.finish === 'brass' ? f.brass() : f.black();
    const glow = glowShade(ctx, '#fff3df');
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * spacing;
      const bottom = ceiling - drop;
      p.lathe(metal, [[0, 0], [0.055, 0], [0.06, 0.006], [0.06, 0.03], [0, 0.03]], [x, ceiling - 0.03, 0], [0, 0, 0], 24);
      p.cyl(f.black(), 0.0025, 0.0025, drop - 0.2, [x, bottom + 0.2, 0], [0, 0, 0], 6);
      if (style === 'globe') {
        p.sphere(f.frosted(), 0.15, [x, bottom + 0.1, 0], [1, 1, 1], [0, 0, 0], 28);
        p.sphere(glow, 0.05, [x, bottom + 0.1, 0]);
        p.cyl(metal, 0.03, 0.03, 0.06, [x, bottom + 0.22, 0], [0, 0, 0], 16);
      } else {
        const profile = PENDANTS[style] || PENDANTS.dome;
        const h = Math.max(...profile.map((pt) => pt[1]));
        p.lathe(metal, profile, [x, bottom + 0.2 - h, 0], [0, 0, 0], 40);
        p.cyl(metal, 0.022, 0.022, 0.06, [x, bottom + 0.2, 0], [0, 0, 0], 14);
        p.lathe(glow, [[0, 0], [0.03, 0.01], [0.035, 0.04], [0, 0.06]], [x, bottom + 0.2 - h + 0.02, 0], [0, 0, 0], 16);
      }
      p.light({ type: 'spot', position: [x, bottom + 0.05, 0], intensity: 1.2, distance: 4, color: WARM });
    }
    return p.build('lamp.pendant');
  }
});

registerKit('lamp.linear', {
  footprint: [1.4, 0.1],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const ceiling = params.ceiling ?? 3.0;
    const drop = params.drop ?? 0.9;
    const len = params.length ?? 1.4;
    const y = ceiling - drop;
    p.box(f.black(), [len, 0.05, 0.07], 0.012, [0, y, 0]);
    p.box(f.led(), [len - 0.04, 0.004, 0.05], 0.002, [0, y - 0.002, 0]);
    for (const sx of [-1, 1]) p.cyl(f.black(), 0.0015, 0.0015, drop - 0.05, [sx * (len / 2 - 0.15), y + 0.05, 0], [0, 0, 0], 4);
    p.light({ type: 'spot', position: [0, y - 0.05, 0], intensity: 1.5, distance: 4, color: WARM });
    return p.build('lamp.linear');
  }
});

registerKit('fan.ceiling', {
  footprint: [1.4, 1.4],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const T = p.T;
    const ceiling = params.ceiling ?? 3.0;
    const body = params.finish === 'walnut' ? f.walnut() : f.lacquer('#f1efea', 0.4);
    const rod = 0.32;
    const hub = ceiling - rod - 0.12;
    p.lathe(body, [[0, 0], [0.07, 0], [0.075, 0.01], [0.04, 0.07], [0, 0.075]], [0, ceiling - 0.075, 0], [0, 0, 0], 28);
    p.cyl(body, 0.012, 0.012, rod, [0, ceiling - rod - 0.06, 0], [0, 0, 0], 10);
    p.lathe(body, [[0, 0], [0.08, 0.005], [0.12, 0.035], [0.125, 0.07], [0.1, 0.1], [0.03, 0.12], [0, 0.12]], [0, hub, 0], [0, 0, 0], 36);
    p.lathe(f.lacquer('#fbf8f2', 0.4), [[0, 0], [0.06, 0.004], [0.08, 0.02], [0, 0.02]], [0, hub - 0.015, 0], [0, 0, 0], 28);
    const blade = new T.Shape();
    blade.moveTo(0, -0.045);
    blade.quadraticCurveTo(0.35, -0.065, 0.6, -0.06);
    blade.quadraticCurveTo(0.63, 0, 0.6, 0.06);
    blade.quadraticCurveTo(0.35, 0.065, 0, 0.045);
    blade.lineTo(0, -0.045);
    const blades = params.blades ?? 3;
    for (let i = 0; i < blades; i++) {
      const a = (i / blades) * Math.PI * 2;
      p.extrude(body, blade, 0.006, 0.002, [Math.cos(a) * 0.1, hub + 0.04, -Math.sin(a) * 0.1], [Math.PI / 2 + 0.12, a, 0]);
    }
    return p.build('fan.ceiling');
  }
});
