/**
 * Configuración global de App Wallet.
 */

/** Clave usada en localStorage. */
export const STORAGE_KEY = 'appwallet.apps.v1';

/** Emoji por defecto para una tarjeta nueva. */
export const DEFAULT_EMOJI = '📱';

/** Paleta de acentos sugeridos para las tarjetas. */
export const ACCENTS = [
  '#a1a1aa', '#d4d4d8', '#71717a', '#a8a29e',
  '#94a3b8', '#8fa3b8', '#8da399', '#a3a38a',
  '#bba98f', '#b8978c', '#a993a8', '#9d97b8',
];

/** Tamaño lógico en el que se renderiza el iframe de preview. */
export const PREVIEW_W = 1280;
export const PREVIEW_H = 800;

/** Archivo de apps de ejemplo que se carga la primera vez. */
export const SEED_FILE = '/apps.json';

/** Tiempo máximo (ms) que esperamos el load del iframe antes de asumir bloqueo. */
export const VIEWER_TIMEOUT = 9000;
