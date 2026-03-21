/**
 * Avisos meteorológicos — AEMET (RSS/CAP + caché localStorage diaria)
 * Fuente: RSS público de avisos para Tenerife (zona AFAP6596)
 *
 * Estrategia de fetch (AEMET no envía CORS headers):
 *   1. Fetch directo al RSS (funciona en entornos sin restricción CORS)
 *   2. Si falla por CORS → fetch a través del Cloudflare Worker (/aviso-aemet)
 *
 * Estrategia de caché:
 *   - Si localStorage contiene el RSS del día de hoy → se usa directamente
 *     (cero peticiones de red durante el resto del día)
 *   - Si el día ha cambiado o no hay caché → se descarga el RSS y se guarda
 *   - Si ambos fetches fallan → se usa el último RSS guardado
 */

const RSS_URL    = 'https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAP6596_RSS.xml';
const RSS_PROXY  = 'https://traficotenerife.nameless-bush-75c2.workers.dev/aviso-aemet';
const CAP_PROXY  = 'https://traficotenerife.nameless-bush-75c2.workers.dev/proxy';
const CACHE_KEY  = 'aemet_rss_tenerife';
const TZ        = 'Atlantic/Canary';

/** Palabras clave de eventos de lluvia */
const LLUVIA_RE = /lluvi|precipitaci|tormenta|granizo|chubasco/i;

/** Mapa color → severidad CAP */
const COLOR_SEV = { rojo: 'Extreme', naranja: 'Severe', amarillo: 'Moderate' };

const SEV_ORD = { Extreme: 3, Severe: 2, Moderate: 1 };

/* ════════════════════════════════════════════════════════════
   API PÚBLICA
   ════════════════════════════════════════════════════════════ */

/**
 * Devuelve el aviso de lluvia más crítico publicado hoy o ayer,
 * o null si no hay ninguno.
 * @returns {Promise<object|null>}
 */
async function cargar() {
  try {
    const xml = await _obtenerRss();
    if (!xml) return null;

    const candidatos = _parsearRss(xml);
    if (!candidatos.length) return null;

    candidatos.sort((a, b) => (SEV_ORD[b.severity] || 0) - (SEV_ORD[a.severity] || 0));
    const mejor = candidatos[0];

    // Enriquecer con onset/expires desde el CAP XML individual (opcional)
    if (mejor.capUrl) {
      try {
        const proxyUrl = `${CAP_PROXY}?url=${encodeURIComponent(mejor.capUrl)}`;
        const capRes = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
        if (capRes.ok) {
          const detalles = _parseCapXml(await capRes.text());
          const match = detalles.find(d =>
            d.severity === mejor.severity || LLUVIA_RE.test(d.event)
          ) || detalles[0];
          if (match) {
            mejor.onset       = match.onset       || mejor.onset;
            mejor.expires     = match.expires     || mejor.expires;
            mejor.description = match.description || mejor.description;
            mejor.area        = match.area        || mejor.area;
          }
        }
      } catch { /* enriquecimiento opcional */ }
    }

    return mejor;

  } catch {
    return null;
  }
}

/* ════════════════════════════════════════════════════════════
   CACHÉ DIARIA (localStorage)
   ════════════════════════════════════════════════════════════ */

/**
 * Devuelve el XML del RSS de AEMET.
 * Prioridad: caché de hoy → fetch fresco → caché antigua (fallback).
 */
async function _obtenerRss() {
  const hoy = _diaTZ(new Date(), TZ);

  // 1. Caché válida de hoy → sin red
  const cacheXml = _leerCache(hoy);
  if (cacheXml) return cacheXml;

  // 2. Fetch fresco: directo primero, luego proxy worker si CORS falla
  const xml = await _fetchRss();
  if (xml) {
    _guardarCache(hoy, xml);
    return xml;
  }

  // 3. Fallback: cualquier caché previa
  return _leerCache(null);
}

/**
 * Intenta obtener el RSS de AEMET:
 * 1. Fetch directo (sin proxy) — falla en navegadores por CORS
 * 2. Fetch vía Worker (proxy CORS)
 * Devuelve el texto XML o null si ambos fallan.
 */
async function _fetchRss() {
  for (const url of [RSS_URL, RSS_PROXY]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (res.ok) return await res.text();
    } catch { /* continuar con siguiente URL */ }
  }
  return null;
}

/** Lee el XML guardado. Si fecha !== null exige que coincida con esa fecha. */
function _leerCache(fecha) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { f, xml } = JSON.parse(raw);
    if (!xml) return null;
    if (fecha !== null && f !== fecha) return null;
    return xml;
  } catch {
    return null;
  }
}

