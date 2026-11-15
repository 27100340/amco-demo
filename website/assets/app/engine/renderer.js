/**
 * WebGL2 renderer with the realism pipeline: sRGB output, Khronos PBR Neutral tone mapping (keeps
 * paint hue true), soft PCF shadows and, on the high tier, GTAO ambient occlusion + SMAA.
 * The renderer resizes with its container and pauses when off-screen or when the tab is hidden.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { QUALITY } from './quality.js';
import { timeLoad } from './load-timing.js';

/**
 * GTAO that leaves out alpha-tested foliage cards: its normal pass ignores alphaTest, so each card
 * would count as a solid quad and leave a dark or light box around the leaves. Left out, the
 * leaves take the occlusion of whatever is behind them.
 * Depends on GTAOPass internals (`_overrideVisibility`, `_visibilityCache`) as of the vendored
 * three 0.187.0: check both still exist when upgrading three.
 */
class FoliageAwareGTAOPass extends GTAOPass {
  _overrideVisibility() {
    super._overrideVisibility();
    const hidden = this._visibilityCache;
    this.scene.traverse((object) => {
      if (!object.isMesh || !object.visible) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.some((m) => m && m.alphaTest > 0)) {
        object.visible = false;
        hidden.push(object);
      }
    });
  }
}

/** GTAO settings: radius in metres (world space), blended at 0.9 over the lit image. */
const AO_SETTINGS = { radius: 0.35, distanceExponent: 1.2, thickness: 0.6, distanceFallOff: 1, scale: 1, samples: 16, screenSpaceRadius: false };
const AO_BLEND = 0.9;
const DENOISE_SETTINGS = { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, samples: 16 };

/**
 * @typedef {object} EngineRenderer
 * @property {THREE.WebGLRenderer} renderer
 * @property {HTMLCanvasElement} canvas
 * @property {(scene: THREE.Scene, camera: THREE.PerspectiveCamera) => void} attach set what is drawn
 * @property {(timed?: boolean) => void} render draw one frame; `timed` records the frame's shadow-map pass
 *   as `amco:shadow-map` (see load-timing.js)
 * @property {() => Promise<void>} precompile compile every shader of the scene and the post-processing in the
 *   background (in parallel where the browser supports it), for the render target they will draw into
 * @property {(tier: 'high'|'medium'|'low') => void} setQuality switch tier at runtime
 * @property {() => 'high'|'medium'|'low'} getQuality current tier
 * @property {() => boolean} isActive false while off-screen or the tab is hidden
 * @property {(listener: () => void) => void} onInvalidate called when a redraw is needed (resize, visible again)
 * @property {(width: number, height: number, pixelRatio?: number) => () => void} withSize render at another size until the returned restore function is called
 * @property {() => { width: number, height: number }} getSize CSS size of the canvas
 * @property {() => { composer: object|null, gtao: object|null }} passes post-processing passes
 * @property {() => void} dispose
 */

/**
 * Creates the renderer inside a container element.
 * @param {HTMLElement} container element that receives the canvas; its size drives the canvas size
 * @param {'high'|'medium'|'low'} quality starting tier
 * @returns {EngineRenderer} the renderer wrapper
 */
