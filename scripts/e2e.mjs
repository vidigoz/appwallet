/**
 * Runner del test E2E: levanta un servidor estático temporal, inyecta
 * scripts/e2e-test.js en una copia de index.html y la ejecuta en Chrome
 * headless, imprimiendo el resultado en la terminal.
 *
 * Uso:  node scripts/e2e.mjs
 * Requiere Google Chrome (o Chromium/Edge) instalado.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8791;
const BASE = `http://127.0.0.1:${PORT}`;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// Cartera de prueba 100% local: así el test es hermético y rápido
// (sin depender de la red ni de sitios externos).
const SEED = [
  { id: 'test-a', name: 'App Uno', url: `${BASE}/blank.html`, accent: '#6366f1', emoji: '🧪', createdAt: 1 },
  { id: 'test-b', name: 'App Dos', url: `${BASE}/blank.html?b`, accent: '#10b981', emoji: '📚', createdAt: 2 },
  { id: 'test-c', name: 'App Tres', url: `${BASE}/blank.html?c`, accent: '#f59e0b', emoji: '🌐', createdAt: 3 },
];
const PRELUDE = `<script>localStorage.setItem('appwallet.apps.v1', ${JSON.stringify(JSON.stringify(SEED))});</script>`;
const BLANK =
  '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>App local de prueba</title></head>' +
  '<body style="font-family:system-ui;padding:40px"><h1>App local de prueba</h1><p>Página servida por el runner E2E.</p></body></html>';

const page = fs
  .readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace('<script type="module" src="/js/app.js"></script>', `${PRELUDE}<script type="module" src="/js/app.js"></script>`)
  .replace('</body>', '<script type="module" src="/scripts/e2e-test.js"></script></body>');

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (urlPath === '/__e2e.html') {
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
    res.end(page);
    return;
  }
  if (urlPath === '/blank.html') {
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
    res.end(BLANK);
    return;
  }
  const file = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  const full = path.join(ROOT, file);
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(full).pipe(res);
});

function findChrome() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find((p) => fs.existsSync(p));
}

const chrome = findChrome();
if (!chrome) {
  console.error('✗ No encontré Chrome/Chromium. Abre /__e2e.html manualmente en tu navegador.');
  process.exit(2);
}

await new Promise((resolve) => server.listen(PORT, resolve));
console.log(`→ Sirviendo ${ROOT} en ${BASE}`);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'appwallet-e2e-'));

/** Ejecuta Chrome sin bloquear el event loop (el servidor debe seguir atendiendo). */
function runChrome(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const result = await runChrome([
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  '--virtual-time-budget=20000',
  `--user-data-dir=${profile}`,
  '--window-size=1200,900',
  '--dump-dom',
  `${BASE}/__e2e.html`,
]);

server.close();

const dom = result.stdout || '';
const match = dom.match(/E2E:(\{[\s\S]*?\})<\/pre>/);
if (!match) {
  console.error('✗ El test no produjo resultados. ¿Error temprano en la página?');
  console.error(dom.slice(0, 1500));
  process.exit(2);
}

const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const report = JSON.parse(unescape(match[1]));

for (const r of report.results) {
  const extra = r.pass || r.extra === null ? '' : `  → recibido: ${String(r.extra).slice(0, 120)}`;
  console.log(`${r.pass ? '✓' : '✗'} ${r.name}${extra}`);
}
console.log(`\n${report.total - report.fallos}/${report.total} comprobaciones OK`);
process.exit(report.fallos > 0 ? 1 : 0);
