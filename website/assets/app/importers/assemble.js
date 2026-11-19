/**
 * Assembles extracted drawings into one Building Model: levels from the sections, walls,
 * openings and rooms from the plans (opening sizes from the schedule), and the site from the
 * layout, with the plans moved onto the layout's building footprint.
 * Pure module: no DOM.
 */
import { createBuilding, validateBuilding, guessRoomUse } from '../model/schema.js';
import {
  add, sub, scale, normalize, leftNormal, distance, pointInPolygon, polygonCentroid
} from '../model/geometry.js';
import { extractSection, SECTION_DEFAULTS, STOREY_NAMES } from './extract/section.js';
import { displayName } from './extract/text.js';
import { nodeWallsGrouped, findRoomFacesGrouped, wallFootprintsGrouped } from './extract/noding.js';

/** Level ids by index. */
const LEVEL_IDS = { '-1': 'basement', 0: 'ground', 1: 'first', 2: 'second', 3: 'third', 4: 'fourth' };
/** A schedule width this much different from the plan is reported. */
const WIDTH_MISMATCH = 0.05;
/** Footprint and plan sizes differing by more than this (m) are reported. */
const FOOTPRINT_MISMATCH = 0.3;
/** How far (m) beyond a wall face the room test point is taken. */
const SIDE_PROBE = 0.05;
/** Boundary wall height (7 ft) and street width (30 ft) used when the layout does not give them. */
const BOUNDARY_WALL_HEIGHT = 2.1336;
const STREET_WIDTH = 9.144;
const MIN_WINDOW_HEIGHT = 0.3;

/**
 * URL-safe id from a name.
 * @param {string} text
 * @returns {string}
 */
function slug(text) {
  return String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Formats metres with two decimals.
 * @param {number} v
 * @returns {string}
 */
function m2(v) {
  return `${v.toFixed(2)} m`;
}

/**
 * Bounding box of points.
 * @returns {{ min: [number, number], max: [number, number] } | null}
 */
function boxOf(points) {
  if (points.length === 0) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] };
}

/**
 * Outer bounding box of extracted plan walls (their footprints, not centrelines).
 * @returns {{ min: [number, number], max: [number, number] } | null}
 */
function planBox(walls) {
  const prepared = walls.map((w, i) => ({ id: `b${i}`, level: 'x', a: w.a, b: w.b, thickness: w.thickness }));
  const points = [...wallFootprintsGrouped(prepared).values()].flatMap((fp) => fp.polygon);
  return boxOf(points);
}

/**
 * Centre of a box.
 * @returns {[number, number]}
 */
function centreOf(box) {
  return [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2];
}

/**
 * True when two boxes overlap.
 * @returns {boolean}
 */
function overlaps(p, q) {
  return p.min[0] < q.max[0] && q.min[0] < p.max[0] && p.min[1] < q.max[1] && q.min[1] < p.max[1];
}

/**
 * Merged level heights from the section drawings (falling back to working drawings). Elevations
 * are relative to each section's ground floor; when two sections disagree the first wins.
 * @param {object[]} sections parsed section drawings
 * @param {object[]} workings parsed working drawings
 * @param {string[]} warnings collects messages
 * @returns {{ byIndex: Map<number, { elevation: number, ceiling: number | null, slab: number | null }>, parapet: number | null,
 *   plinth: number | null, sill: number | null, lintel: number | null, sectionDefaults: string[] }}
 */
