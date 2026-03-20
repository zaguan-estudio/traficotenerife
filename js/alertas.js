/**
 * alertas.js — Alertas de congestión con Gemini 2.0 Flash
 *
 * - analizarTodas()      → refresco silencioso en segundo plano (cada 5 min)
 * - lanzarConProgreso()  → análisis manual con UI de progreso en tiempo real
 *
 * Analiza únicamente las cámaras marcadas como favoritas.
 */

// URL del Cloudflare Worker — ver proxy/worker.js y proxy/wrangler.toml
const WORKER_BASE = 'https://traficotenerife.nameless-bush-75c2.workers.dev';

/* ── Road label por grupo ──────────────────────────────────── */
const ROAD_BY_GROUP = {
  'norte':       'TF-5',
  'sur':         'TF-1',
  'tf2':         'TF-2',
  'tun-litoral': 'Vía Litoral',
  'tun-vega':    'Tún. Vega',
  'tun-bicho':   'Tún. Bicho',
  'tun-guincho': 'Tún. Guincho',
};

/* ── Índice plano de todas las cámaras: id → {name, road} ─── */
function buildCamIndex() {
  const map = new Map();
  CAMERA_GROUPS.forEach(group => {
    const road = ROAD_BY_GROUP[group.id] ?? group.name;
    group.cameras.forEach(cam => map.set(cam.id, { name: cam.name, road }));
  });
  return map;
}

/* ── Lista dinámica: solo cámaras favoritas ────────────────── */
function getCamsToAnalyze() {
  const index = buildCamIndex();
  return getFavs()
    .filter(id => index.has(id))
    .map(id => ({ id, ...index.get(id) }));
}

/* ── Estado activo de alertas: Map<camId, alertData> ───────── */
const estadoActivo = new Map();

/* ── Helpers ───────────────────────────────────────────────── */
const domId = id => id.replace(/-/g, '_');
const delay = ms => new Promise(r => setTimeout(r, ms));

/* ── Análisis de una cámara via Worker ─────────────────────── */
async function analizarCamara(cam) {
  if (!WORKER_BASE) {
    return { _error: 'WORKER_BASE no configurado' };
  }
  try {
    const resp = await fetch(`${WORKER_BASE}/analizar`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ camId: cam.id }),
      signal:  AbortSignal.timeout(35000),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error ?? `HTTP ${resp.status}`);
    if (!data?.estado) throw new Error('Respuesta sin campo estado');
    return data;
  } catch (e) {
    console.warn(`[alertas] Error (${cam.name}):`, e.message);
    return { _error: e.message };
  }
}

/* ── Actualizar estadoActivo con resultado ─────────────────── */
function aplicarResultado(cam, res) {
  if (!res) return;
  if (res.estado === 'normal') {
    estadoActivo.delete(cam.id);
  } else {
    const hora = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    estadoActivo.set(cam.id, {
      estado:      res.estado,
      descripcion: res.descripcion,
      camName:     cam.name,
      road:        cam.road,
      hora
    });
  }
}

/* ════════════════════════════════════════════════════════════
   REFRESCO SILENCIOSO (automático, cada 5 min)
   ════════════════════════════════════════════════════════════ */
async function analizarTodas() {
  const cams = getCamsToAnalyze();
  if (!cams.length) return;
  const results = await Promise.allSettled(
    cams.map(cam => analizarCamara(cam).then(res => ({ cam, res })))
  );
  let changed = false;
  results.forEach(r => {
    if (r.status !== 'fulfilled' || !r.value.res) return;
    aplicarResultado(r.value.cam, r.value.res);
    changed = true;
  });
  if (changed) renderPanel();
}

/* ════════════════════════════════════════════════════════════
   ANÁLISIS MANUAL CON PROGRESO EN TIEMPO REAL
   ════════════════════════════════════════════════════════════ */
