/**
 * Tráfico Tenerife – App Logic
 * Estilos: Tailwind CSS v4 (compilado con Vite)
 */

const REFRESH_INTERVAL_MS = 30000;
const SCAN_MIN = 1;
const SCAN_MAX = 100;

let refreshTimer    = null;
let countdownTimer  = null;
let countdownRemain = REFRESH_INTERVAL_MS / 1000;
let autoRefreshOn   = true;
let openModalCamId  = null;
let allExpanded     = true;
let scannerMode     = false;

const $ = id => document.getElementById(id);

// Sanitiza IDs con guiones para uso en atributos DOM
function domSafe(camId) { return camId.replace(/-/g, '_'); }

/* ── Reloj ────────────────────────────────────────────────── */
function updateClock() {
  const el = $('current-time');
  if (el) el.textContent = new Date().toLocaleTimeString('es-ES');
}
updateClock();
setInterval(updateClock, 1000);

/* ── RENDER PRINCIPAL ─────────────────────────────────────── */
function init() {
  const main = $('main-content');
  if (!main) return;
  main.innerHTML = '';
  main.appendChild(renderControls());
  CAMERA_GROUPS.forEach(g => main.appendChild(renderGroup(g)));
  updateNavBadges();
  initSectionCollapse();
  resetCountdown();
}

/* ── Barra de controles ───────────────────────────────────── */
const BTN_BASE   = 'bg-[#1e1e1e] border border-neutral-800 text-neutral-400 px-3.5 py-1.5 rounded text-xs cursor-pointer transition-all flex items-center gap-1.5 hover:border-[#e8a000] hover:text-[#e8a000]';
const BTN_ACTIVE = 'bg-[#e8a000]/15 border border-[#e8a000] text-[#e8a000] px-3.5 py-1.5 rounded text-xs cursor-pointer transition-all flex items-center gap-1.5';

function renderControls() {
  const wrap = document.createElement('div');
  wrap.className = 'flex items-center gap-2.5 py-3 flex-wrap';
  wrap.innerHTML = `
    <button id="btn-auto-refresh" class="${BTN_ACTIVE}">↺ Auto-actualizar</button>
    <button id="btn-refresh-now"  class="${BTN_BASE}">⟳ Actualizar ahora</button>
    <button id="btn-expand-all"   class="${BTN_BASE}">⊟ Colapsar todo</button>
    <button id="btn-scanner"      class="${BTN_BASE}">🔍 Explorar IDs</button>
    <div id="countdown-label"
         class="ml-auto text-xs text-neutral-500 flex items-center gap-1.5">
      Próx. actualización:
      <strong id="countdown-secs">${countdownRemain}</strong>s
      <div class="w-20 h-0.5 bg-neutral-800 rounded-full overflow-hidden">
        <div id="countdown-fill"
             class="h-full bg-[#e8a000] rounded-full"
             style="width:100%; transition: width 1s linear;"></div>
      </div>
    </div>
  `;
  wrap.querySelector('#btn-auto-refresh').addEventListener('click', toggleAutoRefresh);
  wrap.querySelector('#btn-refresh-now').addEventListener('click', refreshAllCams);
  wrap.querySelector('#btn-expand-all').addEventListener('click', toggleAllSections);
  wrap.querySelector('#btn-scanner').addEventListener('click', toggleScannerMode);
  return wrap;
}