function sectionData(sections, workings, warnings) {
  const results = sections.map((p) => ({ p, r: p.extracted }))
    .filter(({ r }) => r && Array.isArray(r.levels) && r.levels.length > 0);
  if (results.length === 0) {
    for (const p of workings) {
      if (!p.doc) continue;
      const r = extractSection(p.doc, { factor: p.units?.factor ?? 0.001 });
      if (r.levels.length > 0) results.push({ p, r });
    }
  }
  const byIndex = new Map();
  const pick = (key) => results.map(({ r }) => r[key]).find((v) => v !== null && v !== undefined) ?? null;
  const sectionDefaults = [];
  results.forEach(({ p, r }, k) => {
    const base = r.levels.find((l) => l.index === 0)?.ffl ?? r.levels[0].ffl;
    for (const level of r.levels) {
      const entry = { elevation: level.ffl - base, ceiling: level.ceiling, slab: level.slab };
      const existing = byIndex.get(level.index);
      if (!existing) {
        byIndex.set(level.index, entry);
      } else if (Math.abs(existing.elevation - entry.elevation) > 0.02 || Math.abs((existing.ceiling ?? 0) - (entry.ceiling ?? 0)) > 0.02) {
        warnings.push(`${p.name ?? p.id} gives different heights for the ${(STOREY_NAMES[level.index] ?? `level ${level.index}`).toLowerCase()} than the first section; the first section was used.`);
      }
    }
    if (k === 0) sectionDefaults.push(...(r.defaultsUsed ?? []));
    warnings.push(...(r.warnings ?? []).filter((w) => !/ceiling height isn't marked/.test(w)));
  });
  return { byIndex, parapet: pick('parapet'), plinth: pick('plinth'), sill: pick('sill'), lintel: pick('lintel'), sectionDefaults };
}

/**
 * Builds the level list.
 * @returns {object[]}
 */
function buildLevels(indices, data, defaultsUsed) {
  const levels = [];
  let elevation = 0;
  indices.forEach((index, i) => {
    const name = STOREY_NAMES[index] ?? `Level ${index}`;
    const known = data.byIndex.get(index);
    let ceiling = known?.ceiling ?? null;
    if (ceiling === null) {
      ceiling = SECTION_DEFAULTS.ceiling;
      defaultsUsed.push(`${name} ceiling height ${m2(ceiling)}`);
    }
    let slab = known?.slab ?? null;
    if (slab === null) {
      slab = SECTION_DEFAULTS.slab;
      defaultsUsed.push(`${name} ${i === indices.length - 1 ? 'roof ' : ''}slab ${m2(slab)}`);
    }
    if (known && i > 0) elevation = known.elevation;
    const level = { id: LEVEL_IDS[index] ?? `level-${index}`, name, elevation, height: ceiling + slab, ceiling, slab };
    const next = data.byIndex.get(indices[i + 1]);
    if (next && next.elevation > elevation) level.height = next.elevation - elevation;
    levels.push(level);
    elevation = level.elevation + level.height;
  });
  const top = levels[levels.length - 1];
  if (top) {
    if (data.parapet !== null) {
      top.parapet = data.parapet;
    } else {
      top.parapet = SECTION_DEFAULTS.parapet;
      defaultsUsed.push(`Parapet ${m2(SECTION_DEFAULTS.parapet)}`);
    }
  }
  return levels;
}

/**
 * Translation that puts the plan on the layout's building footprint.
 * @returns {[number, number]}
 */
function footprintOffset(reference, footprint, warnings) {
  const box = planBox(reference);
  const target = boxOf(footprint);
  if (!box || !target) return [0, 0];
  const dw = Math.abs((box.max[0] - box.min[0]) - (target.max[0] - target.min[0]));
  const dh = Math.abs((box.max[1] - box.min[1]) - (target.max[1] - target.min[1]));
  if (dw > FOOTPRINT_MISMATCH || dh > FOOTPRINT_MISMATCH) {
    warnings.push('The building footprint on the site layout is a different size from the ground floor plan; the plan was centred on it.');
  }
  return sub(centreOf(target), centreOf(box));
}

/**
 * Wall role from the room faces either side.
 * @returns {'exterior'|'interior'|'partition'}
 */
function wallRole(wall, faces) {
  const d = normalize(sub(wall.b, wall.a));
  const mid = scale(add(wall.a, wall.b), 0.5);
  const n = leftNormal(d);
  const probe = wall.thickness / 2 + SIDE_PROBE;
  const left = add(mid, scale(n, probe));
  const right = sub(mid, scale(n, probe));
  const inside = (p) => faces.some((f) => pointInPolygon(p, f.polygon));
  if (!inside(left) || !inside(right)) return 'exterior';
  return wall.thickness >= 0.2 ? 'interior' : 'partition';
}

/**
 * "D1", "D1 and W1", "D1, D2 and W1".
 * @param {string[]} items
 * @returns {string}
 */
function listOf(items) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Orders tags as a schedule does: doors, windows, ventilators, then by number ("D2" before "D10").
 * @param {string} p
 * @param {string} q
 * @returns {number}
 */
function byTag(p, q) {
  const order = (tag) => 'DWV'.indexOf(tag[0]) === -1 ? 3 : 'DWV'.indexOf(tag[0]);
  return order(p) - order(q) || p.localeCompare(q, 'en', { numeric: true });
}

/**
 * Applies the schedule to one plan opening, falling back to defaults.
 * @returns {object} the Building Model opening (without id)
 */
function sizeOpening(o, wallLength, others, ctx) {
  const entry = o.tag ? ctx.schedule[o.tag] : undefined;
  const label = o.tag ?? (o.type === 'door' ? 'A door' : 'A window');
  let type = o.type;
  let width = o.width;
  let height;
  let sill;
  if (entry) {
    type = entry.type === 'door' ? 'door' : entry.type === 'opening' ? 'opening' : 'window';
    if (Math.abs(entry.width - o.width) > WIDTH_MISMATCH * entry.width) {
      const fits = o.at - entry.width / 2 >= -1e-6 && o.at + entry.width / 2 <= wallLength + 1e-6
        && !others.some((q) => Math.abs(q.at - o.at) < (q.width + entry.width) / 2 - 1e-6);
      if (fits) {
        width = entry.width;
        ctx.warnings.push(`${o.tag} on the ${ctx.levelName.toLowerCase()} plan measures ${m2(o.width)} but the schedule says ${m2(entry.width)}; the schedule size was used.`);
      } else {
        ctx.warnings.push(`${o.tag} on the ${ctx.levelName.toLowerCase()} plan measures ${m2(o.width)} but the schedule says ${m2(entry.width)}; the schedule size doesn't fit the wall, so the plan size was kept.`);
      }
    } else {
      width = entry.width;
    }
    height = entry.height;
    sill = type === 'door' || type === 'opening' ? (entry.sill ?? 0) : (entry.sill ?? ctx.sill());
  } else {
    if (o.tag) ctx.unscheduled.add(o.tag);
    else ctx.untagged.push(label);
    if (type === 'door' || type === 'opening') {
      sill = 0;
      height = ctx.lintel();
    } else {
      sill = ctx.sill();
      const head = ctx.lintel();
      height = head - sill > MIN_WINDOW_HEIGHT ? head - sill : 1.2;
    }
    if (o.tag && !ctx.schedule[o.tag]) {
      ctx.schedule[o.tag] = { type, width, height, sill: type === 'door' ? null : sill, material: null };
    }
  }
  const opening = { type, at: o.at, width, height, sill };
  if (o.tag) opening.tag = o.tag;
  return opening;
}

/**
 * Assembles parsed drawings into a Building Model.
 * - Levels: one per floor (`floors`, else the highest plan level + 1), elevations, ceilings and
 *   slabs from the first section drawing that has level markers (working drawings as a fallback),
 *   relative to the ground floor; the top level gets the parapet. Missing values use the Pakistani
 *   defaults and are listed in `report.defaultsUsed`.
 * - Walls and openings from each plan (ids w1…, o1…; `drawing` names the source drawing); door and
 *   window sizes from the merged schedule by tag (the schedule wins when the plan width differs by
 *   more than 5%, with a warning); partial-height walls get the parapet height.
 * - Rooms: one per enclosed face of each level's wall graph, named from the plan's room text
 *   (displayed in Title Case) or "Room N"; ids are slugs of the names, numbered on collision.
 * - Wall roles: exterior when either side faces the outside, else interior (≥ 0.2 m) or partition.
 * - Site from the first layout; the plans are moved so the ground floor's outer walls are centred
 *   on the layout's building footprint (without one, plans and layout share an origin).
 * @param {{ id: string, name?: string, slot: string, levelIndex?: number | null, section?: string | null, doc?: object, extracted?: object, units?: { unit: string, factor: number, source: string }, readable?: boolean }[]} parsed
 * @param {{ name?: string, kind?: 'house'|'office'|'shop'|'mixed', floors?: number }} [options]
 * @returns {{ building: import('../model/schema.js').Building,
 *   schedule: Object<string, { type: string, width: number, height: number, sill: number | null, material: string | null }>,
 *   report: { counts: { walls: number, doors: number, windows: number, rooms: number, levels: number }, unitsUsed: { drawing: string, unit: string | null, source: string | null }[],
 *     warnings: string[], defaultsUsed: string[], alignment: Object<string, { factor: number, offset: [number, number] }> } }}
 */
export function assemble(parsed, { name = 'My property', kind = 'house', floors } = {}) {
  const warnings = [];
  const defaultsUsed = [];
  const usable = (parsed ?? []).filter((p) => p && p.readable !== false && p.extracted);
  const ofSlot = (slot) => usable.filter((p) => p.slot === slot);
  const plans = ofSlot('plan').filter((p) => Number.isInteger(p.levelIndex)).sort((x, y) => x.levelIndex - y.levelIndex);
  const sections = ofSlot('section');
  const workings = ofSlot('working');
  const layout = ofSlot('layout')[0] ?? null;

  const floorCount = Number.isInteger(floors) && floors > 0 ? floors : Math.max(1, ...plans.map((p) => p.levelIndex + 1));
  const indices = [...new Set([...(plans.some((p) => p.levelIndex < 0) ? [-1] : []), ...Array.from({ length: floorCount }, (_, i) => i)])];
  const leftOut = ofSlot('plan').filter((p) => !Number.isInteger(p.levelIndex) || p.levelIndex >= floorCount);
  if (leftOut.length) {
    const names = leftOut.map((p) => p.name ?? p.id).join(', ');
    warnings.push(`${leftOut.length === 1 ? 'A floor plan was' : `${leftOut.length} floor plans were`} left out because the project has ${floorCount} ${floorCount === 1 ? 'floor' : 'floors'} (${names}). Add a floor to the project, or choose which floor each plan is for.`);
  }
  const data = sectionData(sections, workings, warnings);
  defaultsUsed.push(...data.sectionDefaults.filter((d) => !defaultsUsed.includes(d)));
  const levels = buildLevels(indices, data, defaultsUsed);
  const dedupe = (list) => [...new Set(list)];

  const schedule = {};
  for (const p of workings) {
    for (const [tag, entry] of Object.entries(p.extracted.entries ?? {})) {
      if (!schedule[tag]) schedule[tag] = { ...entry };
    }
    warnings.push(...(p.extracted.warnings ?? []).filter((w) => !/No door or window schedule/.test(w)));
  }
  let sillDefaulted = false;
  let lintelDefaulted = false;
  const sill = () => {
    if (data.sill !== null) return data.sill;
    sillDefaulted = true;
    return SECTION_DEFAULTS.sill;
  };
  const lintel = () => {
    if (data.lintel !== null) return data.lintel;
    lintelDefaulted = true;
    return SECTION_DEFAULTS.lintel;
  };

  const footprint = layout?.extracted?.footprint ?? null;
  const reference = plans.find((p) => p.levelIndex === 0) ?? plans[0];
  let offset = [0, 0];
  if (layout && reference) {
    if (footprint) offset = footprintOffset(reference.extracted.walls, footprint, warnings);
    else warnings.push('The site layout has no building footprint (layer A-SITE-BLDG); the plans and the layout were assumed to share an origin.');
  }
  const referenceBox = reference ? planBox(reference.extracted.walls) : null;

  const building = createBuilding({ id: slug(name) || 'my-property', name, kind, source: 'dxf' });
  building.levels = levels;
  const alignment = {};
  const untagged = [];
  const unscheduled = new Set();
  let wallCount = 0;
  let openingCount = 0;
  const roomIds = new Set();
  let unnamed = 0;
  const parapetHeight = () => {
    if (data.parapet !== null) return data.parapet;
    return SECTION_DEFAULTS.parapet;
  };

  for (const level of levels) {
    const index = indices[levels.indexOf(level)];
    const levelPlans = plans.filter((p) => p.levelIndex === index);
    if (levelPlans.length === 0) {
      warnings.push(`No plan for the ${level.name.toLowerCase()}, so it has no walls yet.`);
      continue;
    }
    if (levelPlans.length > 1) warnings.push(`More than one ${level.name.toLowerCase()} plan was uploaded; the first one was used.`);
    const plan = levelPlans[0];
    let shift = offset;
    const box = planBox(plan.extracted.walls);
    if (plan !== reference && box && referenceBox && !overlaps(box, referenceBox)) {
      shift = add(offset, sub(referenceBox.min, box.min));
      warnings.push(`The ${level.name.toLowerCase()} plan is drawn away from the ground floor plan; it was lined up by its bottom-left corner.`);
    }
    alignment[plan.id] = { factor: plan.units?.factor ?? 0.001, offset: [...shift] };
    warnings.push(...(plan.extracted.warnings ?? []).map((w) => `${level.name}: ${w}`));

    const ctx = { schedule, warnings, levelName: level.name, sill, lintel, untagged, unscheduled };
    const walls = plan.extracted.walls.map((w) => {
      wallCount += 1;
      const wall = { id: `w${wallCount}`, level: level.id, a: add(w.a, shift), b: add(w.b, shift), thickness: w.thickness, role: 'interior', openings: [], drawing: plan.id };
      if (w.partial) wall.height = parapetHeight();
      return wall;
    });
    if (plan.extracted.walls.some((w) => w.partial) && data.parapet === null) {
      defaultsUsed.push(`Low wall (parapet and railing) height ${m2(SECTION_DEFAULTS.parapet)}`);
    }
    plan.extracted.walls.forEach((_, wi) => {
      const wall = walls[wi];
      const own = plan.extracted.openings.filter((o) => o.wall === wi);
      for (const o of own) {
        const sized = sizeOpening(o, distance(wall.a, wall.b), own.filter((q) => q !== o), ctx);
        openingCount += 1;
        wall.openings.push({ id: `o${openingCount}`, ...sized, drawing: plan.id });
      }
    });
    const faces = findRoomFacesGrouped(nodeWallsGrouped(walls));
    for (const wall of walls) wall.role = wallRole(wall, faces);
    building.walls.push(...walls);

    const named = (plan.extracted.rooms ?? []).map((r) => ({ ...r, at: add(r.at, shift) }));
    const sortedFaces = [...faces].sort((x, y) => x.area - y.area);
    const used = new Set();
    for (const face of sortedFaces) {
      const match = named.find((r, i) => !used.has(i) && pointInPolygon(r.at, face.polygon));
      if (match) used.add(named.indexOf(match));
      const label = match?.name ? displayName(match.name) : `Room ${++unnamed}`;
      let id = slug(label) || 'room';
      for (let k = 2; roomIds.has(id); k++) id = `${slug(label) || 'room'}-${k}`;
      roomIds.add(id);
      const centroid = polygonCentroid(face.polygon);
      const at = match && pointInPolygon(match.at, face.polygon) ? match.at : (pointInPolygon(centroid, face.polygon) ? centroid : face.polygon[0]);
      building.rooms.push({ id, level: level.id, name: label, use: guessRoomUse(label), at: [...at], drawing: plan.id });
    }
  }
  if (sillDefaulted) defaultsUsed.push(`Window sill ${m2(SECTION_DEFAULTS.sill)}`);
  if (lintelDefaulted) defaultsUsed.push(`Door and window head ${m2(SECTION_DEFAULTS.lintel)}`);
  if (unscheduled.size > 0) warnings.push(`No schedule sizes for ${listOf([...unscheduled].sort(byTag))}, so their widths were measured from the plan and standard heights were used.`);
  if (untagged.length > 0) warnings.push(`${untagged.length} door${untagged.length === 1 ? ' or window has' : 's or windows have'} no tag, so standard sizes were used.`);

  if (layout) {
    const site = layout.extracted;
    alignment[layout.id] = { factor: layout.units?.factor ?? 0.001, offset: [0, 0] };
    warnings.push(...(site.warnings ?? []));
    if (site.boundary) {
      building.site = { boundary: site.boundary.map((p) => [...p]), ground: (site.ground ?? []).map((g) => ({ polygon: g.polygon.map((p) => [...p]), material: g.material })) };
      if (site.boundaryWall) {
        let height = site.boundaryWall.height;
        if (height === null || height === undefined) {
          height = BOUNDARY_WALL_HEIGHT;
          defaultsUsed.push(`Boundary wall height ${m2(height)} (7 ft)`);
        }
        building.site.boundaryWall = { height, thickness: site.boundaryWall.thickness, gates: site.boundaryWall.gates.map((g) => ({ at: [...g.at], width: g.width })) };
      }
      if (site.street) {
        let width = site.street.width;
        if (width === null || width === undefined) {
          width = STREET_WIDTH;
          defaultsUsed.push(`Street width ${m2(width)} (30 ft)`);
        }
        building.site.street = { side: site.street.side, width };
      }
    }
  }

  building.meta = {
    drawings: (parsed ?? []).filter(Boolean).map((p) => ({ id: p.id, name: p.name ?? p.id, slot: p.slot, levelIndex: p.levelIndex ?? null, section: p.section ?? null })),
    warnings: []
  };
  if (data.plinth !== null) building.meta.plinth = data.plinth;
  const check = validateBuilding(building);
  warnings.push(...check.errors.map((e) => `Model check: ${e}`), ...check.warnings.map((w) => `Model check: ${w}`));
  const finalWarnings = dedupe(warnings);
  building.meta.warnings = finalWarnings;
  const all = building.walls.flatMap((w) => w.openings);
  return {
    building,
    schedule,
    report: {
      counts: {
        walls: building.walls.length,
        doors: all.filter((o) => o.type === 'door').length,
        windows: all.filter((o) => o.type === 'window').length,
        rooms: building.rooms.length,
        levels: building.levels.length
      },
      unitsUsed: (parsed ?? []).filter(Boolean).map((p) => ({ drawing: p.name ?? p.id, unit: p.units?.unit ?? null, source: p.units?.source ?? null })),
      warnings: finalWarnings,
      defaultsUsed: dedupe(defaultsUsed),
      alignment
    }
  };
}
