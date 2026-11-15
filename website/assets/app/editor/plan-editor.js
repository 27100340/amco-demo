/**
 * The 2D review and trace plan editor (browser only). DXF packages open in review mode with the
 * auto-read walls over the CAD linework; PDF and photo packages open in trace mode with the
 * scanned plan underneath. Whatever the editor outputs is exactly what the 3D engine builds.
 *
 * Usage:
 *   const editor = createPlanEditor(container, { building, backdrops, schedule, mode, onChange, onPreview3D });
 *   editor.setLevel('g'); editor.setTool('wall'); editor.getBuilding(); editor.undo(); editor.destroy();
 */
import { distance } from '../model/geometry.js';
import { formatLength, parseLength } from '../model/units.js';
import { createHistory, snapshotCommand } from './commands.js';
import {
  WALL_THICKNESS, copyData, normaliseBuilding, normaliseSchedule, syncRooms, createPlanCache, dropCollapsedWalls,
  findOpening, isUnnamedRoom
} from './model-ops.js';
import { levelRooms } from './hit.js';
import { createView, boundsOf, unionBounds } from './view.js';
import { renderBackdrop, renderPlan, renderOverlay, backdropBounds } from './render.js';
import { prepareBackdrops } from './backdrop.js';
import { renderPanel, lengthField } from './panel.js';
import { el, isTypingTarget } from './dom.js';
import { icon } from './icons.js';
import { createSelectTool } from './tools/select.js';
import { createWallTool } from './tools/wall.js';
import { createOpeningTool } from './tools/opening.js';
import { createRoomTool } from './tools/room.js';
import { createScaleTool } from './tools/scale.js';
import { createSiteTool, DEFAULT_GATE_WIDTH } from './tools/site.js';

/** onChange is called this long (ms) after the last change. */
const CHANGE_DELAY = 300;
/** A press that moves further than this (px) is a drag, not a click. */
const DRAG_THRESHOLD = 4;
/** Toasts stay up this long (ms). */
const TOAST_TIME = 4200;
/** Zoom step for the + and − keys and buttons. */
const ZOOM_STEP = 1.25;
/** Stage width (px) from which fitting leaves room beside the tips card (below it on narrower stages). */
const TIPS_ASIDE_MIN = 760;
/** Gap (px) kept between the tips card and fitted content. */
const TIPS_GAP = 8;
/** Where the units preference is remembered in this browser. */
const UNITS_KEY = 'amco.editor.units';

/** Toolbar buttons: tool name, label, shortcut key, icon. */
const TOOL_BUTTONS = [
  { name: 'select', label: 'Select', key: 'V', icon: 'select' },
  { name: 'wall', label: 'Wall', key: 'W', icon: 'wall' },
  { name: 'door', label: 'Door', key: 'D', icon: 'door' },
  { name: 'window', label: 'Window', key: 'N', icon: 'window' },
  { name: 'room', label: 'Room', key: 'R', icon: 'room' },
  { name: 'site', label: 'Plot', key: 'P', icon: 'site' },
  { name: 'scale', label: 'Scale', key: 'S', icon: 'scale' }
];

/**
 * Reads the remembered units choice.
 * @returns {'imperial'|'metric'}
 */
function readUnits() {
  try {
    return window.localStorage.getItem(UNITS_KEY) === 'metric' ? 'metric' : 'imperial';
  } catch (error) {
    console.error(error);
    return 'imperial';
  }
}

/**
 * Remembers the units choice.
 * @param {'imperial'|'metric'} units
 */
function writeUnits(units) {
  try {
    window.localStorage.setItem(UNITS_KEY, units);
  } catch (error) {
    console.error(error);
  }
}

/**
 * True when two hover/selection targets point at the same thing.
 * @returns {boolean}
 */
function sameTarget(x, y) {
  if (!x || !y) return x === y;
  return x.kind === y.kind && x.id === y.id && x.index === y.index;
}

/**
 * Mounts the plan editor in `container`.
 * @param {HTMLElement} container
 * @param {{
 *   building: import('../model/schema.js').Building,
 *   backdrops?: Object<string, { kind: 'dxf', entities: object[], factor: number, offset: [number, number] }
 *     | { kind: 'bitmap', bitmap: unknown, metresPerPixel: number | null, offset: [number, number] }>,
 *   schedule?: Object<string, { type: string, width: number, height: number, sill: number }>,
 *   mode?: 'review'|'trace',
 *   onChange?: (building: import('../model/schema.js').Building, schedule: object) => void,
 *   onPreview3D?: (building: import('../model/schema.js').Building) => void
 * }} options backdrops are keyed by level id or 'site'. A DXF backdrop's entities are in drawing
 *   units (metres = units × factor + offset). A bitmap backdrop is any image (URL, image, canvas,
 *   ImageBitmap or Blob) whose bottom-left corner sits at `offset`; the scale tool writes the
 *   new `metresPerPixel` back onto the caller's backdrop object. onChange is debounced 300 ms.
 * @returns {{ setLevel(levelId: string): void, setTool(name: string): void,
 *   getBuilding(): import('../model/schema.js').Building, getSchedule(): object,
 *   undo(): void, redo(): void, destroy(): void }}
 */
