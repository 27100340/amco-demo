/**
 * The ProjectStore the page uses: IndexedDB when the browser allows it, otherwise a memory store
 * for this tab only (`persistent === false`, with a `reason` to show the customer).
 *
 * ProjectStore: { persistent, reason, list(), get(id), save(project), remove(id),
 *                 putFile(projectId, fileId, blob, meta), getFile(projectId, fileId), removeFile(projectId, fileId) }
 * A later cloud backend implements the same methods.
 */
import { createIdbStore } from './idb-store.js';
import { createMemoryStore } from './memory-store.js';

export { QUOTA_MESSAGE } from './errors.js';

/** Why nothing is being saved, when the browser blocks storage. */
export const BLOCKED_REASON = 'Your browser isn\'t letting this page save, so this project won\'t be saved after you close the tab. Use Export project to keep a copy.';

/**
 * Opens the best store this browser allows.
 * @param {{ idbFactory?: IDBFactory|null, now?: () => string }} [options] `idbFactory` defaults to
 *   the browser's indexedDB (tests inject their own); `now` stamps saves (for tests)
 * @returns {Promise<object>} a ProjectStore; when IndexedDB is missing, throws or refuses writes,
 *   a memory store with `persistent: false`, `reason` and `cause` (the original failure)
 */
export async function createStore({ idbFactory = globalThis.indexedDB, now } = {}) {
  const clock = now ? { now } : {};
  try {
    return await createIdbStore({ idbFactory, verify: true, ...clock });
  } catch (error) {
    const store = createMemoryStore({ reason: BLOCKED_REASON, ...clock });
    store.cause = error;
    return store;
  }
}
