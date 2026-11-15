/**
 * Small hand-drawn DXF plans for the importer tests, written with the sample-set DXF writer.
 * Units are millimetres unless a builder says otherwise.
 */
import { createDxf } from '../../../tools/sample-drawings/dxf-writer.mjs';
import { parseDxf } from '../../../website/assets/app/importers/dxf/reader.js';

/**
 * Draws an axis-aligned rectangle outline as four lines.
 * @returns {void}
 */
export function rect(d, layer, [x0, y0], [x1, y1]) {
  d.poly(layer, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true);
}

/**
 * One room 4000 × 3000 mm clear with 230 mm walls (outer 4460 × 3460 from the origin).
 * @param {{ text?: string | null, insunits?: number | null }} [options]
 * @returns {import('../../../website/assets/app/importers/dxf/reader.js').DxfDoc}
 */
export function singleRoom({ text = null, insunits = 4 } = {}) {
  const d = createDxf({ insunits });
  rect(d, 'A-WALL', [0, 0], [4460, 3460]);
  rect(d, 'A-WALL', [230, 230], [4230, 3230]);
  if (text) d.text('A-AREA-IDEN', [2230, 1730], 200, text, 0, { h: 'center', v: 'middle' });
  d.text('A-ANNO-TTLB', [0, -1500], 500, 'GROUND FLOOR PLAN');
  return parseDxf(d.toString());
}

/**
 * Two rooms 8000 × 5000 mm overall clear, split by a 115 mm partition centred at x = 4115.
 * The partition meets the outer wall in two T-junctions.
 * @returns {import('../../../website/assets/app/importers/dxf/reader.js').DxfDoc}
 */
export function twoRooms() {
  const d = createDxf();
  rect(d, 'A-WALL', [0, 0], [8230, 5230]);
  rect(d, 'A-WALL', [230, 230], [4057.5, 5000]);
  rect(d, 'A-WALL', [4172.5, 230], [8000, 5000]);
  d.text('A-AREA-IDEN', [2100, 2600], 200, 'LOUNGE', 0, { h: 'center', v: 'middle' });
  d.text('A-AREA-IDEN', [2100, 2300], 150, '12\'-6" x 15\'-9"', 0, { h: 'center', v: 'middle' });
  d.text('A-AREA-IDEN', [6100, 2600], 200, 'BED ROOM', 0, { h: 'center', v: 'middle' });
  return parseDxf(d.toString());
}

/**
 * The single room with a 900 mm door in the south wall (x 1500–2400) drawn as a leaf and swing
 * arc on A-DOOR with tag D1, and a 1500 mm window in the north wall (x 1000–2500) drawn as a
 * frame and glass line on A-GLAZ with tag W1.
 * @returns {import('../../../website/assets/app/importers/dxf/reader.js').DxfDoc}
 */
export function roomWithOpenings() {
  const d = createDxf();
  const wall = (a, b) => d.line('A-WALL', a, b);
  wall([0, 0], [1500, 0]); wall([2400, 0], [4460, 0]);
  wall([230, 230], [1500, 230]); wall([2400, 230], [4230, 230]);
  wall([1500, 0], [1500, 230]); wall([2400, 0], [2400, 230]);
  wall([4460, 0], [4460, 3460]); wall([4230, 230], [4230, 3230]);
  wall([0, 3460], [1000, 3460]); wall([2500, 3460], [4460, 3460]);
  wall([230, 3230], [1000, 3230]); wall([2500, 3230], [4230, 3230]);
  wall([1000, 3230], [1000, 3460]); wall([2500, 3230], [2500, 3460]);
  wall([0, 0], [0, 3460]); wall([230, 230], [230, 3230]);
  d.line('A-DOOR', [1500, 230], [1500, 1130]);
  d.arc('A-DOOR', [1500, 230], 900, 0, 90);
  d.text('A-DOOR-IDEN', [1950, 700], 150, 'D1', 0, { h: 'center', v: 'middle' });
  rect(d, 'A-GLAZ', [1000, 3230], [2500, 3460]);
  d.line('A-GLAZ', [1000, 3345], [2500, 3345]);
  d.text('A-GLAZ-IDEN', [1750, 3800], 150, 'W1', 0, { h: 'center', v: 'middle' });
  d.text('A-AREA-IDEN', [2230, 1730], 200, 'STUDY', 0, { h: 'center', v: 'middle' });
  return parseDxf(d.toString());
}

/**
 * A 12′ × 10′ clear bedroom with 9″ walls drawn in inches on layer 0, no $INSUNITS, no wall layer.
 * @returns {import('../../../website/assets/app/importers/dxf/reader.js').DxfDoc}
 */
export function inchRoomOnLayer0() {
  const d = createDxf({ insunits: null });
  rect(d, '0', [0, 0], [162, 138]);
  rect(d, '0', [9, 9], [153, 129]);
  d.text('0', [81, 69], 9, 'BED ROOM', 0, { h: 'center', v: 'middle' });
  d.circle('0', [40, 40], 6);
  return parseDxf(d.toString());
}

/**
 * Parses a writer document.
 * @returns {import('../../../website/assets/app/importers/dxf/reader.js').DxfDoc}
 */
export function parse(d) {
  return parseDxf(d.toString());
}

