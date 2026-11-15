/**
 * ProjectStore kept in memory for this page only: used when the browser will not let us save
 * (private browsing, storage switched off, IndexedDB missing). Works exactly like the IndexedDB
 * store, but `persistent` is false and everything is gone when the tab closes.
 */
import { validateProject } from './project-schema.js';

/**
 * Deep copy of a project.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function clone(value) {
  return structuredClone(value);
}

/**
 * Key for one file of one project.
 * @param {string} projectId
 * @param {string} fileId
 * @returns {string}
 */
function fileKey(projectId, fileId) {
  return JSON.stringify([projectId, fileId]);
}

/**
 * Projects, newest change first.
 * @param {object[]} projects
 * @returns {object[]}
 */
export function byNewest(projects) {
  return [...projects].sort((a, b) => String(b.updated).localeCompare(String(a.updated)) || String(a.name).localeCompare(String(b.name)));
}

/**
 * Throws when a project cannot be saved.
 * @param {object} project
 * @throws {Error}
 */
export function assertSavable(project) {
  const check = validateProject(project);
  if (!check.ok) {
    const error = new Error(`This project can't be saved: ${check.errors.join(' ')}`);
    error.code = 'INVALID';
    throw error;
  }
}

/**
 * Creates an in-memory ProjectStore.
 * @param {{ now?: () => string, reason?: string }} [options] `now` returns the ISO time stamped on
 *   saves (for tests); `reason` explains to the customer why nothing is saved
 * @returns {{ persistent: boolean, reason: string|null, list: () => Promise<object[]>, get: (id: string) => Promise<object|null>,
 *   save: (project: object) => Promise<object>, remove: (id: string) => Promise<void>,
 *   putFile: (projectId: string, fileId: string, blob: Blob, meta?: object) => Promise<void>,
 *   getFile: (projectId: string, fileId: string) => Promise<{ blob: Blob, meta: object }|null>,
 *   removeFile: (projectId: string, fileId: string) => Promise<void> }}
 */
export function createMemoryStore({ now = () => new Date().toISOString(), reason = null } = {}) {
  const projects = new Map();
  const files = new Map();
  return {
    persistent: false,
    reason,
    async list() {
      return byNewest([...projects.values()]).map(clone);
    },
    async get(id) {
      return projects.has(id) ? clone(projects.get(id)) : null;
    },
    async save(project) {
      assertSavable(project);
      const stored = { ...clone(project), updated: now() };
      projects.set(stored.id, stored);
      return clone(stored);
    },
    async remove(id) {
      projects.delete(id);
      for (const key of [...files.keys()]) {
        if (JSON.parse(key)[0] === id) files.delete(key);
      }
    },
    async putFile(projectId, fileId, blob, meta = {}) {
      files.set(fileKey(projectId, fileId), { blob, meta: clone(meta) });
    },
    async getFile(projectId, fileId) {
      const found = files.get(fileKey(projectId, fileId));
      return found ? { blob: found.blob, meta: clone(found.meta) } : null;
    },
    async removeFile(projectId, fileId) {
      files.delete(fileKey(projectId, fileId));
    }
  };
}
