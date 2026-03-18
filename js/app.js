/**
 * Tráfico Tenerife – App Logic
 * Renders camera grids, handles refresh, modal, and controls.
 *
 * Strategy for camera images:
 * 1. Attempt to fetch the official CIC page via CORS proxy to discover live camera URLs
 * 2. Fall back to static URL list from cameras.js if fetch fails
 * 3. Display cameras grouped by road section (TF-5, TF-1, TF-13, TF-2, Noreste, Sta Cruz)
 */

const REFRESH_INTERVAL_MS = 30000; // 30 seconds

// CORS proxy used to fetch the CIC page from the browser
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';
const CIC_CAM_PAGE = 'https://cic.tenerife.es/web3/mosaico_cctv/camaras_trafico_w.html';

let refreshTimer    = null;
let countdownTimer  = null;
let countdownRemain = REFRESH_INTERVAL_MS / 1000;
let autoRefreshOn   = true;
let openModalCamId  = null;
let allExpanded     = true;

// Runtime camera map: camId → { name, url, groupId }
const activeCameras = {};

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
   CIC PAGE FETCH
   Tries to pull live camera image URLs from the official
   CIC Tenerife mosaic page via a CORS proxy.
   Falls back silently to static URLs in cameras.js.
────────────────────────────────────────────────────────── */
async function discoverCameraUrlsFromCIC() {
  try {
    const proxyUrl = CORS_PROXY + encodeURIComponent(CIC_CAM_PAGE);
    const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return null;

    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Collect all img src / data-src that look like camera images on CIC servers
    const discovered = {};
    doc.querySelectorAll('img, [data-src]').forEach(el => {
      const src = el.src || el.getAttribute('data-src') || '';
      if (src.includes('cic.tenerife.es') && (src.includes('.jpg') || src.includes('.jpeg') || src.includes('.png'))) {
        const key = src.split('/').pop().split('?')[0].replace(/\.\w+$/, '');
        discovered[key] = src;
      }
    });

    // Also look for iframes / embeds
    doc.querySelectorAll('iframe').forEach(el => {
      const src = el.src || '';
      if (src.includes('cic.tenerife.es')) {
        discovered['__iframe__' + Object.keys(discovered).length] = src;
      }
    });

    return Object.keys(discovered).length > 0 ? discovered : null;
  } catch {
    return null;
  }
}

/* ──────────────────────────────────────────────────────────
   RENDER
────────────────────────────────────────────────────────── */
async function init() {
  const mainContent = $('main-content');
  if (!mainContent) return;

  // Show loading state
  mainContent.innerHTML = `<div style="color:#666;padding:40px;text-align:center;font-size:0.85rem">
    <div style="font-size:2rem;margin-bottom:12px">⌛</div>
    Cargando cámaras de tráfico…
  </div>`;

  // Try to discover live URLs from CIC (non-blocking)
  const discoveredUrls = await discoverCameraUrlsFromCIC();
  if (discoveredUrls) {
    console.info('[TráficoTF] Discovered', Object.keys(discoveredUrls).length, 'camera URLs from CIC');
  }

  // Register all cameras
  CAMERA_GROUPS.forEach(group => {
    group.cameras.forEach(cam => {
      // If CIC discovery found a matching URL, use it; otherwise static
      const liveUrl = discoveredUrls && discoveredUrls[cam.id];
      activeCameras[cam.id] = {
        name: cam.name,
        groupId: group.id,
        liveUrl: liveUrl || null,
      };
    });
  });

  // Render
  mainContent.innerHTML = '';
  mainContent.appendChild(renderControls());
  CAMERA_GROUPS.forEach(g => mainContent.appendChild(renderGroup(g)));
  updateNavBadges();
  initSectionCollapse();
  resetCountdown();
}

function renderControls() {
  const wrap = document.createElement('div');
  wrap.className = 'global-controls';
  wrap.innerHTML = `
    <button class="ctrl-btn active" id="btn-auto-refresh">↺ Auto-actualizar</button>
    <button class="ctrl-btn"        id="btn-refresh-now">⟳ Actualizar ahora</button>
    <button class="ctrl-btn"        id="btn-expand-all">⊞ Expandir todo</button>
    <div class="refresh-countdown">
      <span id="countdown-label" style="display:flex;align-items:center;gap:6px;">
        Próxima actualización: <strong id="countdown-secs">${countdownRemain}</strong>s
        <div class="countdown-bar"><div class="countdown-fill" id="countdown-fill" style="width:100%"></div></div>
      </span>
    </div>
  `;
  // Events
  wrap.querySelector('#btn-auto-refresh').addEventListener('click', toggleAutoRefresh);
  wrap.querySelector('#btn-refresh-now').addEventListener('click', refreshAllCams);
  wrap.querySelector('#btn-expand-all').addEventListener('click', toggleAllSections);
  return wrap;
}

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
  group.cameras.forEach(cam => grid.appendChild(makeCamCard(cam)));
  section.appendChild(grid);

  return section;
}

