/**
 * Side panel of the plan editor (browser only): the current tool's options or the selected
 * item's properties, the drawing underneath, heights per floor, the door and window schedule,
 * a summary with checks, and "Preview 3D".
 */
import { distance } from '../model/geometry.js';
import { ROOM_USES, validateBuilding } from '../model/schema.js';
import {
  SCHEDULE_TYPES, DEFAULT_SCHEDULE, findOpening, fitOpening, fitGate, applyScheduleRow, renameTag, nextTag, openingsWithTag,
  openingTypeOf, deriveLevelHeights, levelCounts, isUnnamedRoom, useAfterRename
} from './model-ops.js';
import { levelRooms } from './hit.js';
import { formatArea } from './drawing.js';
import { el } from './dom.js';
import { icon } from './icons.js';
import { thicknessControl, thicknessMode } from './tools/wall.js';
import { rowsFor } from './tools/opening.js';
import { boundaryWallControls } from './tools/site.js';
import { openingFitMessage } from './tools/shared.js';

/** Labels for room uses where the plain word reads oddly. */
const USE_LABELS = {
  living: 'Living room', drawing: 'Drawing room', bath: 'Bathroom', stair: 'Stairs', store: 'Store room',
  cafe: 'Café', fitting: 'Fitting room', other: 'Other'
};
/** Labels for schedule row types. */
const TYPE_LABELS = { door: 'Door', window: 'Window', ventilator: 'Ventilator', opening: 'Opening', shopfront: 'Shopfront', garage: 'Garage' };
/** Labels for wall roles. */
const ROLE_LABELS = { exterior: 'Outer wall', interior: 'Inner wall', partition: 'Partition', glass: 'Glass wall' };
/** Headings for each opening type. */
const OPENING_NOUNS = { door: 'Door', window: 'Window', opening: 'Opening', shopfront: 'Shopfront', garage: 'Garage door' };
/** Most checks listed in the summary. */
const MAX_CHECKS = 6;

/**
 * Display label for a room use.
 * @param {string} use
 * @returns {string}
 */
export function useLabel(use) {
  return USE_LABELS[use] ?? use.charAt(0).toUpperCase() + use.slice(1);
}

/**
 * A labelled length input that accepts ft-in or metres and commits on change.
 * @param {object} ctx editor tool context
 * @param {{ key: string, label: string, value: number, min?: number, max?: number, hint?: string,
 *   onCommit: (metres: number) => void, signed?: boolean }} options
 * @returns {HTMLElement}
 */
export function lengthField(ctx, { key, label, value, min = 0, max = 100, hint, onCommit }) {
  const id = `${ctx.uid}-${key}`;
  const input = el('input', {
    class: 'input pe-input',
    id,
    'data-key': key,
    value: Number.isFinite(value) ? ctx.fmt(value) : '',
    autocomplete: 'off'
  });
  input.addEventListener('change', () => {
    const metres = ctx.parse(input.value);
    if (metres === null || metres < min || metres > max) {
      ctx.fieldError(input, `Type a length between ${ctx.fmt(min)} and ${ctx.fmt(max)}, such as ${ctx.units === 'metric' ? '3.05 m' : '10\' 0"'}.`);
      return;
    }
    onCommit(metres);
  });
  return el('div', { class: 'pe-control' }, [
    el('label', { class: 'pe-label', for: id, text: label }),
    input,
    hint ? el('p', { class: 'pe-hint', text: hint }) : null
  ]);
}

/**
 * A compact length cell for the schedule table.
 * @returns {HTMLInputElement}
 */
function lengthCell(ctx, { key, label, value, onCommit }) {
  const input = el('input', { class: 'pe-cell', 'data-key': key, 'aria-label': label, value: ctx.fmt(value), autocomplete: 'off' });
  input.addEventListener('change', () => {
    const metres = ctx.parse(input.value);
    if (metres === null || metres < 0 || metres > 20) {
      ctx.fieldError(input, 'Type a size such as 3\' 0" or 0.9 m.');
      return;
    }
    onCommit(metres);
  });
  return input;
}

