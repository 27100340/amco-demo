/**
 * Scale tool for scanned plans: click both ends of a dimension you know, type its real length,
 * and the drawing is resized to match. Anything already traced on that floor is resized with it,
 * so it stays on the drawing. Setting the scale is one undoable step.
 */
import { distance, sub, normalize } from '../../model/geometry.js';
import { snapPoint } from '../snap.js';
import { rescaleLevel } from '../model-ops.js';
import { el } from '../dom.js';

/**
 * Creates the scale tool.
 * @param {object} ctx editor tool context (see plan-editor.js)
 * @returns {object} tool
 */
export function createScaleTool(ctx) {
  let points = [];
  let cursor = null;

  const bitmap = () => {
    const b = ctx.backdrop();
    return b && b.kind === 'bitmap' ? b : null;
  };

  const snapAt = (ev) => {
    const from = points.length === 1 ? points[0] : undefined;
    return snapPoint(ev.world, { walls: [], ortho: ctx.options.ortho && !ev.shift, from, tolerance: 0 }).point;
  };

  const apply = (input) => {
    const backdrop = bitmap();
    const length = ctx.parse(input.value);
    if (!(length > 0)) {
      ctx.fieldError(input, 'Type the real length, such as 24\' 0" or 7.3 m.');
      return;
    }
    const drawn = distance(points[0], points[1]);
    const current = backdrop.metresPerPixel;
    const pixels = drawn / current;
    if (!(pixels > 1)) {
      ctx.fieldError(input, 'Those two points are too close together. Start again with a longer line.');
      return;
    }
    const next = length / pixels;
    const factor = next / current;
    const level = ctx.levelId;
    const hadWalls = ctx.levelWalls().length > 0;
    ctx.commit('Set drawing scale', (state) => {
      state.scales[level] = next;
      rescaleLevel(state.building, level, backdrop.offset, factor);
    });
    points = [];
    ctx.fit();
    ctx.toast(hadWalls ? 'Scale set. Your tracing was resized to match.' : 'Scale set. Now trace the walls with the Wall tool (W).', 'ok');
    if (!hadWalls && !ctx.isSite) ctx.setTool('wall');
    else ctx.refreshPanel();
  };

  return {
    name: 'scale',
    cursor: 'crosshair',
    hint() {
      if (!bitmap()) return 'This floor has no scanned drawing to scale.';
      if (points.length === 0) return 'Click one end of a dimension you know. The longer the line, the more accurate.';
      if (points.length === 1) return 'Now click the other end of that dimension.';
      return 'Type the real length of that line on the right, then press Enter.';
    },
    deactivate() {
      points = [];
      cursor = null;
    },
    leave() {
      cursor = null;
    },
    hover(ev) {
      cursor = points.length < 2 ? snapAt(ev) : null;
    },
    click(ev) {
      if (!bitmap()) {
        ctx.toast('This floor has no scanned drawing to scale. CAD drawings carry their own scale.', 'info');
        return;
      }
      const p = snapAt(ev);
      points = points.length >= 2 ? [p] : [...points, p];
      if (points.length === 2) ctx.focus('scale-length');
      ctx.refreshPanel();
    },
    cancel() {
      if (points.length === 0) return false;
      points = [];
      ctx.refreshPanel();
      return true;
    },
    overlay() {
      const shapes = [];
      const end = points.length === 1 ? cursor : points[1];
      for (const p of points) shapes.push({ type: 'marker', at: p, kind: 'endpoint', cls: 'is-measure' });
      if (points.length >= 1 && end) {
        shapes.push({ type: 'line', a: points[0], b: end, cls: 'is-measure' });
        const mid = [(points[0][0] + end[0]) / 2, (points[0][1] + end[1]) / 2];
        const backdrop = bitmap();
        const prefix = backdrop?.scaled ? 'Measures' : 'About';
        if (distance(points[0], end) > 0) {
          shapes.push({ type: 'label', at: mid, text: `${prefix} ${ctx.fmt(distance(points[0], end))}`, dy: -12, cls: 'is-measure' });
        }
        if (points.length === 1 && cursor && distance(points[0], cursor) > 0) {
          shapes.push({ type: 'guide', at: points[0], dir: normalize(sub(cursor, points[0])), cls: 'is-measure' });
        }
      } else if (cursor) {
        shapes.push({ type: 'marker', at: cursor, kind: 'free' });
      }
      return shapes;
    },
    panel() {
      const box = el('div', { class: 'pe-tool-opts' });
      const backdrop = bitmap();
      if (!backdrop) {
        box.append(el('p', { class: 'pe-hint', text: 'This floor has no scanned drawing. CAD drawings carry their own scale, so there is nothing to set here.' }));
        return box;
      }
      const mmPerPixel = backdrop.metresPerPixel * 1000;
      box.append(el('p', { class: `pe-status-line${backdrop.scaled ? ' is-ok' : ' is-warn'}`, text: backdrop.scaled
        ? `Scale set: 1 pixel on the drawing is ${mmPerPixel.toFixed(1)} mm.`
        : 'Scale not set yet. Lengths are only a guess until you set it.' }));
      box.append(el('ol', { class: 'pe-steps' }, [
        el('li', { class: points.length >= 1 ? 'is-done' : '', text: 'Click one end of a dimension you know.' }),
        el('li', { class: points.length >= 2 ? 'is-done' : '', text: 'Click the other end.' }),
        el('li', { text: 'Type its real length.' })
      ]));
      if (points.length === 2) {
        const id = `${ctx.uid}-scale-length`;
        const input = el('input', {
          class: 'input pe-input',
          id,
          'data-key': 'scale-length',
          placeholder: ctx.units === 'metric' ? 'e.g. 7.3 m' : 'e.g. 24\' 0"',
          autocomplete: 'off'
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            apply(input);
          }
        });
        box.append(
          el('div', { class: 'pe-control' }, [el('label', { class: 'pe-label', for: id, text: 'Real length of that line' }), input]),
          el('div', { class: 'pe-row' }, [
            el('button', { type: 'button', class: 'btn btn-sm', 'data-key': 'scale-apply', onclick: () => apply(input), text: 'Set scale' }),
            el('button', {
              type: 'button',
              class: 'btn btn-ghost btn-sm',
              'data-key': 'scale-restart',
              text: 'Start again',
              onclick: () => {
                points = [];
                ctx.refreshPanel();
                ctx.refresh();
              }
            })
          ])
        );
      }
      return box;
    }
  };
}
