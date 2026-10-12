/**
 * App Wallet — punto de entrada.
 * Orquesta el estado, la cartera, el editor, los respaldos y el visor de apps.
 */
import { ACCENTS, DEFAULT_EMOJI, VIEWER_TIMEOUT } from './config.js';
import {
  readApps,
  writeApps,
  loadSeedApps,
  makeApp,
  downloadBackup,
  parseBackup,
  normalizeUrl,
} from './storage.js';
import { createCardView } from './cards.js';

const $ = (selector, root = document) => root.querySelector(selector);

const els = {
  grid: $('#cardGrid'),
  empty: $('#emptyState'),
  meta: $('#walletMeta'),
  search: $('#search'),
  fab: $('#btnAdd'),
  install: $('#btnInstall'),
  dataBtn: $('#btnData'),

  editorModal: $('#editorModal'),
  editorForm: $('#editorForm'),
  editorTitle: $('#editorTitle'),
  formError: $('#formError'),
  btnSave: $('#btnSave'),
  btnDelete: $('#btnDelete'),
  swatches: $('#swatches'),
  accentInput: $('#accentInput'),
  accentText: $('#accentText'),

  dataModal: $('#dataModal'),
  importFile: $('#importFile'),
  demoBtn: $('#btnDemo'),
  exportBtn: $('#btnExport'),
  importBtn: $('#btnImport'),
  clearBtn: $('#btnClear'),

  viewer: $('#viewer'),
  viewerFrame: $('#viewerFrame'),
  viewerLoader: $('#viewerLoader'),
  viewerBlocked: $('#viewerBlocked'),
  viewerProgress: $('#viewerProgress'),
  viewerTitle: $('#viewerTitle'),
  viewerEmoji: $('#viewerEmoji'),
  viewerBack: $('#viewerBack'),
  viewerReload: $('#viewerReload'),
  viewerExternal: $('#viewerExternal'),
  viewerFullscreen: $('#viewerFullscreen'),
  viewerBlockedOpen: $('#viewerBlockedOpen'),
  viewerBlockedBack: $('#viewerBlockedBack'),

  toast: $('#toast'),
  cardTemplate: $('#cardTemplate'),
};

let apps = [];
let editingId = null;
let viewerApp = null;
let viewerOpen = false;
let viewerTimer = null;
let progressTimer = null;
let toastTimer = null;
let deferredInstall = null;

const cardView = createCardView({
  container: els.grid,
  template: els.cardTemplate,
  onOpen: openViewer,
  onEdit: (app) => openEditor(app),
  onDelete: confirmDelete,
});

/* ------------------------------------------------------------------ *
 * Cartera
 * ------------------------------------------------------------------ */

function renderWallet() {
  cardView.render(apps);
  refreshMeta();
}

const EMPTY_MARKUP = `
  <div class="empty__art" aria-hidden="true">💳</div>
  <h3>Tu cartera está vacía</h3>
  <p>Pega el link de una app de Netlify y aparecerá aquí como una tarjeta.</p>
  <button class="btn btn--accent" data-open-editor>＋ Agregar mi primera app</button>`;

const NO_RESULTS_MARKUP = `
  <div class="empty__art" aria-hidden="true">🔍</div>
  <h3>Sin resultados</h3>
  <p>No encontramos ninguna app con ese nombre.</p>
  <button class="btn btn--ghost" data-clear-search>Limpiar búsqueda</button>`;

function showEmpty(markup) {
  if (els.empty.dataset.variant !== markup) {
    els.empty.innerHTML = markup;
    els.empty.dataset.variant = markup;
  }
  els.empty.hidden = false;
  els.grid.hidden = true;
}

function refreshMeta() {
  const total = apps.length;
  const visible = cardView.applyFilter(els.search.value);

  if (total === 0) {
    els.meta.textContent = 'Sin apps todavía';
    showEmpty(EMPTY_MARKUP);
    return;
  }

  els.empty.hidden = true;
  els.grid.hidden = false;

  if (visible === 0) {
    els.meta.textContent = `${total} app${total === 1 ? '' : 's'}`;
    showEmpty(NO_RESULTS_MARKUP);
  } else if (visible === total) {
    els.meta.textContent = `${total} app${total === 1 ? '' : 's'}`;
  } else {
    els.meta.textContent = `${visible} de ${total} apps`;
  }
}

