/**
 * Tráfico Tenerife – App Logic
 *
 * Renderiza la cuadrícula de cámaras, gestiona el refresco automático,
 * el modal lightbox y los controles de sección.
 *
 * URLs de imágenes: https://cic.tenerife.es/e-Traffic3/data/camara-2701001-{N}.jpg
 */

const REFRESH_INTERVAL_MS = 30000; // 30 segundos
// Rango máximo de IDs a explorar en el Modo Escáner
const SCAN_MIN = 1;
const SCAN_MAX = 100;

let refreshTimer    = null;
let countdownTimer  = null;
let countdownRemain = REFRESH_INTERVAL_MS / 1000;
let autoRefreshOn   = true;
let openModalCamId  = null;   // número de cámara abierta en el modal
let allExpanded     = true;
let scannerMode     = false;

/* ── DOM shortcuts ────────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ── Clock ────────────────────────────────────────────────── */
function updateClock() {
  const el = $('current-time');
  if (el) el.textContent = new Date().toLocaleTimeString('es-ES');
}
updateClock();
setInterval(updateClock, 1000);

/* ──────────────────────────────────────────────────────────
   RENDER PRINCIPAL
────────────────────────────────────────────────────────── */
function init() {
  const mainContent = $('main-content');
  if (!mainContent) return;

  mainContent.innerHTML = '';
  mainContent.appendChild(renderControls());
  CAMERA_GROUPS.forEach(g => mainContent.appendChild(renderGroup(g)));
  updateNavBadges();
  initSectionCollapse();
  resetCountdown();
}

