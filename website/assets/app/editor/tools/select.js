/**
 * Select tool: click walls, openings, rooms, gates and the plot boundary; drag wall ends (ends
 * that meet move together), drag a selected wall sideways, slide a selected opening along its
 * wall, and drag plot corners. Every change is one undoable step.
 */
import { sub, dot, scale, distance, normalize, leftNormal, projectOnSegment } from '../../model/geometry.js';
import { snapPoint } from '../snap.js';
import { hitTest } from '../hit.js';
import { connectedEnds, followTee, translateEnds, findOpening, fitOpening, reseatGates } from '../model-ops.js';
import { openingFitMessage, roundSegment } from './shared.js';

/** Hit radius in screen pixels. */
const HIT_PX = 8;
/** Snap radius in screen pixels. */
const SNAP_PX = 10;

/**
 * Moves the listed wall ends to `point`, keeping T-junction walls attached. Mutates `building`.
 */
function moveEnds(building, ends, point) {
  const skip = new Set(ends.map((e) => `${e.wallId}.${e.end}`));
  const moved = [];
  for (const { wallId, end } of ends) {
    const wall = building.walls.find((w) => w.id === wallId);
    if (!wall) continue;
    moved.push({ before: { id: wall.id, level: wall.level, a: [...wall.a], b: [...wall.b] }, wall });
    wall[end] = [point[0], point[1]];
  }
  for (const { before, wall } of moved) followTee(building, before, wall, skip);
}

/**
 * Creates the select tool.
 * @param {object} ctx editor tool context (see plan-editor.js)
 * @returns {object} tool
 */