export function createRenderer(container, quality) {
  const renderer = new THREE.WebGLRenderer({ antialias: quality !== 'high', powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    throw new Error('WebGL2 is not available in this browser.');
  }
  const hasMsaa = quality !== 'high';
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  let tier = quality;
  let scene = null;
  let camera = null;
  let composer = null;
  let gtao = null;
  let width = 1;
  let height = 1;
  let onScreen = true;
  let pageVisible = document.visibilityState !== 'hidden';
  let timeShadows = false;
  const listeners = [];
  const shadowMap = renderer.shadowMap;
  const renderShadows = shadowMap.render;
  shadowMap.render = (lights, shadowScene, shadowCamera) => {
    if (timeShadows && shadowMap.enabled && shadowMap.needsUpdate) timeLoad('shadow-map', () => renderShadows.call(shadowMap, lights, shadowScene, shadowCamera));
    else renderShadows.call(shadowMap, lights, shadowScene, shadowCamera);
  };
  const invalidate = () => listeners.forEach((listener) => listener());

  /** Pixel ratio for the current tier. */
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, QUALITY[tier].pixelRatio);

  /** Tears down and rebuilds the post-processing chain for the current tier. */
  function buildComposer() {
    if (composer) {
      composer.passes.forEach((pass) => pass.dispose && pass.dispose());
      composer.dispose();
      composer = null;
      gtao = null;
    }
    const settings = QUALITY[tier];
    const wantsAo = settings.ao;
    const needsSmaa = settings.smaa || !hasMsaa;
    if (!scene || !camera || (!wantsAo && !needsSmaa)) return;
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(pixelRatio());
    composer.setSize(width, height);
    composer.addPass(new RenderPass(scene, camera));
    if (wantsAo) {
      const scale = pixelRatio();
      gtao = new FoliageAwareGTAOPass(scene, camera, Math.round(width * scale), Math.round(height * scale), undefined, AO_SETTINGS, DENOISE_SETTINGS);
      gtao.blendIntensity = AO_BLEND;
      composer.addPass(gtao);
    }
    if (needsSmaa) composer.addPass(new SMAAPass());
    composer.addPass(new OutputPass());
  }

  /** Applies tier settings to the renderer. */
  function applyTier() {
    const settings = QUALITY[tier];
    renderer.shadowMap.enabled = settings.shadows;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(width, height, false);
    buildComposer();
  }

  /** Reads the container size and resizes everything. */
  function resize() {
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(width, height, false);
    if (composer) {
      composer.setPixelRatio(pixelRatio());
      composer.setSize(width, height);
    }
    if (camera) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    invalidate();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const intersectionObserver = new IntersectionObserver((entries) => {
    onScreen = entries.some((entry) => entry.isIntersecting);
    if (onScreen) invalidate();
  });
  intersectionObserver.observe(container);
  const onVisibility = () => {
    pageVisible = document.visibilityState !== 'hidden';
    if (pageVisible) invalidate();
  };
  document.addEventListener('visibilitychange', onVisibility);
  resize();
  applyTier();

  return {
    renderer,
    canvas,
    attach(nextScene, nextCamera) {
      scene = nextScene;
      camera = nextCamera;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      buildComposer();
    },
    render(timed = false) {
      if (!scene || !camera) return;
      timeShadows = timed;
      if (composer) composer.render();
      else renderer.render(scene, camera);
      timeShadows = false;
    },
    async precompile() {
      if (!scene || !camera) return;
      const jobs = [];
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(composer ? composer.readBuffer : null);
      jobs.push(renderer.compileAsync(scene, camera));
      renderer.setRenderTarget(previous);
      const quad = new THREE.PlaneGeometry(2, 2);
      if (composer) {
        const materials = new Set();
        for (const pass of composer.passes) {
          for (const value of Object.values(pass)) {
            if (value && value.isShaderMaterial) materials.add(value);
          }
        }
        const view = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        for (const material of materials) jobs.push(renderer.compileAsync(new THREE.Mesh(quad, material), view));
      }
      await Promise.all(jobs);
      quad.dispose();
    },
    setQuality(next) {
      if (!QUALITY[next] || next === tier) return;
      tier = next;
      applyTier();
      invalidate();
    },
    getQuality: () => tier,
    isActive: () => onScreen && pageVisible,
    onInvalidate(listener) { listeners.push(listener); },
    withSize(w, h, ratio = 1) {
      const saved = { width, height };
      renderer.setPixelRatio(ratio);
      renderer.setSize(w, h, false);
      if (composer) {
        composer.setPixelRatio(ratio);
        composer.setSize(w, h);
      }
      if (camera) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      return () => {
        width = 0;
        height = 0;
        renderer.setPixelRatio(pixelRatio());
        renderer.setSize(saved.width, saved.height, false);
        if (composer) {
          composer.setPixelRatio(pixelRatio());
          composer.setSize(saved.width, saved.height);
        }
        width = saved.width;
        height = saved.height;
        if (camera) {
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        }
        invalidate();
      };
    },
    getSize: () => ({ width, height }),
    /** @returns {{ composer: EffectComposer|null, gtao: GTAOPass|null }} post-processing passes (for development tools) */
    passes: () => ({ composer, gtao }),
    dispose() {
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      if (composer) {
        composer.passes.forEach((pass) => pass.dispose && pass.dispose());
        composer.dispose();
      }
      renderer.dispose();
      canvas.remove();
    }
  };
}
