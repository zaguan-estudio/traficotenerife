/**
 * Cloudflare Worker — Proxy CORS + IA análisis de cámaras + Avisos AEMET
 *
 * Endpoints:
 *   GET  /camara-{id}.jpg   → proxy imagen desde CIC Tenerife
 *   POST /analizar          → analiza una cámara con Gemini 2.0 Flash
 *     Body:     { "camId": "2701002-516" }
 *     Response: { "estado": "normal|denso|colapso", "descripcion": "…" }
 *   GET  /aemet-avisos      → avisos meteorológicos adversos de Tenerife (AEMET)
 *     Response: { "warnings": [...], "updatedAt": "ISO8601" }
 *
 * ── Despliegue ────────────────────────────────────────────────────────────
 *   1. Instala Wrangler:  npm install -g wrangler
 *   2. Login:             wrangler login
 *   3. Despliega:         wrangler deploy  (usa el wrangler.toml del proyecto)
 *   4. Añade los secrets:
 *        wrangler secret put GEMINI_API_KEY
 *        wrangler secret put AEMET_API_KEY
 *      (pega tu API key cuando lo pida — nunca queda en el código)
 *      Obtén tu clave AEMET gratuita en https://opendata.aemet.es
 *   5. Copia la URL del worker y ponla en WORKER_BASE de alertas.js / aemet.js
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

    // GET /aemet-avisos — avisos meteorológicos de Tenerife
    if (request.method === 'GET' && url.pathname === '/aemet-avisos') {
      return handleAemetAvisos(env);
    }

    // GET /* — proxy de imagen CIC
    return handleProxy(url);
  },
};

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

/* ── Avisos meteorológicos AEMET ────────────────────────────── */
async function handleAemetAvisos(env) {
  const apiKey = env.AEMET_API_KEY;
  if (!apiKey) {
    return jsonResp({ error: 'AEMET_API_KEY no configurado — ejecuta: wrangler secret put AEMET_API_KEY' }, 500);
  }

  // Área 61 = Isla de Tenerife (zona de avisos AEMET)
  const AREA = '61';

  try {
    // Paso 1: obtener la URL de los datos CAP
    const metaResp = await fetch(
      `https://opendata.aemet.es/openapi/api/avisos_cap/ultimoelaborado/area/${AREA}?api_key=${apiKey}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (metaResp.status === 204 || metaResp.status === 404) {
      return jsonResp({ warnings: [], updatedAt: new Date().toISOString() });
    }
    if (!metaResp.ok) {
      return jsonResp({ error: `AEMET meta ${metaResp.status}` }, 502);
    }

    const meta = await metaResp.json();
    if (!meta.datos) {
      return jsonResp({ warnings: [], updatedAt: new Date().toISOString() });
    }

    // Paso 2: descargar el fichero CAP (XML)
    const dataResp = await fetch(meta.datos, { signal: AbortSignal.timeout(10000) });
    if (!dataResp.ok) {
      return jsonResp({ error: `AEMET datos ${dataResp.status}` }, 502);
    }

    const xml      = await dataResp.text();
    const warnings = parseCapXml(xml);

    return jsonResp({ warnings, updatedAt: new Date().toISOString() });

  } catch (e) {
    return jsonResp({ error: `AEMET error: ${e.message}` }, 502);
  }
}

/**
 * Parsea un fichero CAP 1.2 (XML) y devuelve un array de avisos activos
 * ordenados de mayor a menor severidad (Extreme → Severe → Moderate).
 * Solo devuelve avisos de status "Actual" con severity >= Moderate.
 */
function parseCapXml(xml) {
  // Ignorar mensajes que no sean alertas reales
  const alertStatus = extractTag(xml, 'status');
  if (alertStatus && alertStatus !== 'Actual') return [];

  const warnings = [];
  const SEV_ORDER = { Extreme: 3, Severe: 2, Moderate: 1 };

  // Iterar sobre todos los bloques <info>
  const infoRegex = /<info[\s>]([\s\S]*?)<\/info>/g;
  let m;
  while ((m = infoRegex.exec(xml)) !== null) {
    const info = m[1];

    // Solo idioma español
    const lang = extractTag(info, 'language');
    if (lang && lang !== 'es-ES') continue;

    const severity = extractTag(info, 'severity') || '';
    if (!SEV_ORDER[severity]) continue; // Ignorar Minor y desconocidos

    warnings.push({
      event:       extractTag(info, 'event')       || '',
      urgency:     extractTag(info, 'urgency')     || '',
      severity,
      certainty:   extractTag(info, 'certainty')   || '',
      onset:       extractTag(info, 'onset')        || '',
      expires:     extractTag(info, 'expires')      || '',
      headline:    extractTag(info, 'headline')     || '',
      description: extractTag(info, 'description') || '',
      area:        extractTag(info, 'areaDesc')     || 'Tenerife',
    });
  }

  // Ordenar: más grave primero
  warnings.sort((a, b) => (SEV_ORDER[b.severity] || 0) - (SEV_ORDER[a.severity] || 0));
  return warnings;
}

/** Extrae el texto de una etiqueta XML simple (soporta CDATA). */
function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  if (!m) return null;
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