function persist() {
  writeApps(apps);
}

function upsertApp(data) {
  if (editingId) {
    const index = apps.findIndex((a) => a.id === editingId);
    if (index !== -1) apps[index] = makeApp({ ...data, id: editingId, createdAt: apps[index].createdAt });
  } else {
    apps = [makeApp(data), ...apps];
  }
  persist();
  renderWallet();
}

function removeApp(id) {
  apps = apps.filter((a) => a.id !== id);
  persist();
  renderWallet();
}


/* ------------------------------------------------------------------ *
 * Utilidades
 * ------------------------------------------------------------------ */
/**
 * Ejecuta el callback en el siguiente frame de pintado.
 * Incluye un respaldo por setTimeout porque requestAnimationFrame se pausa
 * cuando la pestaña está en segundo plano (y el visor quedaría invisible).
 */
function nextFrame(callback) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    callback();
  };
  requestAnimationFrame(run);
  setTimeout(run, 80);
}

/* ------------------------------------------------------------------ *
 * Toast
 * ------------------------------------------------------------------ */
function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  nextFrame(() => els.toast.classList.add('is-visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove('is-visible');
    setTimeout(() => {
      els.toast.hidden = true;
    }, 280);
  }, 2600);
}

/* ------------------------------------------------------------------ *
 * Modales genéricos
 * ------------------------------------------------------------------ */
function openModal(el) {
  el.hidden = false;
  document.body.classList.add('modal-open');
}

function closeModal(el) {
  el.hidden = true;
  if (els.editorModal.hidden && els.dataModal.hidden) {
    document.body.classList.remove('modal-open');
  }
}

/* ------------------------------------------------------------------ *
 * Editor de apps
 * ------------------------------------------------------------------ */
function buildSwatches() {
  els.swatches.innerHTML = '';
  for (const color of ACCENTS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.color = color;
    btn.style.background = color;
    btn.setAttribute('aria-label', `Usar color ${color}`);
    btn.addEventListener('click', () => setAccent(color));
    els.swatches.appendChild(btn);
  }
}

function setAccent(color) {
  const hex = /^#[0-9a-f]{6}$/i.test(color || '') ? color.toLowerCase() : '#6366f1';
  els.accentInput.value = hex;
  els.accentText.value = hex;
  for (const btn of els.swatches.children) {
    btn.classList.toggle('is-active', btn.dataset.color.toLowerCase() === hex);
  }
}

function randomAccent() {
  return ACCENTS[Math.floor(Math.random() * ACCENTS.length)];
}

function openEditor(app = null) {
  editingId = app?.id || null;

  els.editorTitle.textContent = editingId ? 'Editar app' : 'Agregar app';
  els.btnDelete.hidden = !editingId;
  els.btnSave.textContent = editingId ? 'Guardar cambios' : 'Agregar a la cartera';
  els.formError.hidden = true;

  const form = els.editorForm;
  form.elements.name.value = app?.name || '';
  form.elements.url.value = app?.url || '';
  form.elements.emoji.value = app?.emoji || '';
  form.elements.emoji.placeholder = DEFAULT_EMOJI;
  setAccent(app?.accent || randomAccent());

  openModal(els.editorModal);
  setTimeout(() => form.elements.name.focus(), 130);
}

function closeEditor() {
  editingId = null;
  closeModal(els.editorModal);
}

function editorError(message) {
  els.formError.textContent = message;
  els.formError.hidden = false;
}

function onEditorSubmit(event) {
  event.preventDefault();
  const form = els.editorForm;
  const name = form.elements.name.value.trim();
  const url = normalizeUrl(form.elements.url.value);
  const emoji = form.elements.emoji.value.trim() || DEFAULT_EMOJI;
  const accent = els.accentText.value.trim();

  if (!name) return editorError('Ponle un nombre a tu app.');
  if (!url) return editorError('Ese link no parece válido. Ejemplo: https://mi-app.netlify.app');

  const wasEditing = Boolean(editingId);
  upsertApp({ name, url, emoji, accent });
  closeEditor();
  showToast(wasEditing ? 'App actualizada ✓' : 'App agregada a tu cartera 🎉');
}