/**
 * A `<select>` with options.
 * @returns {HTMLSelectElement}
 */
function selectBox({ key, label, id, value, options, onChange, disabled }) {
  const select = el('select', { class: 'select pe-select', id, 'data-key': key, 'aria-label': id ? null : label, disabled },
    options.map(([v, text]) => el('option', { value: v, selected: v === value }, text)));
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

/**
 * Section wrapper with a heading.
 * @returns {HTMLElement}
 */
function section(title, children, { key, collapsible = false, ctx } = {}) {
  if (!collapsible) {
    return el('section', { class: 'pe-section' }, [el('h3', { class: 'pe-h', text: title }), ...children]);
  }
  const open = !ctx.ui.closedSections.has(key);
  const details = el('details', { class: 'pe-section pe-details', open }, [
    el('summary', { class: 'pe-h', 'data-key': `section-${key}` }, title),
    el('div', { class: 'pe-details-body' }, children)
  ]);
  details.addEventListener('toggle', () => {
    if (details.open) ctx.ui.closedSections.delete(key);
    else ctx.ui.closedSections.add(key);
  });
  return details;
}

/**
 * Properties of the selected wall.
 * @returns {HTMLElement[]}
 */
function wallEditor(ctx, wall) {
  const len = distance(wall.a, wall.b);
  const doors = wall.openings.filter((o) => o.type === 'door' || o.type === 'garage').length;
  const windows = wall.openings.length - doors;
  const parts = [`${ctx.fmt(len)} long`];
  if (doors) parts.push(`${doors} door${doors > 1 ? 's' : ''}`);
  if (windows) parts.push(`${windows} window${windows > 1 ? 's' : ''}`);
  const custom = ctx.ui.customWall === wall.id;
  return [
    el('p', { class: 'pe-meta', text: parts.join(' · ') }),
    thicknessControl(ctx, {
      thickness: wall.thickness,
      mode: custom ? 'custom' : thicknessMode(wall.thickness),
      key: 'sel-thickness',
      onPick: (value, role, mode) => {
        ctx.ui.customWall = mode === 'custom' ? wall.id : null;
        if (!ctx.commit('Change wall thickness', (state) => {
          const target = state.building.walls.find((w) => w.id === wall.id);
          if (!target) return false;
          target.thickness = value;
          return true;
        })) ctx.refreshPanel();
      }
    }),
    el('div', { class: 'pe-control' }, [
      el('label', { class: 'pe-label', for: `${ctx.uid}-sel-role`, text: 'Type of wall' }),
      selectBox({
        key: 'sel-role',
        id: `${ctx.uid}-sel-role`,
        value: wall.role ?? 'interior',
        options: Object.entries(ROLE_LABELS),
        onChange: (role) => ctx.commit('Change wall type', (state) => {
          const target = state.building.walls.find((w) => w.id === wall.id);
          if (!target) return false;
          target.role = role;
          return true;
        })
      })
    ]),
    deleteButton(ctx, 'Delete wall')
  ];
}

/**
 * The delete button for the current selection.
 * @returns {HTMLElement}
 */
function deleteButton(ctx, text) {
  return el('button', {
    type: 'button',
    class: 'btn btn-ghost btn-sm pe-delete',
    'data-key': 'sel-delete',
    onclick: () => ctx.deleteSelection(),
    html: `${icon('trash')}<span>${text}</span>`
  });
}

/**
 * Properties of the selected opening.
 * @returns {HTMLElement[]}
 */
function openingEditor(ctx, wall, opening) {
  const kind = ['door', 'garage', 'opening'].includes(opening.type) ? 'door' : 'window';
  const tagged = Boolean(opening.tag && ctx.schedule[opening.tag]);
  const rows = rowsFor(ctx.schedule, kind);
  const sizeOptions = [...rows.map(([tag, entry]) => [tag, `${tag} · ${ctx.fmt(entry.width)} × ${ctx.fmt(entry.height)}`]), ['', 'Its own size (no tag)']];
  const noun = kind === 'door' ? 'door' : 'window';
  const fields = el('div', { class: 'pe-grid2' });
  for (const [key, label] of [['width', 'Width'], ['height', 'Height'], ['sill', 'Sill height']]) {
    fields.append(lengthField(ctx, {
      key: `sel-${key}`,
      label,
      value: opening[key] ?? 0,
      min: key === 'sill' ? 0 : 0.1,
      max: 10,
      onCommit: (value) => {
        if (key === 'width') {
          const fit = fitOpening(ctx.state.building, wall.id, { at: opening.at, width: value }, opening.id);
          if (!fit.ok && !tagged) {
            ctx.fieldError(document.getElementById(`${ctx.uid}-sel-width`), openingFitMessage(fit, noun));
            return;
          }
        }
        if (tagged) {
          ctx.commit(`Change ${opening.tag} ${label.toLowerCase()}`, (state) => {
            const row = state.schedule[opening.tag];
            if (!row) return false;
            row[key] = value;
            applyScheduleRow(state.building, opening.tag, row);
            return true;
          });
        } else {
          ctx.commit(`Change ${noun} ${label.toLowerCase()}`, (state) => {
            const found = findOpening(state.building, opening.id);
            if (!found) return false;
            found.opening[key] = value;
            return true;
          });
        }
      }
    }));
  }
  return [
    el('div', { class: 'pe-control' }, [
      el('label', { class: 'pe-label', for: `${ctx.uid}-sel-tag`, text: 'Size' }),
      selectBox({
        key: 'sel-tag',
        id: `${ctx.uid}-sel-tag`,
        value: tagged ? opening.tag : '',
        options: sizeOptions,
        onChange: (tag) => ctx.commit(tag ? `Use ${tag}` : `Give ${noun} its own size`, (state) => {
          const found = findOpening(state.building, opening.id)?.opening;
          const entry = tag ? state.schedule[tag] : null;
          if (!found || (tag && !entry)) return false;
          if (!tag) {
            delete found.tag;
            return true;
          }
          Object.assign(found, { tag, type: openingTypeOf(entry, tag), width: entry.width, height: entry.height, sill: entry.sill ?? 0 });
          return true;
        })
      })
    ]),
    tagged ? el('p', { class: 'pe-hint', text: `Sizes come from the schedule. Changing them here changes every ${opening.tag}.` }) : null,
    tagged ? null : el('div', { class: 'pe-control' }, [
      el('label', { class: 'pe-label', for: `${ctx.uid}-sel-type`, text: 'Type' }),
      selectBox({
        key: 'sel-type',
        id: `${ctx.uid}-sel-type`,
        value: opening.type,
        options: [['door', 'Door'], ['window', 'Window'], ['opening', 'Opening (no door)'], ['shopfront', 'Shopfront'], ['garage', 'Garage door']],
        onChange: (type) => ctx.commit('Change opening type', (state) => {
          const found = findOpening(state.building, opening.id);
          if (!found) return false;
          found.opening.type = type;
          return true;
        })
      })
    ]),
    fields,
    deleteButton(ctx, `Delete ${noun}`)
  ].filter(Boolean);
}

/**
 * Properties of the selected room.
 * @returns {HTMLElement[]}
 */
function roomEditor(ctx, room, area) {
  const id = `${ctx.uid}-room-name`;
  const name = el('input', { class: 'input pe-input', id, 'data-key': 'room-name', value: room.name, autocomplete: 'off' });
  name.addEventListener('change', () => {
    const text = name.value.trim();
    if (!text) {
      ctx.fieldError(name, 'Give the room a name, such as Lounge or Bedroom 2.');
      return;
    }
    ctx.commit('Rename room', (state) => {
      const target = state.building.rooms.find((r) => r.id === room.id);
      if (!target) return false;
      target.use = useAfterRename(target, text);
      target.name = text;
      return true;
    });
  });
  return [
    isUnnamedRoom(room) ? el('p', { class: 'pe-flag-line', text: 'Name this room so its walls are labelled properly.' }) : null,
    el('div', { class: 'pe-control' }, [el('label', { class: 'pe-label', for: id, text: 'Room name' }), name]),
    el('div', { class: 'pe-control' }, [
      el('label', { class: 'pe-label', for: `${ctx.uid}-room-use`, text: 'Used as' }),
      selectBox({
        key: 'room-use',
        id: `${ctx.uid}-room-use`,
        value: room.use,
        options: ROOM_USES.map((use) => [use, useLabel(use)]),
        onChange: (use) => ctx.commit('Change room use', (state) => {
          const target = state.building.rooms.find((r) => r.id === room.id);
          if (!target) return false;
          target.use = use;
          return true;
        })
      })
    ]),
    el('p', { class: 'pe-meta', text: `Floor area ${formatArea(area, ctx.units)}` })
  ].filter(Boolean);
}

/**
 * Properties of the selected gate.
 * @returns {HTMLElement[]}
 */
function gateEditor(ctx, index) {
  const gate = ctx.building.site.boundaryWall.gates[index];
  return [
    lengthField(ctx, {
      key: 'gate-width',
      label: 'Gate width',
      value: gate.width,
      min: 0.6,
      max: 12,
      onCommit: (width) => {
        const fit = fitGate(ctx.state.building.site, gate.at, width, index);
        if (!fit.ok) {
          ctx.fieldError(document.getElementById(`${ctx.uid}-gate-width`), 'That width would run round a corner or into another gate.');
          return;
        }
        ctx.commit('Change gate width', (state) => {
          const target = state.building.site?.boundaryWall?.gates?.[index];
          if (!target) return false;
          target.width = width;
          return true;
        });
      }
    }),
    deleteButton(ctx, 'Delete gate')
  ];
}

/**
 * The contextual section: selection properties, else the tool's options.
 * @returns {HTMLElement | null}
 */
function contextSection(ctx, tool) {
  const sel = ctx.selection;
  const b = ctx.building;
  if (sel?.kind === 'wall') {
    const wall = b.walls.find((w) => w.id === sel.id);
    if (wall) return section('Wall', wallEditor(ctx, wall));
  }
  if (sel?.kind === 'opening') {
    const found = findOpening(b, sel.id);
    if (found) {
      const noun = OPENING_NOUNS[found.opening.type] ?? 'Opening';
      const title = found.opening.tag ? `${noun} ${found.opening.tag}` : noun;
      return section(title, openingEditor(ctx, found.wall, found.opening));
    }
  }
  if (sel?.kind === 'room') {
    const entry = levelRooms(b, ctx.levelId, ctx.plan()).find((r) => r.room.id === sel.id);
    if (entry) {
      const list = tool.name === 'room' ? tool.panel() : null;
      return section('Room', [...roomEditor(ctx, entry.room, entry.area), list]);
    }
  }
  if (sel?.kind === 'gate' && b.site?.boundaryWall?.gates?.[sel.index]) return section('Gate', gateEditor(ctx, sel.index));
  if (sel?.kind === 'boundary' && b.site) {
    return section('Plot boundary', [
      boundaryWallControls(ctx),
      el('button', {
        type: 'button',
        class: 'btn btn-ghost btn-sm pe-delete',
        'data-key': 'sel-delete',
        onclick: () => ctx.deleteSelection(),
        html: `${icon('trash')}<span>Remove plot boundary</span>`
      })
    ]);
  }
  const title = { select: 'Select', wall: 'Draw walls', door: 'Place doors', window: 'Place windows', room: 'Rooms', scale: 'Set the scale', site: 'Plot and gate' }[tool.name];
  const body = tool.panel ? tool.panel() : el('p', { class: 'pe-hint', text: tool.hint() });
  return section(title, [body]);
}

/**
 * Opacity and visibility of the drawing underneath.
 * @returns {HTMLElement | null}
 */
function backdropSection(ctx) {
  const backdrop = ctx.backdrop();
  if (!backdrop) return null;
  const look = ctx.backdropLook();
  const id = `${ctx.uid}-opacity`;
  const range = el('input', { type: 'range', class: 'pe-range', id, min: '0', max: '100', step: '5', value: String(Math.round(look.opacity * 100)), 'data-key': 'backdrop-opacity' });
  range.addEventListener('input', () => ctx.setBackdropLook({ opacity: Number(range.value) / 100 }));
  const show = el('input', { type: 'checkbox', checked: look.visible, 'data-key': 'backdrop-show' });
  show.addEventListener('change', () => ctx.setBackdropLook({ visible: show.checked }));
  return section('Drawing underneath', [
    el('label', { class: 'pe-check' }, [show, el('span', { text: backdrop.kind === 'dxf' ? 'Show the CAD linework' : 'Show the scanned plan' })]),
    el('div', { class: 'pe-control' }, [el('label', { class: 'pe-label', for: id, text: 'Strength' }), range])
  ]);
}

/**
 * Heights per floor.
 * @returns {HTMLElement}
 */
function heightsSection(ctx) {
  const levels = [...ctx.building.levels].sort((x, y) => y.elevation - x.elevation);
  const top = levels[0];
  const blocks = levels.map((level) => {
    const commit = (key, label) => (value) => ctx.commit(`Change ${level.name} ${label}`, (state) => {
      state.building.levels.find((l) => l.id === level.id)[key] = value;
      deriveLevelHeights(state.building.levels);
    });
    const grid = el('div', { class: 'pe-grid2' }, [
      lengthField(ctx, { key: `h-${level.id}-elevation`, label: 'Floor level', value: level.elevation, min: -10, max: 200, onCommit: commit('elevation', 'floor level') }),
      lengthField(ctx, { key: `h-${level.id}-ceiling`, label: 'Ceiling height', value: level.ceiling, min: 1.8, max: 12, onCommit: commit('ceiling', 'ceiling height') }),
      lengthField(ctx, { key: `h-${level.id}-slab`, label: 'Slab', value: level.slab, min: 0, max: 1, onCommit: commit('slab', 'slab') }),
      level === top
        ? lengthField(ctx, { key: `h-${level.id}-parapet`, label: 'Parapet', value: level.parapet ?? 0, min: 0, max: 3, onCommit: commit('parapet', 'parapet') })
        : null
    ]);
    const gap = level.height;
    const tight = level !== top && level.ceiling + level.slab > gap + 1e-6;
    return el('div', { class: 'pe-level' }, [
      el('h4', { class: 'pe-level-name', text: level.name }),
      grid,
      el('p', { class: tight ? 'pe-meta is-warn' : 'pe-meta', text: tight
        ? `Ceiling and slab are taller than the ${ctx.fmt(gap)} up to the next floor.`
        : `Floor to floor ${ctx.fmt(gap)}` })
    ]);
  });
  return section('Heights', [
    el('p', { class: 'pe-hint', text: `Type feet and inches (10' 6") or metres (3.2 m). Read them from your section drawing.` }),
    ...blocks
  ], { key: 'heights', collapsible: true, ctx });
}

/**
 * Schedule rows in display order: doors, windows, ventilators, then the rest, by tag.
 * @returns {[string, object][]}
 */
function orderedRows(schedule) {
  const rank = (entry) => {
    const i = SCHEDULE_TYPES.indexOf(String(entry.type ?? '').toLowerCase());
    return i === -1 ? SCHEDULE_TYPES.length : i;
  };
  return Object.entries(schedule).sort(([ta, a], [tb, b]) => rank(a) - rank(b) || ta.localeCompare(tb, undefined, { numeric: true }));
}

/**
 * The door and window schedule: one row per tag.
 * @returns {HTMLElement}
 */
function scheduleSection(ctx) {
  const list = el('ul', { class: 'pe-sched' });
  for (const [tag, entry] of orderedRows(ctx.schedule)) {
    const used = openingsWithTag(ctx.building, tag).length;
    const tagInput = el('input', { class: 'pe-cell pe-cell-tag', 'data-key': `s-${tag}-tag`, 'aria-label': `Tag ${tag}`, value: tag, autocomplete: 'off' });
    tagInput.addEventListener('change', () => {
      const next = tagInput.value.trim().toUpperCase();
      if (next === tag) return;
      if (!next || ctx.schedule[next]) {
        ctx.fieldError(tagInput, next ? `${next} is already in the schedule.` : 'A size needs a tag such as D3.');
        return;
      }
      ctx.commit(`Rename ${tag} to ${next}`, (state) => renameTag(state.building, state.schedule, tag, next));
    });
    const rowCommit = (key, label) => (value) => ctx.commit(`Change ${tag} ${label}`, (state) => {
      const row = state.schedule[tag];
      if (!row) return false;
      row[key] = value;
      applyScheduleRow(state.building, tag, row);
      return true;
    });
    const type = selectBox({
      key: `s-${tag}-type`,
      label: `Type of ${tag}`,
      value: String(entry.type ?? '').toLowerCase(),
      options: SCHEDULE_TYPES.map((t) => [t, TYPE_LABELS[t]]),
      onChange: rowCommit('type', 'type')
    });
    type.className = 'pe-cell pe-cell-type';
    const remove = el('button', {
      type: 'button',
      class: 'pe-icon-btn',
      'data-key': `s-${tag}-remove`,
      'aria-label': `Remove ${tag}`,
      title: used ? `${tag} is used ${used} time${used > 1 ? 's' : ''}` : `Remove ${tag}`,
      html: icon('close'),
      onclick: () => {
        if (used) {
          ctx.toast(`${tag} is used by ${used} opening${used > 1 ? 's' : ''}. Remove ${used > 1 ? 'them' : 'it'} or give ${used > 1 ? 'them' : 'it'} another size first.`, 'warn');
          return;
        }
        ctx.commit(`Remove ${tag}`, (state) => {
          delete state.schedule[tag];
        });
      }
    });
    const size = (key, label, value) => el('label', { class: 'pe-srow-size' }, [
      el('span', { class: 'pe-label', text: label }),
      lengthCell(ctx, { key: `s-${tag}-${key}`, label: `${tag} ${label.toLowerCase()}`, value, onCommit: rowCommit(key, label.toLowerCase()) })
    ]);
    list.append(el('li', { class: 'pe-srow' }, [
      el('div', { class: 'pe-srow-head' }, [
        tagInput,
        type,
        used ? el('span', { class: 'pe-used', text: `used ${used}×` }) : null,
        remove
      ]),
      el('div', { class: 'pe-srow-sizes' }, [
        size('width', 'Width', entry.width),
        size('height', 'Height', entry.height),
        size('sill', 'Sill', entry.sill ?? 0)
      ])
    ]));
  }
  const add = (type, label) => el('button', {
    type: 'button',
    class: 'btn btn-ghost btn-sm',
    'data-key': `s-add-${type}`,
    html: `${icon('plus')}<span>${label}</span>`,
    onclick: () => {
      const tag = nextTag(ctx.schedule, type);
      const base = { ...(type === 'door' ? DEFAULT_SCHEDULE.D1 : DEFAULT_SCHEDULE.W1) };
      ctx.commit(`Add ${tag}`, (state) => {
        state.schedule[tag] = base;
      });
      ctx.focus(`s-${tag}-width`);
    }
  });
  return section('Door and window schedule', [
    el('p', { class: 'pe-hint', text: 'Every opening with a tag takes its size from here.' }),
    list,
    el('div', { class: 'pe-row' }, [add('door', 'Door size'), add('window', 'Window size')])
  ], { key: 'schedule', collapsible: true, ctx });
}

/**
 * Friendlier wording for a validation message, and the item it points at.
 * @returns {{ text: string, target: object | null }}
 */
function describeCheck(building, message) {
  let target = null;
  const text = message
    .replace(/opening "([^"]+)"/g, (_, id) => {
      const found = findOpening(building, id);
      target ??= found ? { kind: 'opening', id, level: found.wall.level } : null;
      return found?.opening.tag ? `${found.opening.tag}` : 'an opening';
    })
    .replace(/openings "([^"]+)" and "([^"]+)"/g, (_, x, y) => {
      const a = findOpening(building, x);
      const b = findOpening(building, y);
      target ??= a ? { kind: 'opening', id: x, level: a.wall.level } : null;
      return `${a?.opening.tag ?? 'an opening'} and ${b?.opening.tag ?? 'an opening'}`;
    })
    .replace(/wall "([^"]+)"/g, (_, id) => {
      const wall = building.walls.find((w) => w.id === id);
      target ??= wall ? { kind: 'wall', id, level: wall.level } : null;
      return 'a wall';
    })
    .replace(/room "([^"]+)"/g, (_, id) => {
      const room = building.rooms.find((r) => r.id === id);
      target ??= room ? { kind: 'room', id, level: room.level } : null;
      return room ? room.name : 'a room';
    });
  return { text: text.charAt(0).toUpperCase() + text.slice(1), target };
}

