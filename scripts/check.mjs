import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);

const required = [
  'btnAdd', 'btnInstall', 'btnData',
  'editorModal', 'editorForm', 'editorTitle', 'formError', 'btnSave', 'btnDelete',
  'swatches', 'accentInput', 'accentText',
  'dataModal', 'importFile', 'btnDemo', 'btnExport', 'btnImport', 'btnClear',
  'viewer', 'viewerFrame', 'viewerLoader', 'viewerBlocked', 'viewerProgress',
  'viewerTitle', 'viewerEmoji', 'viewerBack', 'viewerReload', 'viewerExternal',
  'viewerFullscreen', 'viewerBlockedOpen', 'viewerBlockedBack',
  'toast', 'cardTemplate', 'cardGrid', 'emptyState', 'walletMeta', 'search',
];
const missing = required.filter((id) => !ids.includes(id));

console.log('IDs totales:', ids.length);
console.log('IDs duplicados:', dupes.length ? dupes : 'ninguno');
console.log('IDs requeridos faltantes:', missing.length ? missing : 'ninguno');

// Verifica que los archivos referenciados existan.
const refs = [...html.matchAll(/(?:href|src)="(\/[^"]+)"/g)].map((m) => m[1]);
const badRefs = refs.filter((r) => {
  const clean = r.split('?')[0];
  const p = clean === '/' ? 'index.html' : clean.slice(1);
  return !fs.existsSync(p);
});
console.log('Referencias en index.html:', refs.length, '| roto/s inexistente/s:', badRefs.length ? badRefs : 'ninguno');
