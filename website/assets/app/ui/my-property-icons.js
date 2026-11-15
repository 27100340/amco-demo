/**
 * Line icons for the "My property" page (24×24, 1.5 px stroke via the shared `.icon` class).
 */

const PATHS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  ring: '<circle cx="12" cy="12" r="7.5"/>',
  alert: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  file: '<path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4"/>',
  image: '<path d="M4 5.5h16v13H4z"/><path d="M4 15.5l4.5-4.5 4 4 2.5-2.5 5 5"/><circle cx="15.5" cy="9" r="1.3"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  upload: '<path d="M12 15.5V4.5M7.5 9L12 4.5 16.5 9"/><path d="M4.5 15v4.5h15V15"/>',
  download: '<path d="M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5"/><path d="M4.5 15v4.5h15V15"/>',
  expand: '<path d="M14 4.5h5.5V10M10 19.5H4.5V14M19.5 4.5L13 11M4.5 19.5L11 13"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  arrowLeft: '<path d="M19.5 12h-15M10 6.5L4.5 12l5.5 5.5"/>'
};

/**
 * Markup for one icon.
 * @param {keyof PATHS | string} name
 * @returns {string} an inline `<svg>` string (empty for unknown names)
 */
export function icon(name) {
  const body = PATHS[name];
  if (!body) return '';
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
}