/** Guarda { f: fecha, xml } en localStorage (ignora errores de cuota). */
function _guardarCache(fecha, xml) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ f: fecha, xml }));
  } catch { /* quota exceeded — sin caché */ }
}

/* ── Parser RSS ───────────────────────────────────────────── */

function _parsearRss(xml) {
  const ahora = new Date();
  const hoy   = _diaTZ(ahora, TZ);

  const candidatos = [];
  const reItem = /<item[\s>]([\s\S]*?)<\/item>/g;
  let m;

  while ((m = reItem.exec(xml)) !== null) {
    const bloque = m[1];

    /* Vigencia: si cap:expires está en el futuro → aviso activo */
    const expiresRaw = _tag(bloque, 'cap:expires') || _tag(bloque, 'expires');
    if (expiresRaw) {
      const expiresDate = new Date(expiresRaw);
      if (!isNaN(expiresDate) && expiresDate < ahora) continue; // ya expirado
    }

    /* Fecha de publicación ---------------------------------- */
    const pubRaw = _tag(bloque, 'pubDate');
    if (!pubRaw) continue;
    const pubDate   = new Date(pubRaw);
    const fechaPub  = _diaTZ(pubDate, TZ);
    // Aceptar: publicado hoy, o en los últimos 4 días y sin fecha de expiración conocida
    if (fechaPub > hoy) continue; // pubDate en el futuro → raro, descartar
    if (!expiresRaw && pubDate < new Date(ahora - 4 * 86_400_000)) continue;

    /* Texto para detectar evento ---------------------------- */
    const titulo = _tag(bloque, 'title')       || '';
    const desc   = _tag(bloque, 'description') || '';
    const texto  = titulo + ' ' + desc;

    if (!LLUVIA_RE.test(texto)) continue;

    /* Severidad desde color en título O descripción ---------- */
    const colorText = texto.toLowerCase();
    let severity    = 'Moderate';
    for (const [color, sev] of Object.entries(COLOR_SEV)) {
      if (colorText.includes(color)) { severity = sev; break; }
    }

    /* Zona */
    const area = _extraerZona(titulo) || 'Tenerife';

    /* Evento */
    let event = 'Lluvia';
    if (/tormenta/i.test(texto))         event = 'Tormenta';
    else if (/granizo/i.test(texto))     event = 'Granizo';
    else if (/chubasco/i.test(texto))    event = 'Chubascos';
    else if (/precipitaci/i.test(texto)) event = 'Precipitaciones';

    candidatos.push({
      event,
      severity,
      headline:    titulo,
      description: desc,
      area,
      onset:   '',
      expires: '',
      capUrl:  _extraerLink(bloque),
    });
  }

  return candidatos;
}

/* ── Parser CAP 1.2 (XML individual) ─────────────────────── */

function _parseCapXml(xml) {
  const alertStatus = _tag(xml, 'status');
  if (alertStatus && alertStatus !== 'Actual') return [];

  const warnings = [];
  const re = /<info[\s>]([\s\S]*?)<\/info>/g;
  let m;

  while ((m = re.exec(xml)) !== null) {
    const info = m[1];

    const lang = _tag(info, 'language');
    if (lang && lang !== 'es-ES') continue;

    const severity = _tag(info, 'severity') || '';
    if (!SEV_ORD[severity]) continue;

    warnings.push({
      event:       _tag(info, 'event')        || '',
      severity,
      onset:       _tag(info, 'onset')        || '',
      expires:     _tag(info, 'expires')      || '',
      description: _tag(info, 'description') || '',
      area:        _tag(info, 'areaDesc')     || 'Tenerife',
    });
  }

  warnings.sort((a, b) => (SEV_ORD[b.severity] || 0) - (SEV_ORD[a.severity] || 0));
  return warnings;
}

/* ── Utilidades ───────────────────────────────────────────── */

function _tag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  if (!m) return null;
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function _extraerLink(bloque) {
  const m1 = bloque.match(/<link>([\s\S]*?)<\/link>/);
  if (m1) return m1[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
  const m2 = bloque.match(/<(?:atom:)?link[^>]+href=["']([^"']+)["']/);
  if (m2) return m2[1];
  return null;
}

function _extraerZona(titulo) {
  const m = titulo.match(/\bpara\s+(.+)/i);
  return m ? m[1].trim() : null;
}

function _diaTZ(date, tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const p = {};
    parts.forEach(({ type, value }) => { p[type] = value; });
    return `${p.year}-${p.month}-${p.day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

window.aemet = { cargar };
