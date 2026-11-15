/**
 * A small in-memory stand-in for `indexedDB`, enough for storage/idb-store.js: open with an
 * upgrade, object stores with in-line keys (string or array key paths), get/put/delete/getAll/
 * getAllKeys, and transactions that complete or abort. Requests settle asynchronously, like the
 * real thing. `failWrites` makes every write abort with a QuotaExceededError.
 */

/** Calls a handler on the next turn. */
function later(fn) {
  setTimeout(fn, 0);
}

/** Error shaped like a DOMException. */
function domError(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}

/** Copies a record, keeping Blobs by reference. */
function copy(value) {
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = v instanceof Blob ? v : structuredClone(v);
  }
  return out;
}

/** Reads the key of a record from a key path. */
function keyOf(record, keyPath) {
  return Array.isArray(keyPath) ? keyPath.map((k) => record[k]) : record[keyPath];
}

/**
 * Creates a fake IDBFactory.
 * @param {{ failWrites?: boolean }} [options]
 * @returns {{ open: (name: string, version: number) => object, databases: Map<string, object> }}
 */
export function createFakeIdb({ failWrites = false } = {}) {
  const databases = new Map();

  function makeDb(state) {
    return {
      get version() { return state.version; },
      objectStoreNames: { contains: (name) => state.stores.has(name) },
      createObjectStore(name, { keyPath }) {
        state.stores.set(name, { keyPath, rows: new Map() });
        return {};
      },
      transaction(names, mode = 'readonly') {
        const list = Array.isArray(names) ? names : [names];
        for (const n of list) if (!state.stores.has(n)) throw domError('NotFoundError', `No store ${n}`);
        let pending = 0;
        let finished = false;
        const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
        const finish = () => {
          if (finished || pending > 0) return;
          finished = true;
          later(() => tx.oncomplete && tx.oncomplete({ target: tx }));
        };
        const abort = (error) => {
          if (finished) return;
          finished = true;
          tx.error = error;
          later(() => {
            if (tx.onerror) tx.onerror({ target: tx });
            if (tx.onabort) tx.onabort({ target: tx });
          });
        };
        tx.abort = () => abort(domError('AbortError', 'Aborted'));
        tx.objectStore = (name) => {
          const store = state.stores.get(name);
          const request = (work, write) => {
            const req = { result: undefined, error: null, onsuccess: null, onerror: null };
            pending += 1;
            later(() => {
              pending -= 1;
              if (finished) return;
              if (write && mode !== 'readwrite') {
                abort(domError('ReadOnlyError', 'Read-only transaction'));
                return;
              }
              if (write && failWrites) {
                req.error = domError('QuotaExceededError', 'The quota has been exceeded.');
                if (req.onerror) req.onerror({ target: req });
                abort(req.error);
                return;
              }
              req.result = work();
              if (req.onsuccess) req.onsuccess({ target: req });
              finish();
            });
            return req;
          };
          return {
            get: (key) => request(() => copy(store.rows.get(JSON.stringify(key))), false),
            getAll: () => request(() => [...store.rows.values()].map(copy), false),
            getAllKeys: () => request(() => [...store.rows.values()].map((r) => keyOf(r, store.keyPath)), false),
            put: (value) => request(() => {
              const key = keyOf(value, store.keyPath);
              store.rows.set(JSON.stringify(key), copy(value));
              return key;
            }, true),
            delete: (key) => request(() => {
              store.rows.delete(JSON.stringify(key));
            }, true)
          };
        };
        later(finish);
        return tx;
      },
      close() {}
    };
  }

  return {
    databases,
    open(name, version) {
      const req = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      later(() => {
        let state = databases.get(name);
        const isNew = !state;
        if (isNew) {
          state = { version: 0, stores: new Map() };
          databases.set(name, state);
        }
        const db = makeDb(state);
        req.result = db;
        if (state.version < version) {
          const oldVersion = state.version;
          state.version = version;
          if (req.onupgradeneeded) req.onupgradeneeded({ target: req, oldVersion, newVersion: version });
        }
        if (req.onsuccess) req.onsuccess({ target: req });
      });
      return req;
    }
  };
}
