/**
 * Undo/redo command stack for the plan editor.
 * Pure module: no DOM, no three.js.
 */

/**
 * @template S
 * @typedef {object} Command
 * @property {(state: S) => S} do applies the change and returns the new state
 * @property {(state: S) => S} undo reverts the change and returns the earlier state
 * @property {string} label plain-English name, e.g. "Add wall"
 */

/**
 * Creates a command history that owns the current state. `exec` runs a command and records it;
 * `undo`/`redo` walk the record. A new `exec` clears the redo list. At most `limit` steps are
 * kept; the oldest are forgotten first.
 * @template S
 * @param {number} [limit=200] most steps that can be undone
 * @param {S} [initial] starting state
 * @returns {{
 *   readonly state: S, readonly canUndo: boolean, readonly canRedo: boolean,
 *   readonly undoLabel: string | null, readonly redoLabel: string | null,
 *   exec(cmd: Command<S>): S, undo(): S, redo(): S, reset(state: S): void
 * }}
 */
export function createHistory(limit = 200, initial = undefined) {
  const max = Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 200));
  let state = initial;
  const done = [];
  const undone = [];
  return {
    get state() { return state; },
    get canUndo() { return done.length > 0; },
    get canRedo() { return undone.length > 0; },
    get undoLabel() { return done.length > 0 ? done[done.length - 1].label : null; },
    get redoLabel() { return undone.length > 0 ? undone[undone.length - 1].label : null; },
    exec(cmd) {
      state = cmd.do(state);
      done.push(cmd);
      if (done.length > max) done.splice(0, done.length - max);
      undone.length = 0;
      return state;
    },
    undo() {
      const cmd = done.pop();
      if (!cmd) return state;
      state = cmd.undo(state);
      undone.push(cmd);
      return state;
    },
    redo() {
      const cmd = undone.pop();
      if (!cmd) return state;
      state = cmd.do(state);
      done.push(cmd);
      return state;
    },
    reset(next) {
      state = next;
      done.length = 0;
      undone.length = 0;
    }
  };
}

/**
 * A command that swaps between two whole states. The editor builds every change as a fresh copy
 * of the state, so undo simply restores the copy taken before the change.
 * @template S
 * @param {string} label
 * @param {S} before state before the change (must not be mutated afterwards)
 * @param {S} after state after the change (must not be mutated afterwards)
 * @returns {Command<S>}
 */
export function snapshotCommand(label, before, after) {
  return { label, do: () => after, undo: () => before };
}
