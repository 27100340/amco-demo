/**
 * Autosave for the open project: saves 500 ms after the last change, one save at a time, and
 * straight away when the tab is hidden or closed.
 */

/**
 * Creates the autosaver.
 * @param {{ store: { save: (project: object) => Promise<object> }, current: () => object|null,
 *   onSaved: (saved: object) => void, onError: (error: Error) => void, delay?: number }} options
 *   `current` returns the project to save (null when none is open)
 * @returns {{ schedule: () => void, flush: () => Promise<void>, cancel: () => void }}
 */
export function createAutosave({ store, current, onSaved, onError, delay = 500 }) {
  let timer = null;
  let chain = Promise.resolve();

  const flush = () => {
    clearTimeout(timer);
    timer = null;
    const project = current();
    if (!project) return chain;
    chain = chain.then(() => store.save(project)).then(onSaved, onError);
    return chain;
  };

  window.addEventListener('pagehide', () => {
    if (timer) flush();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && timer) flush();
  });

  return {
    /** Saves shortly (each call restarts the wait). */
    schedule() {
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    flush,
    /** Drops a save that is waiting (the project is being deleted). */
    cancel() {
      clearTimeout(timer);
      timer = null;
    }
  };
}
