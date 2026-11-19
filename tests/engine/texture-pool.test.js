import { test } from 'node:test';
import assert from 'node:assert/strict';
import { texturePoolSize, createTexturePool, MAX_TEXTURE_WORKERS } from '../../website/assets/app/engine/materials/texture-pool.js';
import { drawPixels, hasPattern, PROCEDURAL_IDS } from '../../website/assets/app/engine/materials/patterns.js';
import { generateTexture, reserveTexture, drawPendingTextures, hasPendingTextures } from '../../website/assets/app/engine/materials/procedural.js';

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
