/**
 * alertas.js — Alertas de congestión con Gemini 2.0 Flash
 *
 * - analizarTodas()      → refresco silencioso en segundo plano (cada 5 min)
 * - lanzarConProgreso()  → análisis manual con UI de progreso en tiempo real
 */

const GEMINI_API_KEY  = 'AIzaSyDL-h5BlwG091qwHaoqnBanIUIXJQTMOR4';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// Proxy propio con CORS headers — ver proxy/worker.js para instrucciones de despliegue.
// Formato: https://TU-WORKER.workers.dev  (sin barra final)
const PROXY_BASE = '';

const MONITORED_CAMS = [
  { id: '2701002-516', name: 'TF-5 · pk A1', road: 'TF-5' },
  { id: '2701002-517', name: 'TF-5 · pk B1', road: 'TF-5' },
  { id: '2701002-519', name: 'TF-5 · pk A2', road: 'TF-5' },
  { id: '2701002-520', name: 'TF-5 · pk B2', road: 'TF-5' },
  { id: '2701002-521', name: 'TF-5 · pk A3', road: 'TF-5' },
  { id: '2701002-522', name: 'TF-5 · pk B3', road: 'TF-5' },
  { id: '2701002-523', name: 'TF-5 · pk A4', road: 'TF-5' },
  { id: '2701002-525', name: 'TF-5 · pk B4', road: 'TF-5' },
  { id: '2701002-524', name: 'TF-5 · pk A5', road: 'TF-5' },
  { id: '2701002-527', name: 'TF-5 · pk B5', road: 'TF-5' },
  { id: '2701002-526', name: 'TF-5 · pk A6', road: 'TF-5' },
  { id: '2701002-529', name: 'TF-5 · pk B6', road: 'TF-5' },
  { id: '2701002-528', name: 'TF-5 · pk A7', road: 'TF-5' },
];

const PROMPT = `Analiza esta imagen de una cámara de tráfico en Tenerife, España.
Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin texto extra):
{"estado":"normal|denso|colapso","descripcion":"frase corta máx 12 palabras"}
Criterios:
- normal: circulación fluida, sin retenciones visibles
- denso: tráfico lento o congestión moderada
- colapso: retención importante, vehículos parados o muy lentos`;

/* ── Estado activo de alertas: Map<camId, alertData> ───────── */
const estadoActivo = new Map();

/* ── Helpers ───────────────────────────────────────────────── */
const domId = id => id.replace(/-/g, '_');
const delay = ms => new Promise(r => setTimeout(r, ms));

/* ── Captura de imagen como base64 a través del proxy ─────── */
async function fetchImageBase64(camId) {
  const t   = Date.now();
  const url = PROXY_BASE
    ? `${PROXY_BASE}/camara-${camId}.jpg?t=${t}`          // proxy propio (CORS OK)
    : `https://cic.tenerife.es/e-Traffic3/data/camara-${camId}.jpg?t=${t}`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror   = reject;
    reader.readAsDataURL(blob);
  });
}

