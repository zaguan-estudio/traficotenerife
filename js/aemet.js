/**
 * Avisos meteorológicos adversos — AEMET OpenData
 * Área: Isla de Tenerife (código 61)
 *
 * Para activar, añade el secret de AEMET al worker:
 *   cd proxy && wrangler secret put AEMET_API_KEY
 *
 * Obtén tu clave gratuita (sin coste) en:
 *   https://opendata.aemet.es/centrodedescargas/inicio
 */

const WORKER_BASE = 'https://traficotenerife.nameless-bush-75c2.workers.dev';

/**
 * Devuelve el aviso más crítico activo para Tenerife, o null si no hay ninguno.
 * @returns {Promise<object|null>}
 */
async function cargar() {
  try {
    const res = await fetch(`${WORKER_BASE}/aemet-avisos`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error || !Array.isArray(data.warnings) || data.warnings.length === 0) return null;
    return data.warnings[0]; // Ya viene ordenado por severidad descendente
  } catch {
    return null;
  }
}

window.aemet = { cargar };
