/**
 * Applies paint to surface materials: colour eases over 0.4 s, finish sets roughness at once.
 */
import * as THREE from 'three';
import { FINISH_ROUGHNESS } from './materials/registry.js';

/** Duration of the colour change (ms). */
export const PAINT_LERP_MS = 400;

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/**
 * Creates the paint animator.
 * @returns {{ apply: (material: THREE.MeshStandardMaterial, hex: string, finish: string, animate: boolean) => void, update: () => boolean, clear: () => void }}
 */
export function createPaintAnimator() {
  const running = new Map();
  return {
    /**
     * Sets a material's paint colour (sRGB hex) and finish.
     * @param {THREE.MeshStandardMaterial} material
     * @param {string} hex
     * @param {'matt'|'silk'|'gloss'} finish
     * @param {boolean} animate ease the colour over 0.4 s
     */
    apply(material, hex, finish, animate) {
      const to = new THREE.Color(hex);
      material.roughness = FINISH_ROUGHNESS[finish] ?? FINISH_ROUGHNESS.matt;
      if (!animate || material.color.equals(to)) {
        running.delete(material);
        material.color.copy(to);
        return;
      }
      running.set(material, { from: material.color.clone(), to, start: performance.now() });
    },
    /**
     * Advances running colour changes.
     * @returns {boolean} true while any colour is still changing
     */
    update() {
      if (!running.size) return false;
      const now = performance.now();
      for (const [material, job] of running) {
        const t = Math.min(1, (now - job.start) / PAINT_LERP_MS);
        material.color.lerpColors(job.from, job.to, easeOut(t));
        if (t >= 1) running.delete(material);
      }
      return true;
    },
    clear() {
      running.clear();
    }
  };
}
