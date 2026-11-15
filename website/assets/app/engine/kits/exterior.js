/**
 * Exterior and architectural kits: hedge, ornamental tree, planter, street light, parked car,
 * MS sliding gate, façade louvres, ACP cladding band, cantilevered canopy slab, glass balcony
 * rail, stairs and rooftop services (split AC units, water tank).
 * Front faces −Z; origin at the floor centre of the footprint. Façade-mounted kits put their
 * back on z = 0, so the fixture point is the wall face.
 */
import { registerKit } from './index.js';
import { start, random, foliage, crown, taperTube, cached, canvasTexture } from './parts.js';

registerKit('hedge', {
  footprint: [3, 0.6],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const L = params.length ?? 3;
    const h = params.height ?? 1.0;
    const d = params.depth ?? 0.6;
    const leaf = foliage(ctx, 'hedge');
    const core = cached(ctx, 'hedge-core', () => new p.T.MeshStandardMaterial({ color: '#233d18', roughness: 1 }));
    p.box(core, [L - 0.1, h - 0.08, d - 0.1], 0.18, [0, 0.02, 0]);
    const rnd = random(params.seed ?? 17);
    const faces = [
      { area: L * d, pick: () => [(rnd() - 0.5) * L * 0.95, h - 0.08, (rnd() - 0.5) * d * 0.9], tilt: () => 1.2 + rnd() * 0.5 },
      { area: L * h, pick: () => [(rnd() - 0.5) * L * 0.95, rnd() * (h - 0.25), -d / 2 + 0.04], tilt: () => 0.2 + rnd() * 0.5, yaw: Math.PI },
      { area: L * h, pick: () => [(rnd() - 0.5) * L * 0.95, rnd() * (h - 0.25), d / 2 - 0.04], tilt: () => 0.2 + rnd() * 0.5, yaw: 0 },
      { area: d * h, pick: () => [-L / 2 + 0.04, rnd() * (h - 0.25), (rnd() - 0.5) * d * 0.9], tilt: () => 0.2 + rnd() * 0.5, yaw: -Math.PI / 2 },
      { area: d * h, pick: () => [L / 2 - 0.04, rnd() * (h - 0.25), (rnd() - 0.5) * d * 0.9], tilt: () => 0.2 + rnd() * 0.5, yaw: Math.PI / 2 }
    ];
    const density = ctx.quality === 'low' ? 18 : 40;
    for (const face of faces) {
      const count = Math.round(face.area * density);
      for (let i = 0; i < count; i++) {
        const pos = face.pick();
        const size = 0.24 + rnd() * 0.14;
        const yaw = face.yaw ?? rnd() * Math.PI * 2;
        p.card(leaf, size, size, pos, [face.tilt(), yaw + (rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.6], { centre: [pos[0], h * 0.45, 0], bend: 0.12, soften: 0.55 });
      }
    }
    return p.build('hedge');
  }
});

registerKit('tree.ornamental', {
  footprint: [3.2, 3.2],
  build(params, ctx) {
    const { p } = start(ctx);
    const T = p.T;
    const height = params.height ?? 5;
    const rnd = random(params.seed ?? 31);
    const bark = ctx.mat('concrete', { color: '#7b6b5a' });
    const leaf = foliage(ctx, 'tree');
    const fork = height * 0.42;
    const trunk = new T.CatmullRomCurve3([
      new T.Vector3(0, 0, 0), new T.Vector3(0.05, fork * 0.5, 0.03), new T.Vector3(-0.03, fork, 0)
    ]);
    p.add(taperTube(T, trunk, 0.13, 0.085, 10, 10), bark);
    p.lathe(bark, [[0.2, 0], [0.14, 0.12], [0.13, 0.25], [0, 0.25]], [0, 0, 0], [0, 0, 0], 12);
    const branches = 5;
    const crownR = height * 0.24;
    for (let i = 0; i < branches; i++) {
      const a = (i / branches) * Math.PI * 2 + rnd() * 0.6;
      const reach = crownR * (0.55 + rnd() * 0.35);
      const top = fork + height * (0.25 + rnd() * 0.2);
      const end = new T.Vector3(Math.cos(a) * reach, top, Math.sin(a) * reach);
      const curve = new T.CatmullRomCurve3([
        new T.Vector3(-0.03, fork - 0.1, 0),
        new T.Vector3(Math.cos(a) * reach * 0.35, fork + (top - fork) * 0.55, Math.sin(a) * reach * 0.35),
        end
      ]);
      p.add(taperTube(T, curve, 0.07, 0.025, 8, 7), bark);
      crown(p, leaf, [end.x, end.y + 0.15, end.z], [crownR * 0.55, crownR * 0.42, crownR * 0.55], ctx.quality === 'low' ? 18 : 34, 0.62, (params.seed ?? 31) + i * 7);
    }
    crown(p, leaf, [0, fork + height * 0.38, 0], [crownR * 0.7, crownR * 0.45, crownR * 0.7], ctx.quality === 'low' ? 20 : 40, 0.7, (params.seed ?? 31) + 99);
    return p.build('tree.ornamental');
  }
});

