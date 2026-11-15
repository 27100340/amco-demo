/**
 * Door and window tools: pick a size from the schedule, move along a wall to preview the opening,
 * click to place it. The centre snaps to 5 cm; a spot that would overlap another opening, cut
 * into a joining wall or run past the end of the wall is shown in amber and refused with a
 * friendly message.
 */
import { nearestWall, fitOpening, openingTypeOf, nextId, takenIds } from '../model-ops.js';
import { el } from '../dom.js';
import { openingFitMessage } from './shared.js';

/** Opening types listed by each tool. */
const KINDS = {
  door: { types: ['door', 'garage', 'opening'], noun: 'door', idPrefix: 'door', empty: 'No door sizes yet. Add one in the schedule below.' },
  window: { types: ['window', 'shopfront'], noun: 'window', idPrefix: 'window', empty: 'No window sizes yet. Add one in the schedule below.' }
};
/** How far (m) from a wall centreline the preview still attaches to that wall. */
const REACH = 0.3;
/** …or this many screen pixels, whichever is larger. */
const REACH_PX = 14;

/**
 * Schedule rows a tool offers, as [tag, entry] pairs sorted by tag.
 * @param {Object<string, object>} schedule
 * @param {'door'|'window'} kind
 * @returns {[string, object][]}
 */
export function rowsFor(schedule, kind) {
  return Object.entries(schedule)
    .filter(([tag, entry]) => KINDS[kind].types.includes(openingTypeOf(entry, tag)))
    .sort(([x], [y]) => x.localeCompare(y, undefined, { numeric: true }));
}

/**
 * Creates the door or window tool.
 * @param {object} ctx editor tool context (see plan-editor.js)
 * @param {'door'|'window'} kind
 * @returns {object} tool
 */
export function createOpeningTool(ctx, kind) {
  const spec = KINDS[kind];
  let preview = null;

  const currentTag = () => {
    const rows = rowsFor(ctx.schedule, kind);
    if (rows.length === 0) return null;
    const chosen = ctx.options.tags[kind];
    if (rows.some(([tag]) => tag === chosen)) return chosen;
    ctx.options.tags[kind] = rows[0][0];
    return rows[0][0];
  };

  const previewAt = (ev) => {
    const tag = currentTag();
    if (!tag) return null;
    const entry = ctx.schedule[tag];
    const near = nearestWall(ctx.building, ctx.levelId, ev.world, Math.max(REACH, ctx.tolerance(REACH_PX)));
    if (!near) return null;
    const fit = fitOpening(ctx.building, near.wall.id, { at: near.s, width: entry.width });
    return { wall: near.wall, tag, entry, ...fit };
  };

  return {
    name: kind,
    cursor: 'crosshair',
    hint() {
      const tag = currentTag();
      if (!tag) return spec.empty;
      return `Move along a wall to place ${tag}, then click. Pick another size on the right.`;
    },
    deactivate() {
      preview = null;
    },
    leave() {
      preview = null;
    },
    hover(ev) {
      preview = previewAt(ev);
    },
    click(ev) {
      preview = previewAt(ev);
      const tag = currentTag();
      if (!tag) {
        ctx.toast(spec.empty, 'warn');
        return;
      }
      if (!preview) {
        ctx.toast(`Click on a wall to place the ${spec.noun}.`, 'info');
        return;
      }
      if (!preview.ok) {
        ctx.toast(openingFitMessage(preview, spec.noun), 'warn');
        return;
      }
      const { wall, at, entry } = preview;
      ctx.commit(`Add ${spec.noun} ${tag}`, (state) => {
        const host = state.building.walls.find((w) => w.id === wall.id);
        host.openings.push({
          id: nextId(spec.idPrefix, takenIds(state.building)),
          type: openingTypeOf(entry, tag),
          at,
          width: entry.width,
          height: entry.height,
          sill: entry.sill ?? 0,
          tag
        });
      });
      preview = null;
    },
    overlay() {
      if (!preview) return [];
      const opening = { type: openingTypeOf(preview.entry, preview.tag), at: preview.at, width: preview.entry.width };
      const shapes = [{ type: 'symbol', wall: preview.wall, opening, cls: preview.ok ? 'is-ok' : 'is-bad' }];
      const u = [preview.wall.b[0] - preview.wall.a[0], preview.wall.b[1] - preview.wall.a[1]];
      const len = Math.hypot(u[0], u[1]) || 1;
      const at = [preview.wall.a[0] + (u[0] / len) * preview.at, preview.wall.a[1] + (u[1] / len) * preview.at];
      const text = preview.ok
        ? `${preview.tag} · ${ctx.fmt(preview.entry.width)}`
        : openingFitMessage(preview, spec.noun);
      shapes.push({ type: 'label', at, text, dy: -22, cls: preview.ok ? 'is-strong' : 'is-bad' });
      return shapes;
    },
    panel() {
      const rows = rowsFor(ctx.schedule, kind);
      const box = el('div', { class: 'pe-tool-opts' });
      if (rows.length === 0) {
        box.append(el('p', { class: 'pe-hint', text: spec.empty }));
        return box;
      }
      const tag = currentTag();
      box.append(el('span', { class: 'pe-label', text: `${spec.noun === 'door' ? 'Door' : 'Window'} size` }));
      box.append(el('div', { class: 'pe-size-list', role: 'group', 'aria-label': `${spec.noun} sizes` }, rows.map(([rowTag, entry]) => el('button', {
        type: 'button',
        class: 'pe-size',
        'aria-pressed': String(rowTag === tag),
        'data-key': `size-${rowTag}`,
        onclick: () => {
          ctx.options.tags[kind] = rowTag;
          ctx.refreshPanel();
          ctx.refresh();
        }
      }, [
        el('strong', { text: rowTag }),
        el('span', { text: `${ctx.fmt(entry.width)} × ${ctx.fmt(entry.height)}` }),
        entry.sill > 0 ? el('span', { class: 'pe-size-note', text: `sill ${ctx.fmt(entry.sill)}` }) : null
      ]))));
      box.append(el('p', { class: 'pe-hint', text: 'Change sizes in the door and window schedule below.' }));
      return box;
    }
  };
}
