/**
 * Tráfico Tenerife – App Logic
 * Estilos: Tailwind CSS v4 (compilado con Vite) — paleta Anthropic
 */

const REFRESH_INTERVAL_MS = 300000; // 5 minutos

let refreshTimer    = null;
let countdownTimer  = null;
let countdownRemain = REFRESH_INTERVAL_MS / 1000;
let autoRefreshOn   = false;
let openModalCamId  = null;
let allExpanded     = true;

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
  main.appendChild(renderAvisoAemet());                // Avisos meteorológicos AEMET
  main.appendChild(renderFavoritesSection());          // Favoritas: primera y abierta
  CAMERA_GROUPS.forEach(g => main.appendChild(renderGroup(g)));
  updateNavBadges();
  initSectionCollapse();
  // Grupos regulares: colapsados por defecto (sin animación en carga inicial)
  CAMERA_GROUPS.forEach(g => {
    const h  = document.querySelector(`[data-section="${g.id}"]`);
    const gr = $(`grid-${g.id}`);
    if (!h || !gr) return;
    gr.style.transition    = 'none';
    gr.style.maxHeight     = '0';
    gr.style.opacity       = '0';
    gr.style.pointerEvents = 'none';
    h.setAttribute('aria-expanded', 'false');
    const tog = h.querySelector('[data-toggle]');
    if (tog) tog.style.transform = 'rotate(-90deg)';
    requestAnimationFrame(() => { gr.style.transition = 'max-height 0.5s ease, opacity 0.3s ease'; });
  });
  allExpanded = false;
  const expandBtn = $('btn-expand-all');
  if (expandBtn) expandBtn.innerHTML = '⊞ Expandir todo';
  resetCountdown();
  initStickyNav();
}

/* ── Nav sticky bajo el header ────────────────────────────── */
function initStickyNav() {
  const header = document.querySelector('header');
  const nav    = document.querySelector('nav[aria-label="Secciones de cámaras"]');
  if (!header || !nav) return;
  function update() { nav.style.top = header.offsetHeight + 'px'; }
  update();
  new ResizeObserver(update).observe(header);
}

/* ── Barra de controles ───────────────────────────────────── */
const BTN_BASE   = 'bg-white border border-[#e8e6dc] text-[#6b6860] px-3.5 py-1.5 rounded text-xs cursor-pointer transition-all flex items-center gap-1.5 hover:border-[#d97757] hover:text-[#d97757] shadow-sm';
const BTN_ACTIVE = 'bg-[#d97757]/10 border border-[#d97757] text-[#d97757] px-3.5 py-1.5 rounded text-xs cursor-pointer transition-all flex items-center gap-1.5 shadow-sm';

function renderControls() {
  const wrap = document.createElement('div');

  // Settings panel: collapsible on mobile (toggled by #btn-settings-toggle in the top bar),
  // always visible on desktop
  const panel = document.createElement('div');
  panel.id = 'settings-panel';
  panel.style.display = 'none'; // hidden by default; applyLayout will show on desktop
  panel.innerHTML = `
    <button id="btn-auto-refresh" class="${BTN_BASE}">↺ Auto-actualizar</button>
    <button id="btn-refresh-now"  class="${BTN_BASE}">⟳ Actualizar ahora</button>
    <button id="btn-expand-all"   class="${BTN_BASE}">⊟ Colapsar todo</button>
    <button id="btn-detectar-ia"  class="${BTN_BASE}">🔍 Detectar atascos con IA</button>
    <div id="countdown-label" class="ml-auto text-xs text-[#6b6860] flex items-center gap-1.5" style="opacity:0.4">
      Próx. actualización:
      <strong id="countdown-secs">${countdownRemain}</strong>
      <div class="w-20 h-0.5 bg-[#e8e6dc] rounded-full overflow-hidden">
        <div id="countdown-fill" class="h-full bg-[#d97757] rounded-full"
             style="width:100%; transition: width 1s linear;"></div>
      </div>
    </div>
  `;

  wrap.appendChild(panel);

  let settingsOpen = false;
  const mq = window.matchMedia('(min-width: 768px)');

  function applyLayout(isDesktop) {
    if (isDesktop) {
      wrap.style.cssText = 'padding-top:12px; padding-bottom:12px;';
      panel.style.cssText = 'display:flex; flex-wrap:wrap; gap:10px; align-items:center;';
      panel.querySelector('#countdown-label').style.display = 'flex';
    } else {
      if (settingsOpen) {
        wrap.style.cssText = 'padding-bottom:8px;';
        panel.style.cssText = 'display:flex; flex-direction:column; gap:8px; padding:12px; background:white; border:1px solid #e8e6dc; border-radius:12px;';
        panel.querySelector('#countdown-label').style.display = 'none';
      } else {
        wrap.style.cssText = '';
        panel.style.display = 'none';
      }
    }
  }

  applyLayout(mq.matches);
  mq.addEventListener('change', e => applyLayout(e.matches));

  // Exponer función para plegar settings desde otros módulos (ej. tras detectar atascos)
  window.cerrarSettings = () => {
    if (!mq.matches && settingsOpen) {
      settingsOpen = false;
      applyLayout(false);
    }
  };

  // Gear button lives in the static HTML top bar
  const gearBtn = document.getElementById('btn-settings-toggle');
  if (gearBtn) {
    gearBtn.addEventListener('click', () => {
      settingsOpen = !settingsOpen;
      gearBtn.setAttribute('aria-expanded', String(settingsOpen));
      applyLayout(mq.matches);
    });
  }

  panel.querySelector('#btn-auto-refresh').addEventListener('click', toggleAutoRefresh);
  panel.querySelector('#btn-refresh-now').addEventListener('click', refreshAllCams);
  panel.querySelector('#btn-expand-all').addEventListener('click', toggleAllSections);
  panel.querySelector('#btn-detectar-ia').addEventListener('click', lanzarDeteccionIA);

  return wrap;
}