registerKit('planter.box', {
  footprint: [1.2, 0.45],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = params.w ?? 1.2;
    const d = params.d ?? 0.45;
    const h = params.h ?? 0.5;
    const shell = params.finish === 'charcoal' ? f.ceramic('#3a3c3e') : f.concrete('#c9c5bd');
    p.box(shell, [w, h, d], 0.02, [0, 0, 0]);
    p.box(ctx.mat('gravel', { color: '#4a3b2e' }), [w - 0.06, 0.02, d - 0.06], 0.005, [0, h - 0.05, 0]);
    const leaf = foliage(ctx, 'shrub');
    const n = Math.max(1, Math.round(w / 0.4));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w / n) * (i + 0.5);
      crown(p, leaf, [x, h + 0.2, 0], [0.24, 0.22, d * 0.5], ctx.quality === 'low' ? 14 : 26, 0.26, (params.seed ?? 3) + i);
    }
    return p.build('planter.box');
  }
});

registerKit('streetlight', {
  footprint: [0.4, 1.8],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const h = params.height ?? 7.5;
    const reach = params.reach ?? 1.4;
    const pole = f.aluminium();
    p.box(f.concrete('#a8a49c'), [0.5, 0.12, 0.5], 0.02, [0, 0, 0]);
    p.lathe(pole, [[0.16, 0], [0.16, 0.02], [0.1, 0.04], [0.085, 0.5], [0.06, h - 0.4], [0.05, h], [0, h]], [0, 0.12, 0], [0, 0, 0], 20);
    p.tube(pole, [[0, h - 0.1, 0], [0, h + 0.12, -0.25], [0, h + 0.2, -reach]], 0.04, { corner: 0.3 });
    p.box(pole, [0.32, 0.08, 0.68], 0.03, [0, h + 0.13, -reach - 0.2]);
    p.box(f.led(), [0.26, 0.006, 0.6], 0.002, [0, h + 0.125, -reach - 0.2]);
    p.light({ type: 'spot', position: [0, h + 0.1, -reach - 0.2], intensity: 2, distance: 18, color: '#fff2df' });
    return p.build('streetlight');
  }
});

/**
 * Car paint: clear-coated metallic.
 * @param {object} ctx kit context
 * @param {string} color body colour
 * @returns {import('three').Material} cached material
 */
function carPaint(ctx, color) {
  return cached(ctx, `carpaint:${color}`, () => new ctx.THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04 }));
}

/**
 * A side-profile shape from [u, v] points (u along the car, v up).
 * @param {object} T three namespace
 * @param {number[][]} points outline
 * @returns {import('three').Shape} the shape
 */
function profile(T, points) {
  const s = new T.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  return s;
}

/**
 * Smooths a polyline outline by sampling a closed Catmull-Rom curve through it, then appends
 * hard points (wheel arches) unchanged.
 * @param {object} T three namespace
 * @param {number[][]} soft points to smooth
 * @param {number} samples output points
 * @returns {number[][]} smoothed points
 */
