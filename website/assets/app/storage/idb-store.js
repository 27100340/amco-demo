/**
 * ProjectStore on IndexedDB (browser): database `amco`, object store `projects` (key `id`) and
 * object store `files` (key `[projectId, fileId]`) holding the uploaded drawings as Blobs.
 * Failures reject with an Error whose `code` is 'QUOTA' (out of space) or 'STORAGE'.
 */
import { assertSavable, byNewest } from './memory-store.js';
import { storageError } from './errors.js';

const DB_NAME = 'amco';
const DB_VERSION = 1;
const PROJECTS = 'projects';
const FILES = 'files';
/** Record written and removed by the start-up check. */
const PROBE_ID = '__amco-storage-check__';

/**
 * Opens (and on first use creates) the database.
 * @param {IDBFactory} idbFactory
 * @returns {Promise<IDBDatabase>}
 */
function openDb(idbFactory) {
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = idbFactory.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(storageError(error));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: ['projectId', 'fileId'] });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(storageError(req.error));
    req.onblocked = () => reject(storageError(new Error('The database is held open by another tab.')));
  });
}

/**
 * Runs one transaction. `work(tx)` issues the requests and returns a function that reads the
 * result once the transaction has completed.
 * @template T
 * @param {IDBDatabase} db
 * @param {string[]} stores
 * @param {'readonly'|'readwrite'} mode
 * @param {(tx: IDBTransaction) => (() => T)} work
 * @returns {Promise<T>}
 */
function run(db, stores, mode, work) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(storageError(error));
    };
    let tx;
    let read;
    try {
      tx = db.transaction(stores, mode);
      read = work(tx);
    } catch (error) {
      fail(error);
      return;
    }
    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve(read());
    };
    tx.onerror = () => fail(tx.error);
    tx.onabort = () => fail(tx.error ?? new Error('The save was cancelled.'));
  });
}

/**
 * Opens the IndexedDB ProjectStore.
 * @param {{ idbFactory?: IDBFactory, now?: () => string, verify?: boolean }} [options] `now` returns
 *   the ISO time stamped on saves (for tests); `verify` writes and removes a test record first, so
 *   a browser that opens the database but refuses writes is caught at start-up
 * @returns {Promise<{ persistent: true, reason: null, list: () => Promise<object[]>, get: (id: string) => Promise<object|null>,
 *   save: (project: object) => Promise<object>, remove: (id: string) => Promise<void>,
 *   putFile: (projectId: string, fileId: string, blob: Blob, meta?: object) => Promise<void>,
 *   getFile: (projectId: string, fileId: string) => Promise<{ blob: Blob, meta: object }|null>,
 *   removeFile: (projectId: string, fileId: string) => Promise<void> }>}
 * @throws {Error} with code 'STORAGE' or 'QUOTA' when the database cannot be used
 */
export async function createIdbStore({ idbFactory = globalThis.indexedDB, now = () => new Date().toISOString(), verify = false } = {}) {
  if (!idbFactory || typeof idbFactory.open !== 'function') throw storageError(new Error('IndexedDB is not available.'));
  const db = await openDb(idbFactory);
  if (verify) {
    await run(db, [PROJECTS], 'readwrite', (tx) => {
      const store = tx.objectStore(PROJECTS);
      store.put({ id: PROBE_ID });
      store.delete(PROBE_ID);
      return () => undefined;
    });
  }
  return {
    persistent: true,
    reason: null,
    list() {
      return run(db, [PROJECTS], 'readonly', (tx) => {
        const req = tx.objectStore(PROJECTS).getAll();
        return () => byNewest(req.result.filter((p) => p.id !== PROBE_ID));
      });
    },
    get(id) {
      return run(db, [PROJECTS], 'readonly', (tx) => {
        const req = tx.objectStore(PROJECTS).get(id);
        return () => req.result ?? null;
      });
    },
    async save(project) {
      assertSavable(project);
      const stored = { ...structuredClone(project), updated: now() };
      await run(db, [PROJECTS], 'readwrite', (tx) => {
        tx.objectStore(PROJECTS).put(stored);
        return () => undefined;
      });
      return structuredClone(stored);
    },
    remove(id) {
      return run(db, [PROJECTS, FILES], 'readwrite', (tx) => {
        tx.objectStore(PROJECTS).delete(id);
        const files = tx.objectStore(FILES);
        const keys = files.getAllKeys();
        keys.onsuccess = () => {
          for (const key of keys.result) if (key[0] === id) files.delete(key);
        };
        return () => undefined;
      });
    },
    putFile(projectId, fileId, blob, meta = {}) {
      return run(db, [FILES], 'readwrite', (tx) => {
        tx.objectStore(FILES).put({ projectId, fileId, blob, meta: structuredClone(meta) });
        return () => undefined;
      });
    },
    getFile(projectId, fileId) {
      return run(db, [FILES], 'readonly', (tx) => {
        const req = tx.objectStore(FILES).get([projectId, fileId]);
        return () => (req.result ? { blob: req.result.blob, meta: req.result.meta ?? {} } : null);
      });
    },
    removeFile(projectId, fileId) {
      return run(db, [FILES], 'readwrite', (tx) => {
        tx.objectStore(FILES).delete([projectId, fileId]);
        return () => undefined;
      });
    }
  };
}
