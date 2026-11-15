/**
 * Minimal R12 ASCII DXF writer (AC1009): header with $INSUNITS, linetype, layer and text-style
 * tables, and LINE, POLYLINE/VERTEX/SEQEND, ARC, CIRCLE and TEXT entities. Opens in AutoCAD,
 * LibreCAD and every DXF viewer. No dependencies.
 */

/** Linetypes in millimetres (acadiso.lin patterns). */
const LINETYPES = {
  CONTINUOUS: { description: 'Solid line', pattern: [] },
  DASHED: { description: 'Dashed __ __ __', pattern: [12.7, -6.35] },
  HIDDEN: { description: 'Hidden _ _ _ _', pattern: [6.35, -3.175] },
  CENTER: { description: 'Center ____ _ ____', pattern: [31.75, -6.35, 6.35, -6.35] },
  PHANTOM: { description: 'Phantom ____ _ _ ____', pattern: [31.75, -6.35, 6.35, -6.35, 6.35, -6.35] }
};
const H_ALIGN = { left: 0, center: 1, right: 2 };
const V_ALIGN = { baseline: 0, bottom: 1, middle: 2, top: 3 };

/**
 * Formats a number for DXF: up to 4 decimals, no trailing zeros, no "-0".
 * @param {number} value
 * @returns {string}
 */
function num(value) {
  const fixed = Number(value).toFixed(4).replace(/\.?0+$/, '');
  return fixed === '-0' ? '0' : fixed;
}

/**
 * Encodes text for an R12 file: ± and ° as %% codes, other non-ASCII characters as \U+XXXX.
 * @param {string} text
 * @returns {string}
 */