function smoothOutline(T, soft, samples) {
  const curve = new T.CatmullRomCurve3(soft.map(([u, v]) => new T.Vector3(u, v, 0)), false, 'centripetal', 0.5);
  return curve.getSpacedPoints(samples).map((pt) => [pt.x, pt.y]);
}

/**
 * Wheel arch points from front to back along the sill line.
 * @param {number} c axle position along the car
 * @param {number} r arch radius
 * @param {number} axle axle height
 * @param {number} sill sill height
 * @returns {number[][]} arch outline from its rear edge, over the top, to its front edge
 */
function arch(c, r, axle, sill) {
  const pts = [[c + r, sill]];
  for (let k = 0; k <= 12; k++) {
    const a = (k / 12) * Math.PI;
    pts.push([c + Math.cos(a) * r, axle + Math.sin(a) * r]);
  }
  pts.push([c - r, sill]);
  return pts;
}

registerKit('car.sedan', {
  footprint: [1.8, 4.6],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const T = p.T;
    const L = 4.6;
    const W = 1.78;
    const paint = carPaint(ctx, params.color || '#d7d8d9');
    const glass = f.lacquer('#151a1f', 0.05);
    const trim = f.lacquer('#151617', 0.45);
    const axle = 0.31;
    const front = -1.36;
    const rear = 1.34;
    const bevel = 0.08;
    const sill = 0.19;
    const top = smoothOutline(T, [
      [2.12, 0.3], [2.28, 0.42], [2.3, 0.62], [2.24, 0.84], [2.05, 0.93], [1.5, 0.95], [0.4, 0.92],
      [-0.75, 0.88], [-1.4, 0.82], [-2.0, 0.74], [-2.24, 0.66], [-2.3, 0.5], [-2.24, 0.3], [-2.12, sill]
    ], 60);
    const under = [...arch(front, 0.37, axle, sill).reverse(), ...arch(rear, 0.37, axle, sill).reverse(), [2.12, sill]];
    const side = { inset: true };
    p.extrude(paint, profile(T, [...top, ...under].map(([u, v]) => [u * 0.985, v])), W - 2 * bevel, bevel, [0, 0, 0], [0, -Math.PI / 2, 0], side);
    const cabinW = W - 0.32;
    const cabin = smoothOutline(T, [[-0.8, 0.9], [-0.2, 1.38], [0.5, 1.42], [1.05, 1.32], [1.55, 0.96]], 30);
    p.extrude(glass, profile(T, [...cabin, [-0.8, 0.9]]), cabinW - 0.12, 0.06, [0, 0, 0], [0, -Math.PI / 2, 0], side);
    const roof = smoothOutline(T, [[-0.22, 1.37], [0.5, 1.425], [1.0, 1.335]], 16);
    const roofShape = profile(T, [...roof, ...roof.slice().reverse().map(([u, v]) => [u, v - 0.05])]);
    p.extrude(paint, roofShape, cabinW - 0.1, 0.05, [0, 0.014, 0], [0, -Math.PI / 2, 0], side);
    for (const sx of [-1, 1]) {
      p.cbox(trim, [0.02, 0.4, 0.09], 0.01, [sx * (cabinW / 2 + 0.004), 1.13, 0.2]);
      p.cbox(paint, [0.12, 0.07, 0.14], 0.03, [sx * (W / 2 + 0.02), 0.98, -0.65], [0, 0, sx * 0.2]);
      p.cbox(f.chrome(), [0.014, 0.022, 0.12], 0.006, [sx * (W / 2 + 0.005), 0.86, -0.1]);
      p.cbox(f.chrome(), [0.014, 0.022, 0.12], 0.006, [sx * (W / 2 + 0.005), 0.87, 0.75]);
      p.cbox(trim, [0.004, 0.5, 0.006], 0.002, [sx * (W / 2 + 0.002), 0.62, 0.32]);
    }
    const tyre = [[0.2, -0.11], [0.29, -0.115], [0.315, -0.09], [0.318, 0.09], [0.29, 0.115], [0.2, 0.11]];
    const rim = new T.Shape();
    rim.absarc(0, 0, 0.205, 0, Math.PI * 2, false);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const hole = new T.Path();
      hole.absarc(Math.cos(a) * 0.125, Math.sin(a) * 0.125, 0.052, 0, Math.PI * 2, true);
      rim.holes.push(hole);
    }
    for (const sx of [-1, 1]) {
      for (const z of [front, rear]) {
        const x = sx * (W / 2 - 0.13);
        p.lathe(f.rubber(), tyre, [x, axle, z], [0, 0, Math.PI / 2], 32);
        p.extrude(f.chrome(), rim, 0.03, 0.006, [x + sx * 0.085, axle, z], [0, Math.PI / 2, 0]);
        p.cyl(f.aluminium(), 0.17, 0.17, 0.02, [x + sx * 0.04, axle, z], [0, 0, Math.PI / 2], 24);
      }
    }
    const lamp = cached(ctx, 'car-tail', () => new T.MeshStandardMaterial({ color: '#5a0d0d', emissive: '#7a0f0f', emissiveIntensity: 0.6, roughness: 0.2 }));
    for (const sx of [-1, 1]) {
      p.cbox(glass, [0.46, 0.085, 0.05], 0.025, [sx * 0.58, 0.7, -2.1], [0.35, sx * 0.3, 0]);
      p.cbox(f.led(), [0.34, 0.012, 0.02], 0.004, [sx * 0.6, 0.675, -2.13], [0.35, sx * 0.3, 0]);
      p.cbox(lamp, [0.46, 0.075, 0.05], 0.02, [sx * 0.56, 0.86, 2.16], [-0.25, -sx * 0.22, 0]);
    }
    p.cbox(trim, [0.8, 0.1, 0.05], 0.025, [0, 0.6, -2.22]);
    p.cbox(trim, [1.1, 0.1, 0.05], 0.025, [0, 0.36, -2.24]);
    const plate = canvasTexture(ctx, 'car-plate', 256, 64, (g, w, h) => {
      g.fillStyle = '#f4f4f2';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#222';
      g.lineWidth = 4;
      g.strokeRect(4, 4, w - 8, h - 8);
      g.fillStyle = '#1b1b1b';
      g.font = '700 40px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('ABC 123', w / 2, h / 2 + 2);
    });
    const plateMat = cached(ctx, 'car-plate-mat', () => new T.MeshStandardMaterial({ map: plate, roughness: 0.5 }));
    p.add(new T.PlaneGeometry(0.52, 0.13), plateMat, [0, 0.45, -2.275], [0, Math.PI, 0], { uv: 'keep' });
    p.add(new T.PlaneGeometry(0.52, 0.13), plateMat, [0, 0.6, 2.274], [0, 0, 0], { uv: 'keep' });
    return p.build('car.sedan');
  }
});