/**
 * Counts for the floor and checks for the whole building.
 * @returns {HTMLElement}
 */
function summarySection(ctx) {
  const b = ctx.building;
  const items = [];
  if (!ctx.isSite) {
    const c = levelCounts(b, ctx.levelId);
    const stat = (n, one, many) => el('div', { class: 'pe-stat' }, [el('strong', { text: String(n) }), el('span', { text: n === 1 ? one : many })]);
    items.push(el('div', { class: 'pe-stats' }, [
      stat(c.walls, 'wall', 'walls'),
      stat(c.doors, 'door', 'doors'),
      stat(c.windows, 'window', 'windows'),
      stat(c.rooms, 'room', 'rooms')
    ]));
    if (c.unnamed) items.push(el('p', { class: 'pe-flag-line', text: `${c.unnamed} room${c.unnamed > 1 ? 's' : ''} still to name.` }));
  } else {
    const site = b.site;
    const gates = site?.boundaryWall?.gates?.length ?? 0;
    items.push(el('p', { class: 'pe-meta', text: site?.boundary?.length >= 3
      ? `Plot drawn · ${gates} gate${gates === 1 ? '' : 's'}${site.boundaryWall ? '' : ' · no boundary wall'}`
      : 'No plot boundary yet.' }));
  }
  let result = ctx.ui.checks.get(b);
  if (!result) {
    result = validateBuilding(b);
    ctx.ui.checks.set(b, result);
  }
  const checks = [...result.errors, ...result.warnings.filter((w) => !/neither a polygon/.test(w))].slice(0, MAX_CHECKS);
  if (checks.length) {
    items.push(el('ul', { class: 'pe-checks' }, checks.map((message) => {
      const { text, target } = describeCheck(b, message);
      return el('li', {}, [
        el('span', { text }),
        target ? el('button', { type: 'button', class: 'btn-link pe-show', onclick: () => ctx.reveal(target), text: 'Show' }) : null
      ]);
    })));
  } else {
    items.push(el('p', { class: 'pe-ok-line', text: 'No problems found.' }));
  }
  return section(ctx.isSite ? 'Summary' : 'This floor', items);
}

/**
 * Renders the whole panel, keeping keyboard focus on the same field across re-renders.
 * @param {HTMLElement} root
 * @param {object} ctx editor tool context
 * @param {object} tool active tool
 */
export function renderPanel(root, ctx, tool) {
  const active = root.contains(document.activeElement) ? document.activeElement : null;
  const key = active?.dataset?.key;
  const caret = active && 'selectionStart' in active ? active.selectionStart : null;
  const scroll = root.scrollTop;
  root.replaceChildren(...[
    contextSection(ctx, tool),
    backdropSection(ctx),
    ctx.isSite ? null : heightsSection(ctx),
    ctx.isSite ? null : scheduleSection(ctx),
    summarySection(ctx)
  ].filter(Boolean));
  root.scrollTop = scroll;
  if (key) {
    const again = root.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (again) {
      again.focus({ preventScroll: true });
      if (typeof caret === 'number' && again.type === 'text') again.setSelectionRange(caret, caret);
    }
  }
}
