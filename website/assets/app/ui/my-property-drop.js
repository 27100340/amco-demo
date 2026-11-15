/**
 * Page-wide drop zone: dragging files anywhere over the page shows an overlay; dropping them on
 * an upload slot passes that slot along.
 */

/**
 * Watches the window for dropped files.
 * @param {HTMLElement} overlay shown while files are dragged over the page
 * @param {(files: File[], options: { slot: string|null }) => void} onDrop
 */
export function watchFileDrops(overlay, onDrop) {
  let depth = 0;
  const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');
  window.addEventListener('dragenter', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth += 1;
    overlay.hidden = false;
  });
  window.addEventListener('dragover', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', (event) => {
    if (!hasFiles(event)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) overlay.hidden = true;
  });
  window.addEventListener('drop', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth = 0;
    overlay.hidden = true;
    const files = [...event.dataTransfer.files];
    const slot = event.target.closest?.('[data-slot]')?.dataset.slot ?? null;
    if (files.length) onDrop(files, { slot });
  });
}
