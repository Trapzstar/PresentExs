// ============================================================
// presentExs — Popup Dashboard
// ============================================================

const $ = (id) => document.getElementById(id);

// ---------- Settings state ----------
const DEFAULT_SETTINGS = {
  voiceEnabled: false,
  subtitleEnabled: false,
  wakeWordEnabled: true,
  wakeWord: 'slide',
  cooldownMs: 1000,
  subtitleOpacity: 50,
  subtitleBgColor: 'black',
  subtitlePositionTop: false,
  theme: 'light',
};

let settings = { ...DEFAULT_SETTINGS };

// ---------- Storage ----------
function loadSettings(cb) {
  try {
    chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS), (res) => {
      if (chrome.runtime.lastError) { console.warn(chrome.runtime.lastError); return cb(); }
      settings = { ...DEFAULT_SETTINGS, ...(res || {}) };
      cb();
    });
  } catch (e) { console.warn(e); cb(); }
}
function saveSettings() { try { chrome.storage.local.set(settings); } catch (e) {} }
function saveOne(key, val) { settings[key] = val; try { chrome.storage.local.set({ [key]: val }); } catch (e) {} }

// ---------- Theme ----------
function applyTheme() {
  document.documentElement.setAttribute('data-theme', settings.theme);
  const btn = $('btnThemeToggle');
  if (btn) btn.textContent = settings.theme === 'dark' ? '☀️' : '🌙';
}

// ---------- UI sync ----------
function applyUI() {
  $('toggleVoice').checked = settings.voiceEnabled;
  $('toggleSubtitle').checked = settings.subtitleEnabled;

  $('setWakeWord').checked = settings.wakeWordEnabled;
  $('setWakeWordText').value = settings.wakeWord;

  $('setCooldown').value = settings.cooldownMs;
  $('setCooldownValue').textContent = settings.cooldownMs + ' ms';

  $('setOpacity').value = settings.subtitleOpacity;
  $('setOpacityValue').textContent = settings.subtitleOpacity + '%';

  $('setPosition').checked = settings.subtitlePositionTop;

  document.querySelectorAll('#colorChips .color-chip').forEach((c) => {
    c.classList.toggle('selected', c.dataset.color === settings.subtitleBgColor);
  });

  updateStatus();
  applyTheme();
}

function updateStatus() {
  const bar = $('statusBar');
  const txt = bar.querySelector('span:last-child');
  const active = [];
  if (settings.voiceEnabled) active.push('🎙️');
  if (settings.subtitleEnabled) active.push('💬');
  if (active.length === 0) {
    txt.textContent = 'Tidak ada fitur aktif';
    bar.classList.remove('ok');
  } else {
    txt.textContent = active.join(' + ') + ' aktif';
    bar.classList.add('ok');
  }
}

// ---------- Screen navigation ----------
function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  if (name === 'dashboard') $('screenDashboard').classList.add('active');
  else if (name === 'voice') $('screenVoice').classList.add('active');
  else if (name === 'subtitle') $('screenSubtitle').classList.add('active');
  else if (name === 'hotkey') $('screenHotkey').classList.add('active');
}

// ---------- Event: menu items ----------
document.querySelectorAll('.menu-item[data-screen]').forEach((btn) => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});
document.querySelectorAll('[data-back]').forEach((btn) => {
  btn.addEventListener('click', () => showScreen('dashboard'));
});

// ---------- Event: toggles ----------
$('toggleVoice').addEventListener('change', (e) => {
  saveOne('voiceEnabled', e.target.checked);
  updateStatus();
  notifyBackground('voiceEnabled', e.target.checked);
});
$('toggleSubtitle').addEventListener('change', (e) => {
  saveOne('subtitleEnabled', e.target.checked);
  updateStatus();
  notifyBackground('subtitleEnabled', e.target.checked);
});

// ---------- Voice settings ----------
$('setWakeWord').addEventListener('change', (e) => saveOne('wakeWordEnabled', e.target.checked));
$('setWakeWordText').addEventListener('change', (e) => {
  const v = (e.target.value || 'slide').trim().toLowerCase();
  e.target.value = v;
  saveOne('wakeWord', v);
});
$('setCooldown').addEventListener('input', (e) => {
  const v = parseInt(e.target.value, 10);
  $('setCooldownValue').textContent = v + ' ms';
  saveOne('cooldownMs', v);
});

// ---------- Subtitle settings ----------
$('setOpacity').addEventListener('input', (e) => {
  const v = parseInt(e.target.value, 10);
  $('setOpacityValue').textContent = v + '%';
  saveOne('subtitleOpacity', v);
  // Teruskan ke content script via storage onChanged
});
document.querySelectorAll('#colorChips .color-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#colorChips .color-chip').forEach((c) => c.classList.remove('selected'));
    chip.classList.add('selected');
    saveOne('subtitleBgColor', chip.dataset.color);
  });
});
$('setPosition').addEventListener('change', (e) => saveOne('subtitlePositionTop', e.target.checked));

// ---------- Theme toggle ----------
$('btnThemeToggle').addEventListener('click', () => {
  saveOne('theme', settings.theme === 'dark' ? 'light' : 'dark');
  applyTheme();
});

// ---------- Open controller / receiver windows ----------
async function openWindow(url, w, h, left, top) {
  const full = chrome.runtime.getURL(url);
  const existing = await chrome.tabs.query({ url: full });
  if (existing.length > 0) {
    await chrome.windows.update(existing[0].windowId, { focused: true });
  } else {
    await chrome.windows.create({ url: full, type: 'popup', width: w, height: h, left, top });
  }
  window.close();
}

$('openController').addEventListener('click', () => openWindow('controller.html', 380, 560, 80, 80));
$('openReceiver').addEventListener('click', () => openWindow('receiver.html', 380, 600, 480, 80));

// ---------- Notify background ----------
function notifyBackground(key, val) {
  try { chrome.runtime.sendMessage({ type: 'SETTING_CHANGED', key, value: val }); } catch (e) {}
}

// ---------- Init ----------
loadSettings(() => {
  applyUI();
});