/**
 * Inline line icons for the plan editor toolbar (24×24, 1.5 px stroke, currentColor).
 */

const PATHS = {
  select: '<path d="M6 3.5l12 7.2-5.3 1.4 3.1 5.6-2.3 1.3-3.1-5.6L6.6 17z"/>',
  wall: '<path d="M3.5 17.5h17M3.5 13.5h17"/><path d="M3.5 13.5v4M20.5 13.5v4"/><path d="M8 5.5h2.5M13.5 5.5H16" stroke-linecap="round"/><circle cx="5" cy="5.5" r="1.5"/><circle cx="19" cy="5.5" r="1.5"/>',
  door: '<path d="M4 20.5h16"/><path d="M6.5 20.5V5.5"/><path d="M6.5 5.5a15 15 0 0 1 13.5 15"/>',
  window: '<path d="M3.5 9.5h17M3.5 14.5h17M3.5 12h17"/><path d="M3.5 9.5v5M20.5 9.5v5"/>',
  room: '<path d="M4 4.5h16v15H4z"/><path d="M8.5 11.5h7M10 14.5h4"/>',
  scale: '<path d="M3.5 15.5l12-12 5 5-12 12z"/><path d="M7 12l2 2M9.5 9.5l1.5 1.5M12 7l2 2"/>',
  site: '<path d="M4 7l6-3 10 4v12l-16-2z" stroke-dasharray="3 2"/><path d="M10 15h4"/>',
  undo: '<path d="M9 7.5L4.5 12 9 16.5"/><path d="M4.5 12H15a4.5 4.5 0 0 1 0 9h-2"/>',
  redo: '<path d="M15 7.5l4.5 4.5-4.5 4.5"/><path d="M19.5 12H9a4.5 4.5 0 0 0 0 9h2"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>'
};

/**
 * Markup for one icon.
 * @param {keyof PATHS | string} name
 * @returns {string} an inline `<svg>` string (empty for unknown names)
 */
export function icon(name) {
  const body = PATHS[name];
  if (!body) return '';
  return `<svg class="pe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}
