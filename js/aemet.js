/**
 * Avisos meteorológicos — AEMET (RSS/CAP)
 * Fuente: RSS público de avisos para Tenerife (zona AFAP6596)
 *
 * Muestra avisos de lluvia publicados hoy o ayer (hora canaria).
 * No requiere API key. Falla silenciosamente ante errores de red o CORS.
 *
 * Flujo:
 *   1. Descarga RSS  → parsea <item> con pubDate, title, link
 *   2. Filtra: fecha (hoy/ayer) + evento lluvia
 *   3. Para el aviso más grave, intenta descargar su CAP XML
 *      y enriquecer con onset/expires/description detallado
 */

// El worker actúa de proxy CORS para el RSS público de AEMET
const RSS_TENERIFE = 'https://traficotenerife.nameless-bush-75c2.workers.dev/aviso-aemet';

/** Palabras clave de eventos de lluvia */
const LLUVIA_RE = /lluvi|precipitaci|tormenta|granizo|chubasco/i;

/** Mapa color → severidad CAP */
const COLOR_SEV = { rojo: 'Extreme', naranja: 'Severe', amarillo: 'Moderate' };

const SEV_ORD = { Extreme: 3, Severe: 2, Moderate: 1 };

/**
 * Devuelve el aviso de lluvia más crítico publicado hoy o ayer,
 * o null si no hay ninguno.
 * @returns {Promise<object|null>}
 */
async function cargar() {
  try {
    const res = await fetch(RSS_TENERIFE, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;

    const xml       = await res.text();
    const candidatos = _parsearRss(xml);
    if (!candidatos.length) return null;

    // El más grave primero
    candidatos.sort((a, b) => (SEV_ORD[b.severity] || 0) - (SEV_ORD[a.severity] || 0));
    const mejor = candidatos[0];

    // Enriquecer con datos CAP completos (onset / expires / descripción)
    if (mejor.capUrl) {
      try {
        const capRes = await fetch(mejor.capUrl, { signal: AbortSignal.timeout(8000) });
        if (capRes.ok) {
          const capXml  = await capRes.text();
          const detalles = _parseCapXml(capXml);
          const match    = detalles.find(d =>
            d.severity === mejor.severity || LLUVIA_RE.test(d.event)
          ) || detalles[0];
          if (match) {
            mejor.onset       = match.onset       || mejor.onset;
            mejor.expires     = match.expires     || mejor.expires;
            mejor.description = match.description || mejor.description;
            mejor.area        = match.area        || mejor.area;
            mejor.urgency     = match.urgency     || '';
          }
        }
      } catch { /* enriquecimiento opcional */ }
    }

    return mejor;

  } catch {
    return null;
  }
}

/* ── Parser RSS ───────────────────────────────────────────── */

function _parsearRss(xml) {
  const tz    = 'Atlantic/Canary';
  const ahora = new Date();
  const hoy   = _diaTZ(ahora, tz);
  const ayer  = _diaTZ(new Date(ahora - 86_400_000), tz);

  const candidatos = [];
  const reItem = /<item[\s>]([\s\S]*?)<\/item>/g;
  let m;

  while ((m = reItem.exec(xml)) !== null) {
    const bloque = m[1];

    /* Fecha de publicación ---------------------------------- */
    const pubRaw = _tag(bloque, 'pubDate');
    if (!pubRaw) continue;
    const fechaPub = _diaTZ(new Date(pubRaw), tz);
    if (fechaPub !== hoy && fechaPub !== ayer) continue;

    /* Texto para detectar evento ---------------------------- */
    const titulo = _tag(bloque, 'title')       || '';
    const desc   = _tag(bloque, 'description') || '';
    const texto  = titulo + ' ' + desc;

    if (!LLUVIA_RE.test(texto)) continue;

    /* Severidad desde color en título O descripción ---------- */
    const colorText = (titulo + ' ' + desc).toLowerCase();
    let severity    = 'Moderate';
    for (const [color, sev] of Object.entries(COLOR_SEV)) {
      if (colorText.includes(color)) { severity = sev; break; }
    }

    /* Zona: todo lo que va detrás de "para" en el título ----- */
    const area = _extraerZona(titulo) || 'Tenerife';

    /* Evento: de más específico a más genérico --------------- */
    let event = 'Lluvia';
    if (/tormenta/i.test(texto))        event = 'Tormenta';
    else if (/granizo/i.test(texto))    event = 'Granizo';
    else if (/chubasco/i.test(texto))   event = 'Chubascos';
    else if (/precipitaci/i.test(texto)) event = 'Precipitaciones';

    /* URL del CAP XML individual */
    const capUrl = _extraerLink(bloque);

    candidatos.push({
      event,
      severity,
      headline:    titulo,
      description: desc,
      area,
      onset:   '',
      expires: '',
      capUrl,
      pubDate: pubRaw,
    });
  }

  return candidatos;
}

/* ── Parser CAP 1.2 (XML individual) ─────────────────────── */

/**
 * Parsea un fichero CAP 1.2 y devuelve avisos activos ordenados
 * por severidad descendente. Ignora Minor, Test, Draft, Exercise.
 */
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
      event:       _tag(info, 'event')       || '',
      severity,
      urgency:     _tag(info, 'urgency')     || '',
      certainty:   _tag(info, 'certainty')   || '',
      onset:       _tag(info, 'onset')       || '',
      expires:     _tag(info, 'expires')     || '',
      headline:    _tag(info, 'headline')    || '',
      description: _tag(info, 'description')|| '',
      area:        _tag(info, 'areaDesc')    || 'Tenerife',
    });
  }

  warnings.sort((a, b) => (SEV_ORD[b.severity] || 0) - (SEV_ORD[a.severity] || 0));
  return warnings;
}

/* ── Utilidades ───────────────────────────────────────────── */

/** Extrae el texto de una etiqueta XML simple (soporta CDATA). */
function _tag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  if (!m) return null;
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

/** Extrae la URL del enlace de un bloque RSS <item>. */
function _extraerLink(bloque) {
  // RSS 2.0 estándar: <link>https://...</link>
  const m1 = bloque.match(/<link>([\s\S]*?)<\/link>/);
  if (m1) return m1[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
  // Atom: <atom:link href="..." /> o <link href="..." />
  const m2 = bloque.match(/<(?:atom:)?link[^>]+href=["']([^"']+)["']/);
  if (m2) return m2[1];
  return null;
}

/**
 * Extrae la zona desde el título del aviso.
 * Ej: "Aviso amarillo de lluvia para Norte de Tenerife" → "Norte de Tenerife"
 */
function _extraerZona(titulo) {
  const m = titulo.match(/\bpara\s+(.+)/i);
  return m ? m[1].trim() : null;
}

/** Devuelve la fecha 'YYYY-MM-DD' de una Date en la zona horaria indicada. */
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
