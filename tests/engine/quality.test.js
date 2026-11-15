import test from 'node:test';
import assert from 'node:assert/strict';
import { isIntegratedGpu, startingTier, lowerTier, createFrameGovernor } from '../../website/assets/app/engine/quality.js';

const IRIS_XE = 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)';

test('integrated and software GPUs are recognised from the WebGL renderer string', () => {
  for (const gpu of [
    IRIS_XE,
    'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon(TM) Vega 8 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon 780M Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
    'Apple GPU',
    'ANGLE (Qualcomm, Adreno (TM) 690, OpenGL ES 3.2)',
    'Mali-G78',
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
    'llvmpipe (LLVM 15.0.7, 256 bits)'
  ]) assert.equal(isIntegratedGpu(gpu), true, gpu);
});

test('discrete and unknown GPUs are not integrated', () => {
  for (const gpu of [
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon RX 6600M Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    '',
    null,
    undefined
  ]) assert.equal(isIntegratedGpu(gpu), false, String(gpu));
});

test('phones, tablets and integrated GPUs start at medium; discrete desktops at high', () => {
  assert.equal(startingTier({ gpu: IRIS_XE }), 'medium');
  assert.equal(startingTier({ mobile: true, gpu: 'NVIDIA GeForce RTX 4070' }), 'medium');
  assert.equal(startingTier({ coarsePointer: true }), 'medium');
  assert.equal(startingTier({ gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)' }), 'high');
  assert.equal(startingTier({ gpu: null }), 'high');
});

test('the governor still steps a slow tier down', () => {
  assert.equal(lowerTier('high'), 'medium');
  assert.equal(lowerTier('medium'), 'low');
  assert.equal(lowerTier('low'), null);
  let steps = 0;
  const governor = createFrameGovernor(() => { steps += 1; });
  for (let i = 0; i < 60; i++) governor.sample(40);
  assert.equal(steps, 1);
  for (let i = 0; i < 120; i++) governor.sample(16);
  assert.equal(steps, 1);
});