/* ── Grupo / sección ──────────────────────────────────────── */
function renderGroup(group) {
  const section = document.createElement('section');
  section.className = 'camera-section my-6 scroll-mt-28';
  section.id = `sec-${group.id}`;

  const n = group.cameras.length;
  const header = document.createElement('div');
  header.className = 'flex items-center gap-3 px-4 py-3.5 bg-gradient-to-r from-[#1e1e1e] to-[#161616] border-l-4 border-[#e8a000] rounded-r-lg mb-3 cursor-pointer select-none transition-all hover:from-[#232323] hover:to-[#1a1a1a]';
  header.setAttribute('role', 'button');
  header.setAttribute('aria-expanded', 'true');
  header.setAttribute('data-section', group.id);
  header.innerHTML = `
    <span class="text-2xl min-w-7 text-center" aria-hidden="true">${group.icon}</span>
    <div class="flex-1 min-w-0">
      <div class="text-[15px] font-bold text-neutral-100 tracking-wide">${group.name}</div>
      <div class="text-[11px] text-neutral-500 mt-0.5">${group.subtitle}</div>
    </div>
    <span class="text-[11px] text-[#e8a000] bg-[#e8a000]/10 px-2.5 py-0.5 rounded-full border border-[#e8a000]/20 whitespace-nowrap shrink-0">
      ${n} cámara${n !== 1 ? 's' : ''}
    </span>
    <span class="text-neutral-500 text-sm shrink-0 transition-transform duration-300" data-toggle aria-hidden="true">▾</span>
  `;
  section.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 overflow-hidden';
  grid.style.transition = 'max-height 0.5s ease, opacity 0.3s ease';
  grid.id = `grid-${group.id}`;
  group.cameras.forEach(cam => grid.appendChild(makeCamCard(cam.id, cam.name)));
  section.appendChild(grid);

  return section;
}

/* ── Tarjeta de cámara ────────────────────────────────────── */
function makeCamCard(camId, camName) {
  const domId    = `cam_${domSafe(camId)}`;
  const card     = document.createElement('div');
  card.className = 'bg-[#1a1a1a] border border-neutral-800 rounded-lg overflow-hidden transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-xl hover:border-[#e8a000] group';
  card.id = `card-${domId}`;

  const imgUrl   = getCameraUrl(camId);
  const camIdEsc = camId.replace(/'/g, "\\'");
  const nameEsc  = camName.replace(/'/g, "\\'");

  card.innerHTML = `
    <div class="relative w-full aspect-[4/3] bg-[#0a0a0a] overflow-hidden"
         role="button" aria-label="Ampliar ${camName}" tabindex="0">

      <!-- Skeleton shimmer -->
      <div class="cam-shimmer" id="skel-${domId}"></div>

      <!-- Imagen de cámara -->
      <img id="img-${domId}"
           src="${imgUrl}"
           alt="Cámara: ${camName}"
           loading="lazy"
           class="w-full h-full object-cover block transition-opacity duration-300 opacity-30"
      />

      <!-- Overlay de error -->
      <div id="err-${domId}"
           style="display:none"
           class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/85 text-neutral-500 text-xs text-center p-3">
        <span class="text-3xl">📷</span>
        <span>Señal no disponible</span>
        <button class="bg-transparent border border-neutral-700 text-neutral-500 px-2 py-1 rounded text-[11px] cursor-pointer hover:border-[#e8a000] hover:text-[#e8a000] transition-all mt-1 whitespace-nowrap"
                onclick="retryCam('${camIdEsc}',event)">Reintentar</button>
      </div>

      <!-- Badge EN VIVO -->
      <span id="live-${domId}"
            class="absolute top-1.5 left-1.5 bg-black/65 text-green-500 text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 tracking-wide">
        <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse block"></span>EN VIVO
      </span>

      <!-- Badge ampliar (hover) -->
      <span class="absolute top-1.5 right-1.5 bg-black/70 text-[#e8a000] text-[10px] px-1.5 py-0.5 rounded hidden group-hover:flex items-center gap-1">
        🔍 Ampliar
      </span>
    </div>

    <!-- Footer de la tarjeta -->
    <div class="px-2.5 py-2 flex items-center justify-between gap-2 border-t border-neutral-800">
      <span class="text-xs font-semibold text-neutral-100 truncate flex-1"
            title="${camName}">${camName}</span>
      <div class="flex gap-1 shrink-0">
        <button class="bg-transparent border border-neutral-800 text-neutral-500 px-2 py-1 rounded text-[11px] cursor-pointer transition-all hover:border-[#e8a000] hover:text-[#e8a000]"
                title="Ver ampliada"
                onclick="openModal('${camIdEsc}','${nameEsc}',event)">⛶</button>
        <button class="bg-transparent border border-neutral-800 text-neutral-500 px-2 py-1 rounded text-[11px] cursor-pointer transition-all hover:border-[#e8a000] hover:text-[#e8a000]"
                title="Refrescar"
                onclick="refreshSingleCam('${camIdEsc}',event)">↺</button>
      </div>
    </div>
  `;

  const img  = card.querySelector(`#img-${domId}`);
  const skel = card.querySelector(`#skel-${domId}`);
  const err  = card.querySelector(`#err-${domId}`);
  const live = card.querySelector(`#live-${domId}`);

  img.addEventListener('load', () => {
    img.classList.remove('opacity-30');
    if (skel) skel.style.display = 'none';
    if (err)  err.style.display  = 'none';
    if (live) live.innerHTML =
      '<span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse block"></span>EN VIVO';
    if (live) live.className = live.className.replace('text-red-500', 'text-green-500');
  });

  img.addEventListener('error', () => {
    img.classList.remove('opacity-30');
    if (skel) skel.style.display = 'none';
    if (err)  err.style.display  = 'flex';
    if (live) {
      live.className = live.className.replace('text-green-500', 'text-red-500');
      live.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-red-500 block"></span>SIN SEÑAL';
    }
  });

  card.querySelector('[role="button"]').addEventListener('click', () => openModal(camId, camName));
  card.querySelector('[role="button"]').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') openModal(camId, camName);
  });

  return card;
}

