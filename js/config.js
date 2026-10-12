/**
 * Configuración global de App Wallet.
 */

/** Clave usada en localStorage. */
export const STORAGE_KEY = 'appwallet.apps.v1';

/** Emoji por defecto para una tarjeta nueva. */
export const DEFAULT_EMOJI = '📱';

/** Paleta de acentos sugeridos para las tarjetas. */
export const ACCENTS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
  '#ef4444', '#f59e0b', '#10b981', '#14b8a6',
  '#06b6d4', '#3b82f6', '#f97316', '#64748b',
];

/** Tamaño lógico en el que se renderiza el iframe de preview. */
export const PREVIEW_W = 1280;
export const PREVIEW_H = 800;

/** Archivo de apps de ejemplo que se carga la primera vez. */
export const SEED_FILE = '/apps.json';

/** Tiempo máximo (ms) que esperamos el load del iframe antes de asumir bloqueo. */
export const VIEWER_TIMEOUT = 9000;