/* ── Grupo / sección ──────────────────────────────────────── */
function renderGroup(group) {
  const section = document.createElement('section');
  section.className = 'camera-section my-6 scroll-mt-28';
  section.id = `sec-${group.id}`;

  const n = group.cameras.length;
  const header = document.createElement('div');
  header.className = 'flex items-center gap-3 px-5 py-4 bg-[#e5e0d5] border border-[#141413] rounded-2xl mb-3 cursor-pointer select-none transition-all hover:bg-[#dedad0]';
  header.setAttribute('role', 'button');
  header.setAttribute('aria-expanded', 'true');
  header.setAttribute('data-section', group.id);
  header.innerHTML = `
    <div class="flex-1 min-w-0">
      <div class="text-[15px] font-bold text-[#141413] tracking-wide">${group.name}</div>
      <div class="text-[11px] text-[#6b6860] mt-0.5">${group.subtitle}</div>
    </div>
    <span class="text-[11px] text-[#141413] bg-[#141413]/10 px-2.5 py-0.5 rounded-full border border-[#141413]/20 whitespace-nowrap shrink-0">
      ${n} cámara${n !== 1 ? 's' : ''}
    </span>
    <span class="text-[#6b6860] text-sm shrink-0 transition-transform duration-300" data-toggle aria-hidden="true">▾</span>
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

/* ── Helpers de favoritas ─────────────────────────────────── */
function buildCamMap() {
  const map = new Map();
  CAMERA_GROUPS.forEach(g => g.cameras.forEach(c => map.set(c.id, c.name)));
  return map;
}

/* ── Aviso meteorológico AEMET ────────────────────────────── */

function renderAvisoAemet() {
  const wrap = document.createElement('div');
  wrap.id = 'aviso-aemet';
  wrap.innerHTML = `
    <div class="flex items-center gap-3 px-5 py-4 bg-[#f5f3ee] border border-[#e8e6dc] rounded-2xl mt-4 mb-1 text-xs text-[#6b6860]">
      <span style="display:inline-block;animation:spin 1s linear infinite">↺</span>
      Consultando avisos meteorológicos AEMET…
    </div>`;
  actualizarAvisoAemet(wrap);
  return wrap;
}

function actualizarAvisoAemet(wrap) {
  const el = wrap || $('aviso-aemet');
  if (!el || !window.aemet) return;
  window.aemet.cargar().then(aviso => {
    el.innerHTML = aviso ? _htmlAviso(aviso) : _htmlSinAvisos();
  }).catch(() => { el.innerHTML = ''; });
}

function _htmlSinAvisos() {
  return `
    <div class="flex items-center gap-3 px-5 py-4 bg-[#f5f3ee] border border-[#e8e6dc] rounded-2xl mt-4 mb-1">
      <span style="color:#22c55e;font-size:1rem">✓</span>
      <div>
        <span class="text-sm font-semibold text-[#141413]">Sin avisos meteorológicos</span>
        <span class="text-xs text-[#6b6860] ml-1.5">Tenerife · AEMET</span>
      </div>
    </div>`;
}

function _htmlAviso(av) {
  const SEV = {
    Extreme:  { label: 'ROJO',     bg: '#fef2f2', border: '#ef4444', txt: '#b91c1c' },
    Severe:   { label: 'NARANJA',  bg: '#fff7f5', border: '#d97757', txt: '#d97757' },
    Moderate: { label: 'AMARILLO', bg: '#fefce8', border: '#ca8a04', txt: '#854d0e' },
  };
  const ICONOS = {
    viento: '💨', lluvia: '🌧', tormenta: '⛈', nieve: '❄️',
    oleaje: '🌊', calor: '🌡️', niebla: '🌫', frío: '🥶', granizo: '🌨',
  };
  const cfg   = SEV[av.severity] ?? SEV.Moderate;
  const ev    = (av.event || '').toLowerCase();
  const icono = Object.entries(ICONOS).find(([k]) => ev.includes(k))?.[1] ?? '⚠️';
  const fmt   = iso => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('es-ES', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
        timeZone: 'Atlantic/Canary',
      });
    } catch { return iso; }
  };
  return `
    <div class="flex items-start gap-3 px-5 py-4 rounded-2xl mt-4 mb-1 border"
         style="background:${cfg.bg};border-color:${cfg.border}">
      <span style="font-size:1.5rem;line-height:1;margin-top:2px">${icono}</span>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">
          <span style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${cfg.txt}">
            ▲ Nivel ${cfg.label}
          </span>
          <span class="text-sm font-semibold text-[#141413]">${av.event || ''}</span>
          <span class="text-[10px] text-[#b0aea5]" style="margin-left:auto">AEMET · ${av.area || 'Tenerife'}</span>
        </div>
        ${av.headline ? `<p class="text-xs text-[#6b6860] mt-1" style="overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${av.headline}</p>` : ''}
        <div style="display:flex;flex-wrap:wrap;gap:0 12px;margin-top:6px;font-size:10px;color:#b0aea5">
          ${av.onset   ? `<span>Vigente: ${fmt(av.onset)}</span>`   : ''}
          ${av.expires ? `<span>Caduca: ${fmt(av.expires)}</span>`  : ''}
        </div>
      </div>
    </div>`;
}

function renderFavoritesSection() {
  const section = document.createElement('section');
  section.className = 'camera-section my-6 scroll-mt-28';
  section.id = 'sec-favoritas';

  const favIds = getFavs();
  const n      = favIds.length;

  const header = document.createElement('div');
  header.className = 'flex items-center gap-3 px-5 py-4 bg-[#e5e0d5] border border-[#141413] rounded-2xl mb-3 cursor-pointer select-none transition-all hover:bg-[#dedad0]';
  header.setAttribute('role', 'button');
  header.setAttribute('aria-expanded', 'true');
  header.setAttribute('data-section', 'favoritas');
  header.innerHTML = `
    <div class="flex-1 min-w-0">
      <div class="text-[15px] font-bold text-[#141413] tracking-wide">
        <span class="text-[#d97757]">★</span> Mis Favoritas
      </div>
      <div class="text-[11px] text-[#6b6860] mt-0.5">Cámaras guardadas</div>
    </div>
    <span id="badge-favoritas"
          class="text-[11px] text-[#141413] bg-[#141413]/10 px-2.5 py-0.5 rounded-full border border-[#141413]/20 whitespace-nowrap shrink-0">
      ${n} cámara${n !== 1 ? 's' : ''}
    </span>
    <span class="text-[#6b6860] text-sm shrink-0 transition-transform duration-300" data-toggle aria-hidden="true">▾</span>
  `;
  section.appendChild(header);

  const grid = document.createElement('div');
  grid.className  = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 overflow-hidden';
  grid.style.transition = 'max-height 0.5s ease, opacity 0.3s ease';
  grid.id = 'grid-favoritas';
  renderFavoritesGrid(grid, favIds);
  section.appendChild(grid);

  if (n === 0) section.style.display = 'none';

  return section;
}

function renderFavoritesGrid(grid, favIds) {
  const camMap = buildCamMap();
  grid.innerHTML = '';
  favIds.forEach(camId => {
    const camName = camMap.get(camId) || camId;
    grid.appendChild(makeCamCard(camId, camName, true));
  });
}

function refreshFavoritesSection() {
  const grid    = $('grid-favoritas');
  const section = $('sec-favoritas');
  if (!grid || !section) return;

  const favIds = getFavs();
  const n      = favIds.length;

  // Ocultar el módulo completo si no hay favoritas
  section.style.display = n === 0 ? 'none' : '';

  if (n > 0) {
    renderFavoritesGrid(grid, favIds);
    grid.style.maxHeight = ''; // altura natural, sin restricción
    // Re-aplicar overlays de alertas en las nuevas tarjetas favoritas
    window.alertas?.actualizarOverlaysCamaras?.();
  }

  const badge    = $('badge-favoritas');
  const navBadge = $('badge-favoritas-nav');
  if (badge)    badge.textContent    = `${n} cámara${n !== 1 ? 's' : ''}`;
  if (navBadge) navBadge.textContent = n || '';
}

function onFavToggle(camId, e) {
  if (e) e.stopPropagation();
  const isFavNow = toggleFav(camId);

  // Actualizar todos los botones estrella de esta cámara en el DOM
  document.querySelectorAll(`[data-fav-id="${camId}"]`).forEach(btn => {
    btn.textContent = isFavNow ? '★' : '☆';
    btn.title = isFavNow ? 'Quitar de favoritas' : 'Añadir a favoritas';
    if (isFavNow) {
      btn.classList.remove('border-[#e8e6dc]', 'text-[#6b6860]');
      btn.classList.add('border-[#d97757]', 'text-[#d97757]');
    } else {
      btn.classList.remove('border-[#d97757]', 'text-[#d97757]');
      btn.classList.add('border-[#e8e6dc]', 'text-[#6b6860]');
    }
  });

  // Actualizar botón del modal si está abierto para esta cámara
  if (openModalCamId === camId) {
    const mBtn = $('modal-fav-btn');
    if (mBtn) syncModalFavBtn(mBtn, isFavNow);
  }

  refreshFavoritesSection();

  // Primera favorita añadida → scroll al módulo para que el usuario lo vea
  if (isFavNow && getFavs().length === 1) {
    requestAnimationFrame(() => {
      $('sec-favoritas')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

function syncModalFavBtn(btn, isFavNow) {
  btn.innerHTML = isFavNow ? '★ Favorita' : '☆ Añadir a favoritas';
  btn.title     = isFavNow ? 'Quitar de favoritas' : 'Añadir a favoritas';
  if (isFavNow) {
    btn.classList.remove('border-[#e8e6dc]', 'text-[#6b6860]');
    btn.classList.add('border-[#d97757]', 'text-[#d97757]');
  } else {
    btn.classList.remove('border-[#d97757]', 'text-[#d97757]');
    btn.classList.add('border-[#e8e6dc]', 'text-[#6b6860]');
  }
}

/* ── Tarjeta de cámara ────────────────────────────────────── */
function makeCamCard(camId, camName, favMode = false) {
  const domId    = favMode ? `fav_${domSafe(camId)}` : `cam_${domSafe(camId)}`;
  const card     = document.createElement('div');
  card.className = 'bg-white border border-[#e8e6dc] rounded-xl overflow-hidden transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:border-[#d97757] group';
  card.id = `card-${domId}`;

  const imgUrl   = getCameraUrl(camId);
  const camIdEsc = camId.replace(/'/g, "\\'");
  const nameEsc  = camName.replace(/'/g, "\\'");

  card.innerHTML = `
    <div class="relative w-full aspect-[4/3] bg-black overflow-hidden"
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
           class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/85 text-[#b0aea5] text-xs text-center p-3">
        <span class="text-3xl">📷</span>
        <span>Señal no disponible</span>
        <button class="bg-transparent border border-[#6b6860] text-[#b0aea5] px-2 py-1 rounded text-[11px] cursor-pointer hover:border-[#d97757] hover:text-[#d97757] transition-all mt-1 whitespace-nowrap"
                onclick="retryCam('${camIdEsc}',event)">Reintentar</button>
      </div>

      <!-- Badge EN VIVO -->
      <span id="live-${domId}"
            class="absolute top-1.5 left-1.5 bg-black/65 text-green-400 text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 tracking-wide">
        <span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse block"></span>EN VIVO
      </span>

      <!-- Badge ampliar (hover) -->
      <span class="absolute top-1.5 right-1.5 bg-black/70 text-[#d97757] text-[10px] px-1.5 py-0.5 rounded hidden group-hover:flex items-center gap-1">
        🔍 Ampliar
      </span>

      <!-- Badge de alerta de tráfico (icono sobre imagen, parte inferior) -->
      <div data-cam-alert="${camId}"
           style="display:none"
           class="absolute inset-x-0 bottom-0 z-10 pointer-events-none flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-white"></div>
    </div>

    <!-- Texto de alerta de tráfico (entre imagen y botones) -->
    <div data-cam-alert-text="${camId}"
         style="display:none"
         class="px-2.5 py-1.5 text-[11px] leading-snug"></div>

    <!-- Footer de la tarjeta -->
    <div class="px-2.5 py-2 flex items-center justify-between gap-2 border-t border-[#e8e6dc] bg-white">
      <span class="text-xs font-semibold text-[#141413] truncate flex-1"
            title="${camName}">${camName}</span>
      <div class="flex gap-1 shrink-0">
        <button class="bg-transparent border border-[#e8e6dc] text-[#6b6860] px-2 py-1 rounded text-[11px] cursor-pointer transition-all hover:border-[#d97757] hover:text-[#d97757]"
                title="Ver ampliada"
                onclick="openModal('${camIdEsc}','${nameEsc}',event)">⛶</button>
        <button class="bg-transparent border border-[#e8e6dc] text-[#6b6860] px-2 py-1 rounded text-[11px] cursor-pointer transition-all hover:border-[#d97757] hover:text-[#d97757]"
                title="Refrescar"
                onclick="refreshSingleCam('${camIdEsc}',event)">↺</button>
        <button class="bg-transparent border px-2 py-1 rounded text-[11px] cursor-pointer transition-all hover:border-[#d97757] hover:text-[#d97757] ${isFav(camId) ? 'border-[#d97757] text-[#d97757]' : 'border-[#e8e6dc] text-[#6b6860]'}"
                title="${isFav(camId) ? 'Quitar de favoritas' : 'Añadir a favoritas'}"
                data-fav-id="${camId}"
                onclick="onFavToggle('${camIdEsc}',event)">${isFav(camId) ? '★' : '☆'}</button>
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
      '<span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse block"></span>EN VIVO';
    if (live) live.className = live.className.replace('text-red-400', 'text-green-400');
  });

  img.addEventListener('error', () => {
    img.classList.remove('opacity-30');
    if (skel) skel.style.display = 'none';
    if (err)  err.style.display  = 'flex';
    if (live) {
      live.className = live.className.replace('text-green-400', 'text-red-400');
      live.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-red-400 block"></span>SIN SEÑAL';
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

/* ── Detección manual de atascos con IA ───────────────────── */
async function lanzarDeteccionIA() {
  const btn = $('btn-detectar-ia');
  if (!btn || btn.disabled) return;

  btn.disabled  = true;
  btn.className = BTN_ACTIVE + ' opacity-75 cursor-not-allowed';
  btn.innerHTML = '<span style="display:inline-block;animation:spin 1s linear infinite">⟳</span> Analizando…';

  try {
    const incidencias = await window.alertas.lanzarConProgreso();
    btn.disabled  = false;

    if (incidencias > 0) {
      btn.className = BTN_ACTIVE;
      btn.innerHTML = `⚠️ ${incidencias} alerta${incidencias > 1 ? 's' : ''}`;
    } else {
      btn.className = 'bg-green-50 border border-green-300 text-green-700 px-3.5 py-1.5 rounded text-xs cursor-pointer flex items-center gap-1.5 shadow-sm';
      btn.innerHTML = '✓ Sin incidencias';
    }

    // Plegar panel de settings en móvil tras mostrar el resultado
    window.cerrarSettings?.();
  } catch {
    btn.disabled  = false;
    btn.className = BTN_BASE;
    btn.innerHTML = '🔍 Detectar atascos con IA';
  }

  setTimeout(() => {
    if (btn) {
      btn.className = BTN_BASE;
      btn.innerHTML = '🔍 Detectar atascos con IA';
    }
  }, 5000);
}

/* ── Refresco de cámaras ──────────────────────────────────── */
function refreshAllCams() {
  CAMERA_GROUPS.forEach(g => g.cameras.forEach(c => refreshSingleCam(c.id)));
  refreshFavoritesSection();
  resetCountdown();
  actualizarAvisoAemet();
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
    live.className = live.className.replace('text-red-400', 'text-green-400');
    live.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse block"></span>EN VIVO';
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
  if (secs) {
    const m = Math.floor(countdownRemain / 60);
    const s = countdownRemain % 60;
    secs.textContent = m > 0 ? `${m}:${String(s).padStart(2, '0')} min` : `${s}s`;
  }
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

  const mFavBtn = $('modal-fav-btn');
  if (mFavBtn) {
    syncModalFavBtn(mFavBtn, isFav(camId));
    mFavBtn.onclick = e => onFavToggle(camId, e);
  }

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
          a.classList.toggle('text-[#d97757]',       active);
          a.classList.toggle('border-[#d97757]',     active);
          a.classList.toggle('text-[#6b6860]',       !active);
          a.classList.toggle('border-transparent',   !active);
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
