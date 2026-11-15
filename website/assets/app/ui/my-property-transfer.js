/**
 * Getting projects and drawings in and out of the page: the `.amco.json` export download, reading
 * an exported file back, and fetching the sample drawing set (same-origin static files).
 */
import { toExport, fromExport } from '../storage/project-schema.js';

const SAMPLE_MANIFEST = 'samples/drawings/manifest.json';
const SAMPLE_FOLDER = 'samples/drawings/';
const DXF_TYPE = 'application/dxf';

/**
 * File-name-safe version of a name.
 * @param {string} text
 * @returns {string}
 */
function fileSlug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'my-property';
}

/**
 * Downloads a project as `<name>.amco.json` (model, paint and drawing details; no files).
 * @param {object} project
 */
export function downloadProject(project) {
  const blob = new Blob([JSON.stringify(toExport(project), null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${fileSlug(project.name)}.amco.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}

/**
 * Reads an exported project file.
 * @param {File} file
 * @returns {Promise<object>} the project
 * @throws {Error} with a plain-English message when the file is not an Amco project
 */
export async function readProjectFile(file) {
  return fromExport(await file.text());
}

/**
 * Fetches the sample drawing set listed in `samples/drawings/manifest.json` as File objects.
 * @returns {Promise<{ files: File[], floors: number }>} `floors` from the plans in the manifest
 * @throws {Error} when a file can't be fetched
 */
export async function fetchSampleFiles() {
  const response = await fetch(SAMPLE_MANIFEST);
  if (!response.ok) throw new Error(`Sample manifest: HTTP ${response.status}`);
  const manifest = await response.json();
  const files = await Promise.all(manifest.map(async (entry) => {
    const r = await fetch(`${SAMPLE_FOLDER}${encodeURIComponent(entry.file)}`);
    if (!r.ok) throw new Error(`${entry.file}: HTTP ${r.status}`);
    return new File([await r.blob()], entry.file, { type: DXF_TYPE });
  }));
  const floors = Math.max(1, ...manifest.filter((e) => e.slot === 'plan').map((e) => (e.levelIndex ?? 0) + 1));
  return { files, floors };
}