export function createPlanEditor(container, { building, backdrops = {}, schedule, mode = 'review', onChange, onPreview3D } = {}) {
  const uid = `pe${Math.random().toString(36).slice(2, 8)}`;
  const plans = createPlanCache();
  /** Plans come from the cache; a drag preview's own level is re-noded only around the drag. */
  const planOf = (b, id) => (b === previewBuilding && id === levelId
    ? plans.preview(history.state.building, b, id)
    : plans.get(b, id));
  const start = normaliseBuilding(building);
  syncRooms(start, { planFor: (id) => plans.get(start, id) });
  const scales = {};
  for (const [id, backdrop] of Object.entries(backdrops ?? {})) {
    if (backdrop?.kind === 'bitmap') scales[id] = backdrop.metresPerPixel > 0 ? backdrop.metresPerPixel : null;
  }
  const history = createHistory(200, { building: start, schedule: normaliseSchedule(schedule, start), scales });
  const ui = { closedSections: new Set(), customWall: null, looks: {}, tipsHidden: false, checks: new WeakMap() };
  const options = {
    thickness: WALL_THICKNESS.full, thicknessMode: 'full', role: 'exterior', ortho: true,
    tags: { door: 'D1', window: 'W1' }, gateWidth: DEFAULT_GATE_WIDTH, siteMode: 'boundary'
  };
  const levelsSorted = () => [...history.state.building.levels].sort((x, y) => x.elevation - y.elevation);

  let levelId = levelsSorted()[0].id;
  let units = readUnits();
  let selection = null;
  let hover = null;
  let previewBuilding = null;
  let changeTimer = null;
  let toastTimer = null;
  let pendingFocus = null;
  let lastHover = null;
  let gesture = null;
  let spaceHeld = false;
  let destroyed = false;
  let ready = false;
  let frame = null;
  let sceneMemo = null;
  let pendingMove = null;
  let overlayDirty = false;
  const pointers = new Map();

  /* ---------- DOM ---------- */

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'pe-canvas');
  svg.setAttribute('tabindex', '0');
  svg.setAttribute('role', 'application');
  svg.setAttribute('aria-label', 'Plan drawing. Use the tools above; shortcuts: V select, W wall, D door, N window, R room, S scale.');
  svg.setAttribute('aria-describedby', `${uid}-status`);
  const levelBar = el('div', { class: 'seg pe-levels', role: 'group', 'aria-label': 'Floors' });
  const toolBar = el('div', { class: 'pe-tools', role: 'toolbar', 'aria-label': 'Drawing tools' });
  const undoBtn = el('button', { type: 'button', class: 'pe-icon-btn', html: icon('undo'), onclick: () => api.undo() });
  const redoBtn = el('button', { type: 'button', class: 'pe-icon-btn', html: icon('redo'), onclick: () => api.redo() });
  const fitBtn = el('button', { type: 'button', class: 'pe-icon-btn', 'aria-label': 'Fit the plan to the screen', title: 'Fit to screen (F)', html: icon('fit'), onclick: () => fitContent() });
  const unitsBar = el('div', { class: 'seg pe-units', role: 'group', 'aria-label': 'Units' });
  const previewBtn = el('button', { type: 'button', class: 'btn btn-sm pe-preview', html: `${icon('cube')}<span>Preview 3D</span>`, onclick: () => onPreview3D?.(api.getBuilding()) });
  const tips = el('div', { class: 'pe-tips' });
  const status = el('p', { class: 'pe-status', id: `${uid}-status`, 'aria-live': 'polite' });
  const toastBox = el('div', { class: 'pe-toast', role: 'status', 'aria-live': 'polite' });
  const zoomBox = el('div', { class: 'pe-zoom' }, [
    el('button', { type: 'button', class: 'pe-icon-btn', 'aria-label': 'Zoom in', title: 'Zoom in (+)', text: '+', onclick: () => zoomBy(ZOOM_STEP) }),
    el('button', { type: 'button', class: 'pe-icon-btn', 'aria-label': 'Zoom out', title: 'Zoom out (−)', text: '−', onclick: () => zoomBy(1 / ZOOM_STEP) })
  ]);
  const stage = el('div', { class: 'pe-stage' }, [svg, tips, zoomBox, status, toastBox]);
  const panel = el('aside', { class: 'pe-panel', 'aria-label': 'Plan details' });
  const root = el('div', { class: 'plan-editor', 'data-mode': mode }, [
    el('div', { class: 'pe-bar' }, [
      levelBar,
      toolBar,
      el('div', { class: 'pe-actions' }, [undoBtn, redoBtn, fitBtn, unitsBar, previewBtn])
    ]),
    el('div', { class: 'pe-body' }, [stage, panel])
  ]);
  container.append(root);
  const view = createView(svg, { onChange: () => requestOverlay() });

  /* ---------- Context shared with tools ---------- */

  const prepared = prepareBackdrops(backdrops, {
    onReady: (id) => {
      if (destroyed) return;
      if (id === levelId) {
        renderBackdropLayer();
        if (ctx.levelWalls().length === 0) fitContent();
        renderAll();
      }
    },
    onError: (id) => toast(`The drawing for ${levelName(id)} could not be shown. You can still draw without it.`, 'warn')
  });

  const ctx = {
    uid,
    options,
    ui,
    get building() { return previewBuilding ?? history.state.building; },
    get state() { return history.state; },
    get schedule() { return history.state.schedule; },
    get levelId() { return levelId; },
    get isSite() { return levelId === 'site'; },
    get units() { return units; },
    get selection() { return selection; },
    plan: () => (levelId === 'site' ? null : planOf(ctx.building, levelId)),
    levelWalls: () => ctx.building.walls.filter((w) => w.level === levelId),
    tolerance: (px = 10) => view.metres(px),
    fmt: (metres) => formatLength(metres, units),
    parse: (text, unit) => parseLength(text, unit ?? (units === 'metric' ? 'm' : 'ft')),
    commit,
    preview,
    select,
    setHover,
    toast,
    refresh: () => renderOverlayOnly(),
    refreshPanel,
    focus: requestFocus,
    setTool: (name) => api.setTool(name),
    undo: () => api.undo(),
    backdrop: () => prepared.get(levelId, history.state.scales[levelId] ?? null),
    backdropLook,
    setBackdropLook,
    fieldError,
    lengthField: (opts) => lengthField(ctx, opts),
    deleteSelection,
    reveal,
    fit: () => fitContent()
  };

  const tools = {
    select: createSelectTool(ctx),
    wall: createWallTool(ctx),
    door: createOpeningTool(ctx, 'door'),
    window: createOpeningTool(ctx, 'window'),
    room: createRoomTool(ctx),
    scale: createScaleTool(ctx),
    site: createSiteTool(ctx)
  };
  let tool = tools.select;

  /* ---------- State changes ---------- */

  /**
   * Applies one undoable change: `mutate` edits a fresh copy of the state; rooms are re-synced.
   * Level plans come from the shared cache, so each changed level is worked out once and the
   * same plans are then used for drawing (a drag's commit works out the moved level in full once).
   * @param {string} label
   * @param {(state: { building: object, schedule: object, scales: object }) => boolean | void} mutate
   * @returns {boolean} false when nothing changed or `mutate` returned false
   */
  function commit(label, mutate) {
    const before = history.state;
    const next = { building: copyData(before.building), schedule: copyData(before.schedule), scales: { ...before.scales } };
    if (mutate(next) === false) return false;
    dropCollapsedWalls(next.building);
    syncRooms(next.building, { planFor: (id) => planOf(next.building, id) });
    if (JSON.stringify(next) === JSON.stringify(before)) {
      refreshPanel();
      return false;
    }
    history.exec(snapshotCommand(label, before, next));
    previewBuilding = null;
    afterChange();
    return true;
  }

  /**
   * Shows a temporary building while dragging; null clears it. Only the edited level is worked
   * out again (other levels come from the plan cache); rooms are re-synced when the drag is
   * committed, so during the drag they keep their labels and only their outlines follow.
   * @param {((state: object) => void) | null} mutate
   */
  function preview(mutate) {
    if (!mutate) {
      if (previewBuilding) {
        previewBuilding = null;
        renderWorld();
      }
      return;
    }
    const next = { building: copyData(history.state.building), schedule: history.state.schedule, scales: history.state.scales };
    mutate(next);
    previewBuilding = next.building;
    renderWorld();
  }

  function afterChange() {
    validateSelection();
    for (const [id, mpp] of Object.entries(history.state.scales)) {
      const backdrop = backdrops?.[id];
      if (backdrop?.kind === 'bitmap') backdrop.metresPerPixel = mpp;
    }
    renderAll();
    clearTimeout(changeTimer);
    changeTimer = setTimeout(flushChange, CHANGE_DELAY);
  }

  function flushChange() {
    if (changeTimer === null) return;
    clearTimeout(changeTimer);
    changeTimer = null;
    onChange?.(api.getBuilding(), api.getSchedule());
  }

  function validateSelection() {
    if (!selection) return;
    const b = history.state.building;
    const exists = {
      wall: () => b.walls.some((w) => w.id === selection.id),
      opening: () => Boolean(findOpening(b, selection.id)),
      room: () => b.rooms.some((r) => r.id === selection.id),
      gate: () => Boolean(b.site?.boundaryWall?.gates?.[selection.index]),
      boundary: () => Boolean(b.site)
    }[selection.kind];
    if (!exists || !exists()) selection = null;
  }

  function select(target) {
    if (sameTarget(target, selection)) return;
    selection = target;
    ui.customWall = null;
    renderWorld();
    renderOverlayOnly();
    refreshPanel();
  }

  function setHover(target) {
    if (sameTarget(target, hover)) return;
    hover = target;
    renderWorld();
  }

  function deleteSelection() {
    const sel = selection;
    if (!sel) return;
    if (sel.kind === 'room') {
      toast('Rooms come from the walls around them. Delete a wall to join two rooms into one.', 'info');
      return;
    }
    const labels = { wall: 'Delete wall', opening: 'Delete opening', gate: 'Delete gate', boundary: 'Remove plot boundary' };
    const done = commit(labels[sel.kind], (state) => {
      const b = state.building;
      if (sel.kind === 'wall') b.walls = b.walls.filter((w) => w.id !== sel.id);
      else if (sel.kind === 'opening') {
        const found = findOpening(b, sel.id);
        if (!found) return false;
        found.wall.openings = found.wall.openings.filter((o) => o.id !== sel.id);
      } else if (sel.kind === 'gate') b.site.boundaryWall.gates.splice(sel.index, 1);
      else if (sel.kind === 'boundary') delete b.site;
      return true;
    });
    if (done) {
      selection = null;
      renderAll();
    }
  }

  function reveal(target) {
    if (target.level && target.level !== levelId) api.setLevel(target.level);
    select({ kind: target.kind, id: target.id });
  }

  /* ---------- Backdrop look ---------- */

  function backdropLook() {
    const kind = backdrops?.[levelId]?.kind;
    return ui.looks[levelId] ?? { opacity: kind === 'bitmap' ? 0.6 : 1, visible: true };
  }

  function setBackdropLook(change) {
    ui.looks[levelId] = { ...backdropLook(), ...change };
    renderBackdropLayer();
  }

  /* ---------- Rendering ---------- */

  /**
   * What the renderers draw. Worked out once per change of building, level, selection, hover or
   * units, so a frame that redraws both the plan and the overlay does the room matching once.
   */
  function scene() {
    const b = ctx.building;
    const memo = sceneMemo;
    if (memo && memo.building === b && memo.levelId === levelId && memo.selection === selection
      && memo.hover === hover && memo.units === units) return memo;
    sceneMemo = buildScene(b);
    return sceneMemo;
  }

  function buildScene(b) {
    const plan = ctx.plan();
    const sorted = levelsSorted();
    let ghost = [];
    let ghostFaces = [];
    if (levelId === 'site') {
      const lowest = sorted[0];
      if (lowest) {
        const lowestPlan = planOf(b, lowest.id);
        ghost = lowestPlan.pieces.map(({ piece }) => lowestPlan.footprints.get(piece.id).polygon);
        ghostFaces = lowestPlan.faces.map((face) => face.polygon);
      }
    } else {
      const index = sorted.findIndex((l) => l.id === levelId);
      const below = sorted[index - 1];
      if (below) {
        const belowPlan = planOf(b, below.id);
        ghost = belowPlan.pieces.map(({ piece }) => belowPlan.footprints.get(piece.id).polygon);
      }
    }
    return {
      building: b,
      levelId,
      plan,
      rooms: plan ? levelRooms(b, levelId, plan) : [],
      ghost,
      ghostFaces,
      selection,
      hover,
      units,
      showPlot: Boolean(b.site) && sorted[0]?.id === levelId
    };
  }

  function renderBackdropLayer() {
    const look = backdropLook();
    renderBackdrop(view, ctx.backdrop(), look);
  }

  function renderWorld() {
    renderPlan(view, scene());
  }

  function renderOverlayOnly() {
    if (destroyed || !ready) return;
    overlayDirty = false;
    renderOverlay(view, scene(), tool.overlay?.() ?? []);
    status.textContent = tool.hint();
  }

  function renderAll() {
    renderBackdropLayer();
    renderWorld();
    renderOverlayOnly();
    renderToolbar();
    refreshPanel();
    renderTips();
  }

  function refreshPanel() {
    if (destroyed || !ready) return;
    renderPanel(panel, ctx, tool);
    applyFocus();
  }

  function levelName(id) {
    if (id === 'site') return 'the site';
    return history.state.building.levels.find((l) => l.id === id)?.name ?? id;
  }

  function availableTools() {
    const hasBitmap = backdrops?.[levelId]?.kind === 'bitmap';
    const names = levelId === 'site' ? ['select', 'site'] : ['select', 'wall', 'door', 'window', 'room'];
    if (hasBitmap) names.push('scale');
    return names;
  }

  function renderToolbar() {
    const bar = root.querySelector('.pe-bar');
    const focusedKey = bar.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    const levelButtons = [...levelsSorted().map((l) => [l.id, l.name]), ['site', 'Site']].map(([id, name]) => el('button', {
      type: 'button',
      'aria-pressed': String(id === levelId),
      'data-key': `level-${id}`,
      onclick: () => api.setLevel(id)
    }, name));
    levelBar.replaceChildren(...levelButtons);
    const names = availableTools();
    toolBar.replaceChildren(...TOOL_BUTTONS.filter((t) => names.includes(t.name)).map((t) => el('button', {
      type: 'button',
      class: 'pe-tool',
      'aria-pressed': String(tool.name === t.name),
      'aria-keyshortcuts': t.key,
      'aria-label': t.label,
      'data-key': `tool-${t.name}`,
      title: `${t.label} (${t.key})`,
      onclick: () => api.setTool(t.name),
      html: `${icon(t.icon)}<span class="pe-tool-label">${t.label}</span><kbd class="pe-kbd">${t.key}</kbd>`
    })));
    undoBtn.disabled = !history.canUndo;
    redoBtn.disabled = !history.canRedo;
    const undoText = history.canUndo ? `Undo: ${history.undoLabel}` : 'Nothing to undo';
    const redoText = history.canRedo ? `Redo: ${history.redoLabel}` : 'Nothing to redo';
    undoBtn.setAttribute('aria-label', undoText);
    undoBtn.title = `${undoText} (Ctrl+Z)`;
    redoBtn.setAttribute('aria-label', redoText);
    redoBtn.title = `${redoText} (Shift+Ctrl+Z)`;
    unitsBar.replaceChildren(...[['imperial', 'ft-in'], ['metric', 'm']].map(([value, label]) => el('button', {
      type: 'button',
      'aria-pressed': String(units === value),
      'aria-label': value === 'imperial' ? 'Feet and inches' : 'Metres',
      'data-key': `units-${value}`,
      onclick: () => {
        units = value;
        writeUnits(value);
        renderAll();
      }
    }, label)));
    root.dataset.tool = tool.name;
    if (focusedKey && !bar.contains(document.activeElement)) {
      const again = bar.querySelector(`[data-key="${focusedKey}"]`);
      (again ?? svg).focus({ preventScroll: true });
    }
  }

  function tipSteps() {
    const b = history.state.building;
    if (levelId === 'site') {
      const plot = b.site?.boundary?.length >= 3;
      return [
        { done: plot, tool: 'site', text: 'Draw the plot: choose Plot and click each corner of the boundary.' },
        { done: (b.site?.boundaryWall?.gates?.length ?? 0) > 0, tool: 'site', text: 'Add the gate: click on the boundary where it opens.' }
      ];
    }
    const walls = b.walls.filter((w) => w.level === levelId);
    const rooms = b.rooms.filter((r) => r.level === levelId);
    const steps = [];
    if (backdrops?.[levelId]?.kind === 'bitmap') {
      steps.push({ done: history.state.scales[levelId] > 0, tool: 'scale', text: 'Set the scale: click two ends of a dimension you know, then type its length.' });
    }
    steps.push(
      { done: walls.length > 0, tool: 'wall', text: 'Trace the walls: choose Wall (W) and click each corner. Esc to finish.' },
      { done: walls.some((w) => w.openings.length > 0), tool: 'door', text: 'Add doors (D) and windows (N): pick a size, then click on a wall.' },
      { done: rooms.length > 0 && rooms.every((r) => !isUnnamedRoom(r)), tool: 'room', text: 'Name each room: choose Room (R) and click inside it.' }
    );
    return steps;
  }

  function renderTips() {
    const hide = () => {
      ui.tipsHidden = true;
      renderTips();
    };
    if (ui.tipsHidden) {
      tips.hidden = true;
      return;
    }
    const close = el('button', { type: 'button', class: 'pe-icon-btn pe-tips-close', 'aria-label': 'Hide tips', html: icon('close'), onclick: hide });
    if (mode === 'review' && levelId !== 'site') {
      tips.hidden = false;
      tips.replaceChildren(close, el('p', { class: 'pe-tips-title', text: 'Check what we read from your drawing' }),
        el('p', { class: 'pe-tips-text', text: 'Walls, doors and windows are drawn over your CAD linework. Click anything that looks wrong to fix it, and name any room marked "Name this room".' }));
      return;
    }
    const steps = tipSteps();
    if (steps.every((s) => s.done)) {
      tips.hidden = true;
      return;
    }
    tips.hidden = false;
    const next = steps.findIndex((s) => !s.done);
    tips.replaceChildren(close, el('p', { class: 'pe-tips-title', text: levelId === 'site' ? 'Draw the site' : 'Trace your plan' }),
      el('ol', { class: 'pe-tips-list' }, steps.map((step, i) => el('li', { class: step.done ? 'is-done' : i === next ? 'is-next' : '' },
        el('button', { type: 'button', class: 'pe-tip', onclick: () => api.setTool(step.tool) }, step.text)))));
  }

  function toast(message, tone = 'info') {
    toastBox.textContent = message;
    toastBox.dataset.tone = tone;
    toastBox.dataset.open = 'true';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastBox.dataset.open = 'false';
    }, TOAST_TIME);
  }

  function fieldError(input, message) {
    if (!input) {
      toast(message, 'warn');
      return;
    }
    input.setAttribute('aria-invalid', 'true');
    if (input.classList.contains('pe-cell')) {
      toast(message, 'warn');
    } else {
      const id = `${input.id || uid}-error`;
      let note = input.parentElement.querySelector('.pe-error');
      if (!note) {
        note = el('p', { class: 'pe-error', id });
        input.after(note);
      }
      note.textContent = message;
      input.setAttribute('aria-describedby', id);
    }
    input.focus();
    input.select?.();
    input.addEventListener('input', () => {
      input.removeAttribute('aria-invalid');
      input.parentElement?.querySelector('.pe-error')?.remove();
    }, { once: true });
  }

  function requestFocus(key, text) {
    pendingFocus = { key, text };
    queueMicrotask(applyFocus);
  }

  function applyFocus() {
    if (!pendingFocus) return;
    const target = panel.querySelector(`[data-key="${CSS.escape(pendingFocus.key)}"]`);
    if (!target) return;
    const { text } = pendingFocus;
    pendingFocus = null;
    const details = target.closest('details');
    if (details && !details.open) details.open = true;
    target.focus({ preventScroll: false });
    if (typeof text === 'string' && 'value' in target) {
      target.value = text;
      target.setSelectionRange?.(text.length, text.length);
    } else {
      target.select?.();
    }
  }

  /* ---------- View helpers ---------- */

  function contentBounds(id = levelId) {
    const b = history.state.building;
    const points = [];
    if (id === 'site') {
      points.push(...(b.site?.boundary ?? []));
      for (const w of b.walls) points.push(w.a, w.b);
    } else {
      for (const w of b.walls) if (w.level === id) points.push(w.a, w.b);
    }
    return unionBounds([boundsOf(points), backdropBounds(prepared.get(id, history.state.scales[id] ?? null))]);
  }

  function fitContent() {
    let inset = {};
    if (!tips.hidden) {
      inset = stage.clientWidth >= TIPS_ASIDE_MIN
        ? { left: tips.offsetLeft + tips.offsetWidth + TIPS_GAP }
        : { top: tips.offsetTop + tips.offsetHeight + TIPS_GAP };
    }
    view.fit(contentBounds(), inset);
  }

  function zoomBy(factor) {
    view.zoomAt(factor, [view.width / 2, view.height / 2]);
  }

  /* ---------- Frame scheduling: at most one drag/hover recompute and overlay draw per frame ---------- */

  function requestFrame() {
    if (frame === null && !destroyed) frame = requestAnimationFrame(runFrame);
  }

  function requestOverlay() {
    overlayDirty = true;
    requestFrame();
  }

  function queueMove(kind, ev) {
    pendingMove = { kind, ev };
    requestFrame();
  }

  function runFrame() {
    frame = null;
    if (!flushMove() && overlayDirty) renderOverlayOnly();
  }

  /**
   * Runs the queued drag or hover now (pointer up and down call this so the last position counts).
   * @returns {boolean} true when something ran
   */
  function flushMove() {
    const move = pendingMove;
    pendingMove = null;
    if (!move || destroyed) return false;
    if (move.kind === 'drag') tool.drag?.(move.ev);
    else tool.hover?.(move.ev);
    renderOverlayOnly();
    return true;
  }

  function dropMove() {
    pendingMove = null;
  }

  /* ---------- Pointer input ---------- */

  const screenOf = (e) => view.clientToScreen(e.clientX, e.clientY);
  const info = (e, sp) => ({
    world: view.toWorld(sp),
    screen: sp,
    shift: e.shiftKey,
    alt: e.altKey,
    mod: e.ctrlKey || e.metaKey,
    pointerType: e.pointerType
  });
  const pinchState = () => {
    const [p, q] = [...pointers.values()];
    return { dist: Math.max(1, distance(p, q)), mid: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] };
  };

  function onPointerDown(e) {
    flushMove();
    root.dataset.input = 'pointer';
    svg.focus({ preventScroll: true });
    if (e.isTrusted) svg.setPointerCapture(e.pointerId);
    const sp = screenOf(e);
    pointers.set(e.pointerId, sp);
    if (pointers.size === 2) {
      dropMove();
      if (gesture?.kind === 'press' && gesture.captured) tool.cancelDrag?.();
      gesture = { kind: 'pinch', ...pinchState() };
      renderOverlayOnly();
      return;
    }
    if (pointers.size > 2) return;
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault();
      gesture = { kind: 'pan', id: e.pointerId, last: sp };
      return;
    }
    if (e.button !== 0) return;
    const captured = tool.down?.(info(e, sp)) === true;
    gesture = { kind: 'press', id: e.pointerId, start: sp, last: sp, captured, moved: false };
  }

  function onPointerMove(e) {
    const sp = screenOf(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, sp);
    if (gesture?.kind === 'pinch') {
      if (pointers.size < 2) return;
      const now = pinchState();
      view.panBy(now.mid[0] - gesture.mid[0], now.mid[1] - gesture.mid[1]);
      view.zoomAt(now.dist / gesture.dist, now.mid);
      gesture.dist = now.dist;
      gesture.mid = now.mid;
      return;
    }
    if (gesture?.kind === 'pan' && gesture.id === e.pointerId) {
      view.panBy(sp[0] - gesture.last[0], sp[1] - gesture.last[1]);
      gesture.last = sp;
      return;
    }
    if (gesture?.kind === 'press' && gesture.id === e.pointerId) {
      if (!gesture.moved && distance(sp, gesture.start) > DRAG_THRESHOLD) gesture.moved = true;
      if (gesture.moved) {
        if (gesture.captured) {
          queueMove('drag', info(e, sp));
        } else {
          view.panBy(sp[0] - gesture.last[0], sp[1] - gesture.last[1]);
        }
      }
      gesture.last = sp;
      return;
    }
    if (e.pointerType === 'touch' || gesture) return;
    lastHover = info(e, sp);
    queueMove('hover', lastHover);
  }

  function onPointerUp(e) {
    flushMove();
    pointers.delete(e.pointerId);
    const g = gesture;
    if (g?.kind === 'pinch') {
      gesture = pointers.size > 0 ? { kind: 'idle' } : null;
      return;
    }
    if (g?.kind === 'idle') {
      if (pointers.size === 0) gesture = null;
      return;
    }
    if (g?.kind === 'pan') {
      gesture = null;
      return;
    }
    if (g?.kind !== 'press' || g.id !== e.pointerId) return;
    gesture = null;
    const ev = info(e, screenOf(e));
    if (e.type === 'pointercancel') {
      if (g.captured) tool.cancelDrag?.();
    } else if (g.captured && g.moved) {
      tool.up?.(ev);
    } else if (!g.moved) {
      if (g.captured) tool.cancelDrag?.();
      tool.click?.(ev);
    }
    if (e.pointerType !== 'touch') {
      lastHover = ev;
      tool.hover?.(ev);
    }
    renderOverlayOnly();
    renderTips();
  }

  function onPointerLeave(e) {
    if (e.pointerType === 'touch' || gesture) return;
    dropMove();
    lastHover = null;
    tool.leave?.();
    setHover(null);
    renderOverlayOnly();
  }

  function onWheel(e) {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 0.05 : 0.0015;
    view.zoomAt(Math.exp(-e.deltaY * unit), screenOf(e));
  }

  /* ---------- Keyboard ---------- */

  /**
   * Keys count when focus is inside the editor, or nowhere in particular (the page body), so
   * shortcuts work straight after the page loads without ever taking keys from other fields.
   * @returns {boolean}
   */
  function ownsKey(e) {
    return e.target === document.body || root.contains(e.target);
  }

  function onKeyDown(e) {
    if (!ownsKey(e)) return;
    if (e.key === 'Tab') delete root.dataset.input;
    if (e.key === 'Shift' && lastHover) {
      lastHover = { ...lastHover, shift: true };
      tool.hover?.(lastHover);
      renderOverlayOnly();
    }
    const typing = isTypingTarget(e.target);
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && (key === 'z' || key === 'y')) {
      if (typing) return;
      e.preventDefault();
      if (key === 'y' || e.shiftKey) api.redo();
      else api.undo();
      return;
    }
    if (typing || mod || e.altKey) return;
    if (tool.key?.(e)) {
      e.preventDefault();
      renderOverlayOnly();
      return;
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        if (!tool.cancel?.()) select(null);
        renderOverlayOnly();
        return;
      case 'Delete':
      case 'Backspace':
        if (selection) {
          e.preventDefault();
          deleteSelection();
        }
        return;
      case ' ':
        if (e.target === svg || e.target === document.body) {
          e.preventDefault();
          spaceHeld = true;
        }
        return;
      case '+':
      case '=':
        zoomBy(ZOOM_STEP);
        return;
      case '-':
        zoomBy(1 / ZOOM_STEP);
        return;
      default:
        break;
    }
    if (key === 'f') {
      fitContent();
      return;
    }
    const shortcut = TOOL_BUTTONS.find((t) => t.key.toLowerCase() === key);
    if (shortcut) {
      e.preventDefault();
      api.setTool(shortcut.name);
    }
  }

  function onKeyUp(e) {
    if (!ownsKey(e)) return;
    if (e.key === ' ') spaceHeld = false;
    if (e.key === 'Shift' && lastHover) {
      lastHover = { ...lastHover, shift: false };
      tool.hover?.(lastHover);
      renderOverlayOnly();
    }
  }

  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', onPointerUp);
  svg.addEventListener('pointerleave', onPointerLeave);
  svg.addEventListener('wheel', onWheel, { passive: false });
  svg.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  /* ---------- Public API ---------- */

  const api = {
    setLevel(id) {
      const known = id === 'site' || history.state.building.levels.some((l) => l.id === id);
      if (!known || id === levelId) return;
      dropMove();
      tool.deactivate?.();
      tool.cancelDrag?.();
      levelId = id;
      selection = null;
      hover = null;
      previewBuilding = null;
      if (!availableTools().includes(tool.name)) tool = tools.select;
      if (id === 'site' && !history.state.building.site) tool = tools.site;
      renderAll();
      const content = contentBounds();
      const visible = view.visibleBounds();
      const inside = content && content.min[0] >= visible.min[0] && content.max[0] <= visible.max[0]
        && content.min[1] >= visible.min[1] && content.max[1] <= visible.max[1];
      if (content && !inside) fitContent();
    },
    setTool(name) {
      if (!tools[name]) return;
      if (!availableTools().includes(name)) {
        const why = levelId === 'site'
          ? 'Walls, doors, windows and rooms are drawn on a floor. Choose a floor tab first.'
          : name === 'site' ? 'The plot is drawn on the Site tab.' : 'This floor has no scanned drawing to scale.';
        toast(why, 'info');
        return;
      }
      if (tool.name === name) return;
      dropMove();
      tool.deactivate?.();
      tool.cancelDrag?.();
      previewBuilding = null;
      hover = null;
      tool = tools[name];
      if (name !== 'select' && !(name === 'room' && selection?.kind === 'room')) selection = null;
      tool.activate?.();
      if (lastHover) tool.hover?.(lastHover);
      renderAll();
    },
    getBuilding: () => copyData(history.state.building),
    getSchedule: () => copyData(history.state.schedule),
    undo() {
      if (tool.onUndo?.()) {
        renderAll();
        return;
      }
      if (!history.canUndo) {
        toast('Nothing to undo.', 'info');
        return;
      }
      const label = history.undoLabel;
      history.undo();
      previewBuilding = null;
      afterChange();
      status.textContent = `Undone: ${label}`;
    },
    redo() {
      tool.onRedo?.();
      if (!history.canRedo) {
        toast('Nothing to redo.', 'info');
        return;
      }
      const label = history.redoLabel;
      history.redo();
      previewBuilding = null;
      afterChange();
      status.textContent = `Redone: ${label}`;
    },
    destroy() {
      if (destroyed) return;
      flushChange();
      destroyed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      clearTimeout(toastTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      view.destroy();
      prepared.revokeAll();
      root.remove();
    }
  };

  if (mode === 'trace' && levelId !== 'site') {
    const unscaled = backdrops?.[levelId]?.kind === 'bitmap' && !(history.state.scales[levelId] > 0);
    if (unscaled) tool = tools.scale;
    else if (ctx.levelWalls().length === 0) tool = tools.wall;
  }
  ready = true;
  renderAll();
  fitContent();
  return api;
}
