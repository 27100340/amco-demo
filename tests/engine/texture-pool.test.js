import { test } from 'node:test';
import assert from 'node:assert/strict';
import { texturePoolSize, createTexturePool, MAX_TEXTURE_WORKERS } from '../../website/assets/app/engine/materials/texture-pool.js';
import { drawPixels, hasPattern, PROCEDURAL_IDS } from '../../website/assets/app/engine/materials/patterns.js';
import { generateTexture, reserveTexture, drawPendingTextures, hasPendingTextures, textureCopy, releaseTextureCopy } from '../../website/assets/app/engine/materials/procedural.js';

test('texture pool leaves one core to the page and stays between 1 and the maximum', () => {
  assert.equal(texturePoolSize(8), MAX_TEXTURE_WORKERS);
  assert.equal(texturePoolSize(4), 3);
  assert.equal(texturePoolSize(2), 1);
  assert.equal(texturePoolSize(1), 1);
  assert.equal(texturePoolSize(undefined), 1);
  assert.equal(texturePoolSize(0), 1);
  assert.equal(texturePoolSize(64), MAX_TEXTURE_WORKERS);
});

test('no texture pool where workers are missing', { skip: typeof Worker !== 'undefined' }, () => {
  assert.equal(createTexturePool('texture-worker.js'), null);
});

test('every procedural id has a pattern', () => {
  for (const id of PROCEDURAL_IDS) assert.ok(hasPattern(id), id);
  assert.equal(hasPattern('toString'), false);
});

test('worker pixels match the maps drawn on the page thread', () => {
  for (const id of ['marble', 'oak-floor', 'lawn']) {
    const set = generateTexture(id, 64);
    const pixels = drawPixels(id, 64);
    for (const name of ['map', 'normalMap', 'roughnessMap']) assert.deepEqual(pixels[name], set[name].image.data, `${id} ${name}`);
    assert.deepEqual(pixels.mean, set.map.userData.mean);
  }
});

test('reserved textures are drawn on the page thread when there are no workers', async () => {
  const set = reserveTexture('brick', 32);
  assert.equal(set.map.image.data, null);
  assert.ok(hasPendingTextures());
  assert.equal(await drawPendingTextures(), true);
  assert.deepEqual(set.map.image.data, drawPixels('brick', 32).map);
});

test('a Worker constructor that throws breaks the pool instead of the caller', async () => {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'Worker');
  const previous = globalThis.Worker;
  const originalError = console.error;
  const logged = [];
  globalThis.Worker = class {
    constructor() {
      throw new Error('module workers are not supported');
    }
  };
  console.error = (error) => logged.push(error);
  try {
    const pool = createTexturePool('texture-worker.js', 2);
    assert.doesNotThrow(() => pool.warm());
    await assert.rejects(pool.draw('marble', 32), /not available/);
    assert.equal(logged.length, 1);
  } finally {
    console.error = originalError;
    if (had) globalThis.Worker = previous;
    else delete globalThis.Worker;
  }
});

test('a released texture copy is no longer updated when its map is drawn', async () => {
  const set = reserveTexture('carpet-tile', 32);
  const kept = textureCopy(set.map, [2, 2]);
  const released = textureCopy(set.map, [3, 3]);
  let disposed = 0;
  released.addEventListener('dispose', () => {
    disposed += 1;
  });
  assert.equal(releaseTextureCopy(released), true);
  assert.equal(disposed, 1);
  assert.equal(releaseTextureCopy(released), false);
  assert.equal(releaseTextureCopy(set.map), false);
  const [keptVersion, releasedVersion] = [kept.version, released.version];
  await drawPendingTextures();
  assert.ok(kept.version > keptVersion);
  assert.equal(released.version, releasedVersion);
});
