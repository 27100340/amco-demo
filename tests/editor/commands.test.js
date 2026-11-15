import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, snapshotCommand } from '../../website/assets/app/editor/commands.js';

const add = (n) => ({ label: `add ${n}`, do: (s) => s + n, undo: (s) => s - n });

test('exec applies a command, undo reverts it and redo applies it again', () => {
  const history = createHistory(200, 10);
  assert.equal(history.state, 10);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);

  assert.equal(history.exec(add(5)), 15);
  assert.equal(history.state, 15);
  assert.equal(history.canUndo, true);
  assert.equal(history.undoLabel, 'add 5');

  assert.equal(history.undo(), 10);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, true);
  assert.equal(history.redoLabel, 'add 5');

  assert.equal(history.redo(), 15);
  assert.equal(history.canRedo, false);
});

test('undo and redo with nothing to do leave the state alone', () => {
  const history = createHistory(200, 'start');
  assert.equal(history.undo(), 'start');
  assert.equal(history.redo(), 'start');
  assert.equal(history.undoLabel, null);
  assert.equal(history.redoLabel, null);
});

test('redo is cleared after a new exec', () => {
  const history = createHistory(200, 0);
  history.exec(add(1));
  history.exec(add(2));
  history.undo();
  assert.equal(history.canRedo, true);
  history.exec(add(10));
  assert.equal(history.canRedo, false);
  assert.equal(history.redo(), 11);
  assert.equal(history.undo(), 1);
  assert.equal(history.undo(), 0);
});

test('history keeps at most `limit` steps, dropping the oldest', () => {
  const history = createHistory(3, 0);
  for (let i = 1; i <= 5; i++) history.exec(add(i));
  assert.equal(history.state, 15);
  assert.equal(history.undo(), 10);
  assert.equal(history.undo(), 6);
  assert.equal(history.undo(), 3);
  assert.equal(history.canUndo, false);
  assert.equal(history.undo(), 3);
});

test('the default limit is 200 steps', () => {
  const history = createHistory(undefined, 0);
  for (let i = 0; i < 250; i++) history.exec(add(1));
  let steps = 0;
  while (history.canUndo) {
    history.undo();
    steps++;
  }
  assert.equal(steps, 200);
  assert.equal(history.state, 50);
});

test('reset replaces the state and forgets every step', () => {
  const history = createHistory(200, 0);
  history.exec(add(1));
  history.undo();
  history.reset(99);
  assert.equal(history.state, 99);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
});

test('snapshotCommand swaps between two whole states', () => {
  const before = { walls: [] };
  const after = { walls: [{ id: 'w1' }] };
  const history = createHistory(200, before);
  history.exec(snapshotCommand('Add wall', before, after));
  assert.equal(history.state, after);
  assert.equal(history.undoLabel, 'Add wall');
  assert.equal(history.undo(), before);
  assert.equal(history.redo(), after);
});