async function lanzarConProgreso() {
  const panel = document.getElementById('alertas-panel');
  if (!panel) return 0;

  const cams = getCamsToAnalyze();

  // Sin favoritas — mostrar aviso
  if (!cams.length) {
    panel.style.display = '';
    panel.innerHTML = `
      <div class="max-w-[1600px] mx-auto px-3 py-3">
        <div class="bg-white border border-[#e8e6dc] rounded-xl px-4 py-3 text-sm text-[#6b6860] shadow-sm">
          Añade cámaras a favoritas ⭐ para analizarlas con IA
        </div>
      </div>`;
    return 0;
  }

  const progEstado = new Map(cams.map(c => [c.id, 'pending']));
  const progDesc   = new Map();
  let   completadas = 0;

  panel.style.display = '';
  renderProgreso(panel, cams, progEstado, progDesc, completadas, false);

  await Promise.all(
    cams.map(async (cam) => {
      progEstado.set(cam.id, 'analyzing');
      updateFila(cam, 'analyzing', null);
      updateCabecera(completadas, false, cams.length);

      const res = await analizarCamara(cam);
      completadas++;

      if (res._error) {
        progEstado.set(cam.id, 'error');
        progDesc.set(cam.id, res._error);
      } else {
        progEstado.set(cam.id, res.estado);
        progDesc.set(cam.id, res.descripcion);
        aplicarResultado(cam, res);
      }

      updateFila(cam, progEstado.get(cam.id), progDesc.get(cam.id));
      updateCabecera(completadas, completadas === cams.length, cams.length);
    })
  );

  const incidencias = estadoActivo.size;
  const hayErrores = [...progEstado.values()].some(e => e === 'error');

  // Si hay errores, mantener el panel de progreso abierto para depurar
  if (!hayErrores) {
    await delay(1600);
    renderPanel();
  }

  return incidencias;
}

/* ── Render inicial del panel de progreso ──────────────────── */
function renderProgreso(panel, cams, estados, descs, completadas, done) {
  panel.innerHTML = `
    <div class="max-w-[1600px] mx-auto px-3 py-3">
      <div class="bg-white border border-[#e8e6dc] rounded-xl overflow-hidden shadow-sm">
        ${cabecerHTML(completadas, done, cams.length)}
        <div class="px-4 pt-2 pb-3 text-xs text-[#6b6860]">
          Comprobando ${cams.length} cámara${cams.length !== 1 ? 's' : ''} favorita${cams.length !== 1 ? 's' : ''}
        </div>
        <div id="ia-rows" class="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-6">
          ${cams.map(cam => filaHTML(cam, estados.get(cam.id), descs.get(cam.id))).join('')}
        </div>
      </div>
    </div>`;
}

/* ── HTML de la cabecera del panel ─────────────────────────── */
function cabecerHTML(completadas, done, total) {
  const spinnerOrCheck = done
    ? `<span class="text-green-500">✓</span>`
    : `<span style="display:inline-block;animation:spin 1s linear infinite" class="text-[#d97757]">⟳</span>`;
  const subtitulo = done
    ? `<span class="text-xs text-[#6b6860]">· Análisis completado</span>`
    : `<span class="text-xs text-[#6b6860]">· Analizando imágenes de tráfico en tiempo real</span>`;
  return `
    <div id="ia-cabecera" class="px-4 py-3 border-b border-[#e8e6dc] bg-[#f5f3ee] flex items-center gap-2">
      ${spinnerOrCheck}
      <span class="font-semibold text-sm text-[#141413]">Gemini 2.0 Flash</span>
      ${subtitulo}
      <span id="ia-counter" class="ml-auto text-xs font-mono text-[#6b6860]">${completadas}/${total}</span>
    </div>`;
}

/* ── Actualiza solo la cabecera (sin re-renderizar filas) ───── */
function updateCabecera(completadas, done, total) {
  const cab = document.getElementById('ia-cabecera');
  if (!cab) return;
  cab.outerHTML = cabecerHTML(completadas, done, total);
}

/* ── HTML de una fila de cámara ────────────────────────────── */
function filaHTML(cam, estado, desc) {
  const id = `ia-row-${domId(cam.id)}`;
  return `<div id="${id}" class="flex items-baseline gap-2 text-xs py-0.5 min-w-0">${filaContenido(cam, estado, desc)}</div>`;
}

function filaContenido(cam, estado, desc) {
  const descSpan = desc
    ? `<span class="truncate opacity-70">${desc}</span>`
    : '';

  switch (estado) {
    case 'pending':
      return `<span class="shrink-0 w-4 text-[#c8c6c0]">○</span>
              <span class="text-[#b0aea5]">${cam.name}</span>`;
    case 'analyzing':
      return `<span class="shrink-0 w-4" style="display:inline-block;animation:spin 1s linear infinite">⟳</span>
              <span class="text-[#6b6860]">${cam.name}</span>
              <span class="text-[#b0aea5] italic">analizando…</span>`;
    case 'normal':
      return `<span class="shrink-0 w-4 text-green-500">✓</span>
              <span class="font-medium text-green-700">${cam.name}</span>
              ${descSpan ? `<span class="truncate text-green-600 opacity-70">${desc}</span>` : ''}`;
    case 'denso':
      return `<span class="shrink-0 w-4">🟡</span>
              <span class="font-medium text-amber-700">${cam.name}</span>
              ${descSpan ? `<span class="truncate text-amber-600 opacity-70">${desc}</span>` : ''}`;
    case 'colapso':
      return `<span class="shrink-0 w-4">🔴</span>
              <span class="font-semibold text-red-700">${cam.name}</span>
              ${descSpan ? `<span class="truncate text-red-600 opacity-70">${desc}</span>` : ''}`;
    case 'error':
      return `<span class="shrink-0 w-4 text-red-400">✕</span>
              <span class="text-[#b0aea5]">${cam.name}</span>
              <span class="text-red-400 italic font-mono">${desc || 'sin respuesta'}</span>`;
    default:
      return '';
  }
}

