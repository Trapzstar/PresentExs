// ============================================================
// background.js — Relay commands ke content script
// ============================================================
console.log('[presentExs] Background started');

async function findSlidesTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active && active.url && active.url.includes('docs.google.com/presentation')) return active;
  const tabs = await chrome.tabs.query({ url: 'https://docs.google.com/presentation/*' });
  return tabs[0] || null;
}

async function forwardAction(action) {
  const tab = await findSlidesTab();
  if (!tab) return { success: false, error: 'Tidak ada tab Google Slides.' };
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'DISPATCH_KEY', action });
    return res || { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SEND_ACTION' || msg.type === 'VOICE_ACTION') {
    forwardAction(msg.action).then(sendResponse);
    return true;
  }
  if (msg.type === 'OPEN_SETTINGS') {
    try { chrome.action.openPopup().catch(() => {}); } catch (e) {}
    sendResponse({ success: true });
    return false;
  }

  if (msg.type === 'PRESENT_FULLSCREEN') {
    startPresentFullscreen().then(sendResponse);
    return true;
  }

  if (msg.type === 'EXIT_FULLSCREEN') {
    exitPresentFullscreen().then(sendResponse);
    return true;
  }

  return false;
  

});

// ============================================================
// FULLSCREEN PRESENT
// ============================================================

function extractPresentationId(url) {
  if (!url) return null;
  const m = url.match(/\/presentation\/d\/([^\/]+)/);
  return m ? m[1] : null;
}

function waitForTabLoad(tabId, timeout = 8000) {
  return new Promise((resolve) => {
    let done = false;

    function finish(tab) {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(tab);
    }

    function listener(id, info, tab) {
      if (id === tabId && info.status === 'complete') {
        // Delay kecil biar Slides selesai render
        setTimeout(() => finish(tab), 300);
      }
    }

    chrome.tabs.onUpdated.addListener(listener);

    // Fallback timeout
    setTimeout(() => {
      chrome.tabs.get(tabId).then(finish).catch(() => finish(null));
    }, timeout);
  });
}

async function startPresentFullscreen() {
  const tab = await findSlidesTab();
  if (!tab) return { success: false, error: 'Tidak ada tab Slides' };

  const presId = extractPresentationId(tab.url);
  if (!presId) return { success: false, error: 'Tidak bisa ambil ID' };

  // Sudah di present mode? langsung fullscreen
  if (/\/present(\/|$)/.test(new URL(tab.url).pathname)) {
    try {
      await chrome.windows.update(tab.windowId, { state: 'fullscreen', focused: true });
      return { success: true, already: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // ✅ SIMPAN STATE WINDOW SEBELUM FULLSCREEN
  try {
    const win = await chrome.windows.get(tab.windowId);
    const prevState = win.state; // 'normal' | 'maximized' | 'minimized'
    await chrome.storage.local.set({ windowPrevState: prevState });
    console.log('[presentExs] Window prev state saved:', prevState);
  } catch (e) {
    console.warn('[presentExs] Save window state failed:', e.message);
  }

  // ✅ FULLSCREEN + NAVIGATE PARALEL (tidak await satu-satu)
  const presentUrl = `https://docs.google.com/presentation/d/${presId}/present`;
  console.log('[presentExs] Present + Fullscreen:', presentUrl);

  const fullscreenPromise = chrome.windows
    .update(tab.windowId, { state: 'fullscreen', focused: true })
    .catch((e) => console.warn('[presentExs] Fullscreen failed:', e.message));

  const navigatePromise = chrome.tabs
    .update(tab.id, { url: presentUrl })
    .catch((e) => console.warn('[presentExs] Navigate failed:', e.message));

  // Tunggu keduanya selesai
  await Promise.all([fullscreenPromise, navigatePromise]);

  // Tunggu tab selesai load
  const loaded = await waitForTabLoad(tab.id);
  if (!loaded) return { success: false, error: 'Tab tidak selesai load' };

  // Re-confirm fullscreen (jaga-jaga Chrome keluar sendiri)
  try {
    await chrome.windows.update(loaded.windowId, { state: 'fullscreen', focused: true });
  } catch (e) {}

  return { success: true };
}

async function exitPresentFullscreen() {
  const tab = await findSlidesTab();
  if (!tab) return { success: false, error: 'Tidak ada tab Slides' };

  const presId = extractPresentationId(tab.url);
  if (!presId) return { success: false, error: 'Tidak bisa ambil ID' };

  // ✅ BACA STATE SEBELUMNYA
  let restoreState = 'maximized'; // default ke maximized kalau tidak ada data
  try {
    const res = await chrome.storage.local.get(['windowPrevState']);
    if (res.windowPrevState) {
      restoreState = res.windowPrevState;
      console.log('[presentExs] Restoring window to:', restoreState);
    }
  } catch (e) {
    console.warn('[presentExs] Read window state failed:', e.message);
  }

  // ✅ EXIT FULLSCREEN → RESTORE KE STATE SEBELUMNYA
  try {
    // Kalau state sebelumnya 'normal', kita bisa coba 'maximized' sebagai default yang lebih baik
    const targetState = restoreState === 'fullscreen' ? 'maximized' : restoreState;
    await chrome.windows.update(tab.windowId, { state: targetState, focused: true });
    console.log('[presentExs] ✓ Window restored to:', targetState);
  } catch (e) {
    console.warn('[presentExs] Restore window failed:', e.message);
    // Fallback: coba maximized
    try {
      await chrome.windows.update(tab.windowId, { state: 'maximized', focused: true });
    } catch (e2) {}
  }

  // ✅ Navigate balik ke editor
  const editUrl = `https://docs.google.com/presentation/d/${presId}/edit`;
  console.log('[presentExs] Navigate ke editor:', editUrl);
  await chrome.tabs.update(tab.id, { url: editUrl });

  // Cleanup saved state
  try {
    await chrome.storage.local.remove(['windowPrevState']);
  } catch (e) {}

  return { success: true };
}