/* ── Badges de navegación ─────────────────────────────────── */
function updateNavBadges() {
  CAMERA_GROUPS.forEach(g => {
    const el = $(`badge-${g.id}`);
    if (el) el.textContent = g.cameras.length;
  });
}

/* ── Colapsar / expandir secciones ───────────────────────── */
function initSectionCollapse() {
  document.querySelectorAll('[data-section]').forEach(header => {
    header.addEventListener('click', () => {
      const id   = header.getAttribute('data-section');
      const grid = $(`grid-${id}`);
      const exp  = header.getAttribute('aria-expanded') === 'true';
      toggleSection(header, grid, !exp);
    });
  });
}

function toggleSection(header, grid, expand) {
  if (!grid) return;
  const toggle = header.querySelector('[data-toggle]');
  if (expand) {
    grid.style.maxHeight    = grid.scrollHeight + 'px';
    grid.style.opacity      = '1';
    grid.style.pointerEvents = '';
    header.setAttribute('aria-expanded', 'true');
    if (toggle) toggle.style.transform = '';
  } else {
    grid.style.maxHeight = grid.scrollHeight + 'px';
    requestAnimationFrame(() => {
      grid.style.maxHeight    = '0';
      grid.style.opacity      = '0';
      grid.style.pointerEvents = 'none';
    });
    header.setAttribute('aria-expanded', 'false');
    if (toggle) toggle.style.transform = 'rotate(-90deg)';
  }
}

function toggleAllSections() {
  allExpanded = !allExpanded;
  CAMERA_GROUPS.forEach(g => {
    const h  = document.querySelector(`[data-section="${g.id}"]`);
    const gr = $(`grid-${g.id}`);
    toggleSection(h, gr, allExpanded);
  });
  const btn = $('btn-expand-all');
  if (btn) btn.innerHTML = allExpanded ? '⊟ Colapsar todo' : '⊞ Expandir todo';
}

/* ── Refresco de cámaras ──────────────────────────────────── */
function refreshAllCams() {
  if (scannerMode) return;
  CAMERA_GROUPS.forEach(g => g.cameras.forEach(c => refreshSingleCam(c.id)));
  resetCountdown();
  if (openModalCamId !== null) {
    const m = $('modal-img');
    if (m) m.src = getCameraUrl(openModalCamId);
  }
}

function refreshSingleCam(camId, e) {
  if (e) e.stopPropagation();
  const domId = `cam_${domSafe(camId)}`;
  const img   = $(`img-${domId}`);
  const skel  = $(`skel-${domId}`);
  const err   = $(`err-${domId}`);
  const live  = $(`live-${domId}`);
  if (!img) return;
  if (skel) skel.style.display = '';
  if (err)  err.style.display  = 'none';
  img.classList.add('opacity-30');
  if (live) {
    live.className = live.className.replace('text-red-500', 'text-green-500');
    live.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse block"></span>EN VIVO';
  }
  img.src = getCameraUrl(camId);
}

