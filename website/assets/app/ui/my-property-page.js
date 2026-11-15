/**
 * "My property" page: upload drawings → requirements gate → build → review/trace → paint.
 * Step 1 lists saved projects and starts a new one (or loads the sample house); step 2 holds the
 * upload slots and the requirements checklist; step 3 the plan editor; step 4 the 3D studio.
 * The open project is autosaved 500 ms after every change. URL state: `?project=<id>&step=<step>`.
 */
import { createStore } from '../storage/project-store.js';
import { createProject, normaliseProject } from '../storage/project-schema.js';
import {
  addDrawing, updateDrawing, removeDrawing, drawingFromParsed, packageDrawings, needsSectionDeclaration,
  packageFingerprint, projectBytes
} from '../storage/project-ops.js';
import { checkPackage, ACCEPTED_EXTENSIONS, MAX_PROJECT_BYTES } from '../importers/index.js';
import { esc } from '../editor/dom.js';
import { mountUploadSlots } from './upload-slots.js';
import { renderRequirements, missingSummary } from './requirements-list.js';
import { createDrawingSession, buildModel } from './my-property-drawings.js';
import { createReviewStep } from './my-property-review.js';
import { createPaintStep } from './my-property-paint.js';
import { createAutosave } from './my-property-autosave.js';
import { downloadProject, readProjectFile, fetchSampleFiles } from './my-property-transfer.js';
import { watchFileDrops } from './my-property-drop.js';
import { mountStartStep } from './my-property-start.js';

const STEPS = ['property', 'drawings', 'review', 'paint'];
const SAMPLE = { name: 'Sample House, DHA Lahore', kind: 'house' };
const KIND_LABEL = { house: 'House', office: 'Office', shop: 'Shop' };

const $ = (selector) => document.querySelector(selector);
const ui = {
  banners: $('[data-banners]'),
  notices: $('[data-notices]'),
  steps: $('[data-steps]'),
  property: $('[data-step="property"]'),
  addAny: $('[data-add-any]'),
  busy: $('[data-busy]'),
  slots: $('[data-slots]'),
  requirements: $('[data-requirements]'),
  build: $('[data-build]'),
  openModel: $('[data-open-model]'),
  gateNote: $('[data-gate-note]'),
  review: $('[data-review]'),
  paint: $('[data-paint]'),
  overlay: $('[data-drop-overlay]'),
  dialog: $('[data-dialog]'),
  dialogTitle: $('[data-dialog-title]'),
  dialogBody: $('[data-dialog-body]')
};

let store = null;
let session = null;
let project = null;
let projects = [];
let step = 'property';
let pendingRebuild = false;
let autosave = null;
let saveError = null;
let notices = [];
let busy = '';
let modelVersion = 0;
let review = null;
let paint = null;

/* ---------- helpers */

/**
 * A new file id.
 * @returns {string}
 */
