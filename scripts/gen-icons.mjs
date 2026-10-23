/**
 * Generador de íconos PWA para App Wallet.
 *
 * Implementa un codificador PNG mínimo (con zlib nativo) para no depender
 * de ninguna librería externa. Dibuja un ícono de "wallet":
 * fondo con gradiente redondeado + una tarjeta con chip.
 *
 * Uso:  node scripts/gen-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'icons');

/* ------------------------------ PNG ------------------------------ */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filtro "none"
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------------------------- Geometría ---------------------------- */
const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** Distancia con signo a un rectángulo redondeado (negativo = dentro). */
function sdRoundRect(px, py, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const hw = (x1 - x0) / 2 - r;
  const hh = (y1 - y0) / 2 - r;
  const dx = Math.abs(px - cx) - hw;
  const dy = Math.abs(py - cy) - hh;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const C0 = hexToRgb('#1c1c1f');
const C1 = hexToRgb('#0b0b0c');

/** Color (RGBA, canal alfa 0..1) de un punto en coordenadas 0..1. */
function shade(x, y, radius) {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;

  // 1. Fondo: cuadrado redondeado con gradiente diagonal.
  if (sdRoundRect(x, y, 0, 0, 1, 1, radius) <= 0) {
    const t = Math.min(Math.max((x + y) / 2, 0), 1);
    [r, g, b] = mix(C0, C1, t);
    a = 1;
  }
  if (a === 0) return [0, 0, 0, 0];

  const over = (col, alpha) => {
    r = col[0] * alpha + r * (1 - alpha);
    g = col[1] * alpha + g * (1 - alpha);
    b = col[2] * alpha + b * (1 - alpha);
    a = alpha + a * (1 - alpha);
  };

  // 2. Tarjeta blanca.
  if (sdRoundRect(x, y, 0.17, 0.29, 0.83, 0.71, 0.05) <= 0) over([255, 255, 255], 0.96);

  // 3. Chip.
  if (sdRoundRect(x, y, 0.245, 0.355, 0.375, 0.485, 0.022) <= 0) over(hexToRgb('#0b0b0c'), 1);

  // 4. Franja (número de tarjeta) y línea secundaria.
  if (sdRoundRect(x, y, 0.245, 0.55, 0.755, 0.61, 0.03) <= 0) over(hexToRgb('#c4c4c8'), 0.95);
  if (sdRoundRect(x, y, 0.245, 0.635, 0.6, 0.675, 0.02) <= 0) over(hexToRgb('#dcdce0'), 0.7);

  // 5. Puntos decorativos junto al chip.
  for (const cx of [0.46, 0.55, 0.64]) {
    if (Math.hypot(x - cx, y - 0.42) <= 0.019) over(hexToRgb('#8a8a90'), 0.85);
  }

  return [r, g, b, a];
}

/** Renderiza un ícono cuadrado con supersampling para bordes suaves. */
function renderIcon(size, radius) {
  const SS = 3; // submuestreo
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const px = (x + (sx + 0.5) / SS) / size;
          const py = (y + (sy + 0.5) / SS) / size;
          const [cr, cg, cb, ca] = shade(px, py, radius);
          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }
      const samples = SS * SS;
      const alpha = a / samples;
      const i = (y * size + x) * 4;
      if (alpha > 0) {
        out[i] = Math.round(Math.min(r / a, 255));
        out[i + 1] = Math.round(Math.min(g / a, 255));
        out[i + 2] = Math.round(Math.min(b / a, 255));
      }
      out[i + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}

/* ------------------------------ Salida ------------------------------ */
fs.mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { file: 'icon-512.png', size: 512, radius: 0.22 },
  { file: 'icon-192.png', size: 192, radius: 0.22 },
  { file: 'apple-touch-icon.png', size: 180, radius: 0.22 },
  { file: 'icon-maskable-512.png', size: 512, radius: 0.5 },
  { file: 'favicon-32.png', size: 32, radius: 0.22 },
];

for (const { file, size, radius } of targets) {
  const png = encodePNG(size, size, renderIcon(size, radius));
  fs.writeFileSync(path.join(OUT_DIR, file), png);
  console.log(`✓ ${file} (${size}×${size}, ${(png.length / 1024).toFixed(1)} KB)`);
}

console.log(`Íconos generados en ${OUT_DIR}`);
