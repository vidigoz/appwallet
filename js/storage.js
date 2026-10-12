/**
 * Persistencia y utilidades de datos.
 * Todo se guarda en localStorage: la cartera vive en tu navegador.
 */
import { STORAGE_KEY, SEED_FILE, DEFAULT_EMOJI } from './config.js';

/** Genera un id único y corto. */
export function uid() {
  return `app_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

/** Normaliza una URL escrita a mano ("mi-app.netlify.app" -> "https://mi-app.netlify.app/"). */
export function normalizeUrl(input) {
  let url = String(input || '').trim();
  if (!url) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    if (!parsed.hostname.includes('.')) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

/** Devuelve el dominio limpio de una URL (sin "www."). */
export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return String(url || '');
  }
}

/** Valida y sanea un registro de app. */
export function makeApp(data) {
  const accent = String(data?.accent || '').toLowerCase();
  return {
    id: data?.id || uid(),
    name: String(data?.name || 'App').trim().slice(0, 48),
    url: normalizeUrl(data?.url),
    accent: /^#[0-9a-f]{6}$/.test(accent) ? accent : '#6366f1',
    emoji: String(data?.emoji || DEFAULT_EMOJI).trim().slice(0, 4) || DEFAULT_EMOJI,
    // false = esa web no permite mostrarse dentro de un iframe (X-Frame-Options o
    // CSP frame-ancestors). En ese caso la tarjeta se queda con su ícono en vez
    // de enseñar un rectángulo en blanco.
    preview: data?.preview !== false,
    createdAt: Number(data?.createdAt) || Date.now(),
  };
}

/** Lee la cartera guardada. Devuelve null si nunca se ha guardado nada. */
export function readApps() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map(makeApp).filter((a) => a.url);
  } catch {
    return null;
  }
}

/** Guarda la cartera completa. */
export function writeApps(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('No se pudo guardar la cartera', err);
  }
}

/** Carga el archivo de apps de ejemplo (solo la primera vez). */
export async function loadSeedApps() {
  try {
    const res = await fetch(SEED_FILE, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data.map(makeApp).filter((a) => a.url);
    }
  } catch {
    /* sin conexión o archivo ausente: seguimos con lista vacía */
  }
  return [];
}

/** Descarga un respaldo JSON de la cartera. */
export function downloadBackup(list) {
  const payload = {
    app: 'App Wallet',
    version: 1,
    exportedAt: new Date().toISOString(),
    apps: list,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `app-wallet-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Interpreta un archivo de respaldo (acepta el formato con envoltura o un array plano). */
export function parseBackup(text) {
  const data = JSON.parse(text);
  const raw = Array.isArray(data) ? data : data?.apps;
  if (!Array.isArray(raw)) throw new Error('Formato de respaldo inválido');
  return raw.map(makeApp).filter((a) => a.url);
}
