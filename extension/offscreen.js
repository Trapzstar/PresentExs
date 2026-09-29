let recognition = null;
let recognizing = false;

// Daftar perintah suara yang dikenali
const COMMANDS = [
  { patterns: ['lanjut', 'next', 'berikutnya', 'maju', 'geser kanan'], action: 'next' },
  { patterns: ['kembali', 'sebelumnya', 'previous', 'mundur', 'geser kiri'], action: 'prev' },
  { patterns: ['mulai', 'start', 'presentasi', 'present'], action: 'present' },
  { patterns: ['keluar', 'exit', 'selesai', 'stop'], action: 'exit' }
];

function matchCommand(text) {
  const lower = text.toLowerCase();
  for (const cmd of COMMANDS) {
    for (const p of cmd.patterns) {
      if (lower.includes(p)) return cmd.action;
    }
  }
  return null;
}

function setStatus(text) {
  chrome.storage.local.set({ voiceStatus: text });
}

function startRecognition() {
  if (recognizing) return;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    setStatus('❌ Browser tidak mendukung Web Speech API');
    return;
  }

  recognition = new SR();
  recognition.lang = 'id-ID';
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    recognizing = true;
    setStatus('🎤 Mendengarkan perintah...');
  };

  recognition.onresult = (event) => {
    const last = event.results.length - 1;
    const transcript = event.results[last][0].transcript.trim();
    console.log('[Voice] Terdengar:', transcript);
    setStatus(`👂 "${transcript}"`);
    const action = matchCommand(transcript);
    if (action) {
      chrome.runtime.sendMessage({ type: 'VOICE_ACTION', action }).catch(() => {});
    }
  };

  recognition.onerror = (e) => {
    console.warn('[Voice] Error:', e.error);
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      setStatus('❌ Izin mikrofon ditolak. Buka ikon 🎤 di address bar.');
      recognizing = false;
      chrome.storage.local.set({ voiceActive: false });
    } else if (e.error === 'no-speech' || e.error === 'audio-capture') {
      // Diabaikan, akan auto-restart
    } else {
      setStatus('⚠ Error: ' + e.error);
    }
  };

  recognition.onend = () => {
    recognizing = false;
    chrome.storage.local.get(['voiceActive'], (res) => {
      if (res.voiceActive) {
        setTimeout(() => {
          try { startRecognition(); } catch (e) { console.warn(e); }
        }, 300);
      }
    });
  };

  try {
    recognition.start();
  } catch (e) {
    setStatus('❌ Gagal memulai: ' + e.message);
  }
}

function stopRecognition() {
  chrome.storage.local.set({ voiceActive: false });
  if (recognition) {
    try {
      recognition.onend = null;
      recognition.stop();
    } catch (e) {}
    recognition = null;
  }
  recognizing = false;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'OFFSCREEN_START') {
    startRecognition();
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'OFFSCREEN_STOP') {
    stopRecognition();
    sendResponse({ ok: true });
    return true;
  }
  return false;
});