registerKit('gate.sliding', {
  footprint: [4.5, 0.1],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = params.width ?? 4.5;
    const h = Math.min(params.height ?? 2.1, 2.4);
    const metal = f.black();
    const slat = params.style === 'wood' ? f.walnut() : metal;
    const gw = w - 0.04;
    const y0 = 0.07;
    p.box(f.steel(), [w + 0.3, 0.02, 0.05], 0.004, [0, 0, 0]);
    p.box(metal, [gw, 0.08, 0.06], 0.008, [0, y0, 0]);
    p.box(metal, [gw, 0.08, 0.06], 0.008, [0, h - 0.08, 0]);
    for (const sx of [-1, 0, 1]) p.box(metal, [0.08, h - y0 - 0.08, 0.06], 0.008, [sx * (gw / 2 - 0.04), y0, 0]);
    const pitch = 0.115;
    const count = Math.floor((h - y0 - 0.24) / pitch);
    for (let i = 0; i < count; i++) {
      const y = y0 + 0.12 + i * pitch;
      p.box(slat, [gw - 0.12, 0.095, 0.022], 0.004, [0, y, -0.005]);
    }
    for (const sx of [-0.3, 0.3]) {
      p.cyl(f.steel(), 0.05, 0.05, 0.04, [sx * gw, 0.01, 0], [0, 0, Math.PI / 2], 18);
    }
    p.box(f.steel(), [0.16, 0.03, 0.012], 0.004, [gw / 2 - 0.25, 1.05, -0.04]);
    return p.build('gate.sliding');
  }
});

