/**
 * ASCII DXF reader (R12 to current): header units, layers, blocks and model-space entities.
 * Blocks are expanded into model space; INSERTs are kept alongside their expanded children.
 * All coordinates stay in drawing units. Pure module: no DOM.
 *
 * Entity shapes:
 *   { type:'LINE', layer, a, b }
 *   { type:'POLY', layer, points, closed }
 *   { type:'ARC', layer, center, radius, startDeg, endDeg }   (anticlockwise from startDeg to endDeg)
 *   { type:'CIRCLE', layer, center, radius }
 *   { type:'TEXT', layer, at, text, height, rotationDeg }     (MTEXT gives one TEXT per line)
 *   { type:'INSERT', layer, name, at, rotationDeg, scale:[sx, sy], attributes:{ TAG: value } }
 */
import { tokenize, NOT_ASCII_DXF } from './tokenizer.js';

/** Deepest block nesting that is expanded; deeper (or recursive) inserts are left as INSERT only. */
const MAX_BLOCK_DEPTH = 8;
/** Most copies a MINSERT array may produce. */
const MAX_ARRAY_COPIES = 400;
/** Distance between MTEXT lines, as a multiple of the text height (AutoCAD's default spacing). */
const MTEXT_LINE_SPACING = 5 / 3;
/** MTEXT codes followed by an argument that ends with ';'. */
const MTEXT_ARG_CODES = 'ACcFfHQTWp';
/** MTEXT toggles without an argument (underline, overline, strike-through). */
const MTEXT_TOGGLES = 'LlOoKk';
const DEG = Math.PI / 180;
const IDENTITY = [1, 0, 0, 1, 0, 0];

/**
 * @typedef {object} DxfDoc
 * @property {string | null} version the $ACADVER header value, e.g. 'AC1009'
 * @property {number | null} insunits the $INSUNITS header value (4 = mm, 6 = m, 1 = in, 2 = ft)
 * @property {string[]} layers layer names from the layer table, then any other layer an entity uses
 * @property {object[]} entities model-space entities, blocks expanded (see the shapes above)
 * @property {{ min: [number, number], max: [number, number] }} extents of the entities
 * @property {string[]} warnings things that were read approximately
 */

/**
 * Decodes AutoCAD control codes in a text value: %%p (±), %%d (°), %%c (⌀), %%%, %%nnn,
 * \U+XXXX unicode escapes; %%u and %%o toggles are dropped.
 * @param {string} text
 * @returns {string}
 */
function decodeText(text) {
  return String(text)
    .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/%%(\d{3})/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/%%[pP]/g, '±')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[cC]/g, '⌀')
    .replace(/%%[uUoOkK]/g, '')
    .replace(/%%%/g, '%');
}

/**
 * Strips MTEXT formatting: \P and \N become line breaks, \~ a space, stacked fractions become
 * "a/b", font/height/colour/width codes and grouping braces are removed.
 * @param {string} text raw MTEXT value (code 3 chunks then code 1)
 * @returns {string[]} the non-empty lines
 */
function mtextLines(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{' || ch === '}') continue;
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = text[i + 1];
    if (next === undefined) break;
    if (next === 'P' || next === 'N' || next === 'X') {
      out += '\n';
      i += 1;
    } else if (next === '~') {
      out += ' ';
      i += 1;
    } else if (next === '\\' || next === '{' || next === '}') {
      out += next;
      i += 1;
    } else if (MTEXT_TOGGLES.includes(next)) {
      i += 1;
    } else if (next === 'U' && text[i + 2] === '+') {
      out += String.fromCharCode(parseInt(text.slice(i + 3, i + 7), 16) || 32);
      i += 6;
    } else if (next === 'S') {
      const end = text.indexOf(';', i);
      out += text.slice(i + 2, end < 0 ? text.length : end).replace(/[\^#]/g, '/');
      i = end < 0 ? text.length : end;
    } else if (MTEXT_ARG_CODES.includes(next)) {
      const end = text.indexOf(';', i);
      i = end < 0 ? text.length : end;
    } else {
      out += next;
      i += 1;
    }
  }
  return decodeText(out)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '');
}