function newFileId() {
  if (globalThis.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Lower-case extension with its dot.
 * @param {string} name
 * @returns {string}
 */
function extensionOf(name) {
  const match = /\.[^./\\]+$/.exec(String(name));
  return match ? match[0].toLowerCase() : '';
}

/**
 * The requirements result for a project.
 * @param {object} p
 * @returns {object} from `checkPackage`
 */
function gateOf(p) {
  return checkPackage(packageDrawings(p), { floors: p.floors, declaredSections: p.declaredSections });
}

/**
 * True when the model is older than the drawings.
 * @returns {boolean}
 */
function isStale() {
  return Boolean(project?.building && project.builtFrom && project.builtFrom !== packageFingerprint(project));
}

/**
 * Whether a step can be opened now.
 * @param {string} name
 * @returns {boolean}
 */
function canOpen(name) {
  if (name === 'property') return true;
  if (!project) return false;
  if (name === 'drawings') return true;
  return Boolean(project.building) && gateOf(project).complete;
}

/**
 * The first floor without a readable plan, or null.
 * @param {string} [except] file id to ignore
 * @returns {number|null}
 */
function firstMissingFloor(except) {
  for (let i = 0; i < project.floors; i++) {
    if (!project.drawings.some((d) => d.fileId !== except && d.slot === 'plan' && d.readable && d.levelIndex === i)) return i;
  }
  return null;
}

/**
 * Adds a notice under the steps.
 * @param {'info'|'warn'} kind
 * @param {string} text
 */
function notify(kind, text) {
  notices = [...notices, { kind, text }].slice(-6);
  renderNotices();
}

/**
 * Shows or clears the "working" message.
 * @param {string} text empty to clear
 */
function setBusy(text) {
  busy = text;
  ui.busy.textContent = text;
  renderStart();
  renderGate();
}

/* ---------- saving */

/**
 * Replaces the open project and schedules a save.
 * @param {object} next
 */
function setProject(next) {
  project = next;
  autosave.schedule();
}

/**
 * Saves the open project now.
 * @returns {Promise<void>}
 */
function flushSave() {
  return autosave.flush();
}

/** Saves the open project shortly. */
function scheduleSave() {
  autosave.schedule();
}

/**
 * Stores a file and its thumbnail; out-of-space and other failures show the save banner.
 * @param {object} parsed
 * @param {File} file
 * @returns {Promise<void>}
 */
async function keepFile(parsed, file) {
  try {
    await session.keep(project.id, parsed, file);
  } catch (error) {
    console.error(error);
    saveError = error;
    renderBanners();
  }
}

/**
 * Removes a drawing's file from the store and memory.
 * @param {string} fileId
 * @returns {Promise<void>}
 */
async function discardFile(fileId) {
  try {
    await session.discard(project.id, fileId);
  } catch (error) {
    console.error(error);
  }
}

/* ---------- export and import */

/**
 * Reads an exported project file and opens it.
 * @param {File} file
 * @returns {Promise<void>}
 */
async function importProject(file) {
  let imported;
  try {
    imported = await readProjectFile(file);
  } catch (error) {
    notify('warn', error.message);
    return;
  }
  if (await store.get(imported.id)) imported = { ...imported, id: createProject().id };
  await openProject(imported, { isNew: true });
  notify('info', `“${imported.name}” is open. An export doesn't include the drawing files, so add them again if you want to rebuild the model.`);
}

/* ---------- rendering */

function renderBanners() {
  const parts = [];
  const exportButton = project ? '<button class="btn btn-sm" type="button" data-banner-export>Export project</button>' : '';
  if (store && !store.persistent) {
    parts.push(`<div class="mp-banner" data-kind="warn"><p>${esc(store.reason)}</p>${exportButton}</div>`);
  }
  if (saveError) {
    parts.push(`<div class="mp-banner" data-kind="warn" role="alert"><p>${esc(saveError.message)}</p>
      <div class="row">${exportButton}<button class="btn btn-ghost btn-sm" type="button" data-banner-retry>Try again</button></div></div>`);
  }
  ui.banners.innerHTML = parts.join('');
}

function renderNotices() {
  ui.notices.innerHTML = notices.length ? `
    <ul class="mp-notice-list list-plain">${notices.map((n) => `<li data-kind="${n.kind}">${esc(n.text)}</li>`).join('')}</ul>
    <button class="btn btn-link mp-notice-clear" type="button" data-notices-clear>Dismiss</button>` : '';
}

function stepNote(name) {
  if (!project) return name === 'property' ? 'Start here' : '';
  if (name === 'property') return project.name;
  if (name === 'drawings') {
    const gate = gateOf(project);
    return `${gate.items.filter((i) => i.satisfied).length} of ${gate.items.length} ready`;
  }
  if (!project.building) return name === 'review' ? 'After the drawings' : '';
  if (name === 'review') {
    if (project.report?.mode === 'trace') return 'Trace your plans';
    const c = project.report?.counts;
    return c ? `${c.walls} walls · ${c.rooms} rooms` : 'Built';
  }
  return Object.keys(project.paint ?? {}).length ? 'Paint saved' : 'Ready to paint';
}

function renderStepper() {
  ui.steps.querySelectorAll('button[data-go]').forEach((button) => {
    const name = button.dataset.go;
    button.disabled = !canOpen(name);
    if (name === step) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  ui.steps.querySelectorAll('[data-step-note]').forEach((note) => {
    note.textContent = stepNote(note.dataset.stepNote);
  });
  document.querySelectorAll('.mp-step-head [data-go]').forEach((button) => {
    button.disabled = !canOpen(button.dataset.go);
  });
  document.querySelectorAll('[data-project-meta]').forEach((meta) => {
    meta.textContent = project ? `${project.name} · ${KIND_LABEL[project.kind]} · ${project.floors} ${project.floors === 1 ? 'floor' : 'floors'}` : '';
  });
}

/** Re-renders step 1. */
function renderStart() {
  startStep.render({ project, projects, busy: Boolean(busy) });
}

function renderGate() {
  if (!project) return;
  const gate = gateOf(project);
  ui.build.disabled = !gate.complete || Boolean(busy);
  ui.build.textContent = project.building ? 'Rebuild my 3D model' : 'Build my 3D model';
  ui.openModel.hidden = !(project.building && gate.complete);
  ui.openModel.disabled = Boolean(busy);
  if (busy) {
    ui.gateNote.innerHTML = `<span class="mp-spinner" aria-hidden="true"></span>${esc(busy)}`;
  } else if (pendingRebuild) {
    ui.gateNote.innerHTML = `<span>Rebuilding replaces the model you checked in review, including your changes there.</span>
      <span class="row"><button class="btn btn-sm" type="button" data-rebuild-confirm>Rebuild</button>
      <button class="btn btn-ghost btn-sm" type="button" data-rebuild-cancel>Cancel</button></span>`;
  } else if (!gate.complete) {
    ui.gateNote.textContent = missingSummary(gate);
  } else {
    ui.gateNote.textContent = isStale() || !project.building
      ? 'Everything we need is here. Building takes a few seconds.'
      : 'Your model is up to date with these drawings.';
  }
}

function renderDrawings() {
  if (!project) return;
  const gate = gateOf(project);
  slots.render({ project, gate, thumbs: session.thumbs, needsSections: needsSectionDeclaration(project) });
  renderRequirements(ui.requirements, gate);
  renderGate();
}

function render() {
  renderStepper();
  renderStart();
  renderDrawings();
  renderBanners();
}

/** Writes the open project and step into the address bar. */
function writeUrl() {
  const params = new URLSearchParams();
  if (project) {
    params.set('project', project.id);
    if (step !== 'property') params.set('step', step);
  }
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
}

/* ---------- steps */

/** Closes the editor and keeps what it holds (getBuilding() is the source of truth). */
function closeReview() {
  const result = review.hide();
  if (!result || !project) return;
  const changed = JSON.stringify(result.building) !== JSON.stringify(project.building)
    || JSON.stringify(result.schedule) !== JSON.stringify(project.schedule);
  if (changed) modelVersion += 1;
  setProject({ ...project, building: result.building, schedule: result.schedule, scale: { ...project.scale, ...result.scale } });
}

/**
 * Opens a step (the nearest reachable one when it is locked).
 * @param {string} target
 * @param {{ view?: string, focus?: boolean, reload?: boolean }} [options] `reload` shows the step
 *   again even when it is already open (a new project or a rebuilt model)
 * @returns {Promise<void>}
 */
async function go(target, { view, focus = true, reload = false } = {}) {
  if (!store) return;
  let next = STEPS.includes(target) ? target : 'property';
  if (!canOpen(next)) next = project ? 'drawings' : 'property';
  if (next === step && !reload) {
    if (focus) document.querySelector(`[data-step="${step}"]`).focus({ preventScroll: true });
    return;
  }
  if (step === 'review') closeReview();
  step = next;
  document.querySelectorAll('[data-step]').forEach((section) => {
    section.hidden = section.dataset.step !== step;
  });
  if (project && step !== 'property' && project.step !== step) {
    setProject({ ...project, step, status: step === 'paint' ? 'ready' : project.status });
  }
  writeUrl();
  renderStepper();
  if (focus) {
    const section = document.querySelector(`[data-step="${step}"]`);
    ui.steps.scrollIntoView({ block: 'start', behavior: 'auto' });
    section.focus({ preventScroll: true });
  }
  if (step === 'drawings') renderDrawings();
  if (step === 'review') await review.show();
  if (step === 'paint') await paint.show(project, { paint: project.paint, version: modelVersion, view });
}

/**
 * Makes a project the open one.
 * @param {object} p
 * @param {{ isNew?: boolean, step?: string }} [options] `isNew` saves it straight away
 * @returns {Promise<void>}
 */
async function openProject(p, { isNew = false, step: at } = {}) {
  if (project) {
    if (step === 'review') closeReview();
    await flushSave();
  }
  project = normaliseProject(p);
  session.use(project.id);
  modelVersion += 1;
  notices = [];
  pendingRebuild = false;
  renderNotices();
  if (isNew) await flushSave();
  projects = await store.list();
  render();
  await go(at ?? project.step, { reload: true });
  if (await session.loadThumbs(project)) {
    renderDrawings();
    if (step === 'review') review.refresh();
  }
}

/** Closes the open project and goes back to step 1. */
async function closeProject() {
  if (step === 'review') closeReview();
  await flushSave();
  project = null;
  session.use(null);
  notices = [];
  renderNotices();
  projects = await store.list();
  render();
  await go('property');
}

/* ---------- drawings */

/**
 * Reads files into the open project. DXFs go to their slot from their title; a file added with
 * a slot's button goes to that slot when the file can't say. A drawing for a place that is
 * already filled replaces the old one.
 * @param {File[]} files
 * @param {{ slot?: string|null }} [options]
 * @returns {Promise<void>}
 */
async function addFiles(files, { slot = null } = {}) {
  if (!project) {
    notify('info', 'Enter your property details first, then add your drawings.');
    await go('property');
    document.querySelector('#mp-name').focus();
    return;
  }
  if (step !== 'drawings') await go('drawings', { focus: false });
  notices = [];
  renderNotices();
  const accepted = [...ACCEPTED_EXTENSIONS, '.dwg'];
  for (const [i, file] of files.entries()) {
    if (!accepted.includes(extensionOf(file.name))) {
      notify('warn', `${file.name} can't be used. Add drawings as DXF, PDF, PNG, JPG or WebP files.`);
      continue;
    }
    if (projectBytes(project) + file.size > MAX_PROJECT_BYTES) {
      notify('warn', `${file.name} wasn't added: a project can hold up to 150 MB of drawings. Remove a large file first, or save the PDF at a lower resolution.`);
      continue;
    }
    setBusy(files.length > 1 ? `Reading ${file.name} (${i + 1} of ${files.length})…` : `Reading ${file.name}…`);
    const id = newFileId();
    let parsed = await session.read(file, id);
    if (slot && parsed.readable && !parsed.slot) {
      parsed = session.apply(id, slot === 'plan' ? { slot, levelIndex: firstMissingFloor() } : { slot });
    }
    await keepFile(parsed, file);
    const entry = drawingFromParsed(parsed);
    const { project: next, replaced } = addDrawing(project, entry);
    project = next;
    for (const old of replaced) {
      await discardFile(old.fileId);
      notify('info', `${entry.name} replaced ${old.name}.`);
    }
    renderDrawings();
    renderStepper();
  }
  setBusy('');
  scheduleSave();
  renderDrawings();
  renderStepper();
}

/**
 * Replaces one drawing with a new file, keeping its place when the new file can't say.
 * @param {string} fileId
 * @param {File} file
 * @returns {Promise<void>}
 */
async function replaceFile(fileId, file) {
  const old = project.drawings.find((d) => d.fileId === fileId);
  if (!old) return;
  notices = [];
  setBusy(`Reading ${file.name}…`);
  const id = newFileId();
  let parsed = await session.read(file, id);
  if (parsed.readable && old.slot && (parsed.format !== 'dxf' || !parsed.slot)) {
    parsed = session.apply(id, { slot: old.slot, levelIndex: old.levelIndex, section: old.section });
  }
  await keepFile(parsed, file);
  project = removeDrawing(project, fileId).project;
  await discardFile(fileId);
  const entry = drawingFromParsed(parsed);
  const { project: next, replaced } = addDrawing(project, entry);
  project = next;
  for (const other of replaced) await discardFile(other.fileId);
  notify('info', `${entry.name} replaced ${old.name}.`);
  setBusy('');
  scheduleSave();
  renderDrawings();
  renderStepper();
}

/**
 * Removes a drawing.
 * @param {string} fileId
 * @returns {Promise<void>}
 */
async function removeFile(fileId) {
  const { project: next, removed } = removeDrawing(project, fileId);
  project = next;
  for (const d of removed) {
    await discardFile(d.fileId);
    notices = [];
    notify('info', `${d.name} removed.`);
  }
  scheduleSave();
  renderDrawings();
  renderStepper();
}

/**
 * Applies the customer's answer about a drawing (what it is, which floor, which section).
 * @param {string} fileId
 * @param {object} changes
 * @returns {Promise<void>}
 */
async function setDetails(fileId, changes) {
  const d = project.drawings.find((x) => x.fileId === fileId);
  if (!d) return;
  const next = { ...changes, placement: 'manual' };
  if ('slot' in changes && changes.slot !== d.slot) {
    next.levelIndex = changes.slot === 'plan' ? firstMissingFloor(fileId) : null;
    next.section = null;
  }
  await session.parsedFor(project, d);
  const parsed = session.apply(fileId, next);
  if (parsed) {
    Object.assign(next, {
      slot: parsed.slot, levelIndex: parsed.levelIndex, section: parsed.section,
      sectionMarks: parsed.sectionMarks ?? [], summary: parsed.summary, warnings: parsed.warnings ?? []
    });
  }
  const { project: updated, replaced } = updateDrawing(project, fileId, next);
  project = updated;
  notices = [];
  for (const old of replaced) {
    await discardFile(old.fileId);
    notify('info', `${d.name} replaced ${old.name}.`);
  }
  scheduleSave();
  renderDrawings();
  renderStepper();
}

/**
 * Builds the model from the drawings and opens the review step.
 * @returns {Promise<void>}
 */
async function build() {
  if (!project || !gateOf(project).complete || busy) return;
  pendingRebuild = false;
  setBusy('Building your 3D model…');
  let built = false;
  try {
    const usable = project.drawings.filter((d) => d.readable && d.slot);
    const parsedList = [];
    const missing = [];
    for (const d of usable) {
      const parsed = await session.parsedFor(project, d);
      if (parsed) parsedList.push(parsed);
      else missing.push(d.name);
    }
    if (missing.length) {
      notify('warn', `These files aren't in this browser, so the model can't be built from them: ${missing.join(', ')}. Add them again.`);
      return;
    }
    const { building, schedule, report } = buildModel(project, parsedList);
    project = {
      ...project, building, schedule, report, status: 'review', builtFrom: packageFingerprint(project), edited: false
    };
    modelVersion += 1;
    await flushSave();
    built = true;
  } catch (error) {
    console.error(error);
    notify('warn', 'Something went wrong while building the model. Check the things to fix on each drawing, then try again. If it keeps happening, send us the drawings on WhatsApp.');
    return;
  } finally {
    // Stay busy until the review step is open, so a second click can't start another build.
    if (!built) setBusy('');
  }
  try {
    await go('review', { reload: true });
  } finally {
    setBusy('');
  }
}

/**
 * Re-reads DXF drawings in other units and rebuilds the model (ruling R14).
 * @param {string[]} fileIds
 * @param {string} unit
 * @returns {Promise<void>}
 */
async function changeUnits(fileIds, unit) {
  let next = project;
  let applied = 0;
  for (const id of fileIds) {
    const d = next.drawings.find((x) => x.fileId === id);
    if (!d) continue;
    await session.parsedFor(next, d);
    const parsed = session.apply(id, { unit });
    if (!parsed) continue;
    applied += 1;
    next = updateDrawing(next, id, {
      unit: parsed.units?.unit ?? unit, unitSource: parsed.units?.source ?? 'user', summary: parsed.summary,
      warnings: parsed.warnings ?? [], sectionMarks: parsed.sectionMarks ?? []
    }).project;
    next = { ...next, units: { ...next.units, [id]: unit } };
  }
  if (!applied) {
    notify('warn', "Those drawings couldn't be read again in the new units, so the model was left as it was. Add the drawing files again, then change the units.");
    return;
  }
  closeReview();
  project = { ...next, edited: false };
  await build();
}

/* ---------- dialog */

/**
 * Shows a drawing large.
 * @param {string} fileId
 * @returns {Promise<void>}
 */
async function enlarge(fileId) {
  const d = project.drawings.find((x) => x.fileId === fileId);
  if (!d) return;
  ui.dialogTitle.textContent = `${d.slot === 'working' ? 'Working drawing' : 'Section'} ${d.section ? `${d.section}-${d.section}` : ''} · ${d.name}`;
  ui.dialogBody.innerHTML = '<p class="mp-loading">Opening the drawing…</p>';
  ui.dialog.showModal();
  const view = await session.preview(project, d);
  if (!ui.dialog.open) return;
  if (view?.svg) ui.dialogBody.innerHTML = view.svg;
  else if (view?.url) ui.dialogBody.innerHTML = `<img src="${esc(view.url)}" alt="${esc(d.name)}">`;
  else ui.dialogBody.innerHTML = '<p class="mp-loading">This drawing can\'t be shown here. Its file isn\'t in this browser.</p>';
}

/* ---------- mounting */

const slots = mountUploadSlots(ui.slots, {
  onAdd: (files, options) => { addFiles(files, options).catch((e) => console.error(e)); },
  onReplace: (fileId, file) => { replaceFile(fileId, file).catch((e) => console.error(e)); },
  onRemove: (fileId) => { removeFile(fileId).catch((e) => console.error(e)); },
  onDetails: (fileId, changes) => { setDetails(fileId, changes).catch((e) => console.error(e)); },
  onDeclare(labels) {
    setProject({ ...project, declaredSections: labels });
    renderDrawings();
    renderStepper();
  }
});

/**
 * Creates step 3 once the store is open.
 * @returns {object}
 */
function mountReview() {
  return createReviewStep(ui.review, {
    session,
    getProject: () => project,
    onChange({ building, schedule, scale }) {
      modelVersion += 1;
      setProject({ ...project, building, schedule, scale: { ...project.scale, ...scale }, edited: true });
      renderStepper();
    },
    onUnits: (fileIds, unit) => { changeUnits(fileIds, unit).catch((e) => console.error(e)); },
    onRebuild: () => {
      go('drawings').then(() => {
        pendingRebuild = Boolean(project.edited);
        renderGate();
        if (!pendingRebuild) build();
        else ui.gateNote.querySelector('[data-rebuild-confirm]')?.focus();
      });
    },
    onPreview3D: () => { go('paint', { view: 'dollhouse' }); },
    onEnlarge: (fileId) => { enlarge(fileId).catch((e) => console.error(e)); },
    isStale
  });
}

/**
 * Creates step 4.
 * @returns {object}
 */
function mountPaint() {
  return createPaintStep(ui.paint, {
    onPaint(state) {
      setProject({ ...project, paint: state, status: 'ready' });
      renderStepper();
    },
    onSave(state, look) {
      project = { ...project, paint: state, status: 'ready', look };
      flushSave();
    },
    onBack: () => { go('review'); },
    onExport: () => downloadProject(project)
  });
}

/**
 * Deletes a project and its drawings from the store.
 * @param {string} id
 * @returns {Promise<void>}
 */
async function deleteProject(id) {
  if (project?.id === id) {
    autosave.cancel();
    if (step === 'review') review.hide();
    project = null;
    session.use(null);
  }
  await store.remove(id);
  projects = await store.list();
  render();
  if (step !== 'property') await go('property');
}

/**
 * Loads the sample house: a new project with the sample drawings added the normal way.
 * @returns {Promise<void>}
 */
async function loadSample() {
  if (busy) return;
  setBusy('Loading the sample drawings…');
  try {
    const { files, floors } = await fetchSampleFiles();
    setBusy('');
    await openProject(createProject({ name: SAMPLE.name, kind: SAMPLE.kind, floors }), { isNew: true, step: 'drawings' });
    await addFiles(files);
  } catch (error) {
    console.error(error);
    setBusy('');
    notify('warn', 'The sample drawings couldn\'t be loaded. Refresh the page and try again, or download the zip and add the files yourself.');
  }
}

/**
 * Runs an async action from a click, reporting failures as a notice.
 * @param {() => Promise<void>} action
 */
function run(action) {
  action().catch((error) => {
    console.error(error);
    notify('warn', error.message);
  });
}

const startStep = mountStartStep(ui.property, {
  onCreate: (details) => run(() => openProject(createProject(details), { isNew: true, step: 'drawings' })),
  onChange(changes) {
    setProject({ ...project, ...changes });
    renderStepper();
    if ('floors' in changes) renderDrawings();
  },
  onContinue: () => run(() => go('drawings')),
  onClose: () => run(closeProject),
  onSample: () => run(loadSample),
  onImport: (file) => run(() => importProject(file)),
  onOpen: (id) => run(async () => {
    const p = id === project?.id ? project : await store.get(id);
    if (p) await openProject(p);
  }),
  onExport: (id) => run(async () => {
    const p = id === project?.id ? project : await store.get(id);
    if (p) downloadProject(p);
  }),
  onDelete: (id) => run(() => deleteProject(id))
});

/* ---------- events */

document.addEventListener('click', (event) => {
  const t = event.target.closest('button');
  if (!t) return;
  if (t.dataset.go) go(t.dataset.go);
  else if (t.hasAttribute('data-banner-export') && project) downloadProject(project);
  else if (t.hasAttribute('data-banner-retry')) flushSave();
  else if (t.hasAttribute('data-notices-clear')) {
    notices = [];
    renderNotices();
  } else if (t.dataset.pick === 'any') ui.addAny.click();
  else if (t.hasAttribute('data-build')) {
    if (project?.building && project.edited) {
      pendingRebuild = true;
      renderGate();
      ui.gateNote.querySelector('[data-rebuild-confirm]')?.focus();
    } else {
      build();
    }
  } else if (t.hasAttribute('data-rebuild-confirm')) build();
  else if (t.hasAttribute('data-rebuild-cancel')) {
    pendingRebuild = false;
    renderGate();
    ui.build.focus();
  } else if (t.hasAttribute('data-open-model')) go('review');
  else if (t.hasAttribute('data-dialog-close')) ui.dialog.close();
});

ui.dialog.addEventListener('click', (event) => {
  if (event.target === ui.dialog) ui.dialog.close();
});

ui.addAny.addEventListener('change', () => {
  const files = [...ui.addAny.files];
  ui.addAny.value = '';
  if (files.length) addFiles(files).catch((e) => console.error(e));
});

/** Starts the page: opens storage, lists projects and reopens the project in the address bar. */
async function start() {
  store = await createStore();
  if (store.cause) console.error(store.cause);
  autosave = createAutosave({
    store,
    current: () => project,
    onSaved(saved) {
      if (project && project.id === saved.id) project = { ...project, updated: saved.updated };
      if (saveError) {
        saveError = null;
        renderBanners();
      }
    },
    onError(error) {
      console.error(error);
      saveError = error;
      renderBanners();
    }
  });
  watchFileDrops(ui.overlay, (files, options) => { addFiles(files, options).catch((e) => console.error(e)); });
  session = createDrawingSession(store);
  review = mountReview();
  paint = mountPaint();
  renderBanners();
  projects = await store.list();
  const params = new URLSearchParams(window.location.search);
  const wanted = params.get('project');
  const saved = wanted ? await store.get(wanted) : null;
  if (saved) {
    await openProject(saved, { step: params.get('step') ?? saved.step });
    return;
  }
  render();
  await go('property', { focus: false });
}

start().catch((error) => {
  console.error(error);
  notify('warn', 'This page couldn\'t start. Refresh to try again.');
});

