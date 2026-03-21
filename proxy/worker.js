/**
 * Cloudflare Worker — Proxy CORS + IA análisis de cámaras
 *
 * Endpoints:
 *   GET  /camara-{id}.jpg   → proxy imagen desde CIC Tenerife
 *   POST /analizar          → analiza una cámara con Gemini 2.0 Flash
 *     Body:     { "camId": "2701002-516" }
 *     Response: { "estado": "normal|denso|colapso", "descripcion": "…" }
 *   GET  /aviso-aemet       → proxy RSS CAP de avisos AEMET (CORS fix)
 *
 * ── Despliegue ────────────────────────────────────────────────────────────
 *   1. Instala Wrangler:  npm install -g wrangler
 *   2. Login:             wrangler login
 *   3. Despliega:         wrangler deploy  (usa el wrangler.toml del proyecto)
 *   4. Añade el secret:   wrangler secret put GEMINI_API_KEY
 *      (pega tu API key cuando lo pida — nunca queda en el código)
 *   5. Copia la URL del worker y ponla en WORKER_BASE de alertas.js
 * ─────────────────────────────────────────────────────────────────────────
 */

const CIC_BASE = 'https://cic.tenerife.es/e-Traffic3/data';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const PROMPT = `Analiza esta imagen de una cámara de tráfico en Tenerife, España.
Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin texto extra):
{"estado":"normal|denso|colapso","descripcion":"frase corta máx 12 palabras"}
Criterios:
- normal: circulación fluida, sin retenciones visibles
- denso: tráfico lento o congestión moderada
- colapso: retención importante, vehículos parados o muy lentos`;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // POST /analizar — análisis IA de una cámara
    if (request.method === 'POST' && url.pathname === '/analizar') {
      return handleAnalizar(request, env);
    }

    // GET /aviso-aemet — proxy RSS AEMET (sin CORS en origen)
    if (request.method === 'GET' && url.pathname === '/aviso-aemet') {
      return handleAvisoAemet();
    }

    // GET /* — proxy de imagen CIC
    return handleProxy(url);
  },
};

/* ── Proxy RSS AEMET ───────────────────────────────────────── */
const AEMET_RSS = 'https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAP6596_RSS.xml';

async function handleAvisoAemet() {
  let resp;
  try {
    resp = await fetch(AEMET_RSS, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TraficoTenerife/1.0)',
        'Referer':    'https://www.aemet.es/',
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    return new Response(`Error fetching AEMET: ${e.message}`, {
      status: 502, headers: CORS_HEADERS,
    });
  }

  if (!resp.ok) {
    return new Response(`AEMET returned ${resp.status}`, {
      status: resp.status, headers: CORS_HEADERS,
    });
  }

  return new Response(resp.body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type':  'application/xml; charset=utf-8',
      'Cache-Control': 'max-age=900', // 15 min
    },
  });
}

/* ── Proxy de imagen CIC ───────────────────────────────────── */
async function handleProxy(url) {
  const target = `${CIC_BASE}${url.pathname}${url.search}`;
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
      status: 502, headers: CORS_HEADERS,
    });
  }

  if (!resp.ok) {
    return new Response(`CIC returned ${resp.status}`, {
      status: resp.status, headers: CORS_HEADERS,
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
}

/* ── Análisis IA con Gemini ────────────────────────────────── */
async function handleAnalizar(request, env) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonResp({ error: 'GEMINI_API_KEY no configurado — ejecuta: wrangler secret put GEMINI_API_KEY' }, 500);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonResp({ error: 'Body JSON inválido' }, 400); }

  const { camId } = body;
  if (!camId || !/^[\d-]+$/.test(camId)) {
    return jsonResp({ error: 'camId inválido' }, 400);
  }

  // 1. Obtener imagen de CIC y convertir a base64
  let imageBase64;
  try {
    const imgResp = await fetch(
      `${CIC_BASE}/camara-${camId}.jpg?t=${Date.now()}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TraficoTenerife/1.0)',
          'Referer':    'https://cic.tenerife.es/',
        },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!imgResp.ok) throw new Error(`HTTP ${imgResp.status}`);
    const buffer = await imgResp.arrayBuffer();
    // btoa en chunks para evitar stack overflow con imágenes grandes
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    imageBase64 = btoa(binary);
  } catch (e) {
    return jsonResp({ error: `No se pudo obtener la imagen: ${e.message}` }, 502);
  }

  // 2. Enviar a Gemini 2.5 Flash
  try {
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: PROMPT },
              { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 300 },
        }),
        signal: AbortSignal.timeout(25000),
      }
    );

    if (!geminiResp.ok) {
      const err = await geminiResp.json().catch(() => ({}));
      return jsonResp(
        { error: `Gemini ${geminiResp.status}: ${err?.error?.message ?? geminiResp.statusText}` },
        502
      );
    }

    const data  = await geminiResp.json();
    const text  = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    // Eliminar markdown y extraer el primer bloque JSON válido
    const clean = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Respuesta no parseable: ${clean.slice(0, 80)}`);
    const parsed = JSON.parse(match[0]);
    if (!['normal', 'denso', 'colapso'].includes(parsed.estado)) {
      throw new Error(`estado desconocido: ${parsed.estado}`);
    }
    return jsonResp(parsed);

  } catch (e) {
    return jsonResp({ error: `Error Gemini: ${e.message}` }, 502);
  }
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
