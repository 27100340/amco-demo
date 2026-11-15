/**
 * Wall tool: click corner to corner to draw a run of walls. Straight lines (0°/90°) by default,
 * Shift for any angle; snaps to wall ends and onto walls; the live length shows as you move;
 * a typed length places the next corner exactly. Esc, Enter, a double-click, closing the loop or
 * ending on another wall finishes the run. Each wall is its own undoable step.
 */
import { add, scale, sub, distance, normalize, leftNormal } from '../../model/geometry.js';
import { snapPoint } from '../snap.js';
import { WALL_THICKNESS, nextId, takenIds } from '../model-ops.js';
import { el } from '../dom.js';
import { roundSegment, orthoDirection, angleOf } from './shared.js';

/** Snap radius in screen pixels. */
const SNAP_PX = 10;
/** Walls within 2 mm of 9″ or 4½″ (230 mm and 115 mm drawings) count as those sizes. */
const THICKNESS_SLACK = 0.002;
/** A click this close (m) to the last corner finishes the run instead of adding a wall. */
const MIN_WALL = 0.05;

/** Thickness choices: chip label, value, role given to new walls. */
const THICKNESS_CHIPS = [
  { mode: 'full', label: '9″', note: 'outer walls', value: WALL_THICKNESS.full, role: 'exterior' },
  { mode: 'half', label: '4½″', note: 'partitions', value: WALL_THICKNESS.half, role: 'partition' },
  { mode: 'custom', label: 'Custom', note: '', value: null, role: 'interior' }
];

/**
 * Thickness chips and the custom field, shared by the wall tool and the wall properties panel.
 * @param {object} ctx editor tool context
 * @param {{ thickness: number, mode: string, onPick: (value: number, role: string, mode: string) => void, key: string }} options
 * @returns {HTMLElement}
 */
export function thicknessControl(ctx, { thickness, mode, onPick, key }) {
  const chips = el('div', { class: 'seg pe-seg', role: 'group', 'aria-label': 'Wall thickness' },
    THICKNESS_CHIPS.map((chip) => el('button', {
      type: 'button',
      'aria-pressed': String(chip.mode === mode),
      'data-key': `${key}-${chip.mode}`,
      title: chip.note ? `${chip.label} ${chip.note}` : 'Type your own thickness',
      onclick: () => {
        if (chip.mode === 'custom') onPick(thickness, chip.role, 'custom');
        else onPick(chip.value, chip.role, chip.mode);
      }
    }, [chip.label, chip.note ? el('span', { class: 'pe-seg-note', text: chip.note }) : null])));
  const wrap = el('div', { class: 'pe-control' }, [el('span', { class: 'pe-label', text: 'Thickness' }), chips]);
  if (mode === 'custom') {
    const input = el('input', {
      class: 'input pe-input',
      'data-key': `${key}-custom-value`,
      'aria-label': 'Custom wall thickness',
      value: ctx.fmt(thickness),
      inputmode: 'decimal'
    });
    input.addEventListener('change', () => {
      const value = ctx.parse(input.value, ctx.units === 'metric' ? 'mm' : 'in');
      if (!(value > 0.03 && value < 1)) {
        ctx.fieldError(input, 'Type a thickness such as 6″ or 150 mm.');
        return;
      }
      onPick(value, 'interior', 'custom');
    });
    wrap.append(input);
  }
  return wrap;
}

/**
 * Thickness mode for a value: 'full', 'half' or 'custom'.
 * @param {number} thickness
 * @returns {'full'|'half'|'custom'}
 */
export function thicknessMode(thickness) {
  if (Math.abs(thickness - WALL_THICKNESS.full) <= THICKNESS_SLACK) return 'full';
  if (Math.abs(thickness - WALL_THICKNESS.half) <= THICKNESS_SLACK) return 'half';
  return 'custom';
}

/**
 * Creates the wall tool.
 * @param {object} ctx editor tool context (see plan-editor.js)
 * @returns {object} tool
 */
