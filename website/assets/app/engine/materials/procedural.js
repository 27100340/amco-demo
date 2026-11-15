/**
 * Procedural PBR textures drawn on canvas: colour, normal (from a height field via a Sobel filter)
 * and roughness. Every pattern tiles seamlessly, covers a known real-world size (`tile`, metres)
 * and is generated once per id and size, then cached.
 */
import * as THREE from 'three';

/** Texture ids this module can generate. */
export const PROCEDURAL_IDS = [
  'plaster', 'concrete', 'marble', 'porcelain', 'oak-floor', 'walnut', 'stone-cladding', 'brick',
  'fabric-linen', 'leather', 'lawn', 'paving', 'asphalt', 'gravel', 'brushed-steel', 'carpet-tile'
];

const cache = new Map();

/**
 * Seeded pseudo-random generator (mulberry32).
 * @param {number} seed
 * @returns {() => number} values in [0, 1)
 */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Quintic fade for smooth value noise. */
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;

/**
 * Adds one octave of tileable value noise into `out`.
 * @param {Float32Array} out size×size field
 * @param {number} size pixels per side
 * @param {number} fx lattice cells across (integer, so the pattern tiles)
 * @param {number} fy lattice cells down (integer)
 * @param {number} amp amplitude
 * @param {() => number} rnd random source
 */
function addOctave(out, size, fx, fy, amp, rnd) {
  const grid = new Float32Array(fx * fy);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const x0 = new Int32Array(size);
  const x1 = new Int32Array(size);
  const tx = new Float32Array(size);
  for (let x = 0; x < size; x++) {
    const g = (x / size) * fx;
    const i = Math.floor(g);
    x0[x] = i % fx;
    x1[x] = (i + 1) % fx;
    tx[x] = fade(g - i);
  }
  for (let y = 0; y < size; y++) {
    const g = (y / size) * fy;
    const j = Math.floor(g);
    const r0 = (j % fy) * fx;
    const r1 = ((j + 1) % fy) * fx;
    const ty = fade(g - j);
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const a = grid[r0 + x0[x]];
      const b = grid[r0 + x1[x]];
      const c = grid[r1 + x0[x]];
      const d = grid[r1 + x1[x]];
      const top = a + (b - a) * tx[x];
      const bottom = c + (d - c) * tx[x];
      out[row + x] += (top + (bottom - top) * ty) * amp;
    }
  }
}

/**
 * Tileable fractal value noise normalised to [0, 1].
 * @param {number} size pixels per side
 * @param {number} freq base lattice cells across
 * @param {number} octaves
 * @param {() => number} rnd random source
 * @param {{ stretch?: number, gain?: number }} [opts] stretch multiplies the vertical frequency
 * @returns {Float32Array}
 */
function fbm(size, freq, octaves, rnd, opts = {}) {
  const out = new Float32Array(size * size);
  const stretch = opts.stretch || 1;
  const gain = opts.gain || 0.5;
  let amp = 1;
  let total = 0;
  let f = freq;
  for (let o = 0; o < octaves; o++) {
    const fx = Math.max(1, Math.min(size, Math.round(f)));
    const fy = Math.max(1, Math.min(size, Math.round(f * stretch)));
    addOctave(out, size, fx, fy, amp, rnd);
    total += amp;
    amp *= gain;
    f *= 2;
  }
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < out.length; i++) {
    out[i] /= total;
    if (out[i] < min) min = out[i];
    if (out[i] > max) max = out[i];
  }
  const range = max - min || 1;
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - min) / range;
  return out;
}

/**
 * Empty working buffers for one texture.
 * @param {number} size
 * @returns {{ size: number, albedo: Float32Array, height: Float32Array, rough: Float32Array }}
 */
function surface(size) {
  return {
    size,
    albedo: new Float32Array(size * size * 3),
    height: new Float32Array(size * size),
    rough: new Float32Array(size * size)
  };
}

/** Writes an sRGB colour (0..1 channels) into the albedo buffer. */
function setColour(s, i, r, g, b) {
  s.albedo[i * 3] = r;
  s.albedo[i * 3 + 1] = g;
  s.albedo[i * 3 + 2] = b;
}

/**
 * Splits a periodic span of `total` into pieces with random lengths, starting at a random offset.
 * @returns {number[]} sorted cut positions in [0, total)
 */