function retryCam(camId, e) {
  if (e) e.stopPropagation();
  refreshSingleCam(camId);
}

/* ── Countdown de auto-refresco ───────────────────────────── */
function resetCountdown() {
  clearInterval(refreshTimer);
  clearInterval(countdownTimer);
  if (!autoRefreshOn) return;

  countdownRemain = REFRESH_INTERVAL_MS / 1000;
  updateCountdownUI();

  countdownTimer = setInterval(() => {
    countdownRemain = Math.max(0, countdownRemain - 1);
    updateCountdownUI();
  }, 1000);

  refreshTimer = setInterval(() => {
    refreshAllCams();
    countdownRemain = REFRESH_INTERVAL_MS / 1000;
  }, REFRESH_INTERVAL_MS);
}

function updateCountdownUI() {
  const fill = $('countdown-fill');
  const secs = $('countdown-secs');
  const pct  = (countdownRemain / (REFRESH_INTERVAL_MS / 1000)) * 100;
  if (fill) fill.style.width = pct + '%';
  if (secs) secs.textContent = countdownRemain;
}

function toggleAutoRefresh() {
  autoRefreshOn = !autoRefreshOn;
  const btn = $('btn-auto-refresh');
  const lbl = $('countdown-label');
  if (btn) btn.className = autoRefreshOn ? BTN_ACTIVE : BTN_BASE;
  if (autoRefreshOn) {
    resetCountdown();
    if (lbl) lbl.style.opacity = '1';
  } else {
    clearInterval(refreshTimer);
    clearInterval(countdownTimer);
    if (lbl) lbl.style.opacity = '0.4';
  }
}

/* ── MODO ESCÁNER ─────────────────────────────────────────── */
let scanAbortController = null;

function toggleScannerMode() {
  scannerMode = !scannerMode;
  const main = $('main-content');
  const btn  = $('btn-scanner');
  if (!main) return;

  if (scannerMode) {
    document.querySelectorAll('.camera-section').forEach(s => s.style.display = 'none');
    clearInterval(refreshTimer);
    clearInterval(countdownTimer);
    if (btn) { btn.className = BTN_ACTIVE; btn.textContent = '✕ Cerrar escáner'; }
    showScannerPanel(main);
  } else {
    if (scanAbortController) { scanAbortController.abort(); scanAbortController = null; }
    const panel = $('scanner-panel');
    if (panel) panel.remove();
    document.querySelectorAll('.camera-section').forEach(s => s.style.display = '');
    if (btn) { btn.className = BTN_BASE; btn.textContent = '🔍 Explorar IDs'; }
    resetCountdown();
  }
}

function showScannerPanel(container) {
  const panel = document.createElement('div');
  panel.id = 'scanner-panel';
  panel.className = 'py-4';
  panel.innerHTML = `
    <div class="bg-[#111] border border-neutral-800 rounded-lg p-5 mb-5">
      <div class="text-lg font-bold text-[#e8a000] mb-2">🔍 Modo Escáner — IDs activos</div>
      <div class="text-xs text-neutral-400 mb-3 break-all">
        Probando IDs del <strong class="text-neutral-200">${SCAN_MIN}</strong>
        al <strong class="text-neutral-200">${SCAN_MAX}</strong>
        · URL: <code class="bg-white/5 px-1.5 py-0.5 rounded text-[#e8a000]">${CIC_BASE}camara-SERIE-{N}.jpg</code>
      </div>
      <div class="bg-neutral-800 rounded-full h-1.5 overflow-hidden mb-2">
        <div class="h-full w-0 bg-[#e8a000] rounded-full" id="scan-bar"
             style="transition: width 0.3s ease;"></div>
      </div>
      <div class="text-xs text-neutral-400" id="scan-status">Iniciando exploración…</div>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
         id="scanner-grid"></div>
  `;
  container.appendChild(panel);
  runScanner();
}

