/**
 * alertas.js — Alertas de congestión con IA (Gemini)
 *
 * Flujo por ciclo (cada 5 min):
 *   1. Intenta Gemini Nano in-browser (window.LanguageModel) — sin key, local
 *   2. Fallback automático a Gemini API cloud (gemini-2.0-flash)
 *   3. Actualiza #alertas-panel: añade/actualiza/elimina tarjetas
 *   4. Las alertas desaparecen automáticamente cuando la cámara vuelve a normal
 */

const GEMINI_API_KEY  = 'AIzaSyDL-h5BlwG091qwHaoqnBanIUIXJQTMOR4';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

/* ── Cámaras estratégicas monitorizadas (8 puntos clave) ───── */
const MONITORED_CAMS = [
  { id: '2701001-26',   name: 'TF-5 · Norte 7',      road: 'TF-5'    },
  { id: '2701002-516',  name: 'TF-5 · pk A1',         road: 'TF-5'    },
  { id: '2701002-534',  name: 'TF-5 · pk A10',        road: 'TF-5'    },
  { id: '2701001-49',   name: 'TF-1 · Sur 1',         road: 'TF-1'    },
  { id: '2701002-1014', name: 'TF-1 · pk A4',         road: 'TF-1'    },
  { id: '2701002-211',  name: 'TF-2 · Sta. María 1',  road: 'TF-2'    },
  { id: '2701001-39',   name: 'TF-2 · Chumberas 1',   road: 'TF-2'    },
  { id: '2701002-911',  name: 'Vía Litoral · 1',      road: 'Litoral' },
];

const PROMPT = `Analiza esta imagen de una cámara de tráfico en Tenerife, España.
Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin texto extra):
{"estado":"normal|denso|colapso","descripcion":"frase corta máx 12 palabras"}
Criterios:
- normal: circulación fluida, sin retenciones visibles
- denso: tráfico lento o congestión moderada
- colapso: retención importante, vehículos parados o muy lentos`;

/* ── Estado activo: Map<camId, alertData> ──────────────────── */
const estadoActivo = new Map();

/* ── Captura de imagen como base64 ────────────────────────── */
async function fetchImageBase64(camId) {
  const url = `https://cic.tenerife.es/e-Traffic3/data/camara-${camId}.jpg?t=${Date.now()}`;
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

/* ── Gemini Nano in-browser (experimental) ─────────────────── */
async function analizarConNano(base64) {
  // La API multimodal de Gemini Nano aún no es estable en producción.
  // Conservamos la estructura para futura integración.
  const nano = window.ai?.languageModel ?? window.LanguageModel;
  if (!nano) throw new Error('Nano N/A');
  throw new Error('Nano multimodal no disponible aún');
}

/* ── Gemini API cloud (gemini-2.0-flash) ───────────────────── */
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
  if (!resp.ok) throw new Error(`Gemini API ${resp.status}`);

  const data  = await resp.json();
  const text  = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const clean = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  return JSON.parse(clean);
}

/* ── Análisis de una cámara (Nano → API) ───────────────────── */
async function analizarCamara(cam) {
  let base64;
  try {
    base64 = await fetchImageBase64(cam.id);
  } catch (e) {
    console.warn(`[alertas] Imagen no disponible (${cam.name}):`, e.message);
    return null;
  }

  for (const fn of [analizarConNano, analizarConAPI]) {
    try {
      const result = await fn(base64);
      if (result?.estado) return result;
    } catch { /* continúa con el siguiente */ }
  }

  console.warn(`[alertas] Sin resultado para ${cam.name}`);
  return null;
}

/* ── Ciclo completo: analiza todas las cámaras ─────────────── */
async function analizarTodas() {
  const results = await Promise.allSettled(
    MONITORED_CAMS.map(cam => analizarCamara(cam).then(res => ({ cam, res })))
  );

  let changed = false;
  results.forEach(r => {
    if (r.status !== 'fulfilled' || !r.value.res) return;
    const { cam, res } = r.value;

    if (res.estado === 'normal') {
      if (estadoActivo.has(cam.id)) { estadoActivo.delete(cam.id); changed = true; }
    } else {
      const hora = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      estadoActivo.set(cam.id, {
        estado:      res.estado,
        descripcion: res.descripcion,
        camName:     cam.name,
        road:        cam.road,
        hora
      });
      changed = true;
    }
  });

  if (changed) renderPanel();
}

/* ── Render del panel de alertas ───────────────────────────── */
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
    </div>
  `;
}

function tarjetaHTML({ estado, descripcion, camName, road, hora }) {
  const c = estado === 'colapso'
    ? { bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-800',   badge: 'bg-red-100 text-red-700',   icon: '🔴', label: 'Colapso'       }
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
window.alertas = { analizarTodas };
