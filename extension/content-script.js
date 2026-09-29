// ============================================================
// presentExs — content-script.js v6 (INTEGRATED)
// - Toolbar floating (auto-hide, snap, drag, transparent)
// - Subtitle overlay (Shadow DOM)
// - Hash navigation (next/prev) — proven working
// - Cache slide IDs untuk present mode
// ============================================================

if (window.__presentexsLoaded) {
  console.log('[presentExs] Already loaded, skip');
} else {
  window.__presentexsLoaded = true;
  console.log('[presentExs] Loaded:', location.href);
  if (window.top === window.self) {
    if (document.body) init();
    else document.addEventListener('DOMContentLoaded', init, { once: true });
  }
}

// ============================================================
// MODE DETECTION
// ============================================================
function isPresentMode() {
  const p = location.pathname;
  return /\/present(\/|$)/.test(p) || /\/localpresent(\/|$)/.test(p);
}

function getPresentationId() {
  const m = location.pathname.match(/^\/presentation\/d\/([^\/]+)/);
  return m ? m[1] : null;
}

// ============================================================
// SLIDE IDs & CACHE
// ============================================================
let cachedSlideIds = [];

function readSlideIdsFromEditor() {
  const thumbs = document.querySelectorAll('.punch-filmstrip-thumbnail[data-slide-page-id]');
  const ids = [];
  thumbs.forEach((t) => {
    const id = t.getAttribute('data-slide-page-id');
    if (id) ids.push(id);
  });
  return ids;
}

function getCurrentSlideId() {
  const sMatch = location.search.match(/[?&]slide=id\.([^&]+)/);
  if (sMatch) return sMatch[1];
  const hMatch = location.hash.match(/slide=id\.([^&]+)/);
  if (hMatch) return hMatch[1];
  return null;
}

function getCurrentIndex() {
  const cur = getCurrentSlideId();
  if (!cur || cachedSlideIds.length === 0) return -1;
  return cachedSlideIds.indexOf(cur);
}

function loadCache(cb) {
  const pid = getPresentationId();
  if (!pid) return cb();
  chrome.storage.local.get([`slideIds_${pid}`], (res) => {
    cachedSlideIds = (res && res[`slideIds_${pid}`]) || [];
    console.log('[presentExs] Cache loaded:', cachedSlideIds.length);
    cb();
  });
}

function saveCache() {
  const pid = getPresentationId();
  if (!pid) return;
  const ids = readSlideIdsFromEditor();
  if (ids.length === 0) return;
  cachedSlideIds = ids;
  chrome.storage.local.set({ [`slideIds_${pid}`]: ids }, () => {
    console.log('[presentExs] Cache saved:', ids.length);
  });
}

// ============================================================
// NAVIGATION
// ============================================================
function navigateToSlideId(slideId) {
  if (!slideId) return false;
  const target = `slide=id.${slideId}`;
  if (location.hash === `#${target}`) return true;
  console.log('[presentExs] Navigate:', target);
  location.hash = target;
  return true;
}

function nextSlide() {
  if (cachedSlideIds.length === 0) { flashToast('Kembali ke editor dulu'); return false; }
  const idx = getCurrentIndex();
  if (idx === -1) { navigateToSlideId(cachedSlideIds[0]); return true; }
  if (idx >= cachedSlideIds.length - 1) { flashToast('Slide akhir'); return false; }
  navigateToSlideId(cachedSlideIds[idx + 1]);
  return true;
}

function prevSlide() {
  if (cachedSlideIds.length === 0) { flashToast('Kembali ke editor dulu'); return false; }
  const idx = getCurrentIndex();
  if (idx <= 0) { flashToast('Slide awal'); return false; }
  navigateToSlideId(cachedSlideIds[idx - 1]);
  return true;
}