/* ── Barra de controles ───────────────────────────────────── */
function renderControls() {
  const wrap = document.createElement('div');
  wrap.className = 'global-controls';
  wrap.innerHTML = `
    <button class="ctrl-btn active" id="btn-auto-refresh">↺ Auto-actualizar</button>
    <button class="ctrl-btn"        id="btn-refresh-now">⟳ Actualizar ahora</button>
    <button class="ctrl-btn"        id="btn-expand-all">⊟ Colapsar todo</button>
    <button class="ctrl-btn"        id="btn-scanner">🔍 Explorar IDs</button>
    <div class="refresh-countdown">
      <span id="countdown-label" style="display:flex;align-items:center;gap:6px;">
        Próxima actualización: <strong id="countdown-secs">${countdownRemain}</strong>s
        <div class="countdown-bar"><div class="countdown-fill" id="countdown-fill" style="width:100%"></div></div>
      </span>
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
  section.className = 'camera-section';
  section.id = `sec-${group.id}`;

  const n = group.cameras.length;
  const header = document.createElement('div');
  header.className = 'section-header';
  header.setAttribute('role', 'button');
  header.setAttribute('aria-expanded', 'true');
  header.setAttribute('data-section', group.id);
  header.innerHTML = `
    <span class="section-icon" aria-hidden="true">${group.icon}</span>
    <div class="section-title-wrap">
      <div class="section-title">${group.name}</div>
      <div class="section-subtitle">${group.subtitle}</div>
    </div>
    <span class="section-count">${n} cámara${n !== 1 ? 's' : ''}</span>
    <span class="section-toggle" aria-hidden="true">▾</span>
  `;
  section.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'camera-grid';
  grid.id = `grid-${group.id}`;
  group.cameras.forEach(cam => grid.appendChild(makeCamCard(cam.num, cam.name)));
  section.appendChild(grid);

  return section;
}

/* ── Tarjeta de cámara ────────────────────────────────────── */
function makeCamCard(camNum, camName) {
  const camId = `cam-${camNum}`;
  const card  = document.createElement('div');
  card.className = 'cam-card';
  card.id = `card-${camId}`;

  const imgUrl = getCameraUrl(camNum);

  card.innerHTML = `
    <div class="cam-image-wrap" role="button"
         aria-label="Ampliar cámara ${camName}" tabindex="0">
      <div class="cam-skeleton" id="skel-${camId}"></div>
      <img id="img-${camId}"
           src="${imgUrl}"
           alt="Cámara de tráfico: ${camName}"
           loading="lazy"
           class="loading"
           crossorigin="anonymous"
      />
      <div class="cam-error-overlay" id="err-${camId}">
        <span class="error-icon">📷</span>
        <span>Señal no disponible</span>
        <button class="cam-btn" onclick="retryCam(${camNum},event)">Reintentar</button>
      </div>
      <span class="cam-live" id="live-${camId}">
        <span class="cam-live-dot"></span>EN VIVO
      </span>
      <span class="cam-refresh-badge">🔍 Ampliar</span>
    </div>
    <div class="cam-footer">
      <span class="cam-name" title="${camName}">${camName}</span>
      <div class="cam-actions">
        <button class="cam-btn" title="Ver ampliada"
          onclick="openModal(${camNum},'${camName.replace(/'/g, "\\'")}',event)">⛶</button>
        <button class="cam-btn" title="Refrescar"
          onclick="refreshSingleCam(${camNum},event)">↺</button>
      </div>
    </div>
  `;

  const img  = card.querySelector(`#img-${camId}`);
  const skel = card.querySelector(`#skel-${camId}`);
  const err  = card.querySelector(`#err-${camId}`);
  const live = card.querySelector(`#live-${camId}`);

  img.addEventListener('load', () => {
    img.classList.remove('loading');
    skel.classList.add('hidden');
    err.classList.remove('visible');
    live.classList.remove('offline');
    live.innerHTML = '<span class="cam-live-dot"></span>EN VIVO';
  });

  img.addEventListener('error', () => {
    img.classList.remove('loading');
    skel.classList.add('hidden');
    err.classList.add('visible');
    live.classList.add('offline');
    live.innerHTML = '<span class="cam-live-dot"></span>SIN SEÑAL';
  });

  card.querySelector('.cam-image-wrap').addEventListener('click', () =>
    openModal(camNum, camName));
  card.querySelector('.cam-image-wrap').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') openModal(camNum, camName);
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
  document.querySelectorAll('.section-header').forEach(header => {
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
  if (expand) {
    grid.style.maxHeight = grid.scrollHeight + 'px';
    grid.classList.remove('collapsed');
    header.setAttribute('aria-expanded', 'true');
    header.classList.remove('collapsed');
  } else {
    grid.style.maxHeight = grid.scrollHeight + 'px';
    requestAnimationFrame(() => { grid.style.maxHeight = '0'; });
    grid.classList.add('collapsed');
    header.setAttribute('aria-expanded', 'false');
    header.classList.add('collapsed');
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
  if (scannerMode) return;  // el escáner gestiona sus propios estados
  CAMERA_GROUPS.forEach(g => g.cameras.forEach(c => refreshSingleCam(c.num)));
  resetCountdown();
  if (openModalCamId !== null) {
    const m = $('modal-img');
    if (m) m.src = getCameraUrl(openModalCamId);
  }
}

function refreshSingleCam(camNum, e) {
  if (e) e.stopPropagation();
  const camId = `cam-${camNum}`;
  const img   = $(`img-${camId}`);
  const skel  = $(`skel-${camId}`);
  const err   = $(`err-${camId}`);
  const live  = $(`live-${camId}`);
  if (!img) return;
  if (skel) skel.classList.remove('hidden');
  if (err)  err.classList.remove('visible');
  img.classList.add('loading');
  if (live) {
    live.classList.remove('offline');
    live.innerHTML = '<span class="cam-live-dot"></span>EN VIVO';
  }
  img.src = getCameraUrl(camNum);
}

function retryCam(camNum, e) {
  if (e) e.stopPropagation();
  refreshSingleCam(camNum);
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
  if (btn) btn.classList.toggle('active', autoRefreshOn);
  const lbl = $('countdown-label');
  if (autoRefreshOn) {
    resetCountdown();
    if (lbl) lbl.style.opacity = '1';
  } else {
    clearInterval(refreshTimer);
    clearInterval(countdownTimer);
    if (lbl) lbl.style.opacity = '0.4';
  }
}

/* ──────────────────────────────────────────────────────────
   MODO ESCÁNER
   Prueba IDs del SCAN_MIN al SCAN_MAX y muestra los que
   devuelven una imagen válida. Útil para descubrir los IDs
   reales del sistema CIC y asignarlos a las secciones.
────────────────────────────────────────────────────────── */
let scanAbortController = null;

function toggleScannerMode() {
  scannerMode = !scannerMode;
  const mainContent = $('main-content');
  const btn = $('btn-scanner');
  if (!mainContent) return;

  if (scannerMode) {
    // Ocultar secciones normales y mostrar escáner
    document.querySelectorAll('.camera-section').forEach(s => s.style.display = 'none');
    clearInterval(refreshTimer);
    clearInterval(countdownTimer);
    if (btn) { btn.classList.add('active'); btn.textContent = '✕ Cerrar escáner'; }
    showScannerPanel(mainContent);
  } else {
    // Abortar escaneo activo
    if (scanAbortController) { scanAbortController.abort(); scanAbortController = null; }
    const panel = $('scanner-panel');
    if (panel) panel.remove();
    document.querySelectorAll('.camera-section').forEach(s => s.style.display = '');
    if (btn) { btn.classList.remove('active'); btn.textContent = '🔍 Explorar IDs'; }
    resetCountdown();
  }
}

function showScannerPanel(container) {
  const panel = document.createElement('div');
  panel.id = 'scanner-panel';
  panel.innerHTML = `
    <div class="scanner-header">
      <div class="scanner-title">🔍 Modo Escáner — Exploración de IDs activos</div>
      <div class="scanner-info">
        Probando IDs del <strong>${SCAN_MIN}</strong> al <strong>${SCAN_MAX}</strong>
        en <code>https://cic.tenerife.es/e-Traffic3/data/camara-${CAM_SERIES}-{N}.jpg</code>
      </div>
      <div class="scanner-progress-wrap">
        <div class="scanner-progress-bar" id="scan-bar"></div>
      </div>
      <div class="scanner-status" id="scan-status">Iniciando exploración…</div>
    </div>
    <div class="scanner-grid" id="scanner-grid"></div>
  `;
  container.appendChild(panel);
  runScanner();
}

async function runScanner() {
  scanAbortController = new AbortController();
  const grid      = $('scanner-grid');
  const statusEl  = $('scan-status');
  const barEl     = $('scan-bar');
  const total     = SCAN_MAX - SCAN_MIN + 1;
  let   found     = 0;

  for (let n = SCAN_MIN; n <= SCAN_MAX; n++) {
    if (scanAbortController.signal.aborted) break;

    const pct = Math.round(((n - SCAN_MIN) / total) * 100);
    if (barEl)    barEl.style.width = pct + '%';
    if (statusEl) statusEl.textContent =
      `Probando ID ${n}/${SCAN_MAX} · ${found} cámara${found !== 1 ? 's' : ''} encontrada${found !== 1 ? 's' : ''}`;

    // Prueba si la imagen carga con un elemento Image oculto
    const ok = await probeImage(getCameraUrl(n), scanAbortController.signal);
    if (ok && grid) {
      found++;
      const card = makeCamCard(n, `Cámara #${n}`);
      card.querySelector('.cam-name').textContent = `ID: ${CAM_SERIES}-${n}`;
      grid.appendChild(card);
    }
  }

  if (barEl)    barEl.style.width = '100%';
  if (statusEl && !scanAbortController.signal.aborted)
    statusEl.textContent = `Exploración completa: ${found} cámara${found !== 1 ? 's' : ''} activa${found !== 1 ? 's' : ''} de ${total} IDs probados.`;
}

function probeImage(url, signal) {
  return new Promise(resolve => {
    if (signal.aborted) return resolve(false);
    const img = new Image();
    const done = ok => { img.onload = img.onerror = null; resolve(ok); };
    img.onload  = () => done(true);
    img.onerror = () => done(false);
    signal.addEventListener('abort', () => done(false), { once: true });
    img.src = url;
  });
}

/* ── Modal / lightbox ─────────────────────────────────────── */
function openModal(camNum, camName, e) {
  if (e) e.stopPropagation();
  openModalCamId = camNum;
  const url = getCameraUrl(camNum);

  const mTitle   = $('modal-title');
  const mImg     = $('modal-img');
  const mSrc     = $('modal-source-link');
  const mOverlay = $('modal-overlay');
  const mRefBtn  = $('modal-refresh-btn');

  if (mTitle)   mTitle.textContent = camName;
  if (mImg)     { mImg.src = url; mImg.alt = camName; }
  if (mSrc)     { mSrc.href = `${CIC_BASE}camara-${CAM_SERIES}-${camNum}.jpg`; mSrc.textContent = 'Ver en CIC Tenerife'; }
  if (mOverlay) mOverlay.classList.add('open');
  if (mRefBtn)  mRefBtn.onclick = () => {
    const u = getCameraUrl(camNum);
    if (mImg) mImg.src = u;
    if (mSrc) mSrc.href = u;
  };

  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const mOverlay = $('modal-overlay');
  if (mOverlay) mOverlay.classList.remove('open');
  openModalCamId = null;
  document.body.style.overflow = '';
}

/* ── Volver arriba ────────────────────────────────────────── */
function initBackToTop() {
  const btn = $('back-to-top');
  if (!btn) return;
  window.addEventListener('scroll', () =>
    btn.classList.toggle('visible', window.scrollY > 300));
  btn.addEventListener('click', () =>
    window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/* ── ScrollSpy (nav activo al hacer scroll) ──────────────── */
function initScrollSpy() {
  const links = document.querySelectorAll('.nav-list a');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id.replace('sec-', '');
        links.forEach(a =>
          a.classList.toggle('active', a.getAttribute('href') === `#sec-${id}`));
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

  // Modal: cerrar
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
