/**
 * Avisos meteorológicos adversos — AEMET OpenData
 * Área: Isla de Tenerife (código 61)
 *
 * Llamada directa al API de AEMET desde el navegador.
 *
 * ⚠️  La API key está en el código fuente (visible en el repo).
 *     Es una clave gratuita de AEMET sin coste económico.
 *     Si AEMET bloquea llamadas desde el navegador (CORS),
 *     el widget fallará silenciosamente sin afectar a la app.
 *
 * Endpoints consultados:
 *   GET /api/avisos_cap/ultimoelaborado/area/61  → avisos CAP Tenerife
 *
 * Docs: https://opendata.aemet.es/dist/index.html
 */

const AEMET_API_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJoZWxsb0B6YWd1YW4uaW8iLCJqdGkiOiJmN2IzZmYzOC1mNzliLTQ4YjktYmRkNy01ZWZlOGU3YTcyN2QiLCJpc3MiOiJBRU1FVCIsImlhdCI6MTc3Mzk2OTI3NSwidXNlcklkIjoiZjdiM2ZmMzgtZjc5Yi00OGI5LWJkZDctNWVmZThlN2E3MjdkIiwicm9sZSI6IiJ9.IKSIeRKdQC42HVxTO58SGUNtoOxzbu1HiX0PiJhrTGk';
const AEMET_BASE   = 'https://opendata.aemet.es/openapi/api';

// Área 61 = Isla de Tenerife (zona de avisos AEMET)
const AREA_TENERIFE = '61';

/**
 * Devuelve el aviso más crítico activo para Tenerife, o null si no hay ninguno.
 * Falla silenciosamente ante errores de red o CORS.
 * @returns {Promise<object|null>}
 */
async function cargar() {
  try {
    // Paso 1: obtener la URL de los datos CAP
    const metaRes = await fetch(
      `${AEMET_BASE}/avisos_cap/ultimoelaborado/area/${AREA_TENERIFE}?api_key=${AEMET_API_KEY}`,
      { signal: AbortSignal.timeout(10000) }
    );

    // 204 = sin avisos activos para el área
    if (metaRes.status === 204 || metaRes.status === 404) return null;
    if (!metaRes.ok) return null;

    const meta = await metaRes.json();

    // 429 u otros errores pueden devolver { estado: 429 } sin datos
    if (!meta.datos || meta.estado === 429) return null;

    // Paso 2: descargar el fichero CAP (XML)
    const dataRes = await fetch(meta.datos, { signal: AbortSignal.timeout(10000) });
    if (!dataRes.ok) return null;

    const xml      = await dataRes.text();
    const warnings = _parseCapXml(xml);
    return warnings.length > 0 ? warnings[0] : null;

  } catch {
    // CORS, timeout, red — falla silenciosamente
    return null;
  }
}

/* ── Parser CAP 1.2 (XML) ─────────────────────────────────── */

/**
 * Parsea un fichero CAP 1.2 y devuelve avisos activos
 * ordenados por severidad descendente (Extreme → Severe → Moderate).
 * Ignora mensajes Minor, Test, Draft o Exercise.
 */
function _parseCapXml(xml) {
  // Solo mensajes con status "Actual"
  const alertStatus = _tag(xml, 'status');
  if (alertStatus && alertStatus !== 'Actual') return [];

  const SEV = { Extreme: 3, Severe: 2, Moderate: 1 };
  const warnings = [];

  const re = /<info[\s>]([\s\S]*?)<\/info>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const info = m[1];

    // Solo bloques en español
    const lang = _tag(info, 'language');
    if (lang && lang !== 'es-ES') continue;

    const severity = _tag(info, 'severity') || '';
    if (!SEV[severity]) continue; // Ignorar Minor y desconocidos

    warnings.push({
      event:       _tag(info, 'event')       || '',
      severity,
      urgency:     _tag(info, 'urgency')     || '',
      certainty:   _tag(info, 'certainty')   || '',
      onset:       _tag(info, 'onset')        || '',
      expires:     _tag(info, 'expires')      || '',
      headline:    _tag(info, 'headline')     || '',
      description: _tag(info, 'description') || '',
      area:        _tag(info, 'areaDesc')     || 'Tenerife',
    });
  }

  // Ordenar: más grave primero
  warnings.sort((a, b) => (SEV[b.severity] || 0) - (SEV[a.severity] || 0));
  return warnings;
}

/** Extrae el texto de una etiqueta XML simple (soporta CDATA). */
function _tag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  if (!m) return null;
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

window.aemet = { cargar };