export function createSelectTool(ctx) {
  let hover = null;
  let drag = null;

  const hit = (ev) => hitTest(ctx.building, ctx.levelId, ctx.isSite ? null : ctx.plan(), ev.world, ctx.tolerance(HIT_PX));

  const targetOf = (h) => {
    if (!h) return null;
    if (h.kind === 'end') return { kind: 'wall', id: h.wallId };
    if (h.kind === 'vertex') return { kind: 'boundary' };
    return h.kind === 'gate' ? { kind: 'gate', index: h.index } : { kind: h.kind, id: h.id };
  };

  const startEnds = (h) => {
    const b = ctx.state.building;
    const ends = connectedEnds(b.walls, h.point, ctx.levelId);
    const grabbed = b.walls.find((w) => w.id === h.wallId);
    const anchor = distance(grabbed.a, h.point) <= distance(grabbed.b, h.point) ? grabbed.b : grabbed.a;
    const moving = new Set(ends.map((e) => e.wallId));
    const others = b.walls.filter((w) => w.level === ctx.levelId && !moving.has(w.id));
    drag = { kind: 'ends', ends, anchor, others, point: h.point, snap: null, wallId: h.wallId };
  };

  const startBody = (wallId, ev) => {
    const b = ctx.state.building;
    const wall = b.walls.find((w) => w.id === wallId);
    const seen = new Set();
    const ends = [...connectedEnds(b.walls, wall.a, ctx.levelId), ...connectedEnds(b.walls, wall.b, ctx.levelId)]
      .filter((e) => {
        const key = `${e.wallId}.${e.end}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    drag = { kind: 'body', wallId, ends, start: ev.world, normal: leftNormal(normalize(sub(wall.b, wall.a))), delta: [0, 0] };
  };

  const startOpening = (openingId) => {
    const found = findOpening(ctx.state.building, openingId);
    if (!found) return false;
    drag = { kind: 'opening', wallId: found.wall.id, openingId, width: found.opening.width, fit: null, lastOk: null, noun: nounOf(found.opening) };
    return true;
  };

  const nounOf = (opening) => (opening.type === 'door' || opening.type === 'garage' ? 'door' : opening.type === 'opening' ? 'opening' : 'window');

  return {
    name: 'select',
    cursor: 'default',
    hint() {
      if (drag?.kind === 'ends') return 'Drag to move the corner. Hold Shift for any angle.';
      const sel = ctx.selection;
      if (sel?.kind === 'wall') return 'Drag the wall to move it, or drag its ends. Delete removes it.';
      if (sel?.kind === 'opening') return 'Drag it along the wall to move it. Delete removes it.';
      if (sel?.kind === 'boundary') return 'Drag a corner of the plot to move it.';
      return ctx.isSite ? 'Click the plot boundary or a gate to change it.' : 'Click a wall, door, window or room to change it.';
    },
    leave() {
      hover = null;
    },
    hover(ev) {
      const h = hit(ev);
      hover = h;
      ctx.setHover(targetOf(h));
    },
    down(ev) {
      const h = hit(ev);
      const sel = ctx.selection;
      if (!h) return false;
      if (h.kind === 'end') startEnds(h);
      else if (h.kind === 'wall' && sel?.kind === 'wall' && sel.id === h.id) startBody(h.id, ev);
      else if (h.kind === 'opening' && sel?.kind === 'opening' && sel.id === h.id) return startOpening(h.id);
      else if (h.kind === 'vertex') drag = { kind: 'vertex', index: h.index, point: null };
      else return false;
      return true;
    },
    drag(ev) {
      if (!drag) return;
      const ortho = ctx.options.ortho && !ev.shift;
      if (drag.kind === 'ends') {
        const snap = snapPoint(ev.world, { walls: drag.others, ortho, from: drag.anchor, tolerance: ctx.tolerance(SNAP_PX) });
        if (snap.kind === 'ortho' || snap.kind === 'free') snap.point = roundSegment(drag.anchor, snap.point, ctx.units);
        drag.snap = snap;
        ctx.preview((state) => moveEnds(state.building, drag.ends, snap.point));
      } else if (drag.kind === 'body') {
        let delta = sub(ev.world, drag.start);
        if (ortho) delta = scale(drag.normal, Math.round(dot(delta, drag.normal) / 0.005) * 0.005);
        drag.delta = delta;
        ctx.preview((state) => translateEnds(state.building, drag.ends, delta));
      } else if (drag.kind === 'opening') {
        const wall = ctx.state.building.walls.find((w) => w.id === drag.wallId);
        if (!wall) return;
        const { t } = projectOnSegment(ev.world, wall.a, wall.b);
        const fit = fitOpening(ctx.state.building, drag.wallId, { at: t * distance(wall.a, wall.b), width: drag.width }, drag.openingId);
        drag.fit = fit;
        if (fit.ok) {
          drag.lastOk = fit.at;
          ctx.preview((state) => {
            const found = findOpening(state.building, drag.openingId);
            if (found) found.opening.at = fit.at;
          });
        }
      } else if (drag.kind === 'vertex') {
        const boundary = ctx.state.building.site.boundary;
        const n = boundary.length;
        const from = boundary[(drag.index - 1 + n) % n];
        const others = boundary.filter((_, i) => i !== drag.index);
        const snap = snapPoint(ev.world, { walls: [], points: others, ortho, from, tolerance: ctx.tolerance(SNAP_PX) });
        drag.point = snap.point;
        drag.snap = snap;
        ctx.preview((state) => {
          state.building.site.boundary[drag.index] = snap.point;
          reseatGates(state.building.site);
        });
      }
    },
    up() {
      const done = drag;
      drag = null;
      ctx.preview(null);
      if (!done) return;
      if (done.kind === 'ends' && done.snap) {
        ctx.commit('Move wall end', (state) => moveEnds(state.building, done.ends, done.snap.point));
      } else if (done.kind === 'body' && (done.delta[0] !== 0 || done.delta[1] !== 0)) {
        ctx.commit('Move wall', (state) => translateEnds(state.building, done.ends, done.delta));
      } else if (done.kind === 'opening') {
        if (done.fit && !done.fit.ok) ctx.toast(openingFitMessage(done.fit, done.noun), 'warn');
        if (done.lastOk !== null) {
          ctx.commit(`Move ${done.noun}`, (state) => {
            const found = findOpening(state.building, done.openingId);
            if (!found) return false;
            found.opening.at = done.lastOk;
            return true;
          });
        }
      } else if (done.kind === 'vertex' && done.point) {
        ctx.commit('Move plot corner', (state) => {
          state.building.site.boundary[done.index] = done.point;
          reseatGates(state.building.site);
        });
      }
    },
    cancelDrag() {
      drag = null;
      ctx.preview(null);
    },
    click(ev) {
      const h = hit(ev);
      ctx.select(targetOf(h));
      if (h?.kind === 'room') ctx.focus('room-name');
    },
    cancel() {
      if (drag) {
        this.cancelDrag();
        return true;
      }
      return false;
    },
    overlay() {
      const shapes = [];
      if (hover?.kind === 'end' && !drag) shapes.push({ type: 'handle', at: hover.point, cls: 'is-hover' });
      if (ctx.isSite && (ctx.selection?.kind === 'boundary' || hover?.kind === 'vertex')) {
        for (const p of ctx.building.site?.boundary ?? []) shapes.push({ type: 'handle', at: p });
      }
      if (!drag) return shapes;
      if ((drag.kind === 'ends' || drag.kind === 'vertex') && drag.snap) {
        shapes.push({ type: 'marker', at: drag.snap.point, kind: drag.snap.kind });
        if (drag.snap.kind === 'ortho' && drag.kind === 'ends') {
          const dir = normalize(sub(drag.snap.point, drag.anchor));
          shapes.push({ type: 'guide', at: drag.anchor, dir });
        }
      }
      if (drag.kind === 'ends' && drag.snap) {
        for (const { wallId } of drag.ends) {
          const wall = ctx.building.walls.find((w) => w.id === wallId);
          if (!wall) continue;
          shapes.push({ type: 'dimension', a: wall.a, b: wall.b, offset: wall.thickness / 2, text: ctx.fmt(distance(wall.a, wall.b)), cls: 'is-strong' });
        }
      }
      if (drag.kind === 'body') {
        const wall = ctx.building.walls.find((w) => w.id === drag.wallId);
        if (wall) {
          const mid = [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2];
          const moved = Math.hypot(drag.delta[0], drag.delta[1]);
          shapes.push({ type: 'label', at: mid, text: `Moved ${ctx.fmt(moved)}`, dy: -14, cls: 'is-strong' });
        }
      }
      if (drag.kind === 'opening' && drag.fit && !drag.fit.ok) {
        const found = findOpening(ctx.building, drag.openingId);
        if (found) {
          const wall = found.wall;
          const u = normalize(sub(wall.b, wall.a));
          const at = [wall.a[0] + u[0] * found.opening.at, wall.a[1] + u[1] * found.opening.at];
          shapes.push({ type: 'label', at, text: openingFitMessage(drag.fit, drag.noun), dy: -22, cls: 'is-bad' });
        }
      }
      return shapes;
    }
  };
}