function periodicCuts(total, minLen, maxLen, rnd) {
  const cuts = [];
  let at = 0;
  while (at < total - 1e-6) {
    cuts.push(at);
    let len = mix(minLen, maxLen, rnd());
    if (total - (at + len) < minLen * 0.6) len = total - at;
    at += len;
  }
  const offset = rnd() * total;
  return cuts.map((c) => (c + offset) % total).sort((a, b) => a - b);
}

/**
 * Index of the piece containing position `p` and the distances to its two cuts.
 * @returns {{ index: number, from: number, to: number }}
 */
function pieceAt(cuts, total, p) {
  let index = cuts.length - 1;
  for (let k = 0; k < cuts.length; k++) {
    if (cuts[k] > p) {
      index = k - 1;
      break;
    }
  }
  const start = index < 0 ? cuts[cuts.length - 1] - total : cuts[index];
  const end = index + 1 < cuts.length ? cuts[index + 1] : cuts[0] + total;
  return { index: (index + cuts.length) % cuts.length, from: p - start, to: end - p };
}

/**
 * Lays a grid of rectangular units (planks, tiles, bricks, stones) in rows. Each row has its own
 * height and periodic cuts. Calls `paint(i, unit, du, dv)` per pixel where du/dv are the distances
 * (metres) to the nearest vertical and horizontal joints and `unit` is a stable per-unit random.
 */
function layUnits(s, tile, rows, paint) {
  const { size } = s;
  const [tw, th] = tile;
  const rowStarts = [];
  let acc = 0;
  for (const row of rows) {
    rowStarts.push(acc);
    acc += row.height;
  }
  for (let y = 0; y < size; y++) {
    const v = ((size - 1 - y) / size) * th;
    let r = rows.length - 1;
    for (let k = 0; k < rows.length; k++) {
      if (v < rowStarts[k] + rows[k].height) {
        r = k;
        break;
      }
    }
    const row = rows[r];
    const dvRow = Math.min(v - rowStarts[r], rowStarts[r] + row.height - v);
    for (let x = 0; x < size; x++) {
      const u = (x / size) * tw;
      const piece = pieceAt(row.cuts, tw, u);
      const unit = row.seeds[piece.index];
      paint(y * size + x, unit, Math.min(piece.from, piece.to), dvRow, r, piece.index);
    }
  }
}

/**
 * Rows with random heights summing to `total` and periodic cuts along `width`.
 */
function makeRows(total, width, heights, lenMin, lenMax, rnd) {
  const rows = [];
  let acc = 0;
  while (acc < total - 1e-6) {
    let h = heights[Math.floor(rnd() * heights.length)];
    if (total - (acc + h) < Math.min(...heights) * 0.6) h = total - acc;
    const cuts = periodicCuts(width, lenMin, lenMax, rnd);
    rows.push({ height: h, cuts, seeds: cuts.map(() => rnd()) });
    acc += h;
  }
  return rows;
}

/* ---------------------------------------------------------------- generators */