function startPresentation() {
  console.log('[presentExs] Request present fullscreen');
  saveCache();  // cache slide IDs dulu
  chrome.runtime.sendMessage({ type: 'PRESENT_FULLSCREEN' }, (res) => {
    if (chrome.runtime.lastError) {
      console.warn('[presentExs] Present error:', chrome.runtime.lastError);
    } else {
      console.log('[presentExs] Present response:', res);
    }
  });
  return true;
}

function exitPresentation() {
  console.log('[presentExs] Request exit fullscreen');
  chrome.runtime.sendMessage({ type: 'EXIT_FULLSCREEN' }, (res) => {
    if (chrome.runtime.lastError) {
      console.warn('[presentExs] Exit error:', chrome.runtime.lastError);
    } else {
      console.log('[presentExs] Exit response:', res);
    }
  });
  return true;
}

// ============================================================
// SUBTITLE OVERLAY (Shadow DOM for isolation)
// ============================================================
let subtitleHost = null;
let subtitleText = null;
let subtitleSettings = { opacity: 50, bgColor: 'black', enabled: false, positionTop: false };

function createSubtitleOverlay() {
  if (subtitleHost) return;

  subtitleHost = document.createElement('div');
  subtitleHost.id = 'presentexs-subtitle-host';
  subtitleHost.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483645;';
  document.documentElement.appendChild(subtitleHost);

  const shadow = subtitleHost.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .wrap {
        position: fixed;
        left: 5%; right: 5%;
        text-align: center;
        pointer-events: none;
        font-family: 'Segoe UI', Roboto, sans-serif;
        font-size: 32px;
        font-weight: 600;
        line-height: 1.4;
        display: none;
      }
      .wrap.bottom { bottom: 6%; }
      .wrap.top    { top: 6%; }
      .wrap.visible { display: block; }
      .inner {
        display: inline-block;
        padding: 10px 24px;
        border-radius: 10px;
        max-width: 100%;
        word-wrap: break-word;
        box-sizing: border-box;
        transition: background 0.2s, color 0.2s;
      }
    </style>
    <div class="wrap bottom" id="wrap"><span class="inner" id="text"></span></div>
  `;

  subtitleText = shadow.getElementById('text');
  subtitleHost.__shadow = shadow;
  subtitleHost.__wrap = shadow.getElementById('wrap');
}

function applySubtitleStyle() {
  if (!subtitleHost) return;
  const wrap = subtitleHost.__wrap;
  const textEl = subtitleText;
  if (!wrap || !textEl) return;

  const colors = {
    black: { rgb: '0,0,0', text: '#fff' },
    white: { rgb: '255,255,255', text: '#000' },
    blue:  { rgb: '26,115,232', text: '#fff' },
    green: { rgb: '52,168,83', text: '#fff' },
    red:   { rgb: '234,67,53', text: '#fff' }
  };
  const cfg = colors[subtitleSettings.bgColor] || colors.black;

  textEl.style.background = `rgba(${cfg.rgb}, ${subtitleSettings.opacity / 100})`;
  textEl.style.color = cfg.text;

  wrap.classList.remove('top', 'bottom');
  wrap.classList.add(subtitleSettings.positionTop ? 'top' : 'bottom');

  // Pindah ke fullscreen root jika ada
  const fsEl = document.fullscreenElement || document.documentElement;
  if (subtitleHost.parentNode !== fsEl) {
    try { fsEl.appendChild(subtitleHost); } catch (e) {}
  }
}

function showSubtitle(text) {
  if (!text || !subtitleSettings.enabled) return;
  createSubtitleOverlay();
  subtitleText.textContent = text;
  subtitleHost.__wrap.classList.add('visible');
  applySubtitleStyle();
}

function hideSubtitle() {
  if (subtitleHost && subtitleHost.__wrap) subtitleHost.__wrap.classList.remove('visible');
}

document.addEventListener('fullscreenchange', applySubtitleStyle);

// ============================================================
// TOOLBAR (floating, auto-hide, snap, drag)
// ============================================================
const IDLE_TIMEOUT = 5000;
const MIN_OPACITY = 0.35;
const MIN_VISIBLE_PX = 20;

let toolbarHost = null;
let toolbarState = {
  expanded: false,
  minimized: false,
  snapSide: 'right',
  position: { x: window.innerWidth - 90, y: 120 },
  voiceEnabled: false,
  subtitleEnabled: false
};
let autoHideTimer = null;
let toastTimer = null;

function flashToast(msg) {
  if (!toolbarHost) return;
  const shadow = toolbarHost.__shadow;
  const toast = shadow.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
}

function createToolbar() {
  if (toolbarHost) return;

  const present = isPresentMode();

  toolbarHost = document.createElement('div');
  toolbarHost.id = 'presentexs-host';
  toolbarHost.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
  document.documentElement.appendChild(toolbarHost);

  const shadow = toolbarHost.attachShadow({ mode: 'open' });
  toolbarHost.__shadow = shadow;

  shadow.innerHTML = `
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      .group {
        position: fixed;
        display: flex;
        flex-direction: column;
        gap: 10px;
        align-items: center;
        pointer-events: auto;
        user-select: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        opacity: ${MIN_OPACITY};
        transition: opacity 0.35s ease, transform 0.45s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .group:hover, .group.expanded, .group.dragging, .group.awake { opacity: 1; }
      .group.dragging { cursor: grabbing; transition: opacity 0.2s ease; }
      .group.minimized.left  { transform: translateX(calc(-100% + ${MIN_VISIBLE_PX}px)); }
      .group.minimized.right { transform: translateX(calc(100% - ${MIN_VISIBLE_PX}px)); }

      .btn {
        width: 48px; height: 48px; border-radius: 50%; border: none;
        color: #fff; font-size: 20px; cursor: pointer; padding: 0;
        display: flex; align-items: center; justify-content: center;
        transition: transform 0.15s, background 0.15s;
        position: relative;
        font-family: inherit;
      }
      .btn:hover { transform: scale(1.08); }
      .btn:active { transform: scale(0.94); }

      .btn.main {
        background: linear-gradient(135deg, #FF8A4C, #FF5C8A);
        box-shadow: 0 6px 20px rgba(255,138,76,0.5);
      }
      .btn.main.active {
        background: linear-gradient(135deg, #34D399, #22C55E);
        box-shadow: 0 6px 20px rgba(34,197,94,0.5);
      }
      .btn.present {
        background: linear-gradient(135deg, #4F46E5, #6366F1);
        box-shadow: 0 6px 20px rgba(99,102,241,0.5);
      }
      .btn.exit {
        background: linear-gradient(135deg, #EF4444, #DC2626);
        box-shadow: 0 6px 20px rgba(239,68,68,0.5);
      }
      .btn.nav { background: #2d2d2d; box-shadow: 0 4px 14px rgba(0,0,0,0.4); }
      .btn.nav:hover { background: #3d3d3d; }
      .btn.subtitle.on {
        background: linear-gradient(135deg, #F59E0B, #FBBF24);
        box-shadow: 0 6px 20px rgba(245,158,11,0.5);
      }

      .btn .dot {
        position: absolute; top: 2px; right: 2px;
        width: 10px; height: 10px; border-radius: 50%;
        background: #34D399; border: 2px solid #1f1f1f; display: none;
      }
      .btn.on .dot { display: block; }

      .sub {
        display: none;
        flex-direction: column;
        gap: 8px;
        align-items: center;
      }
      .group.expanded .sub { display: flex; }

      .btn[data-tip]:hover::after {
        content: attr(data-tip);
        position: absolute; right: 60px; top: 50%; transform: translateY(-50%);
        background: #1f1f1f; color: #fff; padding: 6px 10px;
        border-radius: 6px; font-size: 12px; white-space: nowrap;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4); pointer-events: none;
      }
      .group.minimized.left .btn[data-tip]:hover::after { right: auto; left: 60px; }

      .toast {
        position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
        background: #1f1f1f; color: #fff; padding: 10px 18px;
        border-radius: 8px; font-size: 13px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        display: none; border-left: 3px solid #FF8A4C;
        pointer-events: none;
      }
      .toast.show { display: block; animation: fade 0.3s ease; }
      @keyframes fade {
        from { opacity: 0; transform: translate(-50%, -10px); }
        to   { opacity: 1; transform: translate(-50%, 0); }
      }
    </style>
    <div class="group" id="group">
      <button class="btn main" id="btnMain" data-tip="presentExs">🎙️</button>
      <div class="sub" id="sub">
        <button class="btn ${present ? 'exit' : 'present'}" id="btnPresent"
          data-tip="${present ? 'Keluar presentasi' : 'Mulai presentasi'}">
          ${present ? '⏹️' : '▶️'}
        </button>
        <button class="btn nav" id="btnNext" data-tip="Slide berikutnya">⏭️</button>
        <button class="btn nav" id="btnPrev" data-tip="Slide sebelumnya">⏮️</button>
        <button class="btn subtitle" id="btnSubtitle" data-tip="Toggle subtitle">💬<span class="dot"></span></button>
      </div>
    </div>
    <div class="toast" id="toast"></div>
  `;

  const $ = (id) => shadow.getElementById(id);
  const group = $('group');
  const btnMain = $('btnMain');
  const btnPresent = $('btnPresent');
  const btnNext = $('btnNext');
  const btnPrev = $('btnPrev');
  const btnSubtitle = $('btnSubtitle');

  // ---------- Position ----------
  function applyPosition() {
    const w = innerWidth, h = innerHeight;
    toolbarState.position.x = Math.max(8, Math.min(toolbarState.position.x, w - 60));
    toolbarState.position.y = Math.max(8, Math.min(toolbarState.position.y, h - 60));
    group.style.left = toolbarState.position.x + 'px';
    group.style.top = toolbarState.position.y + 'px';
    toolbarState.snapSide = (toolbarState.position.x + 30) < (w / 2) ? 'left' : 'right';
    group.classList.toggle('left', toolbarState.snapSide === 'left');
    group.classList.toggle('right', toolbarState.snapSide === 'right');
  }

  function savePosition() {
    chrome.storage.local.set({ toolbarPosition: toolbarState.position });
  }

  // ---------- Minimize ----------
  function minimize() {
    if (toolbarState.minimized) return;
    toolbarState.minimized = true;
    if (toolbarState.expanded) {
      toolbarState.expanded = false;
      group.classList.remove('expanded');
    }
    group.classList.add('minimized');
  }

  function restore() {
    if (!toolbarState.minimized) return;
    toolbarState.minimized = false;
    group.classList.remove('minimized');
  }

  function startAutoHide() {
    clearTimeout(autoHideTimer);
    if (toolbarState.expanded) return;
    autoHideTimer = setTimeout(minimize, IDLE_TIMEOUT);
  }

  function wake() {
    clearTimeout(autoHideTimer);
    group.classList.add('awake');
    restore();
  }

  function sleep() {
    group.classList.remove('awake');
    startAutoHide();
  }

  function resetActivity() {
    restore();
    startAutoHide();
  }

  // ---------- Drag ----------
  let dragState = null;
  btnMain.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    restore();
    clearTimeout(autoHideTimer);
    dragState = {
      startX: e.clientX, startY: e.clientY,
      origX: toolbarState.position.x, origY: toolbarState.position.y,
      moved: false
    };
    try { btnMain.setPointerCapture(e.pointerId); } catch (e) {}
  });

  btnMain.addEventListener('pointermove', (e) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(dx, dy) > 5) {
      dragState.moved = true;
      group.classList.add('dragging');
    }
    if (dragState.moved) {
      toolbarState.position.x = dragState.origX + dx;
      toolbarState.position.y = dragState.origY + dy;
      applyPosition();
    }
  });

  btnMain.addEventListener('pointerup', (e) => {
    if (!dragState) return;
    try { btnMain.releasePointerCapture(e.pointerId); } catch (e) {}
    group.classList.remove('dragging');
    if (dragState.moved) {
      savePosition();
    } else {
      toolbarState.expanded = !toolbarState.expanded;
      group.classList.toggle('expanded', toolbarState.expanded);
    }
    dragState = null;
    startAutoHide();
  });

  // ---------- Hover ----------
  group.addEventListener('pointerenter', wake);
  group.addEventListener('pointerleave', sleep);

  // ---------- Actions ----------
  btnPresent.addEventListener('click', () => {
    if (isPresentMode()) exitPresentation();
    else startPresentation();
    resetActivity();
  });

  btnNext.addEventListener('click', () => {
    nextSlide();
    resetActivity();
  });

  btnPrev.addEventListener('click', () => {
    prevSlide();
    resetActivity();
  });

  btnSubtitle.addEventListener('click', () => {
    toolbarState.subtitleEnabled = !toolbarState.subtitleEnabled;
    btnSubtitle.classList.toggle('on', toolbarState.subtitleEnabled);
    chrome.storage.local.set({ subtitleEnabled: toolbarState.subtitleEnabled });
    flashToast(toolbarState.subtitleEnabled ? '💬 Subtitle ON' : '💬 Subtitle OFF');
    resetActivity();
  });

  // ---------- Init ----------
  chrome.storage.local.get(
    ['toolbarPosition', 'subtitleEnabled'],
    (res) => {
      if (res.toolbarPosition) {
        toolbarState.position = res.toolbarPosition;
      }
      applyPosition();
      if (res.subtitleEnabled) {
        toolbarState.subtitleEnabled = true;
        btnSubtitle.classList.add('on');
      }
      startAutoHide();
    }
  );

  // Storage sync
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.subtitleEnabled) {
      toolbarState.subtitleEnabled = !!changes.subtitleEnabled.newValue;
      btnSubtitle.classList.toggle('on', toolbarState.subtitleEnabled);
      subtitleSettings.enabled = toolbarState.subtitleEnabled;
      if (!toolbarState.subtitleEnabled) hideSubtitle();
    }
    if (changes.subtitleOpacity) {
      subtitleSettings.opacity = changes.subtitleOpacity.newValue;
      applySubtitleStyle();
    }
    if (changes.subtitleBgColor) {
      subtitleSettings.bgColor = changes.subtitleBgColor.newValue;
      applySubtitleStyle();
    }
    if (changes.subtitlePositionTop) {
      subtitleSettings.positionTop = changes.subtitlePositionTop.newValue;
      applySubtitleStyle();
    }
  });

  window.addEventListener('resize', applyPosition);

  console.log('[presentExs] ✓ Toolbar siap — mode:', present ? 'PRESENT' : 'EDITOR');
}

// ============================================================
// MESSAGE HANDLER
// ============================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'DISPATCH_KEY') {
    if (msg.action === 'next') nextSlide();
    else if (msg.action === 'prev') prevSlide();
    else if (msg.action === 'present') startPresentation();
    else if (msg.action === 'exit') exitPresentation();
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'SHOW_SUBTITLE') {
    showSubtitle(msg.text);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'HIDE_SUBTITLE') {
    hideSubtitle();
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

// ============================================================
// INIT
// ============================================================
function init() {
  const present = isPresentMode();

  // Load subtitle settings
  chrome.storage.local.get(
    ['subtitleEnabled', 'subtitleOpacity', 'subtitleBgColor', 'subtitlePositionTop'],
    (res) => {
      if (res.subtitleEnabled) subtitleSettings.enabled = true;
      if (res.subtitleOpacity !== undefined) subtitleSettings.opacity = res.subtitleOpacity;
      if (res.subtitleBgColor) subtitleSettings.bgColor = res.subtitleBgColor;
      if (res.subtitlePositionTop) subtitleSettings.positionTop = true;
      if (subtitleSettings.enabled) createSubtitleOverlay();
    }
  );

  if (present) {
    loadCache(() => createToolbar());
  } else {
    setTimeout(() => {
      saveCache();
      createToolbar();
    }, 800);
  }
}