/**
 * Reads one record's group codes.
 * @param {{ code: number, value: string }[]} codes
 * @returns {{ get: (code: number, fallback?: any) => string | any, num: (code: number, fallback?: number) => number, all: (code: number) => string[] }}
 */
function recordReader(codes) {
  const get = (code, fallback = undefined) => {
    const found = codes.find((c) => c.code === code);
    return found ? found.value : fallback;
  };
  const num = (code, fallback = 0) => {
    const value = Number(get(code));
    return Number.isFinite(value) && get(code) !== undefined ? value : fallback;
  };
  const all = (code) => codes.filter((c) => c.code === code).map((c) => c.value);
  return { get, num, all };
}

/**
 * Groups the pairs between `start` and `end` into records that each begin with a code 0.
 * @returns {{ type: string, codes: { code: number, value: string }[] }[]}
 */
function toRecords(pairs, start, end) {
  const records = [];
  let current = null;
  for (let i = start; i < end; i++) {
    const pair = pairs[i];
    if (pair.code === 0) {
      current = { type: pair.value, codes: [] };
      records.push(current);
    } else if (current) {
      current.codes.push(pair);
    }
  }
  return records;
}

/**
 * Index of the ENDSEC pair closing the section that starts at `start`.
 * @returns {number}
 */
function sectionEnd(pairs, start) {
  for (let i = start; i < pairs.length; i++) {
    if (pairs[i].code === 0 && (pairs[i].value === 'ENDSEC' || pairs[i].value === 'EOF')) return i;
  }
  return pairs.length;
}

/**
 * Reads $ACADVER and $INSUNITS from the header section.
 * @returns {{ version: string | null, insunits: number | null }}
 */
function readHeader(pairs, start, end) {
  let version = null;
  let insunits = null;
  for (let i = start; i < end; i++) {
    if (pairs[i].code !== 9) continue;
    const value = pairs[i + 1];
    if (!value) continue;
    if (pairs[i].value === '$ACADVER') version = value.value;
    if (pairs[i].value === '$INSUNITS') {
      const n = Number(value.value);
      insunits = Number.isFinite(n) ? n : null;
    }
  }
  return { version, insunits };
}

/**
 * Layer names from the LAYER table.
 * @returns {string[]}
 */
