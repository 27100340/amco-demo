/**
 * Room tool: rooms are found automatically from closed loops of walls. Click inside one to name
 * it and choose its use; the panel lists every room on the floor, flagging those still to name.
 */
import { pointInPolygon } from '../../model/geometry.js';
import { levelRooms } from '../hit.js';
import { isUnnamedRoom } from '../model-ops.js';
import { formatArea } from '../drawing.js';
import { el } from '../dom.js';

/**
 * Creates the room tool.
 * @param {object} ctx editor tool context (see plan-editor.js)
 * @returns {object} tool
 */
export function createRoomTool(ctx) {
  const roomAt = (pt) => levelRooms(ctx.building, ctx.levelId, ctx.plan())
    .filter(({ polygon }) => pointInPolygon(pt, polygon))
    .sort((x, y) => x.area - y.area)[0] ?? null;

  return {
    name: 'room',
    cursor: 'pointer',
    hint() {
      return 'Click inside a room to name it. Rooms appear by themselves once walls meet all the way round.';
    },
    hover(ev) {
      const found = roomAt(ev.world);
      ctx.setHover(found ? { kind: 'room', id: found.room.id } : null);
    },
    click(ev) {
      const found = roomAt(ev.world);
      if (!found) {
        ctx.select(null);
        ctx.toast('That spot is not inside a closed room. Check that the walls meet all the way round.', 'info');
        return;
      }
      ctx.select({ kind: 'room', id: found.room.id });
      ctx.focus('room-name');
    },
    panel() {
      const rooms = levelRooms(ctx.building, ctx.levelId, ctx.plan());
      const box = el('div', { class: 'pe-tool-opts' });
      if (rooms.length === 0) {
        box.append(el('p', { class: 'pe-hint', text: 'No rooms on this floor yet. Draw walls that meet all the way round and rooms will appear.' }));
        return box;
      }
      box.append(el('span', { class: 'pe-label', text: `Rooms on this floor (${rooms.length})` }));
      box.append(el('ul', { class: 'pe-room-list' }, rooms.map(({ room, area }) => el('li', {}, el('button', {
        type: 'button',
        class: `pe-room-item${isUnnamedRoom(room) ? ' is-unnamed' : ''}`,
        'aria-pressed': String(ctx.selection?.kind === 'room' && ctx.selection.id === room.id),
        'data-key': `room-item-${room.id}`,
        onclick: () => {
          ctx.select({ kind: 'room', id: room.id });
          ctx.focus('room-name');
        }
      }, [
        el('span', { class: 'pe-room-item-name', text: room.name }),
        el('span', { class: 'pe-room-item-area', text: formatArea(area, ctx.units) }),
        isUnnamedRoom(room) ? el('span', { class: 'pe-flag', text: 'Name this room' }) : null
      ])))));
      return box;
    }
  };
}