async function runScanner() {
  scanAbortController = new AbortController();
  const grid     = $('scanner-grid');
  const statusEl = $('scan-status');
  const barEl    = $('scan-bar');
  const total    = SCAN_MAX - SCAN_MIN + 1;
  let   found    = 0;

  for (let n = SCAN_MIN; n <= SCAN_MAX; n++) {
    if (scanAbortController.signal.aborted) break;
    const pct = Math.round(((n - SCAN_MIN) / total) * 100);
    if (barEl)    barEl.style.width = pct + '%';
    if (statusEl) statusEl.textContent =
      `Probando ID ${n}/${SCAN_MAX} · ${found} cámara${found !== 1 ? 's' : ''} encontrada${found !== 1 ? 's' : ''}`;

    const ok = await probeImage(getCameraUrl(n), scanAbortController.signal);
    if (ok && grid) {
      found++;
      grid.appendChild(makeCamCard(String(n), `ID: ${n}`));
    }
  }

  if (barEl)    barEl.style.width = '100%';
  if (statusEl && !scanAbortController.signal.aborted)
    statusEl.textContent =
      `Exploración completa: ${found} cámara${found !== 1 ? 's' : ''} activa${found !== 1 ? 's' : ''} de ${total} IDs probados.`;
}

function probeImage(url, signal) {
  return new Promise(resolve => {
    if (signal.aborted) return resolve(false);
    const img  = new Image();
    const done = ok => { img.onload = img.onerror = null; resolve(ok); };
    img.onload  = () => done(true);
    img.onerror = () => done(false);
    signal.addEventListener('abort', () => done(false), { once: true });
    img.src = url;
  });
}

/* ── Modal / lightbox ─────────────────────────────────────── */
function openModal(camId, camName, e) {
  if (e) e.stopPropagation();
  openModalCamId = camId;
  const url      = getCameraUrl(camId);
  const mTitle   = $('modal-title');
  const mImg     = $('modal-img');
  const mSrc     = $('modal-source-link');
  const mOverlay = $('modal-overlay');
  const mRefBtn  = $('modal-refresh-btn');

  if (mTitle)   mTitle.textContent = camName;
  if (mImg)     { mImg.src = url; mImg.alt = camName; }
  if (mSrc)     { mSrc.href = `${CIC_BASE}camara-${camId}.jpg`; mSrc.textContent = 'Ver en CIC Tenerife'; }
  if (mOverlay) mOverlay.style.display = 'flex';
  if (mRefBtn)  mRefBtn.onclick = () => {
    const u = getCameraUrl(camId);
    if (mImg) mImg.src = u;
    if (mSrc) mSrc.href = u;
  };
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const mOverlay = $('modal-overlay');
  if (mOverlay) mOverlay.style.display = 'none';
  openModalCamId = null;
  document.body.style.overflow = '';
}

/* ── Volver arriba ────────────────────────────────────────── */
function initBackToTop() {
  const btn = $('back-to-top');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
      btn.classList.remove('opacity-0', 'pointer-events-none');
    } else {
      btn.classList.add('opacity-0', 'pointer-events-none');
    }
  });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/* ── ScrollSpy ────────────────────────────────────────────── */
function initScrollSpy() {
  const links = document.querySelectorAll('.nav-link');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id.replace('sec-', '');
        links.forEach(a => {
          const active = a.getAttribute('href') === `#sec-${id}`;
          a.classList.toggle('text-[#e8a000]',     active);
          a.classList.toggle('border-[#e8a000]',   active);
          a.classList.toggle('text-neutral-400',   !active);
          a.classList.toggle('border-transparent', !active);
        });
      }
    });
  }, { rootMargin: '-30% 0px -60% 0px' });
  document.querySelectorAll('.camera-section').forEach(s => observer.observe(s));
}

/* ── Bootstrap ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  init();
  initBackToTop();
  initScrollSpy();

  const mClose   = $('modal-close');
  const mOverlay = $('modal-overlay');
  if (mClose)   mClose.addEventListener('click', closeModal);
  if (mOverlay) mOverlay.addEventListener('click', e => {
    if (e.target === mOverlay) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
});