function readLayerTable(pairs, start, end) {
  const names = [];
  for (const record of toRecords(pairs, start, end)) {
    if (record.type !== 'LAYER') continue;
    const name = recordReader(record.codes).get(2);
    if (name !== undefined && !names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * Splits a record list into entity groups: POLYLINE with its VERTEXes and INSERT with its
 * ATTRIBs are gathered into one group up to their SEQEND.
 * @returns {{ type: string, codes: object[], children: object[] }[]}
 */
function groupEntities(records) {
  const groups = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.type === 'SEQEND' || record.type === 'VERTEX' || record.type === 'ATTRIB') continue;
    const group = { type: record.type, codes: record.codes, children: [] };
    if (record.type === 'POLYLINE' || record.type === 'INSERT') {
      const childType = record.type === 'POLYLINE' ? 'VERTEX' : 'ATTRIB';
      let j = i + 1;
      while (j < records.length && records[j].type === childType) {
        group.children.push(records[j]);
        j += 1;
      }
      if (j < records.length && records[j].type === 'SEQEND') j += 1;
      i = j - 1;
    }
    groups.push(group);
  }
  return groups;
}

/**
 * Reads the BLOCKS section into a map of block name → { base, groups }.
 * @returns {Map<string, { base: [number, number], groups: object[] }>}
 */
function readBlocks(pairs, start, end) {
  const blocks = new Map();
  const records = toRecords(pairs, start, end);
  for (let i = 0; i < records.length; i++) {
    if (records[i].type !== 'BLOCK') continue;
    const header = recordReader(records[i].codes);
    const name = header.get(2, '');
    const body = [];
    let j = i + 1;
    while (j < records.length && records[j].type !== 'ENDBLK') {
      body.push(records[j]);
      j += 1;
    }
    blocks.set(name, { base: [header.num(10), header.num(20)], groups: groupEntities(body) });
    i = j;
  }
  return blocks;
}

/**
 * Applies an affine transform [a, b, c, d, e, f] (x' = a·x + c·y + e, y' = b·x + d·y + f).
 * @returns {[number, number]}
 */
function apply(m, p) {
  return [m[0] * p[0] + m[2] * p[1] + m[4] + 0, m[1] * p[0] + m[3] * p[1] + m[5] + 0];
}

/**
 * Composes two transforms: the result applies `inner` first, then `outer`.
 * @returns {number[]}
 */
function compose(outer, inner) {
  const [a, b, c, d, e, f] = outer;
  const [a2, b2, c2, d2, e2, f2] = inner;
  return [
    a * a2 + c * b2, b * a2 + d * b2,
    a * c2 + c * d2, b * c2 + d * d2,
    a * e2 + c * f2 + e, b * e2 + d * f2 + f
  ];
}

/**
 * Transform of an insert: translate(at) · rotate(rotation) · scale(sx, sy) · translate(−base).
 * @returns {number[]}
 */
function insertTransform(at, rotationDeg, sx, sy, base) {
  const cos = Math.cos(rotationDeg * DEG);
  const sin = Math.sin(rotationDeg * DEG);
  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;
  return [a, b, c, d, at[0] - (a * base[0] + c * base[1]), at[1] - (b * base[0] + d * base[1])];
}

/**
 * Normalises an angle to [0, 360).
 * @returns {number}
 */
function normDeg(deg) {
  const r = ((deg % 360) + 360) % 360;
  return Math.abs(r - 360) < 1e-9 ? 0 : r + 0;
}

/**
 * Rounds away floating-point noise so transformed values compare cleanly.
 * @returns {number}
 */
function clean(value) {
  const rounded = Math.round(value * 1e9) / 1e9;
  return Math.abs(rounded - value) < 1e-9 ? rounded + 0 : value;
}

/**
 * Scale factor of a transform along its (transformed) y axis, used for text heights.
 * @returns {number}
 */
function yScale(m) {
  return Math.hypot(m[2], m[3]);
}

/**
 * Transforms a direction angle.
 * @returns {number} degrees
 */
function transformAngle(m, deg) {
  const v = [Math.cos(deg * DEG), Math.sin(deg * DEG)];
  const x = m[0] * v[0] + m[2] * v[1];
  const y = m[1] * v[0] + m[3] * v[1];
  return normDeg(clean((Math.atan2(y, x) * 180) / Math.PI));
}

/**
 * Applies a transform to one plain entity, returning a new entity.
 * @returns {object}
 */
function transformEntity(entity, m) {
  const pt = (p) => apply(m, p).map(clean);
  const det = m[0] * m[3] - m[1] * m[2];
  const radiusScale = Math.sqrt(Math.abs(det));
  switch (entity.type) {
    case 'LINE':
      return { ...entity, a: pt(entity.a), b: pt(entity.b) };
    case 'POLY':
      return { ...entity, points: entity.points.map(pt) };
    case 'CIRCLE':
      return { ...entity, center: pt(entity.center), radius: clean(entity.radius * radiusScale) };
    case 'ARC': {
      const center = pt(entity.center);
      const at = (deg) => [entity.center[0] + entity.radius * Math.cos(deg * DEG), entity.center[1] + entity.radius * Math.sin(deg * DEG)];
      const angleOf = (p) => normDeg(clean((Math.atan2(p[1] - center[1], p[0] - center[0]) * 180) / Math.PI));
      let startDeg = angleOf(apply(m, at(entity.startDeg)));
      let endDeg = angleOf(apply(m, at(entity.endDeg)));
      if (det < 0) [startDeg, endDeg] = [endDeg, startDeg];
      return { ...entity, center, radius: clean(entity.radius * radiusScale), startDeg, endDeg };
    }
    case 'TEXT':
      return { ...entity, at: pt(entity.at), height: clean(entity.height * yScale(m)), rotationDeg: transformAngle(m, entity.rotationDeg) };
    default:
      return entity;
  }
}

/**
 * Converts an entity group to zero or more plain entities (INSERT handled by the caller).
 * @param {{ type: string, codes: object[], children: object[] }} group
 * @param {string[]} warnings
 * @returns {object[]}
 */
function plainEntities(group, warnings) {
  const r = recordReader(group.codes);
  const layer = r.get(8, '0');
  switch (group.type) {
    case 'LINE':
      return [{ type: 'LINE', layer, a: [r.num(10), r.num(20)], b: [r.num(11), r.num(21)] }];
    case 'LWPOLYLINE': {
      const points = [];
      let bulged = false;
      for (const { code, value } of group.codes) {
        if (code === 10) points.push([Number(value), 0]);
        else if (code === 20 && points.length > 0) points[points.length - 1][1] = Number(value);
        else if (code === 42 && Number(value) !== 0) bulged = true;
      }
      if (bulged) warnings.push(`A curved polyline on layer ${layer} was read as straight segments.`);
      return [{ type: 'POLY', layer, points, closed: (r.num(70) & 1) === 1 }];
    }
    case 'POLYLINE': {
      const flags = r.num(70);
      if (flags & (16 | 64)) return [];
      let bulged = false;
      const points = [];
      for (const vertex of group.children) {
        const v = recordReader(vertex.codes);
        const vflags = v.num(70);
        if (vflags & 16) continue;
        if (v.num(42) !== 0) bulged = true;
        points.push([v.num(10), v.num(20)]);
      }
      if (bulged) warnings.push(`A curved polyline on layer ${layer} was read as straight segments.`);
      return [{ type: 'POLY', layer, points, closed: (flags & 1) === 1 }];
    }
    case 'ARC':
      return [{ type: 'ARC', layer, center: [r.num(10), r.num(20)], radius: r.num(40), startDeg: normDeg(r.num(50)), endDeg: normDeg(r.num(51)) }];
    case 'CIRCLE':
      return [{ type: 'CIRCLE', layer, center: [r.num(10), r.num(20)], radius: r.num(40) }];
    case 'TEXT':
    case 'ATTRIB': {
      if (group.type === 'ATTRIB' && (r.num(70) & 1) === 1) return [];
      const text = decodeText(r.get(1, '')).trim();
      if (text === '') return [];
      const justified = r.num(72) !== 0 || r.num(73) !== 0 || (group.type === 'ATTRIB' && r.num(74) !== 0);
      const hasAlign = r.get(11) !== undefined;
      const at = justified && hasAlign ? [r.num(11), r.num(21)] : [r.num(10), r.num(20)];
      return [{ type: 'TEXT', layer, at, text, height: r.num(40), rotationDeg: normDeg(r.num(50)) }];
    }
    case 'MTEXT':
      return mtextEntities(r, layer);
    default:
      return [];
  }
}

/**
 * Splits an MTEXT into one TEXT per line, stacked along the text's down direction.
 * @returns {object[]}
 */
function mtextEntities(r, layer) {
  const raw = [...r.all(3), r.get(1, '')].join('');
  const lines = mtextLines(raw);
  const height = r.num(40);
  const hasDirection = r.get(11) !== undefined;
  const rotationDeg = normDeg(hasDirection ? (Math.atan2(r.num(21), r.num(11)) * 180) / Math.PI : r.num(50));
  const attach = r.num(71, 1);
  const row = Math.floor((attach - 1) / 3);
  const spacing = height * MTEXT_LINE_SPACING;
  const down = [Math.sin(rotationDeg * DEG), -Math.cos(rotationDeg * DEG)];
  const origin = [r.num(10), r.num(20)];
  const n = lines.length;
  return lines.map((text, i) => {
    let offset = i * spacing;
    if (row === 1) offset = (i - (n - 1) / 2) * spacing;
    if (row === 2) offset = (i - (n - 1)) * spacing;
    return {
      type: 'TEXT',
      layer,
      at: [clean(origin[0] + down[0] * offset), clean(origin[1] + down[1] * offset)],
      text,
      height,
      rotationDeg: clean(rotationDeg)
    };
  });
}

/**
 * Appends items one by one: spreading a very large array into push() overflows the stack.
 * @param {object[]} target
 * @param {object[]} items
 */
function appendAll(target, items) {
  for (const item of items) target.push(item);
}

/**
 * Converts a DIMENSION into its drawn block (when present) or a single TEXT.
 * @returns {{ entities: object[], pendingHeight: object | null }}
 */
function dimensionEntities(group, blocks, depth, m, parentLayer, warnings) {
  const r = recordReader(group.codes);
  const layer = inherit(r.get(8, '0'), parentLayer);
  const block = blocks.get(r.get(2, ''));
  if (block && block.groups.length > 0) {
    const out = [];
    for (const child of block.groups) appendAll(out, expandGroup(child, blocks, depth + 1, m, layer, warnings));
    return out;
  }
  const measured = r.num(42, NaN);
  const value = Number.isFinite(measured) ? String(Math.round(measured * 1000) / 1000) : '';
  const override = r.get(1, '');
  const text = (override === '' ? value : override.replace('<>', value)).trim();
  if (text === '') return [];
  return [transformEntity({ type: 'TEXT', layer, at: [r.num(11), r.num(21)], text: decodeText(text), height: NaN, rotationDeg: normDeg(r.num(53)) }, m)];
}

/**
 * Entities on layer 0 inside a block take the layer of the insert.
 * @returns {string}
 */
function inherit(layer, parentLayer) {
  return parentLayer !== null && layer === '0' ? parentLayer : layer;
}

/**
 * Expands one entity group under transform `m`.
 * @returns {object[]}
 */
function expandGroup(group, blocks, depth, m, parentLayer, warnings) {
  if (group.type === 'ATTDEF') return [];
  if (group.type === 'DIMENSION') return dimensionEntities(group, blocks, depth, m, parentLayer, warnings);
  if (group.type !== 'INSERT') {
    return plainEntities(group, warnings).map((e) => transformEntity({ ...e, layer: inherit(e.layer, parentLayer) }, m));
  }
  const r = recordReader(group.codes);
  const layer = inherit(r.get(8, '0'), parentLayer);
  const name = r.get(2, '');
  const at = [r.num(10), r.num(20)];
  const sx = r.num(41, 1) || 1;
  const sy = r.num(42, 1) || 1;
  const rotationDeg = normDeg(r.num(50));
  const attributes = {};
  const attributeTexts = [];
  for (const child of group.children) {
    const a = recordReader(child.codes);
    const tag = a.get(2);
    if (tag !== undefined) attributes[tag] = decodeText(a.get(1, ''));
    attributeTexts.push(...plainEntities({ type: 'ATTRIB', codes: child.codes, children: [] }, warnings)
      .map((e) => transformEntity({ ...e, layer: inherit(e.layer, layer) }, m)));
  }
  const worldAt = apply(m, at).map(clean);
  const out = [{
    type: 'INSERT',
    layer,
    name,
    at: worldAt,
    rotationDeg: transformAngle(m, rotationDeg),
    scale: [clean(sx * Math.hypot(m[0], m[1])), clean(sy * yScale(m))],
    attributes
  }];
  const block = blocks.get(name);
  if (!block) {
    warnings.push(`Block "${name}" is missing from the file.`);
  } else if (depth >= MAX_BLOCK_DEPTH) {
    warnings.push(`Block "${name}" is nested too deeply to draw.`);
  } else {
    const columns = Math.max(1, r.num(70, 1));
    const rows = Math.max(1, r.num(71, 1));
    const copies = Math.min(columns * rows, MAX_ARRAY_COPIES);
    for (let k = 0; k < copies; k++) {
      const col = k % columns;
      const row = Math.floor(k / columns);
      const shift = [col * r.num(44), row * r.num(45)];
      const local = insertTransform([at[0] + shift[0] * Math.cos(rotationDeg * DEG) - shift[1] * Math.sin(rotationDeg * DEG),
        at[1] + shift[0] * Math.sin(rotationDeg * DEG) + shift[1] * Math.cos(rotationDeg * DEG)], rotationDeg, sx, sy, block.base);
      const total = compose(m, local);
      for (const child of block.groups) appendAll(out, expandGroup(child, blocks, depth + 1, total, layer, warnings));
    }
  }
  appendAll(out, attributeTexts);
  return out;
}

/**
 * Points that bound an entity, for the extents.
 * @returns {[number, number][]}
 */
function boundingPoints(entity) {
  switch (entity.type) {
    case 'LINE':
      return [entity.a, entity.b];
    case 'POLY':
      return entity.points;
    case 'CIRCLE': {
      const [x, y] = entity.center;
      const r = entity.radius;
      return [[x - r, y - r], [x + r, y + r]];
    }
    case 'ARC': {
      const { center, radius, startDeg, endDeg } = entity;
      const sweep = normDeg(endDeg - startDeg) || 360;
      const points = [startDeg, startDeg + sweep];
      for (const axis of [0, 90, 180, 270, 360, 450, 540, 630]) {
        if (axis > startDeg && axis < startDeg + sweep) points.push(axis);
      }
      return points.map((deg) => [center[0] + radius * Math.cos(deg * DEG), center[1] + radius * Math.sin(deg * DEG)]);
    }
    case 'TEXT':
      return [entity.at];
    default:
      return [];
  }
}

/**
 * Bounding box of all entities, rounded to remove floating noise.
 * @returns {{ min: [number, number], max: [number, number] }}
 */
function computeExtents(entities) {
  let min = [Infinity, Infinity];
  let max = [-Infinity, -Infinity];
  for (const entity of entities) {
    for (const p of boundingPoints(entity)) {
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
      min = [Math.min(min[0], p[0]), Math.min(min[1], p[1])];
      max = [Math.max(max[0], p[0]), Math.max(max[1], p[1])];
    }
  }
  if (!Number.isFinite(min[0])) return { min: [0, 0], max: [0, 0] };
  return { min: min.map(clean), max: max.map(clean) };
}

/**
 * Fills in heights of dimension texts that had no style height with the median text height.
 * @param {object[]} entities
 */
function fillTextHeights(entities) {
  const heights = entities.filter((e) => e.type === 'TEXT' && Number.isFinite(e.height) && e.height > 0).map((e) => e.height).sort((x, y) => x - y);
  const median = heights.length > 0 ? heights[Math.floor(heights.length / 2)] : 1;
  for (const e of entities) {
    if (e.type === 'TEXT' && !Number.isFinite(e.height)) e.height = median;
  }
}

/**
 * Parses an ASCII DXF file.
 * Reads the header ($ACADVER, $INSUNITS), the layer table, blocks and the ENTITIES section:
 * LINE, LWPOLYLINE, POLYLINE/VERTEX, ARC, CIRCLE, TEXT, MTEXT (formatting stripped, one TEXT
 * per line), INSERT (block expanded with its transform, attributes kept and drawn as text; layer
 * 0 inside a block takes the insert's layer) and DIMENSION (its drawn block, or its text).
 * Paper-space entities and unknown entity types are skipped. Bulges are read as straight
 * segments with a warning.
 * @param {string} text the file contents
 * @returns {DxfDoc}
 * @throws {Error} 'Not an ASCII DXF' for binary DXF, DWG or anything else that is not DXF text
 */
export function parseDxf(text) {
  const pairs = tokenize(text);
  let header = { version: null, insunits: null };
  let tableLayers = [];
  let blocks = new Map();
  let groups = [];
  let sawSection = false;
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code !== 0 || pairs[i].value !== 'SECTION') continue;
    sawSection = true;
    const name = pairs[i + 1]?.code === 2 ? pairs[i + 1].value : '';
    const start = i + 2;
    const end = sectionEnd(pairs, start);
    if (name === 'HEADER') header = readHeader(pairs, start, end);
    else if (name === 'TABLES') tableLayers = readLayerTable(pairs, start, end);
    else if (name === 'BLOCKS') blocks = readBlocks(pairs, start, end);
    else if (name === 'ENTITIES') groups = groupEntities(toRecords(pairs, start, end));
    i = end;
  }
  if (!sawSection) throw new Error(NOT_ASCII_DXF);
  const warnings = [];
  const entities = [];
  for (const group of groups) {
    if (recordReader(group.codes).get(67) === '1') continue;
    appendAll(entities, expandGroup(group, blocks, 0, IDENTITY, null, warnings));
  }
  fillTextHeights(entities);
  const layers = [...tableLayers];
  for (const e of entities) {
    if (!layers.includes(e.layer)) layers.push(e.layer);
  }
  return {
    version: header.version,
    insunits: header.insunits,
    layers,
    entities,
    extents: computeExtents(entities),
    warnings: [...new Set(warnings)]
  };
}