function confirmDelete(app) {
  if (!app) return;
  if (!window.confirm(`¿Eliminar "${app.name}" de tu cartera?`)) return;
  removeApp(app.id);
  showToast('App eliminada');
}

/* ------------------------------------------------------------------ *
 * Visor de apps (webview a pantalla completa)
 * ------------------------------------------------------------------ */
function setProgress(value) {
  els.viewerProgress.style.width = `${value}%`;
  els.viewerProgress.classList.toggle('is-active', value > 0 && value < 100);
}

function startProgress() {
  clearInterval(progressTimer);
  let value = 8;
  setProgress(value);
  progressTimer = setInterval(() => {
    value = Math.min(value + Math.random() * 11, 88);
    setProgress(value);
  }, 420);
}

function finishProgress() {
  clearInterval(progressTimer);
  progressTimer = null;
  setProgress(100);
  setTimeout(() => setProgress(0), 600);
}

function openViewer(app) {
  if (!app || !app.url) return;

  viewerApp = app;
  viewerOpen = true;

  els.viewerTitle.textContent = app.name;
  els.viewerEmoji.textContent = app.emoji;
  els.viewerLoader.classList.remove('is-hidden');
  els.viewerBlocked.hidden = true;
  startProgress();

  els.viewer.hidden = false;
  els.viewer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('viewer-open');
  nextFrame(() => els.viewer.classList.add('is-open'));

  els.viewerFrame.src = app.url;

  clearTimeout(viewerTimer);
  viewerTimer = setTimeout(() => {
    if (!viewerOpen) return;
    els.viewerLoader.classList.add('is-hidden');
    els.viewerBlocked.hidden = false;
    finishProgress();
  }, VIEWER_TIMEOUT);

  history.pushState({ walletViewer: true }, '', `#app=${encodeURIComponent(app.id)}`);
}

function closeViewer(fromPopstate = false) {
  if (!viewerOpen) return;
  viewerOpen = false;
  viewerApp = null;

  clearTimeout(viewerTimer);
  clearInterval(progressTimer);
  setProgress(0);

  els.viewer.classList.remove('is-open');
  els.viewer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('viewer-open');

  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

  setTimeout(() => {
    if (viewerOpen) return;
    els.viewer.hidden = true;
    els.viewerFrame.src = 'about:blank';
    els.viewerBlocked.hidden = true;
  }, 300);

  if (!fromPopstate && history.state?.walletViewer) history.back();
}

function reloadViewer() {
  if (!viewerOpen || !viewerApp) return;
  els.viewerLoader.classList.remove('is-hidden');
  els.viewerBlocked.hidden = true;
  startProgress();
  // Forzar recarga reasignando el src.
  els.viewerFrame.src = 'about:blank';
  setTimeout(() => {
    if (viewerOpen && viewerApp) els.viewerFrame.src = viewerApp.url;
  }, 40);
  clearTimeout(viewerTimer);
  viewerTimer = setTimeout(() => {
    if (!viewerOpen) return;
    els.viewerLoader.classList.add('is-hidden');
    els.viewerBlocked.hidden = false;
    finishProgress();
  }, VIEWER_TIMEOUT);
}

function openExternally() {
  const url = viewerApp?.url;
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    els.viewer.requestFullscreen?.().catch(() => {});
  }
}

els.viewerFrame.addEventListener('load', () => {
  if (!viewerOpen || els.viewerFrame.src === 'about:blank') return;
  clearTimeout(viewerTimer);
  els.viewerLoader.classList.add('is-hidden');
  els.viewerBlocked.hidden = true;
  finishProgress();
});

/* ------------------------------------------------------------------ *
 * Datos y respaldo
 * ------------------------------------------------------------------ */
function exportBackup() {
  if (!apps.length) return showToast('Tu cartera está vacía');
  downloadBackup(apps);
  showToast('Respaldo exportado ✓');
}

async function importBackup(file) {
  try {
    const list = parseBackup(await file.text());
    if (!list.length) throw new Error('vacío');
    apps = list;
    persist();
    renderWallet();
    closeModal(els.dataModal);
    showToast(`${list.length} app${list.length === 1 ? '' : 's'} importada${list.length === 1 ? '' : 's'} ✓`);
  } catch {
    showToast('No pudimos leer ese respaldo 😕');
  }
}