registerKit('louvre.screen', {
  footprint: [2.4, 0.25],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = params.width ?? 2.4;
    const h = params.height ?? 3;
    const y = params.y ?? 0;
    const spacing = params.spacing ?? 0.14;
    const fin = params.wood === 'walnut' ? f.walnut() : f.oak();
    const frame = f.black();
    p.box(frame, [w, 0.06, 0.22], 0.006, [0, y, -0.11]);
    p.box(frame, [w, 0.06, 0.22], 0.006, [0, y + h - 0.06, -0.11]);
    const count = Math.floor(w / spacing);
    for (let i = 0; i < count; i++) {
      const x = -((count - 1) * spacing) / 2 + i * spacing;
      p.box(fin, [0.045, h - 0.12, 0.16], 0.008, [x, y + 0.06, -0.12]);
    }
    return p.build('louvre.screen');
  }
});

registerKit('acp.band', {
  footprint: [6, 0.06],
  build(params, ctx) {
    const { p } = start(ctx);
    const w = params.width ?? 6;
    const h = params.height ?? 1.2;
    const y = params.y ?? 3;
    const panel = ctx.mat('acp', params.color ? { color: params.color } : {});
    const module = params.module ?? 1.2;
    const cols = Math.max(1, Math.round(w / module));
    const rows = Math.max(1, Math.round(h / 0.9));
    const pw = w / cols;
    const ph = h / rows;
    const joint = 0.012;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        p.box(panel, [pw - joint, ph - joint, 0.04], 0.004, [-w / 2 + pw * (c + 0.5), y + r * ph + joint / 2, -0.03]);
      }
    }
    p.box(p.ctx.mat('metal-black'), [w, h, 0.012], 0.002, [0, y, -0.008]);
    return p.build('acp.band');
  }
});

registerKit('canopy.slab', {
  footprint: [3, 1.2],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const w = params.width ?? 3;
    const d = params.depth ?? 1.2;
    const t = params.thickness ?? 0.18;
    const y = params.y ?? 3.0;
    const render = ctx.mat('plaster', { color: params.color || '#f3f1ec' });
    p.box(render, [w, t, d], 0.012, [0, y - t, -d / 2]);
    p.box(f.black(), [w - 0.04, 0.012, 0.02], 0.002, [0, y - t + 0.03, -d - 0.006]);
    const lights = Math.max(1, Math.round(w / 1.2));
    for (let i = 0; i < lights; i++) {
      const x = -w / 2 + (w / lights) * (i + 0.5);
      p.cyl(f.led(), 0.05, 0.05, 0.004, [x, y - t - 0.003, -d / 2], [0, 0, 0], 20);
    }
    return p.build('canopy.slab');
  }
});

registerKit('balcony.rail', {
  footprint: [3, 0.1],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const L = params.length ?? 3;
    const h = params.height ?? 1.05;
    p.box(f.aluminium(), [L, 0.12, 0.08], 0.008, [0, 0, 0]);
    const panels = Math.max(1, Math.round(L / 1.2));
    const pw = L / panels;
    for (let i = 0; i < panels; i++) p.box(f.glass(), [pw - 0.01, h - 0.08, 0.012], 0.003, [-L / 2 + pw * (i + 0.5), 0.08, 0]);
    p.tube(f.steel(), [[-L / 2, h + 0.01, 0], [L / 2, h + 0.01, 0]], 0.022);
    return p.build('balcony.rail');
  }
});

/**
 * Adds one flight of steps rising along +z in kit space. A solid flight is one seamless stepped
 * mass down to the floor; an open flight has separate stepped blocks under each tread.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {{ x: number, z0: number, y0: number, width: number, steps: number, rise: number, going: number, dir: number, solid: boolean }} o flight
 */
