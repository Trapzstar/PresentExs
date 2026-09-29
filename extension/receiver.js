// ============================================================
// Sisi PC — terima perintah, subtitle, dan settings dari HP
// ============================================================
const ROOM_PREFIX = 'gsc-ctrl-';

// ---- Load config dengan fallback ----
const CFG = window.PRESENTEXS_CONFIG || {};
const PHONE_PAGE_URL = CFG.PHONE_PAGE_URL || 'https://your-app.pages.dev/';
const ICE_SERVERS = CFG.ICE_SERVERS || [
  { urls: 'stun:stun.l.google.com:19302' }
];

const roomCodeEl = document.getElementById('roomCode');
const qrEl = document.getElementById('qr');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');

const code = String(Math.floor(100000 + Math.random() * 900000));
roomCodeEl.textContent = code;

const fullUrl = `${PHONE_PAGE_URL}?room=${code}`;
qrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(fullUrl)}`;

function log(msg, isErr = false) {
  const t = new Date().toLocaleTimeString();
  const div = document.createElement('div');
  div.textContent = `[${t}] ${msg}`;
  if (isErr) div.style.color = '#ea4335';
  if (logEl.textContent.startsWith('Log akan muncul')) logEl.replaceChildren();
  logEl.insertBefore(div, logEl.firstChild);
  while (logEl.children.length > 20) logEl.removeChild(logEl.lastChild);
}

function setStatus(msg, cls = '') {
  statusEl.textContent = msg;
  statusEl.className = 'status' + (cls ? ' ' + cls : '');
}

// ---------------- Slides tab tracking ----------------

let slidesTabId = null;

async function findSlidesTab() {
  if (slidesTabId !== null) {
    try {
      const t = await chrome.tabs.get(slidesTabId);
      if (t && t.url && t.url.includes('docs.google.com/presentation')) return t;
    } catch (e) { slidesTabId = null; }
  }
  const tabs = await chrome.tabs.query({ url: 'https://docs.google.com/presentation/*' });
  if (tabs.length > 0) {
    slidesTabId = tabs[0].id;
    return tabs[0];
  }
  return null;
}

// ---------------- Subtitle forwarding ----------------

async function forwardSubtitle(text) {
  const tab = await findSlidesTab();
  if (!tab) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_SUBTITLE', text });
  } catch (e) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['content-script.js']
      });
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { type: 'SHOW_SUBTITLE', text }).catch(() => {});
      }, 250);
    } catch (err) {
      console.warn('[Receiver] Inject gagal:', err);
    }
  }
}

async function hideSubtitle() {
  const tab = await findSlidesTab();
  if (!tab) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'HIDE_SUBTITLE' });
  } catch (e) {}
}

// ---------------- PeerJS ----------------

const peerId = ROOM_PREFIX + code;

const peer = new Peer(peerId, {
  debug: 1,
  config: {
    iceServers: ICE_SERVERS
  }
});

const connections = new Set();

peer.on('open', (id) => {
  setStatus('Menunggu HP scan QR...');
  log('Peer siap: ' + id);
});

peer.on('error', (err) => {
  setStatus('❌ ' + err.type + ': ' + err.message, 'err');
  log('Error: ' + err.type + ' — ' + err.message, true);
});

peer.on('connection', (conn) => {
  log('HP terhubung: ' + conn.peer);

  conn.on('open', () => {
    connections.add(conn);
    setStatus(`✅ ${connections.size} HP terhubung`, 'ok');
    log('Total: ' + connections.size);
    try { conn.send({ type: 'hello', from: 'pc' }); } catch (e) {}
  });

  conn.on('data', async (data) => {
    if (!data) return;

    // -- Perintah slide --
    if (data.action) {
      log('Perintah: ' + data.action);
      try {
        const res = await chrome.runtime.sendMessage({ type: 'VOICE_ACTION', action: data.action });
        try {
          conn.send({
            type: 'ack',
            action: data.action,
            success: !!(res && res.success),
            error: res?.error || null
          });
        } catch (e) {}
        if (res && !res.success) log('Gagal: ' + res.error, true);
      } catch (e) {
        try { conn.send({ type: 'ack', action: data.action, success: false, error: e.message }); } catch (err) {}
        log('Error: ' + e.message, true);
      }
      return;
    }

    // -- Subtitle dari presenter --
    if (data.type === 'subtitle' && data.text) {
      forwardSubtitle(data.text);
      for (const c of connections) {
        if (c !== conn && c.open) {
          try { c.send({ type: 'subtitle', text: data.text }); } catch (e) {}
        }
      }
      return;
    }

    // -- Subtitle OFF --
    if (data.type === 'subtitle-off') {
      log('Subtitle OFF');
      hideSubtitle();
      for (const c of connections) {
        if (c !== conn && c.open) {
          try { c.send({ type: 'subtitle-off' }); } catch (e) {}
        }
      }
      return;
    }

    // -- Settings dari HP (opacity + warna) --
    if (data.type === 'settings' && data.settings) {
      const s = data.settings;
      const update = {};
      if (s.subtitleOpacity !== undefined) update.subtitleOpacity = s.subtitleOpacity;
      if (s.subtitleBgColor !== undefined) update.subtitleBgColor = s.subtitleBgColor;
      if (Object.keys(update).length > 0) {
        chrome.storage.local.set(update);
        log('Settings disinkronkan: ' + JSON.stringify(update));
      }
      // Relay ke HP lain
      for (const c of connections) {
        if (c !== conn && c.open) {
          try { c.send({ type: 'settings', settings: s }); } catch (e) {}
        }
      }
      return;
    }
  });

  conn.on('close', () => {
    connections.delete(conn);
    setStatus(connections.size === 0 ? '⚠ Semua HP terputus' : `✅ ${connections.size} HP terhubung`,
              connections.size === 0 ? 'err' : 'ok');
    log('Koneksi ditutup. Total: ' + connections.size);
  });

  conn.on('error', (e) => log('Conn error: ' + e.message, true));
});

window.addEventListener('beforeunload', () => {
  try { peer.destroy(); } catch (e) {}
});