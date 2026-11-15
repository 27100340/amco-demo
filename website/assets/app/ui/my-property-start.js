/**
 * Step 1, your property: the details form (name, type, floors), which starts a new project or
 * edits the open one, the sample-house buttons, and the saved projects with Open, Export and
 * Delete (Delete asks first). The page owns the projects; this module renders and reports.
 */
import { renderProjectList } from './project-list.js';

/**
 * Sets aria-pressed across a choice group.
 * @param {HTMLElement} group
 * @param {string|number} value
 */
function pressChoice(group, value) {
  group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === String(value))));
}

/**
 * Wires step 1.
 * @param {HTMLElement} root the step's section
 * @param {{ onCreate: (details: { name: string, kind: string, floors: number }) => void,
 *   onChange: (changes: { name?: string, kind?: string, floors?: number }) => void, onContinue: () => void,
 *   onClose: () => void, onSample: () => void, onImport: (file: File) => void, onOpen: (id: string) => void,
 *   onExport: (id: string) => void, onDelete: (id: string) => void }} handlers
 * @returns {{ render: (view: { project: object|null, projects: object[], busy: boolean }) => void }}
 */
export function mountStartStep(root, handlers) {
  const q = (selector) => root.querySelector(selector);
  const form = q('[data-details-form]');
  const name = q('#mp-name');
  const kind = q('[data-choice="kind"]');
  const floors = q('[data-choice="floors"]');
  const list = q('[data-project-list]');
  const importInput = q('[data-import]');
  const draft = { name: '', kind: 'house', floors: 1 };
  let view = { project: null, projects: [], busy: false };
  let confirmingId = null;

  function renderList() {
    renderProjectList(list, { projects: view.projects, currentId: view.project?.id ?? null, confirmingId });
  }

  kind.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    pressChoice(kind, button.dataset.value);
    if (view.project) handlers.onChange({ kind: button.dataset.value });
    else draft.kind = button.dataset.value;
  });

  floors.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    const value = Number(button.dataset.value);
    pressChoice(floors, value);
    if (view.project) handlers.onChange({ floors: value });
    else draft.floors = value;
  });

  name.addEventListener('input', () => {
    if (view.project) handlers.onChange({ name: name.value.trim() || 'My property' });
    else draft.name = name.value;
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (view.project) handlers.onContinue();
    else handlers.onCreate({ name: name.value, kind: draft.kind, floors: draft.floors });
  });

  q('[data-close-project]').addEventListener('click', () => handlers.onClose());
  q('[data-load-sample]').addEventListener('click', () => {
    if (!view.busy) handlers.onSample();
  });
  q('[data-pick="import"]').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', () => {
    const file = importInput.files[0];
    importInput.value = '';
    if (file) handlers.onImport(file);
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-project-action]');
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.projectAction;
    if (action === 'open') handlers.onOpen(id);
    else if (action === 'export') handlers.onExport(id);
    else if (action === 'delete') {
      confirmingId = id;
      renderList();
      list.querySelector('[data-project-action="confirm-delete"]')?.focus();
    } else if (action === 'cancel-delete') {
      confirmingId = null;
      renderList();
      list.querySelector(`[data-focus-key="delete-${CSS.escape(id)}"]`)?.focus();
    } else if (action === 'confirm-delete') {
      confirmingId = null;
      handlers.onDelete(id);
    }
  });

  return {
    /**
     * Shows the open project's details (or the new-project draft) and the saved projects.
     * @param {{ project: object|null, projects: object[], busy: boolean }} next
     */
    render(next) {
      view = next;
      const { project } = view;
      const source = project ?? draft;
      if (document.activeElement !== name) name.value = project ? project.name : draft.name;
      pressChoice(kind, source.kind);
      pressChoice(floors, source.floors);
      q('[data-details-title]').textContent = project ? 'Property details' : 'Start a new property';
      q('[data-details-text]').textContent = project
        ? 'Changes are saved as you go. If you change the number of floors, the drawings you need change too.'
        : 'Tell us what you are building or painting. You can change these later.';
      q('[data-close-project]').hidden = !project;
      q('[data-load-sample]').disabled = view.busy;
      renderList();
    }
  };
}