function flight(p, f, o) {
  const tread = f.marble();
  const body = p.ctx.mat('plaster', { color: '#f1efea' });
  const at = (i) => o.z0 + o.dir * i * o.going;
  if (o.solid) {
    const side = new p.T.Shape();
    side.moveTo(at(0), 0);
    for (let i = 0; i < o.steps; i++) {
      const top = o.y0 + (i + 1) * o.rise - 0.03;
      side.lineTo(at(i), top);
      side.lineTo(at(i + 1), top);
    }
    side.lineTo(at(o.steps), 0);
    p.extrude(body, side, o.width, 0, [o.x, 0, 0], [0, -Math.PI / 2, 0]);
  }
  for (let i = 0; i < o.steps; i++) {
    const y = o.y0 + i * o.rise;
    const z = o.z0 + o.dir * (i + 0.5) * o.going;
    if (!o.solid) p.box(body, [o.width, o.rise + 0.09, o.going], 0.004, [o.x, y - 0.12, z]);
    p.box(tread, [o.width + 0.02, 0.03, o.going + 0.03], 0.006, [o.x, y + o.rise - 0.03, z - o.dir * 0.015]);
  }
}

/** Handrail height above the stair nosing line. */
const RAIL_HEIGHT = 0.9;

/**
 * Adds a handrail with balusters along a straight run of a flight's inner edge. When `clip` is
 * given (the clear ceiling height of the room the stair stands in), the rail stops where it meets
 * the ceiling, as it would entering the stairwell, instead of poking through the floor above.
 * @param {import('./parts.js').Parts} p collector
 * @param {object} f finishes
 * @param {number} x rail x
 * @param {number[][]} line [[z0, y0], [z1, y1]] nosing line, bottom to top
 * @param {number} [clip] height the rail may not rise above
 */
function handrail(p, f, x, line, clip = Infinity) {
  const steel = f.steel();
  const [[z0, y0], [zEnd, yEnd]] = line;
  const cut = yEnd + RAIL_HEIGHT > clip ? Math.max(0, (clip - RAIL_HEIGHT - y0) / (yEnd - y0)) : 1;
  if (cut <= 0) return;
  const z1 = z0 + (zEnd - z0) * cut;
  const y1 = y0 + (yEnd - y0) * cut;
  p.tube(f.walnut(), [[x, y0 + RAIL_HEIGHT, z0], [x, y1 + RAIL_HEIGHT, z1]], 0.025, { corner: 0.1 });
  const n = Math.max(2, Math.round(Math.abs(z1 - z0) / 0.25));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const z = z0 + (z1 - z0) * t;
    const y = y0 + (y1 - y0) * t;
    p.tube(steel, [[x, y, z], [x, y + RAIL_HEIGHT - 0.02, z]], 0.008);
  }
}

registerKit('stair.dogleg', {
  footprint: [2.4, 4.2],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const H = params.height ?? 3.2;
    const W = params.width ?? 2.4;
    const L = params.length ?? 4.2;
    const fw = W / 2 - 0.04;
    const risers = Math.max(4, Math.round(H / 0.17));
    const rise = H / risers;
    const first = Math.ceil(risers / 2);
    const second = risers - first;
    const landing = Math.min(1.2, fw + 0.1);
    const going = Math.min(0.3, (L - landing) / Math.max(first, second));
    const zStart = -L / 2;
    flight(p, f, { x: W / 4 + 0.02, z0: zStart, y0: 0, width: fw, steps: first - 1, rise, going, dir: 1, solid: true });
    const landY = (first - 1) * rise + rise;
    const landZ = zStart + (first - 1) * going;
    const body = ctx.mat('plaster', { color: '#f1efea' });
    p.box(body, [W, landY - 0.03, L / 2 - landZ], 0.004, [0, 0, landZ + (L / 2 - landZ) / 2]);
    p.box(f.marble(), [W + 0.02, 0.03, L / 2 - landZ + 0.02], 0.006, [0, landY - 0.03, landZ + (L / 2 - landZ) / 2]);
    flight(p, f, { x: -W / 4 - 0.02, z0: landZ, y0: landY, width: fw, steps: second, rise, going, dir: -1, solid: false });
    p.box(body, [0.08, H, L - landing - 0.1], 0.004, [0, 0, zStart + (L - landing) / 2 - 0.05]);
    handrail(p, f, 0.06, [[zStart + 0.15, rise], [landZ, landY]]);
    handrail(p, f, -0.06, [[landZ, landY], [landZ - second * going + 0.1, H]], params.clip);
    return p.build('stair.dogleg');
  }
});

