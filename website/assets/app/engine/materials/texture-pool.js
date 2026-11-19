/**
 * A small pool of module workers that draw procedural texture pixels (`texture-worker.js`) off the
 * page's thread and in parallel, so a load's textures cost the page almost nothing. Where workers
 * are missing (Node, very old browsers) there is no pool and the caller draws on its own thread.
 */

/** Most workers to start, whatever the core count. */
export const MAX_TEXTURE_WORKERS = 4;

/**
 * How many texture workers to run: one core is left to the page, at least one worker and at most
 * MAX_TEXTURE_WORKERS.
 * @param {number} [cores] logical cores (`navigator.hardwareConcurrency`); unknown counts as 2
 * @returns {number}
 */
export function texturePoolSize(cores) {
  const known = Number.isFinite(cores) && cores > 0 ? Math.floor(cores) : 2;
  return Math.max(1, Math.min(MAX_TEXTURE_WORKERS, known - 1));
}

/**
 * Starts a texture pool. Workers are created on the first job.
 * @param {URL|string} workerUrl the worker module
 * @param {number} [size] worker count (default from the core count)
 * @returns {{ draw: (id: string, size: number) => Promise<{ map: Uint8Array, normalMap: Uint8Array, roughnessMap: Uint8Array, mean: number[], ms: number }>, dispose: () => void } | null}
 *   null where module workers are not available; `draw` rejects when a worker fails, and the
 *   caller then draws the texture itself
 */
export function createTexturePool(workerUrl, size) {
  if (typeof Worker === 'undefined') return null;
  const count = size ?? texturePoolSize(typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency);
  const workers = [];
  const idle = [];
  const queue = [];
  const running = new Map();
  let nextJob = 1;
  let broken = false;

  /** Fails every queued and running job (a worker could not start or crashed). */
  function failAll(reason) {
    broken = true;
    const error = new Error(reason);
    for (const job of [...queue, ...running.values()]) job.fail(error);
    queue.length = 0;
    running.clear();
  }

  /** Hands queued jobs to idle workers. */
  function pump() {
    while (idle.length && queue.length) {
      const worker = idle.pop();
      const job = queue.shift();
      running.set(job.id, { ...job, worker });
      worker.postMessage({ job: job.id, id: job.pattern, size: job.size });
    }
  }

  /** Starts the workers. */
  function start() {
    for (let i = 0; i < count; i++) {
      const worker = new Worker(workerUrl, { type: 'module' });
      worker.addEventListener('message', (event) => {
        const { job: id, error, ...pixels } = event.data;
        const job = running.get(id);
        running.delete(id);
        idle.push(worker);
        if (job) {
          if (error) job.fail(new Error(error));
          else job.done(pixels);
        }
        pump();
      });
      worker.addEventListener('error', (event) => {
        event.preventDefault();
        failAll('A texture worker failed');
      });
      workers.push(worker);
      idle.push(worker);
    }
  }

  return {
    draw(pattern, pixels) {
      if (broken) return Promise.reject(new Error('Texture workers are not available'));
      if (!workers.length) start();
      return new Promise((done, fail) => {
        queue.push({ id: nextJob++, pattern, size: pixels, done, fail });
        pump();
      });
    },
    dispose() {
      failAll('Texture pool closed');
      for (const worker of workers) worker.terminate();
      workers.length = 0;
      idle.length = 0;
    }
  };
}
