/**
 * Cloudflare Worker — Proxy CORS para cámaras CIC Tenerife
 *
 * Despliegue rápido:
 *   1. Ve a https://workers.cloudflare.com → "Create Worker"
 *   2. Pega este código y haz Deploy
 *   3. Copia la URL del worker (ej: https://cic-proxy.TU-USUARIO.workers.dev)
 *   4. Ponla en PROXY_BASE de alertas.js
 *
 * URL de uso: https://TU-WORKER.workers.dev/camara-2701002-516.jpg?t=123
 */

const CIC_BASE = 'https://cic.tenerife.es/e-Traffic3/data';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request) {
    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url     = new URL(request.url);
    const imgPath = url.pathname + url.search;           // /camara-XXX.jpg?t=...
    const target  = `${CIC_BASE}${imgPath}`;

    let resp;
    try {
      resp = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TraficoTenerife/1.0)',
          'Referer':    'https://cic.tenerife.es/',
        },
        signal: AbortSignal.timeout(10000),
      });
    } catch (e) {
      return new Response(`Error fetching image: ${e.message}`, {
        status: 502,
        headers: CORS_HEADERS,
      });
    }

    if (!resp.ok) {
      return new Response(`CIC returned ${resp.status}`, {
        status: resp.status,
        headers: CORS_HEADERS,
      });
    }

    return new Response(resp.body, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type':  resp.headers.get('Content-Type') ?? 'image/jpeg',
        'Cache-Control': 'no-store',
      },
    });
  },
};