/**
 * DXF text with `count` short lines at random angles scattered over 30 × 20 m (mm), as an
 * exploded hatch or brick pattern on the wall layer gives, plus a "GROUND FLOOR PLAN" title.
 * Seeded, so every run draws the same lines.
 * @param {number} count
 * @param {{ layer?: string, insunits?: number | null, seed?: number }} [options]
 * @returns {string}
 */
export function scatteredLines(count, { layer = 'A-WALL', insunits = 4, seed = 7 } = {}) {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const parts = [];
  if (insunits !== null) parts.push('0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n', String(insunits), '\n0\nENDSEC\n');
  parts.push('0\nSECTION\n2\nENTITIES\n');
  for (let i = 0; i < count; i++) {
    const x = rnd() * 30000;
    const y = rnd() * 20000;
    parts.push(`0\nLINE\n8\n${layer}\n10\n${x}\n20\n${y}\n11\n${x + rnd() * 900}\n21\n${y + rnd() * 900}\n`);
  }
  parts.push('0\nTEXT\n8\nA-ANNO-TTLB\n10\n0\n20\n-2000\n40\n500\n1\nGROUND FLOOR PLAN\n0\nENDSEC\n0\nEOF\n');
  return parts.join('');
}

/**
 * A large regular plan: `rows × cols` rooms 3500 × 3000 mm clear with 230 mm double-line walls,
 * a 900 mm door (leaf and swing on A-DOOR) in each room's south wall except along the outside,
 * and a room name in each room.
 * @param {number} rows
 * @param {number} cols
 * @returns {import('../../../website/assets/app/importers/dxf/reader.js').DxfDoc}
 */
export function roomGrid(rows, cols) {
  const d = createDxf();
  const t = 230;
  const xs = Array.from({ length: cols + 1 }, (_, i) => i * (3500 + t));
  const ys = Array.from({ length: rows + 1 }, (_, j) => j * (3000 + t));
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x0 = xs[i] + t - (i === 0 ? t : 0);
      const x1 = xs[i + 1] + (i === cols - 1 ? t : 0);
      const door = j > 0 ? [xs[i] + t + 600, xs[i] + t + 1500] : null;
      for (const y of [ys[j], ys[j] + t]) {
        if (!door) {
          d.line('A-WALL', [x0, y], [x1, y]);
          continue;
        }
        d.line('A-WALL', [x0, y], [door[0], y]);
        d.line('A-WALL', [door[1], y], [x1, y]);
      }
      if (door) {
        d.line('A-WALL', [door[0], ys[j]], [door[0], ys[j] + t]);
        d.line('A-WALL', [door[1], ys[j]], [door[1], ys[j] + t]);
        d.line('A-DOOR', [door[0], ys[j] + t], [door[0], ys[j] + t + 900]);
        d.arc('A-DOOR', [door[0], ys[j] + t], 900, 0, 90);
      }
    }
  }
  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j < rows; j++) {
      d.line('A-WALL', [xs[i], ys[j] + t], [xs[i], ys[j + 1]]);
      d.line('A-WALL', [xs[i] + t, ys[j] + t], [xs[i] + t, ys[j + 1]]);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) d.text('A-AREA-IDEN', [xs[i] + 1800, ys[j] + 1600], 200, `ROOM ${j * cols + i + 1}`);
  }
  d.text('A-ANNO-TTLB', [0, -2000], 500, 'GROUND FLOOR PLAN');
  return parseDxf(d.toString());
}

/**
 * DXF text with `count` separate 230 mm double-line wall stubs, 1–4 m long, at seeded random
 * places over a `span` × `span` mm square, square to the axes or (anyAngle) at any angle.
 * @param {number} count
 * @param {{ span?: number, anyAngle?: boolean, seed?: number }} [options]
 * @returns {string}
 */
export function wallStubs(count, { span = 100000, anyAngle = false, seed = 7 } = {}) {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const d = createDxf({ insunits: 4 });
  for (let k = 0; k < count; k++) {
    const x = rnd() * span;
    const y = rnd() * span;
    const len = 1000 + rnd() * 3000;
    const angle = anyAngle ? rnd() * Math.PI : (rnd() < 0.5 ? 0 : Math.PI / 2);
    const u = [Math.cos(angle), Math.sin(angle)];
    const n = [-u[1], u[0]];
    for (const o of [0, 230]) {
      const a = [x + n[0] * o, y + n[1] * o];
      d.line('A-WALL', a, [a[0] + u[0] * len, a[1] + u[1] * len]);
    }
  }
  d.text('A-ANNO-TTLB', [0, -2000], 500, 'GROUND FLOOR PLAN');
  return d.toString();
}

/**
 * DXF text with a `k` × `k` lattice of separate 1 m, 230 mm double-line wall stubs 3 m apart.
 * @param {number} k
 * @returns {string}
 */
export function stubLattice(k) {
  const d = createDxf({ insunits: 4 });
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      d.line('A-WALL', [i * 3000, j * 3000], [i * 3000 + 1000, j * 3000]);
      d.line('A-WALL', [i * 3000, j * 3000 + 230], [i * 3000 + 1000, j * 3000 + 230]);
    }
  }
  d.text('A-ANNO-TTLB', [0, -2000], 500, 'GROUND FLOOR PLAN');
  return d.toString();
}