export function createWallTool(ctx) {
  let chain = null;
  let cursor = null;

  const last = () => chain.points[chain.points.length - 1];

  const snapAt = (ev) => {
    const from = chain ? last() : undefined;
    const snap = snapPoint(ev.world, {
      walls: ctx.levelWalls(),
      ortho: ctx.options.ortho && !ev.shift,
      from,
      tolerance: ctx.tolerance(SNAP_PX)
    });
    if (from && (snap.kind === 'ortho' || snap.kind === 'free')) snap.point = roundSegment(from, snap.point, ctx.units);
    return snap;
  };

  const finish = () => {
    if (!chain) return false;
    chain = null;
    ctx.refreshPanel();
    ctx.refresh();
    return true;
  };

  const place = (point, kind) => {
    if (!chain) {
      chain = { points: [point] };
      ctx.refreshPanel();
      return;
    }
    const from = last();
    if (distance(point, from) < MIN_WALL) {
      finish();
      return;
    }
    const { thickness, role } = ctx.options;
    const added = ctx.commit('Add wall', (state) => {
      const id = nextId('w', takenIds(state.building));
      state.building.walls.push({ id, level: ctx.levelId, a: [...from], b: [...point], thickness, role, openings: [] });
    });
    if (!added) return;
    chain.points.push(point);
    const closed = chain.points.length > 2 && distance(point, chain.points[0]) < 1e-6;
    const joined = kind === 'endpoint' || kind === 'wall';
    if (closed || joined) {
      finish();
      ctx.toast(closed ? 'Loop closed. Rooms are found automatically.' : 'Wall joined.', 'info');
    } else {
      ctx.refreshPanel();
    }
  };

  const placeTyped = (input) => {
    const length = ctx.parse(input.value);
    if (!(length > 0)) {
      ctx.fieldError(input, 'Type a length such as 12\' 6" or 3.8 m.');
      return;
    }
    const from = last();
    let dir = cursor ? normalize(sub(cursor.point, from)) : [1, 0];
    if (dir[0] === 0 && dir[1] === 0) dir = [1, 0];
    if (ctx.options.ortho) dir = orthoDirection(dir);
    place(add(from, scale(dir, length)), 'free');
    ctx.focus('wall-length');
  };

  return {
    name: 'wall',
    cursor: 'crosshair',
    get drawing() { return Boolean(chain); },
    hint() {
      if (!chain) return 'Click where a wall starts. Walls snap to corners and to other walls.';
      return 'Click the next corner, or type a length. Esc or double-click to finish. Shift for any angle.';
    },
    deactivate() {
      chain = null;
      cursor = null;
    },
    leave() {
      cursor = null;
    },
    hover(ev) {
      cursor = snapAt(ev);
    },
    click(ev) {
      const snap = snapAt(ev);
      cursor = snap;
      place(snap.point, snap.kind);
    },
    key(ev) {
      if (ev.key === 'Enter') return finish();
      if (ev.key === 'Backspace' && chain) {
        ctx.undo();
        return true;
      }
      if (chain && /^[0-9.]$/.test(ev.key)) {
        ctx.focus('wall-length', ev.key);
        return true;
      }
      return false;
    },
    cancel() {
      return finish();
    },
    onUndo() {
      if (!chain) return false;
      if (chain.points.length <= 1) {
        finish();
        return true;
      }
      chain.points.pop();
      return false;
    },
    onRedo() {
      finish();
    },
    overlay() {
      const shapes = [];
      if (chain) {
        for (const p of chain.points) shapes.push({ type: 'dot', at: p, cls: 'is-chain' });
      }
      if (!cursor) return shapes;
      if (chain) {
        const from = last();
        const to = cursor.point;
        const len = distance(from, to);
        if (len > 1e-6) {
          const dir = normalize(sub(to, from));
          const n = scale(leftNormal(dir), ctx.options.thickness / 2);
          shapes.push({ type: 'poly', points: [sub(from, n), sub(to, n), add(to, n), add(from, n)], cls: 'is-wall-preview' });
          if (cursor.kind === 'ortho') shapes.push({ type: 'guide', at: from, dir });
          const angle = cursor.kind === 'ortho' ? '' : ` · ${angleOf(dir)}°`;
          shapes.push({ type: 'dimension', a: from, b: to, offset: ctx.options.thickness / 2, text: `${ctx.fmt(len)}${angle}`, cls: 'is-strong' });
        }
      }
      shapes.push({ type: 'marker', at: cursor.point, kind: cursor.kind });
      return shapes;
    },
    panel() {
      const box = el('div', { class: 'pe-tool-opts' });
      box.append(thicknessControl(ctx, {
        thickness: ctx.options.thickness,
        mode: ctx.options.thicknessMode,
        key: 'wall-thickness',
        onPick: (value, role, mode) => {
          Object.assign(ctx.options, { thickness: value, role, thicknessMode: mode });
          ctx.refreshPanel();
          ctx.refresh();
        }
      }));
      const ortho = el('input', { type: 'checkbox', 'data-key': 'wall-ortho', checked: ctx.options.ortho });
      ortho.addEventListener('change', () => {
        ctx.options.ortho = ortho.checked;
        ctx.refresh();
      });
      box.append(el('label', { class: 'pe-check' }, [ortho, el('span', { text: 'Straight lines only' })]),
        el('p', { class: 'pe-hint', text: 'Hold Shift while drawing for any angle.' }));
      if (chain) {
        const input = el('input', {
          class: 'input pe-input',
          'data-key': 'wall-length',
          id: `${ctx.uid}-wall-length`,
          placeholder: ctx.units === 'metric' ? 'e.g. 3.8 m' : 'e.g. 12\' 6"',
          autocomplete: 'off',
          inputmode: 'decimal'
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            placeTyped(input);
          } else if (e.key === 'Escape') {
            input.blur();
            finish();
          }
        });
        box.append(
          el('div', { class: 'pe-control' }, [
            el('label', { class: 'pe-label', for: `${ctx.uid}-wall-length`, text: 'Next wall length' }),
            input,
            el('p', { class: 'pe-hint', text: 'Type a length and press Enter. It follows the direction of your pointer.' })
          ]),
          el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-key': 'wall-finish', onclick: finish, text: 'Finish this run (Esc)' })
        );
      }
      return box;
    }
  };
}
