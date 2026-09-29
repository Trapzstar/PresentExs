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
  return false;
});