function makeCamCard(cam) {
  const card = document.createElement('div');
  card.className = 'cam-card';
  card.id = `card-${cam.id}`;

  const imgUrl = getCameraUrl(cam.id);

  card.innerHTML = `
    <div class="cam-image-wrap" role="button" aria-label="Ampliar cámara ${cam.name}" tabindex="0">
      <div class="cam-skeleton" id="skel-${cam.id}"></div>
      <img id="img-${cam.id}"
           src="${imgUrl}"
           alt="Cámara de tráfico: ${cam.name}"
           loading="lazy"
           class="loading"
      />
      <div class="cam-error-overlay" id="err-${cam.id}">
        <span class="error-icon">📷</span>
        <span>Señal no disponible</span>
        <button class="cam-btn" onclick="retryCam('${cam.id}',event)">Reintentar</button>
      </div>
      <span class="cam-live" id="live-${cam.id}">
        <span class="cam-live-dot"></span>EN VIVO
      </span>
      <span class="cam-refresh-badge">🔍 Ampliar</span>
    </div>
    <div class="cam-footer">
      <span class="cam-name" title="${cam.name}">${cam.name}</span>
      <div class="cam-actions">
        <button class="cam-btn" title="Ver ampliada"    onclick="openModal('${cam.id}','${cam.name.replace(/'/g, "\\'")}',event)">⛶</button>
        <button class="cam-btn" title="Refrescar"       onclick="refreshSingleCam('${cam.id}',event)">↺</button>
      </div>
    </div>
  `;

  const img  = card.querySelector(`#img-${cam.id}`);
  const skel = card.querySelector(`#skel-${cam.id}`);
  const err  = card.querySelector(`#err-${cam.id}`);
  const live = card.querySelector(`#live-${cam.id}`);

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

  card.querySelector('.cam-image-wrap').addEventListener('click', () => openModal(cam.id, cam.name));
  card.querySelector('.cam-image-wrap').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') openModal(cam.id, cam.name);
  });

  return card;
}

/* ── Navigation badges ────────────────────────────────────── */
function updateNavBadges() {
  CAMERA_GROUPS.forEach(g => {
    const el = $(`badge-${g.id}`);
    if (el) el.textContent = g.cameras.length;
  });
}

/* ── Section collapse ─────────────────────────────────────── */
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
    const h = document.querySelector(`[data-section="${g.id}"]`);
    const gr = $(`grid-${g.id}`);
    toggleSection(h, gr, allExpanded);
  });
  const btn = $('btn-expand-all');
  if (btn) btn.innerHTML = `${allExpanded ? '⊟ Colapsar todo' : '⊞ Expandir todo'}`;
}

/* ── Camera refresh ───────────────────────────────────────── */
function refreshAllCams() {
  CAMERA_GROUPS.forEach(g => g.cameras.forEach(c => refreshSingleCam(c.id)));
  resetCountdown();
  if (openModalCamId) {
    const m = $('modal-img');
    if (m) m.src = getCameraUrl(openModalCamId);
  }
}

function refreshSingleCam(camId, e) {
  if (e) e.stopPropagation();
  const img  = $(`img-${camId}`);
  const skel = $(`skel-${camId}`);
  const err  = $(`err-${camId}`);
  const live = $(`live-${camId}`);
  if (!img) return;
  if (skel) skel.classList.remove('hidden');
  if (err)  err.classList.remove('visible');
  img.classList.add('loading');
  if (live) { live.classList.remove('offline'); live.innerHTML = '<span class="cam-live-dot"></span>EN VIVO'; }
  img.src = getCameraUrl(camId);
}

function retryCam(camId, e) {
  if (e) e.stopPropagation();
  refreshSingleCam(camId);
}

/* ── Auto-refresh countdown ───────────────────────────────── */
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

/* ── Modal / lightbox ─────────────────────────────────────── */
function openModal(camId, camName, e) {
  if (e) e.stopPropagation();
  openModalCamId = camId;
  const url = getCameraUrl(camId);

  const mTitle   = $('modal-title');
  const mImg     = $('modal-img');
  const mSrc     = $('modal-source-link');
  const mOverlay = $('modal-overlay');
  const mRefBtn  = $('modal-refresh-btn');

  if (mTitle) mTitle.textContent = camName;
  if (mImg)   { mImg.src = url; mImg.alt = camName; }
  if (mSrc)   { mSrc.href = url; mSrc.textContent = 'Fuente: CIC Tenerife'; }
  if (mOverlay) mOverlay.classList.add('open');
  if (mRefBtn) mRefBtn.onclick = () => {
    const u = getCameraUrl(camId);
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

/* ── Back to top ──────────────────────────────────────────── */
function initBackToTop() {
  const btn = $('back-to-top');
  if (!btn) return;
  window.addEventListener('scroll', () => btn.classList.toggle('visible', window.scrollY > 300));
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/* ── Nav active state on scroll ──────────────────────────── */
function initScrollSpy() {
  const links = document.querySelectorAll('.nav-list a');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id.replace('sec-', '');
        links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#sec-${id}`));
      }
    });
  }, { rootMargin: '-30% 0px -60% 0px' });

  document.querySelectorAll('.camera-section').forEach(s => observer.observe(s));
}

/* ── Bootstrap ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  init().then(() => {
    initBackToTop();
    initScrollSpy();
  });

  // Modal close
  const mClose   = $('modal-close');
  const mOverlay = $('modal-overlay');
  if (mClose)   mClose.addEventListener('click', closeModal);
  if (mOverlay) mOverlay.addEventListener('click', e => { if (e.target === mOverlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
});
