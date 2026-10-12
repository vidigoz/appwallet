/**
 * frame-check: dice si una web se deja mostrar dentro de un iframe.
 *
 * La cartera la usa al guardar una app: si la web manda `X-Frame-Options` o un
 * `Content-Security-Policy: frame-ancestors` restrictivo, la tarjeta se queda
 * con su ícono en lugar de enseñar un rectángulo en blanco.
 *
 * El navegador NO puede comprobarlo por su cuenta: las cabeceras las aplica la
 * web destino y el JavaScript de la cartera no puede leerlas (CORS), así que la
 * comprobación se hace aquí, en el servidor.
 *
 *   GET /.netlify/functions/frame-check?url=https://mi-app.netlify.app
 *   → { "embeddable": false, "reason": "x-frame-options: SAMEORIGIN" }
 *
 * `embeddable: null` = no se pudo comprobar (sin red, timeout, host no permitido).
 */

// Solo https y nunca direcciones internas: la función no debe servir de proxy
// hacia la red local (SSRF).
const PRIVATE_HOST = /^(localhost$|127\.|0\.0\.0\.0$|10\.|192\.168\.|169\.254\.|::1$|\[::1\]$)/i;
const PRIVATE_172 = /^172\.(1[6-9]|2\d|3[01])\./;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });

  const target = new URL(req.url).searchParams.get('url');
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return json({ embeddable: null, error: 'url inválida' }, 400);
  }

  if (parsed.protocol !== 'https:') return json({ embeddable: null, error: 'solo se admite https' }, 400);
  if (PRIVATE_HOST.test(parsed.hostname) || PRIVATE_172.test(parsed.hostname)) {
    return json({ embeddable: null, error: 'host no permitido' }, 400);
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(parsed.href, { redirect: 'follow', signal: controller.signal });
    clearTimeout(timer);
    res.body?.cancel?.(); // solo nos interesan las cabeceras

    const xfo = (res.headers.get('x-frame-options') || '').trim();
    const csp = res.headers.get('content-security-policy') || '';
    const ancestors = ((csp.match(/frame-ancestors\s+([^;]+)/i) || [])[1] || '').trim();

    // X-Frame-Options bloquea salvo que sea un valor vacío/inexistente.
    // frame-ancestors bloquea si no permite "*" ni el dominio de la cartera
    // (los sitios de Netlify se permiten entre sí con https://*.netlify.app).
    const cspBlocks = Boolean(ancestors) && !ancestors.includes('*') && !/netlify\.app/i.test(ancestors);
    const embeddable = !xfo && !cspBlocks;

    return json({
      embeddable,
      status: res.status,
      reason: xfo ? `x-frame-options: ${xfo}` : cspBlocks ? `frame-ancestors ${ancestors}` : '',
    });
  } catch (err) {
    return json({ embeddable: null, error: String(err?.message || err) });
  }
};
