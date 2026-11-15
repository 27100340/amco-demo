/**
 * Site tool (site tab only): draw the plot boundary corner by corner, then mark gates on it.
 * The boundary wall's height and thickness are set in the panel. Each change is undoable.
 */
import { add, scale, sub, distance, normalize, polygonArea } from '../../model/geometry.js';
import { snapPoint } from '../snap.js';
import { fitGate, reseatGates } from '../model-ops.js';
import { el } from '../dom.js';
import { gateFitMessage, roundSegment } from './shared.js';

const FOOT = 0.3048;
/** Boundary wall used when a plot is first drawn: 7′ high, 9″ thick. */
export const DEFAULT_BOUNDARY_WALL = Object.freeze({ height: 7 * FOOT, thickness: 9 * 0.0254 });
/** Default gate width: 12′. */
export const DEFAULT_GATE_WIDTH = 12 * FOOT;
/** Snap radius in screen pixels. */
const SNAP_PX = 10;
/** A gate preview attaches to the boundary within this many pixels. */
const GATE_REACH_PX = 24;

/**
 * Boundary wall fields (on/off, height, thickness), shared by the site tool and the boundary
 * properties panel.
 * @param {object} ctx editor tool context
 * @returns {HTMLElement}
 */
export function boundaryWallControls(ctx) {
  const site = ctx.building.site;
  const wall = site?.boundaryWall;
  const box = el('div', { class: 'pe-control' });
  const toggle = el('input', { type: 'checkbox', 'data-key': 'site-wall-on', checked: Boolean(wall) });
  toggle.addEventListener('change', () => {
    ctx.commit(toggle.checked ? 'Add boundary wall' : 'Remove boundary wall', (state) => {
      if (!state.building.site) return false;
      if (toggle.checked) state.building.site.boundaryWall = { ...DEFAULT_BOUNDARY_WALL, gates: [] };
      else delete state.building.site.boundaryWall;
      return true;
    });
  });
  box.append(el('label', { class: 'pe-check' }, [toggle, el('span', { text: 'Boundary wall round the plot' })]));
  if (!wall) return box;
  const grid = el('div', { class: 'pe-grid2' });
  for (const [key, label] of [['height', 'Wall height'], ['thickness', 'Wall thickness']]) {
    grid.append(ctx.lengthField({
      key: `site-wall-${key}`,
      label,
      value: wall[key],
      min: key === 'height' ? 0.3 : 0.05,
      max: key === 'height' ? 6 : 1,
      onCommit: (value) => ctx.commit(`Change boundary wall ${key}`, (state) => {
        state.building.site.boundaryWall[key] = value;
      })
    }));
  }
  box.append(grid);
  return box;
}

/**
 * Creates the site tool.
 * @param {object} ctx editor tool context (see plan-editor.js)
 * @returns {object} tool
 */
