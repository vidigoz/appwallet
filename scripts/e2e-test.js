/**
 * Test E2E de App Wallet.
 *
 * Se ejecuta dentro del navegador sobre una copia de index.html
 * (ver scripts/e2e.mjs) y escribe los resultados en <pre id="e2e">.
 * Comprueba los módulos reales: storage.js + la UI completa.
 */
import { normalizeUrl, hostOf, makeApp, parseBackup } from '/js/storage.js';

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, pass, extra = null) => results.push({ name, pass: !!pass, extra });
const $ = (s) => document.querySelector(s);
const all = (s) => [...document.querySelectorAll(s)];

/* ---------------------- Funciones puras (storage) ---------------------- */
function testPure() {
  check('normalizeUrl agrega https', normalizeUrl('mi-app.netlify.app') === 'https://mi-app.netlify.app/');
  check('normalizeUrl respeta rutas y query', normalizeUrl(' https://a.netlify.app/x?y=1 ') === 'https://a.netlify.app/x?y=1');
  check('normalizeUrl rechaza protocolos raros', normalizeUrl('ftp://a.com') === '' && normalizeUrl('javascript:alert(1)') === '');
  check('normalizeUrl rechaza vacío', normalizeUrl('') === '' && normalizeUrl(null) === '');
  check('hostOf limpia www', hostOf('https://www.x.netlify.app/p') === 'x.netlify.app');

  const a = makeApp({ name: ' Hola ', url: 'hola.netlify.app', accent: '#ABCDEF', emoji: '🚀' });
  check('makeApp sanea el registro', a.name === 'Hola' && a.url === 'https://hola.netlify.app/' && a.accent === '#abcdef' && a.emoji === '🚀');
  check('makeApp aplica acento por defecto', makeApp({ name: 'x', url: 'x.netlify.app', accent: 'rojo' }).accent === '#6366f1');
  check('makeApp genera id y fecha', Boolean(a.id) && Number.isFinite(a.createdAt));

  check('parseBackup acepta la envoltura', parseBackup('{"apps":[{"name":"A","url":"a.netlify.app"}]}').length === 1);
  check('parseBackup acepta array plano', parseBackup('[{"name":"B","url":"b.netlify.app"}]')[0].name === 'B');
  let threw = false;
  try { parseBackup('{"nope":1}'); } catch { threw = true; }
  check('parseBackup rechaza formato inválido', threw);
}