const GENERATORS = {
  plaster(size, rnd) {
    const s = surface(size);
    const low = fbm(size, 3, 4, rnd);
    const grain = fbm(size, 96, 3, rnd);
    for (let i = 0; i < size * size; i++) {
      const g = grain[i] + (rnd() - 0.5) * 0.25;
      const tone = 0.925 + (low[i] - 0.5) * 0.035 + (g - 0.5) * 0.02;
      setColour(s, i, tone, tone * 0.997, tone * 0.988);
      s.height[i] = g * 0.8 + low[i] * 0.2;
      s.rough[i] = 0.9 + (g - 0.5) * 0.08;
    }
    return { s, tile: [1.6, 1.6], strength: 0.35 };
  },

  concrete(size, rnd) {
    const s = surface(size);
    const low = fbm(size, 3, 5, rnd);
    const mid = fbm(size, 24, 3, rnd);
    for (let i = 0; i < size * size; i++) {
      const tone = 0.56 + (low[i] - 0.5) * 0.14 + (mid[i] - 0.5) * 0.05 + (rnd() - 0.5) * 0.03;
      setColour(s, i, tone * 1.01, tone, tone * 0.97);
      s.height[i] = mid[i] * 0.55 + low[i] * 0.08;
      s.rough[i] = 0.82 + (mid[i] - 0.5) * 0.12;
    }
    const pores = Math.round(size * size * 0.0015);
    for (let k = 0; k < pores; k++) {
      const cx = Math.floor(rnd() * size);
      const cy = Math.floor(rnd() * size);
      const r = 1 + Math.floor(rnd() * 2);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const i = ((cy + dy + size) % size) * size + ((cx + dx + size) % size);
          s.height[i] -= 0.5;
          setColour(s, i, s.albedo[i * 3] * 0.7, s.albedo[i * 3 + 1] * 0.7, s.albedo[i * 3 + 2] * 0.7);
        }
      }
    }
    return { s, tile: [2, 2], strength: 1.2 };
  },

  marble(size, rnd) {
    const s = surface(size);
    const warp = fbm(size, 4, 5, rnd);
    const cloud = fbm(size, 3, 4, rnd);
    const fine = fbm(size, 10, 4, rnd);
    const tiles = 2;
    const tileSize = 0.6;
    const grout = 0.0015;
    const phases = Array.from({ length: tiles * tiles }, () => ({ p: rnd() * 6.28, a: 0.6 + rnd() * 1.2, b: 0.3 + rnd() * 0.9, k: 1.2 + rnd() * 0.8 }));
    for (let y = 0; y < size; y++) {
      const v = ((size - 1 - y) / size) * tiles * tileSize;
      const ty = Math.min(tiles - 1, Math.floor(v / tileSize));
      const lv = v - ty * tileSize;
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const u = (x / size) * tiles * tileSize;
        const tx = Math.min(tiles - 1, Math.floor(u / tileSize));
        const lu = u - tx * tileSize;
        const ph = phases[ty * tiles + tx];
        const arg = (lu * ph.a + lv * ph.b) * 6.28 * ph.k + warp[i] * 7 + ph.p;
        const band = Math.abs(Math.sin(arg));
        const vein = 1 - smooth(0.0, 0.16, band);
        const thin = 1 - smooth(0.0, 0.05, Math.abs(Math.sin(arg * 2.3 + fine[i] * 9)));
        const cl = (cloud[i] - 0.5) * 0.05;
        const veinMix = clamp01(vein * 0.45 + thin * 0.3);
        let r = mix(0.935 + cl, 0.6, veinMix);
        let g = mix(0.918 + cl, 0.585, veinMix);
        let b = mix(0.885 + cl, 0.565, veinMix);
        const edge = Math.min(lu, tileSize - lu, lv, tileSize - lv);
        let rough = 0.1 + veinMix * 0.06;
        let h = 0.6;
        if (edge < grout) {
          r = 0.74;
          g = 0.71;
          b = 0.66;
          rough = 0.7;
          h = 0;
        }
        setColour(s, i, r, g, b);
        s.height[i] = h;
        s.rough[i] = rough;
      }
    }
    return { s, tile: [1.2, 1.2], strength: 3 };
  },

  porcelain(size, rnd) {
    const s = surface(size);
    const cloud = fbm(size, 5, 4, rnd);
    const speck = fbm(size, 128, 2, rnd);
    const tones = [0, 1].map(() => (rnd() - 0.5) * 0.025);
    for (let y = 0; y < size; y++) {
      const v = ((size - 1 - y) / size) * 1.2;
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const u = (x / size) * 1.2;
        const col = u < 0.6 ? 0 : 1;
        const lu = u - col * 0.6;
        const edge = Math.min(lu, 0.6 - lu, v, 1.2 - v);
        const tone = 0.8 + tones[col] + (cloud[i] - 0.5) * 0.05 + (speck[i] - 0.5) * 0.025;
        if (edge < 0.0015) {
          setColour(s, i, 0.6, 0.585, 0.56);
          s.height[i] = 0;
          s.rough[i] = 0.85;
        } else {
          setColour(s, i, tone, tone * 0.98, tone * 0.95);
          s.height[i] = 0.6 + speck[i] * 0.05;
          s.rough[i] = 0.3 + (cloud[i] - 0.5) * 0.1;
        }
      }
    }
    return { s, tile: [1.2, 1.2], strength: 3 };
  },

  'oak-floor'(size, rnd) {
    const s = surface(size);
    const grain = fbm(size, 3, 5, rnd, { stretch: 28 });
    const figure = fbm(size, 2, 3, rnd, { stretch: 6 });
    const rows = makeRows(2.4, 2.4, [0.2], 0.6, 1.8, rnd);
    layUnits(s, [2.4, 2.4], rows, (i, unit, du, dv) => {
      const g = grain[i];
      const ring = (g * 9 + figure[i] * 2 + unit * 5) % 1;
      const late = smooth(0.78, 0.98, ring);
      const tone = 0.9 + unit * 0.16;
      const grainTone = 0.92 + g * 0.16;
      let r = 0.62 * tone * grainTone * (1 - late * 0.1);
      let gg = 0.49 * tone * grainTone * (1 - late * 0.12);
      let b = 0.37 * tone * grainTone * (1 - late * 0.13);
      const joint = Math.min(du, dv);
      const bevel = smooth(0.0, 0.003, joint);
      r *= 0.55 + 0.45 * bevel;
      gg *= 0.55 + 0.45 * bevel;
      b *= 0.55 + 0.45 * bevel;
      setColour(s, i, r, gg, b);
      s.height[i] = bevel * (0.75 + g * 0.08 - late * 0.04);
      s.rough[i] = 0.42 + g * 0.12 + (1 - bevel) * 0.3;
    });
    return { s, tile: [2.4, 2.4], strength: 3.5 };
  },

  walnut(size, rnd) {
    const s = surface(size);
    const grain = fbm(size, 2, 5, rnd, { stretch: 24 });
    const figure = fbm(size, 3, 3, rnd, { stretch: 4 });
    for (let i = 0; i < size * size; i++) {
      const ring = (grain[i] * 11 + figure[i] * 3) % 1;
      const late = smooth(0.7, 0.98, ring);
      const k = (0.86 + grain[i] * 0.3) * (1 - late * 0.3);
      setColour(s, i, 0.4 * k, 0.25 * k, 0.16 * k);
      s.height[i] = grain[i] * 0.5 - late * 0.2;
      s.rough[i] = 0.42 + late * 0.12;
    }
    return { s, tile: [1, 1], strength: 1.2 };
  },

  'stone-cladding'(size, rnd) {
    const s = surface(size);
    const face = fbm(size, 24, 4, rnd);
    const low = fbm(size, 6, 3, rnd);
    const palette = [[0.74, 0.67, 0.56], [0.64, 0.6, 0.53], [0.57, 0.49, 0.4], [0.79, 0.75, 0.67], [0.68, 0.6, 0.5]];
    const rows = makeRows(1.2, 1.2, [0.08, 0.11, 0.14, 0.18], 0.16, 0.5, rnd);
    const mortar = 0.006;
    layUnits(s, [1.2, 1.2], rows, (i, unit, du, dv) => {
      const edge = Math.min(du, dv);
      if (edge < mortar) {
        const m = 0.5 + (face[i] - 0.5) * 0.06;
        setColour(s, i, m, m * 0.97, m * 0.93);
        s.height[i] = 0.05 * face[i];
        s.rough[i] = 0.95;
        return;
      }
      const base = palette[Math.floor(unit * palette.length) % palette.length];
      const shade = 0.88 + (face[i] - 0.5) * 0.22 + (low[i] - 0.5) * 0.1 + (unit - 0.5) * 0.12;
      setColour(s, i, base[0] * shade, base[1] * shade, base[2] * shade);
      const bulge = smooth(mortar, mortar + 0.02, edge);
      s.height[i] = 0.25 + bulge * 0.45 + face[i] * 0.3;
      s.rough[i] = 0.86 + (face[i] - 0.5) * 0.1;
    });
    return { s, tile: [1.2, 1.2], strength: 4.5 };
  },

  brick(size, rnd) {
    const s = surface(size);
    const grain = fbm(size, 48, 3, rnd);
    const low = fbm(size, 4, 3, rnd);
    const course = 0.086;
    const stretcher = 0.239;
    const courses = 12;
    const width = stretcher * 4;
    const height = course * courses;
    const joint = 0.005;
    const palette = [[0.66, 0.33, 0.22], [0.6, 0.28, 0.19], [0.7, 0.41, 0.29], [0.63, 0.31, 0.2], [0.5, 0.25, 0.17]];
    const seeds = Array.from({ length: courses * 8 }, () => rnd());
    for (let y = 0; y < size; y++) {
      const v = ((size - 1 - y) / size) * height;
      const c = Math.min(courses - 1, Math.floor(v / course));
      const lv = v - c * course;
      const header = c % 2 === 1;
      const unitLen = header ? stretcher / 2 : stretcher;
      const offset = header ? stretcher / 4 : 0;
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const u = ((x / size) * width + offset) % width;
        const n = Math.floor(u / unitLen);
        const lu = u - n * unitLen;
        const edge = Math.min(lu, unitLen - lu, lv, course - lv);
        if (edge < joint) {
          const m = 0.7 + (grain[i] - 0.5) * 0.08;
          setColour(s, i, m, m * 0.97, m * 0.92);
          s.height[i] = 0.1;
          s.rough[i] = 0.95;
          continue;
        }
        const seed = seeds[(c * 8 + n) % seeds.length];
        const base = palette[Math.floor(seed * palette.length) % palette.length];
        const shade = 0.9 + (grain[i] - 0.5) * 0.25 + (low[i] - 0.5) * 0.12 + (seed - 0.5) * 0.15;
        setColour(s, i, base[0] * shade, base[1] * shade, base[2] * shade);
        s.height[i] = 0.55 + smooth(joint, joint + 0.006, edge) * 0.3 + grain[i] * 0.15;
        s.rough[i] = 0.84 + (grain[i] - 0.5) * 0.1;
      }
    }
    return { s, tile: [width, height], strength: 3.5 };
  },

  'fabric-linen'(size, rnd) {
    const s = surface(size);
    const slubU = fbm(size, 6, 3, rnd, { stretch: 16 });
    const slubV = fbm(size, 96, 3, rnd, { stretch: 1 / 16 });
    const threads = 128;
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const u = x / size;
        const cu = u * threads;
        const cv = v * threads;
        const over = (Math.floor(cu) + Math.floor(cv)) % 2 === 0;
        const warp = Math.sin((cu % 1) * Math.PI);
        const weft = Math.sin((cv % 1) * Math.PI);
        const h = over ? warp * 0.7 + weft * 0.3 : weft * 0.7 + warp * 0.3;
        const slub = over ? slubU[i] : slubV[i];
        const tone = 0.8 + slub * 0.1 + h * 0.06;
        setColour(s, i, tone, tone * 0.985, tone * 0.96);
        s.height[i] = h * 0.8 + slub * 0.2;
        s.rough[i] = 0.94;
      }
    }
    return { s, tile: [0.25, 0.25], strength: 1.2 };
  },

  leather(size, rnd) {
    const s = surface(size);
    const grain = fbm(size, 40, 4, rnd);
    const crease = fbm(size, 6, 4, rnd);
    for (let i = 0; i < size * size; i++) {
      const pebble = 1 - Math.pow(Math.abs(grain[i] - 0.5) * 2, 0.6);
      const fold = 1 - smooth(0, 0.05, Math.abs(crease[i] - 0.5));
      const tone = 0.8 + pebble * 0.06 - fold * 0.08;
      setColour(s, i, tone, tone, tone);
      s.height[i] = pebble * 0.6 - fold * 0.4;
      s.rough[i] = 0.48 + (1 - pebble) * 0.15 + fold * 0.1;
    }
    return { s, tile: [0.4, 0.4], strength: 1.5 };
  },

  lawn(size, rnd) {
    const s = surface(size);
    const tufts = fbm(size, 24, 4, rnd);
    const clumps = fbm(size, 96, 2, rnd);
    for (let i = 0; i < size * size; i++) {
      const blade = rnd();
      const shade = (tufts[i] - 0.5) * 0.12 + (clumps[i] - 0.5) * 0.1;
      const k = 0.88 + blade * 0.22 + shade;
      const dry = blade > 0.9 ? 0.5 : smooth(0.55, 0.85, clumps[i]) * 0.18;
      setColour(s, i, mix(0.33, 0.56, dry) * k, mix(0.4, 0.52, dry) * k, mix(0.24, 0.34, dry) * k);
      s.height[i] = blade * 0.6 + tufts[i] * 0.25 + clumps[i] * 0.15;
      s.rough[i] = 0.95;
    }
    return { s, tile: [3, 3], strength: 2.5 };
  },

  paving(size, rnd) {
    const s = surface(size);
    const speck = fbm(size, 160, 2, rnd);
    const low = fbm(size, 4, 3, rnd);
    const rows = Array.from({ length: 4 }, (_, r) => ({ height: 0.3, cuts: [0, 0.6].map((c) => (c + (r % 2) * 0.3) % 1.2).sort((a, b) => a - b), seeds: [rnd(), rnd()] }));
    layUnits(s, [1.2, 1.2], rows, (i, unit, du, dv) => {
      const edge = Math.min(du, dv);
      if (edge < 0.003) {
        setColour(s, i, 0.34, 0.33, 0.31);
        s.height[i] = 0;
        s.rough[i] = 0.95;
        return;
      }
      const tone = 0.64 + (unit - 0.5) * 0.06 + (speck[i] - 0.5) * 0.08 + (low[i] - 0.5) * 0.06;
      setColour(s, i, tone, tone * 0.98, tone * 0.94);
      s.height[i] = 0.5 + smooth(0.003, 0.008, edge) * 0.3 + speck[i] * 0.2;
      s.rough[i] = 0.85;
    });
    return { s, tile: [1.2, 1.2], strength: 3 };
  },

  asphalt(size, rnd) {
    const s = surface(size);
    const low = fbm(size, 4, 4, rnd);
    const mid = fbm(size, 64, 2, rnd);
    for (let i = 0; i < size * size; i++) {
      const stone = rnd() > 0.985 ? 0.18 + rnd() * 0.12 : 0;
      const tone = 0.16 + (low[i] - 0.5) * 0.04 + (mid[i] - 0.5) * 0.04 + stone;
      setColour(s, i, tone, tone, tone * 1.02);
      s.height[i] = mid[i] * 0.6 + (stone > 0 ? 0.4 : 0);
      s.rough[i] = 0.9 - stone * 0.5;
    }
    return { s, tile: [2, 2], strength: 2 };
  },

  gravel(size, rnd) {
    const s = surface(size);
    const base = fbm(size, 32, 2, rnd);
    for (let i = 0; i < size * size; i++) {
      const t = 0.42 + base[i] * 0.1;
      setColour(s, i, t, t * 0.96, t * 0.9);
      s.height[i] = 0;
      s.rough[i] = 0.95;
    }
    const pebbles = Math.round((size * size) / 90);
    const colours = [[0.7, 0.67, 0.6], [0.58, 0.56, 0.52], [0.78, 0.76, 0.72], [0.62, 0.55, 0.47]];
    for (let k = 0; k < pebbles; k++) {
      const cx = rnd() * size;
      const cy = rnd() * size;
      const r = (size / 1024) * (5 + rnd() * 7);
      const c = colours[Math.floor(rnd() * colours.length)];
      const shade = 0.85 + rnd() * 0.25;
      const ri = Math.ceil(r);
      for (let dy = -ri; dy <= ri; dy++) {
        for (let dx = -ri; dx <= ri; dx++) {
          const d = Math.sqrt(dx * dx + dy * dy) / r;
          if (d > 1) continue;
          const i = ((Math.floor(cy) + dy + size) % size) * size + ((Math.floor(cx) + dx + size) % size);
          const dome = Math.sqrt(1 - d * d);
          if (dome < s.height[i]) continue;
          s.height[i] = dome;
          setColour(s, i, c[0] * shade * (0.8 + dome * 0.2), c[1] * shade * (0.8 + dome * 0.2), c[2] * shade * (0.8 + dome * 0.2));
          s.rough[i] = 0.75;
        }
      }
    }
    return { s, tile: [1, 1], strength: 4 };
  },

  'brushed-steel'(size, rnd) {
    const s = surface(size);
    const streak = fbm(size, 1, 4, rnd, { stretch: 256 });
    for (let i = 0; i < size * size; i++) {
      const t = 0.66 + (streak[i] - 0.5) * 0.08;
      setColour(s, i, t, t * 1.005, t * 1.01);
      s.height[i] = streak[i];
      s.rough[i] = 0.3 + streak[i] * 0.14;
    }
    return { s, tile: [0.5, 0.5], strength: 0.3 };
  },

  'carpet-tile'(size, rnd) {
    const s = surface(size);
    const rowsDir = fbm(size, 4, 3, rnd, { stretch: 48 });
    const colsDir = fbm(size, 192, 3, rnd, { stretch: 1 / 48 });
    const tones = [0, 1, 2, 3].map(() => (rnd() - 0.5) * 0.03);
    for (let y = 0; y < size; y++) {
      const ty = y < size / 2 ? 0 : 1;
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const tx = x < size / 2 ? 0 : 1;
        const turned = (tx + ty) % 2 === 1;
        const pile = turned ? colsDir[i] : rowsDir[i];
        const fibre = rnd();
        const tone = 0.3 + tones[ty * 2 + tx] + (pile - 0.5) * 0.05 + (fibre - 0.5) * 0.05;
        setColour(s, i, tone * 0.96, tone, tone * 1.07);
        s.height[i] = fibre * 0.5 + pile * 0.5;
        s.rough[i] = 1;
      }
    }
    return { s, tile: [1, 1], strength: 1.5 };
  }
};

