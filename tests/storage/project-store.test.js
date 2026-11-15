import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../../website/assets/app/storage/project-schema.js';
import { createMemoryStore } from '../../website/assets/app/storage/memory-store.js';
import { createIdbStore } from '../../website/assets/app/storage/idb-store.js';
import { createStore, QUOTA_MESSAGE } from '../../website/assets/app/storage/project-store.js';
import { createFakeIdb } from './fake-idb.js';

/** A clock that moves one minute per call, so `updated` always differs. */
function steppingClock() {
  let t = Date.parse('2026-11-12T09:00:00.000Z');
  return () => {
    t += 60000;
    return new Date(t).toISOString();
  };
}

/**
 * The ProjectStore contract, run against every backend.
 * @param {string} name
 * @param {() => Promise<object>} make creates a fresh, empty store
 */
function contract(name, make) {
  test(`${name}: save then get returns an equal copy`, async () => {
    const store = await make();
    const project = createProject({ name: 'House', kind: 'house', floors: 2, id: 'p1' });
    const saved = await store.save(project);
    assert.equal(saved.id, 'p1');
    const back = await store.get('p1');
    assert.equal(back.name, 'House');
    back.name = 'changed';
    assert.equal((await store.get('p1')).name, 'House', 'callers get copies, never the stored object');
    project.name = 'changed too';
    assert.equal((await store.get('p1')).name, 'House', 'saving copies the project');
  });

  test(`${name}: save stamps updated and list puts the newest first`, async () => {
    const store = await make();
    await store.save(createProject({ name: 'Old', kind: 'house', floors: 1, id: 'a' }));
    await store.save(createProject({ name: 'New', kind: 'shop', floors: 1, id: 'b' }));
    const list = await store.list();
    assert.deepEqual(list.map((p) => p.id), ['b', 'a']);
    await store.save({ ...(await store.get('a')), name: 'Old, edited' });
    assert.deepEqual((await store.list()).map((p) => p.id), ['a', 'b']);
    assert.ok((await store.get('a')).updated > (await store.get('b')).updated);
  });

  test(`${name}: get of an unknown id is null`, async () => {
    const store = await make();
    assert.equal(await store.get('nope'), null);
    assert.equal(await store.getFile('nope', 'f1'), null);
  });

  test(`${name}: save refuses a broken project`, async () => {
    const store = await make();
    await assert.rejects(store.save({ id: 'x', name: '', kind: 'castle' }), /project/i);
    assert.deepEqual(await store.list(), []);
  });

  test(`${name}: files are stored per project with their details`, async () => {
    const store = await make();
    await store.save(createProject({ name: 'House', kind: 'house', floors: 1, id: 'p1' }));
    const blob = new Blob(['0\nSECTION\n'], { type: 'application/dxf' });
    await store.putFile('p1', 'f1', blob, { name: 'plan.dxf', type: 'application/dxf' });
    const file = await store.getFile('p1', 'f1');
    assert.equal(await file.blob.text(), '0\nSECTION\n');
    assert.deepEqual(file.meta, { name: 'plan.dxf', type: 'application/dxf' });
    await store.putFile('p1', 'f1', new Blob(['v2']), { name: 'plan.dxf' });
    assert.equal(await (await store.getFile('p1', 'f1')).blob.text(), 'v2', 'putting again replaces the file');
    await store.removeFile('p1', 'f1');
    assert.equal(await store.getFile('p1', 'f1'), null);
  });

  test(`${name}: remove deletes the project and only its files`, async () => {
    const store = await make();
    await store.save(createProject({ name: 'One', kind: 'house', floors: 1, id: 'p1' }));
    await store.save(createProject({ name: 'Two', kind: 'house', floors: 1, id: 'p2' }));
    await store.putFile('p1', 'f1', new Blob(['a']), {});
    await store.putFile('p2', 'f1', new Blob(['b']), {});
    await store.remove('p1');
    assert.equal(await store.get('p1'), null);
    assert.equal(await store.getFile('p1', 'f1'), null);
    assert.equal(await (await store.getFile('p2', 'f1')).blob.text(), 'b');
    assert.deepEqual((await store.list()).map((p) => p.id), ['p2']);
  });
}

contract('memory store', async () => createMemoryStore({ now: steppingClock() }));
contract('IndexedDB store', async () => createIdbStore({ idbFactory: createFakeIdb(), now: steppingClock() }));

test('memory store says it does not persist', () => {
  assert.equal(createMemoryStore().persistent, false);
});

test('createStore uses IndexedDB when it works', async () => {
  const store = await createStore({ idbFactory: createFakeIdb() });
  assert.equal(store.persistent, true);
  await store.save(createProject({ name: 'House', kind: 'house', floors: 1, id: 'p1' }));
  assert.equal((await store.get('p1')).name, 'House');
  assert.deepEqual((await store.list()).map((p) => p.id), ['p1'], 'the start-up check leaves nothing behind');
});

test('falls back to memory store when backend throws', async () => {
  const throwing = { open() { throw new Error('The operation is insecure.'); } };
  const store = await createStore({ idbFactory: throwing });
  assert.equal(store.persistent, false);
  assert.match(store.reason, /won.t be saved|isn.t saving|can.t save/i);
  await store.save(createProject({ name: 'Session only', kind: 'house', floors: 1, id: 'p1' }));
  await store.putFile('p1', 'f1', new Blob(['x']), {});
  assert.equal((await store.get('p1')).name, 'Session only');
  assert.equal(await (await store.getFile('p1', 'f1')).blob.text(), 'x');
});

test('falls back to memory store when opening fails later or writes are refused', async () => {
  const failing = {
    open() {
      const req = { onsuccess: null, onerror: null, onupgradeneeded: null, error: new Error('blocked') };
      setTimeout(() => req.onerror && req.onerror({ target: req }), 0);
      return req;
    }
  };
  const a = await createStore({ idbFactory: failing });
  assert.equal(a.persistent, false);
  const b = await createStore({ idbFactory: createFakeIdb({ failWrites: true }) });
  assert.equal(b.persistent, false, 'a browser that opens the database but refuses writes is not persistent');
  const c = await createStore({ idbFactory: undefined });
  assert.equal(c.persistent, false);
  await c.save(createProject({ name: 'Works', kind: 'house', floors: 1, id: 'p1' }));
  assert.equal((await c.get('p1')).name, 'Works');
});

test('quota errors become Error with code QUOTA and a clear message', async () => {
  const factory = createFakeIdb();
  const store = await createIdbStore({ idbFactory: factory });
  await store.save(createProject({ name: 'House', kind: 'house', floors: 1, id: 'p1' }));
  const full = await createIdbStore({ idbFactory: createFakeIdb({ failWrites: true }) });
  await assert.rejects(full.save(createProject({ name: 'House', kind: 'house', floors: 1, id: 'p2' })), (error) => {
    assert.equal(error.code, 'QUOTA');
    assert.equal(error.message, QUOTA_MESSAGE);
    return true;
  });
  await assert.rejects(full.putFile('p2', 'f1', new Blob(['x']), {}), (error) => error.code === 'QUOTA');
});