/* ---------------------------- UI: visor ---------------------------- */
async function testViewer() {
  check('se renderizan 3 tarjetas seed', all('.card').length === 3, all('.card').length);
  // Los previews se cargan de forma diferida (IntersectionObserver): esperamos.
  for (let i = 0; i < 30 && !all('.card__iframe').every((f) => f.getAttribute('src')); i += 1) await sleep(100);
  check('los previews visibles cargan su src', all('.card__iframe').every((f) => f.getAttribute('src')), all('.card__iframe').map((f) => f.getAttribute('src')).join(' , '));
  check('el preview está escalado', /matrix\(0\./.test(getComputedStyle($('.card__iframe')).transform), getComputedStyle($('.card__iframe')).transform);
  check('se pintan nombre, emoji y dominio', all('.card__name')[0].textContent === 'App Uno' && $('.card__emoji').textContent === '🧪' && $('.card__domain').textContent === '127.0.0.1', `${all('.card__name')[0].textContent} / ${$('.card__domain').textContent}`);
  check('los nombres respetan el orden', all('.card__name').map((n) => n.textContent).join('|') === 'App Uno|App Dos|App Tres', all('.card__name').map((n) => n.textContent).join('|'));

  const card0 = all('.card')[0];
  const expectedUrl = card0.dataset.previewUrl;
  card0.querySelector('.card__more').click();
  await sleep(80);
  check('el menú de la tarjeta se abre', !card0.querySelector('.card__menu').hidden);

  card0.querySelector('.card__menu [data-action="open"]').click();
  await sleep(400);
  const viewer = $('#viewer');
  for (let i = 0; i < 20 && !viewer.classList.contains('is-open'); i += 1) await sleep(50);
  check('el visor se abre', !viewer.hidden && viewer.classList.contains('is-open'));
  check('el visor carga la URL de la app', $('#viewerFrame').getAttribute('src') === expectedUrl, $('#viewerFrame').getAttribute('src'));
  check('título y emoji del visor', $('#viewerTitle').textContent === 'App Uno' && $('#viewerEmoji').textContent === '🧪');
  check('body bloqueado (sin scroll de fondo)', document.body.classList.contains('viewer-open'));
  check('se agregó entrada al historial', location.hash === '#app=' + encodeURIComponent(card0.dataset.id), location.hash);
  check('el menú se cierra al abrir', card0.querySelector('.card__menu').hidden);

  $('#viewerReload').click();
  await sleep(500);
  check('recargar reasigna el src', $('#viewerFrame').getAttribute('src') === expectedUrl, $('#viewerFrame').getAttribute('src'));

  $('#viewerBack').click();
  await sleep(700);
  check('el visor se cierra', viewer.hidden && !viewer.classList.contains('is-open'));
  check('body liberado', !document.body.classList.contains('viewer-open'));
  check('el iframe se libera', $('#viewerFrame').getAttribute('src') === 'about:blank', $('#viewerFrame').getAttribute('src'));

  // Esc cierra el visor
  card0.click();
  await sleep(400);
  check('abre al pulsar la tarjeta', !viewer.hidden);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  await sleep(500);
  check('Esc cierra el visor', viewer.hidden);
}

/* --------------------------- UI: editor --------------------------- */
async function testEditor() {
  const editor = $('#editorModal');
  const form = $('#editorForm');

  $('#btnAdd').click();
  await sleep(250);
  check('el editor abre', !editor.hidden);
  check('el color por defecto está marcado', /^#[0-9a-f]{6}$/.test($('#accentText').value), $('#accentText').value);

  form.elements.name.value = 'App de prueba';
  form.elements.url.value = 'prueba.netlify.app';
  form.elements.emoji.value = '✅';
  $('#accentText').value = '#10b981';
  $('#accentText').dispatchEvent(new Event('input', { bubbles: true }));
  $('#btnSave').click();
  await sleep(350);

  check('el editor cierra al guardar', editor.hidden);
  check('la app nueva va al frente', all('.card').length === 4 && all('.card__name')[0].textContent === 'App de prueba', all('.card__name').map((n) => n.textContent));
  check('la URL se normaliza a https', all('.card')[0].dataset.previewUrl === 'https://prueba.netlify.app/', all('.card')[0].dataset.previewUrl);
  check('el acento se aplica a la tarjeta', getComputedStyle(all('.card')[0]).getPropertyValue('--accent').trim() === '#10b981');
  check('se persiste en localStorage', JSON.parse(localStorage.getItem('appwallet.apps.v1')).length === 4);

  // Validación
  $('#btnAdd').click();
  await sleep(200);
  form.elements.name.value = 'Mala';
  form.elements.url.value = 'esto no es una url';
  form.elements.emoji.value = '';
  $('#btnSave').click();
  await sleep(250);
  check('rechaza una URL inválida', !$('#formError').hidden && all('.card').length === 4, $('#formError').textContent);

  // Editar la app existente desde el menú
  const target = all('.card')[0];
  target.querySelector('.card__more').click();
  await sleep(80);
  target.querySelector('.card__menu [data-action="edit"]').click();
  await sleep(250);
  check('el editor carga los datos existentes', form.elements.name.value === 'App de prueba' && form.elements.url.value === 'https://prueba.netlify.app/', form.elements.url.value);
  check('el botón eliminar aparece al editar', !$('#btnDelete').hidden);
  form.elements.name.value = 'App renombrada';
  $('#btnSave').click();
  await sleep(300);
  check('la edición se guarda', all('.card').length === 4 && all('.card__name')[0].textContent === 'App renombrada', all('.card__name')[0].textContent);
}

/* --------------------------- UI: buscador --------------------------- */
async function testSearch() {
  const search = $('#search');
  search.value = 'renombrada';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(150);
  check('el buscador filtra', all('.card').filter((c) => !c.hidden).length === 1);
  check('la meta muestra el filtro', $('#walletMeta').textContent === '1 de 4 apps', $('#walletMeta').textContent);

  search.value = 'zzzz';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(150);
  check('muestra el estado "sin resultados"', !$('#emptyState').hidden && $('#emptyState').textContent.includes('Sin resultados'));

  search.value = '';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(150);
  check('vuelve a mostrar la rejilla', $('#emptyState').hidden && !$('#cardGrid').hidden);
  check('la meta vuelve al total', $('#walletMeta').textContent === '4 apps', $('#walletMeta').textContent);
}

/* ------------------------ UI: datos y borrado ------------------------ */
async function testData() {
  const card = all('.card')[0];
  card.querySelector('.card__more').click();
  await sleep(80);
  card.querySelector('.card__menu [data-action="delete"]').click();
  await sleep(300);
  check('el menú elimina la app', all('.card').length === 3, all('.card').length);
  check('la eliminación se persiste', JSON.parse(localStorage.getItem('appwallet.apps.v1')).length === 3);

  $('#btnData').click();
  await sleep(200);
  check('el modal de datos abre', !$('#dataModal').hidden);
  $('#btnClear').click();
  await sleep(300);
  check('borrar todo vacía la cartera', all('.card').length === 0);
  check('muestra el estado vacío', !$('#emptyState').hidden && $('#emptyState').textContent.includes('Tu cartera está vacía'));
  check('la meta indica que está vacía', $('#walletMeta').textContent === 'Sin apps todavía', $('#walletMeta').textContent);
  check('localStorage queda como array vacío', JSON.parse(localStorage.getItem('appwallet.apps.v1')).length === 0);
  check('el modal de datos se cerró', $('#dataModal').hidden);

  // El CTA del estado vacío abre el editor
  const cta = $('#emptyState [data-open-editor]');
  check('el estado vacío ofrece agregar', Boolean(cta));
  cta.click();
  await sleep(250);
  check('el CTA abre el editor', !$('#editorModal').hidden);
  document.querySelector('#editorModal [data-close]').click();
  await sleep(200);
  check('la X cierra el editor', $('#editorModal').hidden && !document.body.classList.contains('modal-open'));
}

/* ------------------------------- Runner ------------------------------- */
async function main() {
  window.confirm = () => true; // el navegador headless no muestra diálogos
  testPure();
  try {
    await testViewer();
    await testEditor();
    await testSearch();
    await testData();
  } catch (err) {
    check('el test se ejecutó sin excepciones', false, String(err && err.stack ? err.stack : err));
  }

  const fallos = results.filter((r) => !r.pass);
  const pre = document.createElement('pre');
  pre.id = 'e2e';
  pre.textContent = 'E2E:' + JSON.stringify({ total: results.length, fallos: fallos.length, results });
  document.body.appendChild(pre);
  document.title = `E2E ${results.length - fallos.length}/${results.length}`;
}

main();