/* ── Gemini API — imagen como base64 ──────────────────────── */
async function analizarConAPI(base64) {
  const body = JSON.stringify({
    contents: [{
      parts: [
        { text: PROMPT },
        { inlineData: { mimeType: 'image/jpeg', data: base64 } }
      ]
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 120 }
  });
  const resp = await fetch(GEMINI_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(25000)
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Gemini ${resp.status}: ${err?.error?.message ?? resp.statusText}`);
  }
  const data  = await resp.json();
  const text  = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const clean = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  return JSON.parse(clean);
}

/* ── Análisis de una cámara ────────────────────────────────── */
async function analizarCamara(cam) {
  let base64;
  try {
    base64 = await fetchImageBase64(cam.id);
  } catch (e) {
    console.warn(`[alertas] Imagen no disponible (${cam.name}):`, e.message);
    return null;
  }
  try {
    const result = await analizarConAPI(base64);
    if (result?.estado) return result;
    throw new Error('Respuesta sin campo estado');
  } catch (e) {
    console.warn(`[alertas] Error Gemini (${cam.name}):`, e.message);
    return null;
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
  const results = await Promise.allSettled(
    MONITORED_CAMS.map(cam => analizarCamara(cam).then(res => ({ cam, res })))
  );
  let changed = false;
  results.forEach(r => {
    if (r.status !== 'fulfilled' || !r.value.res) return;
    const antes = estadoActivo.has(r.value.cam.id);
    aplicarResultado(r.value.cam, r.value.res);
    if (antes !== estadoActivo.has(r.value.cam.id)) changed = true;
    else changed = true; // descripción puede haber cambiado
  });
  if (changed) renderPanel();
}

/* ════════════════════════════════════════════════════════════
   ANÁLISIS MANUAL CON PROGRESO EN TIEMPO REAL
   ════════════════════════════════════════════════════════════ */
async function lanzarConProgreso() {
  const panel = document.getElementById('alertas-panel');
  if (!panel) return 0;

  // Estado de progreso por cámara
  const progEstado = new Map(MONITORED_CAMS.map(c => [c.id, 'pending']));
  const progDesc   = new Map();
  let   completadas = 0;

  // Render inicial — todas pendientes
  panel.style.display = '';
  renderProgreso(panel, progEstado, progDesc, completadas, false);

  // Analizar en paralelo, actualizar fila al terminar cada una
  await Promise.all(
    MONITORED_CAMS.map(async (cam) => {
      progEstado.set(cam.id, 'analyzing');
      updateFila(cam, 'analyzing', null);
      updateCabecera(completadas, false);

      const res = await analizarCamara(cam);
      completadas++;

      if (!res) {
        progEstado.set(cam.id, 'error');
        progDesc.set(cam.id, 'sin respuesta');
      } else {
        progEstado.set(cam.id, res.estado);
        progDesc.set(cam.id, res.descripcion);
        aplicarResultado(cam, res);
      }

      updateFila(cam, progEstado.get(cam.id), progDesc.get(cam.id));
      updateCabecera(completadas, completadas === MONITORED_CAMS.length);
    })
  );

  const incidencias = estadoActivo.size;

  // Mostrar resumen final 1.5 s antes de transición a alertas
  await delay(1600);
  renderPanel();

  return incidencias;
}

/* ── Render inicial del panel de progreso ──────────────────── */
function renderProgreso(panel, estados, descs, completadas, done) {
  panel.innerHTML = `
    <div class="max-w-[1600px] mx-auto px-3 py-3">
      <div class="bg-white border border-[#e8e6dc] rounded-xl overflow-hidden shadow-sm">
        ${cabecerHTML(completadas, done)}
        <div class="px-4 pt-2 pb-3 text-xs text-[#6b6860]">
          Comprobando ${MONITORED_CAMS.length} puntos kilométricos en TF-5 · Autopista del Norte
        </div>
        <div id="ia-rows" class="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-6">
          ${MONITORED_CAMS.map(cam => filaHTML(cam, estados.get(cam.id), descs.get(cam.id))).join('')}
        </div>
      </div>
    </div>`;
}

/* ── HTML de la cabecera del panel ─────────────────────────── */
function cabecerHTML(completadas, done) {
  const total = MONITORED_CAMS.length;
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
function updateCabecera(completadas, done) {
  const cab = document.getElementById('ia-cabecera');
  if (!cab) return;
  cab.outerHTML = cabecerHTML(completadas, done);
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
      return `<span class="shrink-0 w-4 text-[#b0aea5]">✕</span>
              <span class="text-[#b0aea5]">${cam.name}</span>
              <span class="text-[#c8c6c0] italic">sin señal</span>`;
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
window.alertas = { analizarTodas, lanzarConProgreso };