function encodeText(text) {
  return String(text)
    .replace(/±/g, '%%p')
    .replace(/°/g, '%%d')
    .replace(/[^\x20-\x7e]/g, (ch) => `\\U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
}

/**
 * Creates an R12 DXF document builder.
 * @param {{ insunits?: number | null, ltscale?: number }} [options] $INSUNITS (4 = mm; null leaves it out) and $LTSCALE
 * @returns {{
 *   layer: (name: string, style?: { color?: number, linetype?: string }) => void,
 *   line: (layer: string, a: number[], b: number[]) => void,
 *   poly: (layer: string, points: number[][], closed?: boolean) => void,
 *   arc: (layer: string, center: number[], radius: number, startDeg: number, endDeg: number) => void,
 *   circle: (layer: string, center: number[], radius: number) => void,
 *   text: (layer: string, at: number[], height: number, text: string, rotationDeg?: number, align?: { h?: 'left'|'center'|'right', v?: 'baseline'|'bottom'|'middle'|'top' }) => void,
 *   toString: () => string
 * }}
 */
export function createDxf({ insunits = 4, ltscale = 25 } = {}) {
  const layers = new Map();
  const body = [];
  let min = [Infinity, Infinity];
  let max = [-Infinity, -Infinity];
  const grow = (p) => {
    min = [Math.min(min[0], p[0]), Math.min(min[1], p[1])];
    max = [Math.max(max[0], p[0]), Math.max(max[1], p[1])];
  };
  const use = (name) => {
    if (!layers.has(name)) layers.set(name, { color: 7, linetype: 'CONTINUOUS' });
  };
  const pair = (code, value) => body.push(String(code), String(value));

  return {
    layer(name, { color = 7, linetype = 'CONTINUOUS' } = {}) {
      layers.set(name, { color, linetype: LINETYPES[linetype] ? linetype : 'CONTINUOUS' });
    },
    line(layer, a, b) {
      use(layer);
      pair(0, 'LINE');
      pair(8, layer);
      pair(10, num(a[0])); pair(20, num(a[1])); pair(30, 0);
      pair(11, num(b[0])); pair(21, num(b[1])); pair(31, 0);
      grow(a); grow(b);
    },
    poly(layer, points, closed = false) {
      use(layer);
      pair(0, 'POLYLINE');
      pair(8, layer);
      pair(66, 1);
      pair(10, 0); pair(20, 0); pair(30, 0);
      pair(70, closed ? 1 : 0);
      for (const p of points) {
        pair(0, 'VERTEX');
        pair(8, layer);
        pair(10, num(p[0])); pair(20, num(p[1])); pair(30, 0);
        grow(p);
      }
      pair(0, 'SEQEND');
      pair(8, layer);
    },
    arc(layer, center, radius, startDeg, endDeg) {
      use(layer);
      pair(0, 'ARC');
      pair(8, layer);
      pair(10, num(center[0])); pair(20, num(center[1])); pair(30, 0);
      pair(40, num(radius));
      pair(50, num(startDeg));
      pair(51, num(endDeg));
      grow([center[0] - radius, center[1] - radius]); grow([center[0] + radius, center[1] + radius]);
    },
    circle(layer, center, radius) {
      use(layer);
      pair(0, 'CIRCLE');
      pair(8, layer);
      pair(10, num(center[0])); pair(20, num(center[1])); pair(30, 0);
      pair(40, num(radius));
      grow([center[0] - radius, center[1] - radius]); grow([center[0] + radius, center[1] + radius]);
    },
    text(layer, at, height, text, rotationDeg = 0, align = {}) {
      use(layer);
      const h = H_ALIGN[align.h ?? 'left'] ?? 0;
      const v = V_ALIGN[align.v ?? 'baseline'] ?? 0;
      pair(0, 'TEXT');
      pair(8, layer);
      pair(10, num(at[0])); pair(20, num(at[1])); pair(30, 0);
      pair(40, num(height));
      pair(1, encodeText(text));
      if (rotationDeg) pair(50, num(rotationDeg));
      if (h || v) {
        pair(72, h);
        pair(11, num(at[0])); pair(21, num(at[1])); pair(31, 0);
        pair(73, v);
      }
      grow(at);
    },
    toString() {
      const out = [];
      const p = (code, value) => out.push(String(code), String(value));
      const lo = Number.isFinite(min[0]) ? min : [0, 0];
      const hi = Number.isFinite(max[0]) ? max : [0, 0];
      p(0, 'SECTION'); p(2, 'HEADER');
      p(9, '$ACADVER'); p(1, 'AC1009');
      if (insunits !== null) {
        p(9, '$INSUNITS'); p(70, insunits);
      }
      p(9, '$MEASUREMENT'); p(70, 1);
      p(9, '$LTSCALE'); p(40, num(ltscale));
      p(9, '$EXTMIN'); p(10, num(lo[0])); p(20, num(lo[1])); p(30, 0);
      p(9, '$EXTMAX'); p(10, num(hi[0])); p(20, num(hi[1])); p(30, 0);
      p(0, 'ENDSEC');
      p(0, 'SECTION'); p(2, 'TABLES');
      const ltypes = Object.entries(LINETYPES);
      p(0, 'TABLE'); p(2, 'LTYPE'); p(70, ltypes.length);
      for (const [name, { description, pattern }] of ltypes) {
        p(0, 'LTYPE'); p(2, name); p(70, 0); p(3, description); p(72, 65); p(73, pattern.length);
        p(40, num(pattern.reduce((s, v) => s + Math.abs(v), 0)));
        for (const v of pattern) p(49, num(v));
      }
      p(0, 'ENDTAB');
      p(0, 'TABLE'); p(2, 'LAYER'); p(70, layers.size + 1);
      p(0, 'LAYER'); p(2, '0'); p(70, 0); p(62, 7); p(6, 'CONTINUOUS');
      for (const [name, { color, linetype }] of layers) {
        if (name === '0') continue;
        p(0, 'LAYER'); p(2, name); p(70, 0); p(62, color); p(6, linetype);
      }
      p(0, 'ENDTAB');
      p(0, 'TABLE'); p(2, 'STYLE'); p(70, 1);
      p(0, 'STYLE'); p(2, 'STANDARD'); p(70, 0); p(40, 0); p(41, 1); p(50, 0); p(71, 0); p(42, 2.5); p(3, 'txt'); p(4, '');
      p(0, 'ENDTAB');
      p(0, 'ENDSEC');
      p(0, 'SECTION'); p(2, 'BLOCKS'); p(0, 'ENDSEC');
      p(0, 'SECTION'); p(2, 'ENTITIES');
      for (const line of body) out.push(line);
      p(0, 'ENDSEC');
      p(0, 'EOF');
      return `${out.join('\r\n')}\r\n`;
    }
  };
}