registerKit('stair.straight', {
  footprint: [1.0, 5.0],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const H = params.height ?? 3.2;
    const W = params.width ?? 1.0;
    const risers = Math.max(4, Math.round(H / 0.175));
    const rise = H / risers;
    const going = params.going ?? 0.27;
    const L = risers * going;
    flight(p, f, { x: 0, z0: -L / 2, y0: 0, width: W, steps: risers, rise, going, dir: 1, solid: params.solid !== false });
    handrail(p, f, -W / 2 + 0.05, [[-L / 2 + 0.15, rise], [L / 2, H]], params.clip);
    return p.build('stair.straight');
  }
});

registerKit('ac.split', {
  footprint: [0.95, 0.25],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const y = params.mount ?? 2.3;
    const body = f.lacquer('#f6f6f3', 0.35);
    p.box(body, [0.92, 0.3, 0.22], 0.05, [0, y - 0.3, -0.11]);
    p.box(f.lacquer('#d9dbdc', 0.35), [0.84, 0.035, 0.012], 0.005, [0, y - 0.27, -0.226], [0.5, 0, 0]);
    p.box(f.lacquer('#5fa8d3', 0.35), [0.04, 0.012, 0.004], 0.002, [0.32, y - 0.12, -0.222]);
    return p.build('ac.split');
  }
});

registerKit('ac.outdoor', {
  footprint: [0.85, 0.35],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const T = p.T;
    const y = params.elevation ?? 0;
    const body = f.lacquer('#e9e8e3', 0.5);
    p.box(f.black(), [0.7, 0.1, 0.3], 0.01, [0, y, 0]);
    p.box(body, [0.82, 0.58, 0.3], 0.02, [0, y + 0.1, 0]);
    const grille = f.black();
    for (const r of [0.07, 0.13, 0.19]) p.add(new T.TorusGeometry(r, 0.005, 5, 40), grille, [-0.12, y + 0.39, -0.152]);
    p.cyl(f.lacquer('#2e3033', 0.6), 0.21, 0.21, 0.01, [-0.12, y + 0.39, -0.145], [Math.PI / 2, 0, 0], 32);
    for (let k = 0; k < 4; k++) p.box(grille, [0.42, 0.008, 0.008], 0.002, [-0.12, y + 0.386, -0.156], [0, 0, (k * Math.PI) / 4]);
    return p.build('ac.outdoor');
  }
});

registerKit('tank.water', {
  footprint: [1.2, 1.2],
  build(params, ctx) {
    const { p, f } = start(ctx);
    const plastic = f.lacquer(params.color || '#2c2e30', 0.55);
    const steel = f.aluminium();
    const y = params.elevation ?? 0;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) p.box(steel, [0.05, 0.4, 0.05], 0.006, [sx * 0.45, y, sz * 0.45]);
    p.box(steel, [1.0, 0.05, 1.0], 0.008, [0, y + 0.4, 0]);
    const ribs = [];
    for (let i = 0; i <= 8; i++) {
      const y = 0.05 + i * 0.13;
      ribs.push([0.54, y], [0.555, y + 0.02], [0.54, y + 0.05]);
    }
    p.lathe(plastic, [[0, 0], [0.52, 0], [0.54, 0.04], ...ribs, [0.5, 1.2], [0.3, 1.27], [0.22, 1.28], [0.22, 1.33], [0, 1.33]], [0, y + 0.45, 0], [0, 0, 0], 40);
    return p.build('tank.water');
  }
});