export function createSiteTool(ctx) {
  let chain = null;
  let cursor = null;
  let gate = null;

  const mode = () => (ctx.building.site?.boundary?.length >= 3 ? ctx.options.siteMode : 'boundary');

  const snapAt = (ev) => {
    const from = chain ? chain[chain.length - 1] : undefined;
    const snap = snapPoint(ev.world, {
      walls: [],
      points: chain ?? [],
      ortho: ctx.options.ortho && !ev.shift,
      from,
      tolerance: ctx.tolerance(SNAP_PX)
    });
    if (from && (snap.kind === 'ortho' || snap.kind === 'free')) snap.point = roundSegment(from, snap.point, ctx.units);
    return snap;
  };

  const commitBoundary = () => {
    const points = chain;
    chain = null;
    if (!points || points.length < 3) {
      ctx.refreshPanel();
      return;
    }
    const ordered = polygonArea(points) < 0 ? [...points].reverse() : points;
    ctx.commit('Draw plot boundary', (state) => {
      const site = state.building.site ?? { boundary: [], ground: [] };
      site.boundary = ordered.map((p) => [p[0], p[1]]);
      site.ground = Array.isArray(site.ground) ? site.ground : [];
      if (!site.boundaryWall) site.boundaryWall = { ...DEFAULT_BOUNDARY_WALL, gates: [] };
      reseatGates(site);
      state.building.site = site;
    });
    ctx.options.siteMode = 'gate';
    ctx.toast('Plot boundary drawn. Now click on it to add the gate.', 'ok');
    ctx.refreshPanel();
  };

  const gateAt = (ev) => {
    const site = ctx.building.site;
    const fit = fitGate(site, ev.world, ctx.options.gateWidth);
    if (!fit.at || distance(fit.at, ev.world) > ctx.tolerance(GATE_REACH_PX)) return null;
    return fit;
  };

  return {
    name: 'site',
    cursor: 'crosshair',
    hint() {
      if (mode() === 'gate') return 'Click on the plot boundary to add a gate there.';
      if (!chain) return 'Click each corner of the plot. Click the first corner again to close it.';
      return 'Click the next corner. Click the first corner, press Enter or double-click to close the plot.';
    },
    deactivate() {
      chain = null;
      cursor = null;
      gate = null;
    },
    leave() {
      cursor = null;
      gate = null;
    },
    hover(ev) {
      if (mode() === 'gate') {
        gate = gateAt(ev);
        cursor = null;
      } else {
        cursor = snapAt(ev);
        gate = null;
      }
    },
    click(ev) {
      if (mode() === 'gate') {
        const fit = gateAt(ev);
        if (!fit) {
          ctx.toast('Click on the plot boundary to place the gate.', 'info');
          return;
        }
        if (!fit.ok) {
          ctx.toast(gateFitMessage(fit), 'warn');
          return;
        }
        const width = ctx.options.gateWidth;
        ctx.commit('Add gate', (state) => {
          const site = state.building.site;
          if (!site.boundaryWall) site.boundaryWall = { ...DEFAULT_BOUNDARY_WALL, gates: [] };
          site.boundaryWall.gates = [...(site.boundaryWall.gates ?? []), { at: fit.at, width }];
        });
        gate = null;
        return;
      }
      const snap = snapAt(ev);
      if (!chain) {
        chain = [snap.point];
        ctx.refreshPanel();
        return;
      }
      const closes = chain.length >= 3 && distance(snap.point, chain[0]) < 1e-6;
      const repeat = distance(snap.point, chain[chain.length - 1]) < 0.05;
      if (closes || repeat) {
        commitBoundary();
        return;
      }
      chain.push(snap.point);
    },
    key(ev) {
      if (ev.key === 'Enter' && chain) {
        commitBoundary();
        return true;
      }
      return false;
    },
    cancel() {
      if (!chain) return false;
      chain = null;
      ctx.refreshPanel();
      return true;
    },
    onUndo() {
      if (!chain) return false;
      chain.pop();
      if (chain.length === 0) chain = null;
      return true;
    },
    overlay() {
      const shapes = [];
      if (chain) {
        shapes.push({ type: 'polyline', points: cursor ? [...chain, cursor.point] : chain, cls: 'is-plot' });
        for (const p of chain) shapes.push({ type: 'dot', at: p, cls: 'is-chain' });
        if (cursor) {
          const from = chain[chain.length - 1];
          const len = distance(from, cursor.point);
          if (len > 1e-6) {
            shapes.push({ type: 'dimension', a: from, b: cursor.point, text: ctx.fmt(len), cls: 'is-strong' });
          }
        }
      }
      if (cursor) shapes.push({ type: 'marker', at: cursor.point, kind: cursor.kind });
      if (gate) {
        const boundary = ctx.building.site.boundary;
        const a = boundary[gate.edge];
        const b = boundary[(gate.edge + 1) % boundary.length];
        const dir = normalize(sub(b, a));
        const half = scale(dir, ctx.options.gateWidth / 2);
        shapes.push({ type: 'line', a: sub(gate.at, half), b: add(gate.at, half), cls: gate.ok ? 'is-gate' : 'is-gate is-bad' });
        shapes.push({
          type: 'label',
          at: gate.at,
          text: gate.ok ? `Gate · ${ctx.fmt(ctx.options.gateWidth)}` : gateFitMessage(gate),
          dy: -16,
          cls: gate.ok ? 'is-strong' : 'is-bad'
        });
      }
      return shapes;
    },
    panel() {
      const box = el('div', { class: 'pe-tool-opts' });
      const hasPlot = ctx.building.site?.boundary?.length >= 3;
      const current = mode();
      box.append(el('div', { class: 'seg pe-seg', role: 'group', 'aria-label': 'What to draw' }, [
        ['boundary', hasPlot ? 'Redraw plot' : 'Plot boundary'],
        ['gate', 'Gate']
      ].map(([value, label]) => el('button', {
        type: 'button',
        'aria-pressed': String(current === value),
        'data-key': `site-mode-${value}`,
        disabled: value === 'gate' && !hasPlot,
        onclick: () => {
          ctx.options.siteMode = value;
          chain = null;
          ctx.refreshPanel();
          ctx.refresh();
        }
      }, label))));
      if (current === 'gate') {
        box.append(ctx.lengthField({
          key: 'site-gate-width',
          label: 'Gate width',
          value: ctx.options.gateWidth,
          min: 0.6,
          max: 12,
          onCommit: (value) => {
            ctx.options.gateWidth = value;
            ctx.refreshPanel();
          }
        }));
      } else if (chain) {
        box.append(el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-key': 'site-close', onclick: commitBoundary, text: 'Close the plot (Enter)', disabled: chain.length < 3 }));
      }
      if (hasPlot) box.append(boundaryWallControls(ctx));
      return box;
    }
  };
}