async function loadDemoApps() {
  const demo = await loadSeedApps();
  if (!demo.length) return showToast('No hay apps de ejemplo disponibles');
  const existing = new Set(apps.map((a) => a.url));
  const fresh = demo.filter((a) => !existing.has(a.url)).map((a) => makeApp({ ...a, id: undefined }));
  apps = [...fresh, ...apps];
  persist();
  renderWallet();
  closeModal(els.dataModal);
  showToast('Apps de ejemplo cargadas ✓');
}

function clearAll() {
  if (!apps.length) return showToast('No hay nada que borrar');
  if (!window.confirm('¿Borrar todas las apps de tu cartera? Esta acción no se puede deshacer.')) return;
  apps = [];
  persist();
  renderWallet();
  closeModal(els.dataModal);
  showToast('Cartera vaciada');
}


/* ------------------------------------------------------------------ *
 * Eventos
 * ------------------------------------------------------------------ */
function wireEvents() {
  els.search.addEventListener('input', refreshMeta);

  // Abrir el editor (botón flotante y cualquier [data-open-editor])
  els.fab.addEventListener('click', () => openEditor());
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-open-editor]')) openEditor();
    if (event.target.closest('[data-clear-search]')) {
      els.search.value = '';
      refreshMeta();
      els.search.focus();
    }
  });

  // Cerrar modales
  document.querySelectorAll('[data-close]').forEach((node) => {
    node.addEventListener('click', (event) => closeModal(event.target.closest('.modal')));
  });

  // Editor
  els.editorForm.addEventListener('submit', onEditorSubmit);
  els.btnDelete.addEventListener('click', () => {
    const app = apps.find((a) => a.id === editingId);
    if (!app) return;
    if (!window.confirm(`¿Eliminar "${app.name}" de tu cartera?`)) return;
    removeApp(app.id);
    closeEditor();
    showToast('App eliminada');
  });
  els.accentInput.addEventListener('input', () => setAccent(els.accentInput.value));
  els.accentText.addEventListener('input', () => {
    const value = els.accentText.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) setAccent(value);
  });

  // Datos y respaldo
  els.dataBtn.addEventListener('click', () => openModal(els.dataModal));
  els.exportBtn.addEventListener('click', exportBackup);
  els.importBtn.addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', () => {
    const file = els.importFile.files?.[0];
    if (file) importBackup(file);
    els.importFile.value = '';
  });
  els.demoBtn.addEventListener('click', loadDemoApps);
  els.clearBtn.addEventListener('click', clearAll);

  // Visor
  els.viewerBack.addEventListener('click', () => closeViewer());
  els.viewerReload.addEventListener('click', reloadViewer);
  els.viewerExternal.addEventListener('click', openExternally);
  els.viewerFullscreen.addEventListener('click', toggleFullscreen);
  els.viewerBlockedOpen.addEventListener('click', openExternally);
  els.viewerBlockedBack.addEventListener('click', () => closeViewer());

  // El botón "atrás" del móvil / navegador regresa a la cartera.
  window.addEventListener('popstate', () => {
    if (viewerOpen) closeViewer(true);
  });

  // Atajos de teclado
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (viewerOpen) closeViewer();
    else if (!els.editorModal.hidden) closeEditor();
    else if (!els.dataModal.hidden) closeModal(els.dataModal);
  });
}

/* ------------------------------------------------------------------ *
 * PWA: service worker + instalación
 * ------------------------------------------------------------------ */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch((err) => {
      console.warn('No se pudo registrar el service worker:', err);
    });
  });
}

function wireInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstall = event;
    els.install.hidden = false;
  });

  els.install.addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    if (outcome === 'accepted') els.install.hidden = true;
    deferredInstall = null;
  });

  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    els.install.hidden = true;
    showToast('¡App instalada! 🎉');
  });
}

/* ------------------------------------------------------------------ *
 * Arranque
 * ------------------------------------------------------------------ */
async function init() {
  buildSwatches();
  wireEvents();
  wireInstallPrompt();

  const stored = readApps();
  apps = stored === null ? await loadSeedApps() : stored;
  if (stored === null) persist();

  renderWallet();
  registerServiceWorker();

  const params = new URLSearchParams(location.search);
  if (params.get('action') === 'add') setTimeout(() => openEditor(), 350);
}

init();