/**
 * Tangent-space normal map (OpenGL convention, +Y up the texture) from a tileable height field.
 * @param {Float32Array} height
 * @param {number} size
 * @param {number} strength slope multiplier
 * @returns {Uint8ClampedArray} RGBA bytes
 */
function normalsFromHeight(height, size, strength) {
  const out = new Uint8ClampedArray(size * size * 4);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  const k = strength * (size / 512);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * k;
      let ny = dy * k;
      const len = Math.sqrt(nx * nx + ny * ny + 1);
      nx /= len;
      ny /= len;
      const nz = 1 / len;
      const o = (y * size + x) * 4;
      out[o] = (nx * 0.5 + 0.5) * 255;
      out[o + 1] = (ny * 0.5 + 0.5) * 255;
      out[o + 2] = (nz * 0.5 + 0.5) * 255;
      out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * Wraps RGBA bytes in a repeating CanvasTexture.
 * @param {Uint8ClampedArray} bytes
 * @param {number} size
 * @param {boolean} srgb true for colour maps
 * @returns {THREE.CanvasTexture}
 */
function toTexture(bytes, size, srgb) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d').putImageData(new ImageData(bytes, size, size), 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * String hash used to seed each generator, so every id has a stable look.
 * @param {string} text
 * @returns {number}
 */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Generates (or returns the cached) PBR maps for a procedural id.
 * @param {string} id one of PROCEDURAL_IDS
 * @param {number} [size=512] pixels per side (512 or 1024)
 * @returns {{ map: THREE.CanvasTexture, normalMap: THREE.CanvasTexture, roughnessMap: THREE.CanvasTexture, tile: [number, number] } | null}
 *   `tile` is the real-world size (metres) one repeat covers; `map.userData.mean` is the average
 *   sRGB colour (0..1 channels); null for unknown ids
 */
export function generateTexture(id, size = 512) {
  const key = `${id}@${size}`;
  if (cache.has(key)) return cache.get(key);
  const generator = GENERATORS[id];
  if (!generator) return null;
  const { s, tile, strength } = generator(size, random(hash(id)));
  const n = size * size;
  const colour = new Uint8ClampedArray(n * 4);
  const rough = new Uint8ClampedArray(n * 4);
  const mean = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) mean[k] += s.albedo[i * 3 + k] / n;
    colour[i * 4] = s.albedo[i * 3] * 255;
    colour[i * 4 + 1] = s.albedo[i * 3 + 1] * 255;
    colour[i * 4 + 2] = s.albedo[i * 3 + 2] * 255;
    colour[i * 4 + 3] = 255;
    const r = clamp01(s.rough[i]) * 255;
    rough[i * 4] = r;
    rough[i * 4 + 1] = r;
    rough[i * 4 + 2] = r;
    rough[i * 4 + 3] = 255;
  }
  const result = {
    map: toTexture(colour, size, true),
    normalMap: toTexture(normalsFromHeight(s.height, size, strength), size, false),
    roughnessMap: toTexture(rough, size, false),
    tile
  };
  result.map.userData.mean = mean;
  cache.set(key, result);
  return result;
}

/**
 * Whether the maps for an id and size are already generated.
 * @param {string} id
 * @param {number} size
 * @returns {boolean}
 */
export function isGenerated(id, size) {
  return cache.has(`${id}@${size}`);
}