/* ── Actualiza solo una fila sin tocar el resto ────────────── */
function updateFila(cam, estado, desc) {
  const el = document.getElementById(`ia-row-${domId(cam.id)}`);
  if (el) el.innerHTML = filaContenido(cam, estado, desc);
}

/* ════════════════════════════════════════════════════════════
   RENDER DE ALERTAS (resultado final)
   ════════════════════════════════════════════════════════════ */
function renderPanel() {
  const panel = document.getElementById('alertas-panel');
  if (!panel) return;

  if (estadoActivo.size === 0) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    actualizarOverlaysCamaras();
    return;
  }

  const items = [...estadoActivo.values()].sort((a, b) =>
    (a.estado === 'colapso' ? 0 : 1) - (b.estado === 'colapso' ? 0 : 1)
  );

  panel.style.display = '';
  panel.innerHTML = `
    <div class="max-w-[1600px] mx-auto px-3 py-2.5 flex flex-wrap gap-2">
      ${items.map(tarjetaHTML).join('')}
    </div>`;

  actualizarOverlaysCamaras();
}

/* ── Overlays de alerta sobre las tarjetas de cámara ───────── */
function actualizarOverlaysCamaras() {
  // Limpiar todos los overlays existentes
  document.querySelectorAll('[data-cam-alert]').forEach(el => {
    el.style.display = 'none';
    el.style.background = '';
    el.innerHTML = '';
  });
  document.querySelectorAll('[data-cam-alert-text]').forEach(el => {
    el.style.display = 'none';
    el.style.background = '';
    el.style.color = '';
    el.style.borderTop = '';
    el.textContent = '';
  });

  // Aplicar overlays para cada alerta activa
  estadoActivo.forEach(({ estado, descripcion }, camId) => {
    const esColapso = estado === 'colapso';
    const icon      = esColapso ? '🔴' : '🟡';
    const label     = esColapso ? 'Colapso' : 'Tráfico denso';
    const badgeBg   = esColapso ? 'rgba(185,28,28,0.82)' : 'rgba(180,83,9,0.82)';
    const textBg    = esColapso ? '#fef2f2' : '#fff7ed';
    const textClr   = esColapso ? '#b91c1c' : '#9a3412';
    const borderClr = esColapso ? '#fecaca' : '#fed7aa';

    document.querySelectorAll(`[data-cam-alert="${camId}"]`).forEach(el => {
      el.style.display    = '';
      el.style.background = badgeBg;
      el.innerHTML = `<span style="font-size:0.9rem;line-height:1">${icon}</span><span>${label}</span>`;
    });

    document.querySelectorAll(`[data-cam-alert-text="${camId}"]`).forEach(el => {
      el.style.display    = '';
      el.style.background = textBg;
      el.style.color      = textClr;
      el.style.borderTop  = `1px solid ${borderClr}`;
      el.textContent      = descripcion;
    });
  });
}

function tarjetaHTML({ estado, descripcion, camName, road, hora }) {
  const c = estado === 'colapso'
    ? { bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-800',   badge: 'bg-red-100 text-red-700',    icon: '🔴', label: 'Colapso'       }
    : { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700', icon: '🟡', label: 'Tráfico denso' };

  return `<div class="flex items-start gap-2 border ${c.border} ${c.bg} rounded-lg px-3 py-2 shadow-sm">
    <span class="mt-0.5 shrink-0 text-base">${c.icon}</span>
    <div class="min-w-0">
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="font-semibold ${c.text} text-sm">${camName}</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium ${c.badge}">${c.label}</span>
        <span class="text-[10px] text-[#6b6860]">${road} · ${hora}</span>
      </div>
      <p class="text-xs ${c.text} opacity-75 mt-0.5 leading-tight">${descripcion}</p>
    </div>
  </div>`;
}

/* ── API pública ───────────────────────────────────────────── */
window.alertas = { analizarTodas, lanzarConProgreso, actualizarOverlaysCamaras };
