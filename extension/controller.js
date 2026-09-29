// ============================================================
// Controller window — Whisper + fuzzy matching + alias learning
// ============================================================

import { pipeline, env } from './transformers.min.js';

// ---------------- DOM ----------------
const micInd = document.getElementById('micInd');
const micStatus = document.getElementById('micStatus');
const recInd = document.getElementById('recInd');
const recStatus = document.getElementById('recStatus');
const heardEl = document.getElementById('heard');
const toggleBtn = document.getElementById('toggleBtn');
const trainBtn = document.getElementById('trainBtn');
const trainStatus = document.getElementById('trainStatus');
const modelSelect = document.getElementById('modelSelect');

// ---------------- State ----------------
let transcriber = null;
let currentModelName = 'Xenova/whisper-base';
let audioContext = null;
let mediaStream = null;
let processor = null;
let listening = false;
let audioBufferQueue = [];
let transcriptionTimer = null;
let lastTranscript = '';        // untuk fitur "Latih"
let lastTranscriptAction = null;
let aliases = {};               // { "ucapan salah (lowercase)": "action" }

const SAMPLE_RATE = 16000;

// ---------------- Daftar perintah ----------------
const COMMANDS = [
  { action: 'next',    patterns: ['lanjut', 'next', 'berikutnya', 'maju', 'geser kanan', 'kanan', 'right'] },
  { action: 'prev',    patterns: ['kembali', 'sebelumnya', 'previous', 'mundur', 'geser kiri', 'kiri', 'back', 'left'] },
  { action: 'present', patterns: ['mulai', 'start', 'presentasi', 'present', 'tampilkan'] },
  { action: 'exit',    patterns: ['keluar', 'exit', 'selesai', 'stop', 'berhenti', 'escape'] }
];

// Kata kunci yang diberikan ke Whisper sebagai "hint"
const INITIAL_PROMPT =
  'Perintah presentasi: lanjut, next, berikutnya, maju, geser kanan, ' +
  'kembali, sebelumnya, previous, mundur, geser kiri, ' +
  'mulai, start, presentasi, present, ' +
  'keluar, exit, selesai, stop, berhenti.';

// ---------------- Storage alias ----------------
async function loadAliases() {
  const res = await chrome.storage.local.get(['aliases']);
  aliases = res.aliases || {};
}

async function saveAliases() {
  await chrome.storage.local.set({ aliases });
}

// ---------------- Levenshtein ----------------
function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        m[i][j] = m[i - 1][j - 1];
      } else {
        m[i][j] = Math.min(
          m[i - 1][j - 1] + 1,
          m[i][j - 1] + 1,
          m[i - 1][j] + 1
        );
      }
    }
  }
  return m[b.length][a.length];
}

// Toleransi typo berdasarkan panjang kata
function toleranceFor(word) {
  if (word.length <= 3) return 0;
  if (word.length <= 5) return 1;
  return 2;
}

// ---------------- Fuzzy match ----------------
function matchCommand(text) {
  const lower = text.toLowerCase().replace(/[.,!?]/g, '').trim();
  if (!lower) return null;

  // 1. Alias persis
  if (aliases[lower]) return aliases[lower];

  // 2. Alias sebagian (kalau user melatih frasa utuh)
  for (const [key, action] of Object.entries(aliases)) {
    if (lower.includes(key) || key.includes(lower)) return action;
  }

  // 3. Pencocokan substring persis dengan pattern
  for (const cmd of COMMANDS) {
    for (const p of cmd.patterns) {
      if (lower.includes(p)) return cmd.action;
    }
  }

  // 4. Fuzzy matching per kata
  const words = lower.split(/\s+/);
  for (const cmd of COMMANDS) {
    for (const p of cmd.patterns) {
      for (const w of words) {
        if (Math.abs(w.length - p.length) > 3) continue;
        if (levenshtein(w, p) <= toleranceFor(p)) {
          return cmd.action;
        }
      }
    }
  }

  return null;
}

// ---------------- UI helper ----------------
function setMic(state, text) {
  micInd.className = 'indicator' + (state === 'on' ? ' on' : state === 'err' ? ' err' : '');
  micStatus.textContent = text;
}
function setRec(state, text) {
  const cls = state === 'on' ? ' on' : state === 'busy' ? ' busy' : state === 'err' ? ' err' : '';
  recInd.className = 'indicator' + cls;
  recStatus.textContent = text;
}
function appendHeard(html) {
  const t = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = 'entry';
  entry.innerHTML = `[${t}] ${html}`;
  if (heardEl.firstChild && heardEl.textContent.startsWith('(Yang terdengar')) {
    heardEl.innerHTML = '';
  }
  heardEl.insertBefore(entry, heardEl.firstChild);
  while (heardEl.children.length > 15) {
    heardEl.removeChild(heardEl.lastChild);
  }
}

async function checkMicPermission() {
  try {
    const p = await navigator.permissions.query({ name: 'microphone' });
    return p.state;
  } catch (e) { return 'prompt'; }
}

// ---------------- Load Whisper ----------------
async function initWhisper(modelName) {
  if (transcriber && currentModelName === modelName) return true;

  // Dispose model lama jika ada
  if (transcriber && typeof transcriber.dispose === 'function') {
    try { await transcriber.dispose(); } catch (e) {}
    transcriber = null;
  }

  currentModelName = modelName;
  setRec('busy', `⏳ Memuat ${modelName}...`);
  appendHeard(`⏳ Mengunduh model <b>${modelName}</b>...`);

  try {
    if (env) {
      env.allowLocalModels = false;
      env.useBrowserCache = true;
    }

    transcriber = await pipeline(
      'automatic-speech-recognition',
      modelName,
      { quantized: true }
    );

    setRec('off', '✅ Model siap. Klik "Mulai Mendengarkan"');
    appendHeard('✅ Model siap digunakan.');
    toggleBtn.disabled = false;
    toggleBtn.textContent = '▶ Mulai Mendengarkan';
    modelSelect.disabled = false;
    return true;
  } catch (e) {
    console.error('[Whisper] Gagal memuat:', e);
    setRec('err', '❌ Gagal memuat: ' + e.message);
    appendHeard(`<span class="err">❌ ${e.message}</span>`);
    return false;
  }
}

// ---------------- Listening ----------------
async function startListening() {
  if (listening) return;
  if (!transcriber) { appendHeard('⚠ Model belum siap.'); return; }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }
    });
  } catch (err) {
    setMic('err', 'Izin ditolak: ' + err.name);
    appendHeard(`<span class="err">❌ Mikrofon tidak diizinkan</span>`);
    return;
  }

  setMic('on', 'Izin mikrofon: GRANTED');

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    const source = audioContext.createMediaStreamSource(mediaStream);

    processor = audioContext.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      if (!listening) return;
      audioBufferQueue.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    listening = true;
    setRec('on', '🎤 Mendengarkan (Whisper)...');
    toggleBtn.textContent = '⏸ Berhenti';
    toggleBtn.classList.remove('primary');
    toggleBtn.classList.add('danger');
    appendHeard('🎤 Mulai mendengarkan...');

    scheduleTranscription();
  } catch (err) {
    setRec('err', '❌ ' + err.message);
    appendHeard(`<span class="err">❌ ${err.message}</span>`);
    stopListening();
  }
}

function scheduleTranscription() {
  if (transcriptionTimer) clearTimeout(transcriptionTimer);
  transcriptionTimer = setTimeout(runTranscription, 1200);
}

async function runTranscription() {
  if (!listening || !transcriber) return;

  if (audioBufferQueue.length > 0) {
    const totalLen = audioBufferQueue.reduce((s, b) => s + b.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const buf of audioBufferQueue) { merged.set(buf, offset); offset += buf.length; }
    audioBufferQueue = [];

    const durationSec = merged.length / SAMPLE_RATE;

    // VAD sederhana: hitung RMS (energi) audio
    let sumSq = 0;
    for (let i = 0; i < merged.length; i++) sumSq += merged[i] * merged[i];
    const rms = Math.sqrt(sumSq / merged.length);

    // Hanya transkripsi jika durasi cukup & ada suara
    if (durationSec > 0.4 && rms > 0.003) {
      try {
        const result = await transcriber(merged, {
          language: 'indonesian',
          task: 'transcribe',
          initial_prompt: INITIAL_PROMPT,
          // chunk_length_s: 30,     ← comment, default 30 sudah cukup
          // stride_length_s: 5      ← comment, hanya perlu untuk audio panjang
        });

        const text = (result && result.text ? result.text : '').trim();
        if (text && text.length > 1) {
          lastTranscript = text;
          appendHeard(`"${text}"`);
          const action = matchCommand(text);
          if (action) {
            lastTranscriptAction = action;
            trainBtn.disabled = false;
            appendHeard(`<span class="action">➡ ${action}</span>`);
            try {
              const res = await chrome.runtime.sendMessage({ type: 'VOICE_ACTION', action });
              if (res && !res.success) appendHeard(`<span class="err">❌ ${res.error}</span>`);
            } catch (e) {
              appendHeard(`<span class="err">❌ ${e.message}</span>`);
            }
          } else {
            lastTranscriptAction = null;
            trainBtn.disabled = false;
            appendHeard(`<span style="color:#9aa0a6">(tidak dikenali — klik 🎓 Latih untuk mengajari)</span>`);
          }
        }
      } catch (err) {
        console.error('[Whisper] Transkripsi error:', err);
      }
    }
  }

  if (listening) scheduleTranscription();
}

function stopListening() {
  listening = false;
  if (transcriptionTimer) { clearTimeout(transcriptionTimer); transcriptionTimer = null; }
  if (processor) { try { processor.disconnect(); } catch (e) {} processor.onaudioprocess = null; processor = null; }
  if (audioContext) { try { audioContext.close(); } catch (e) {} audioContext = null; }
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  audioBufferQueue = [];
  setRec('off', '⏹ Dihentikan');
  toggleBtn.textContent = '▶ Mulai Mendengarkan';
  toggleBtn.classList.add('primary');
  toggleBtn.classList.remove('danger');
}

// ---------------- Fitur "Latih" ----------------
trainBtn.addEventListener('click', async () => {
  if (!lastTranscript) {
    trainStatus.textContent = '⚠ Belum ada ucapan untuk dilatih.';
    return;
  }

  // Tanya user perintah apa yang dimaksud
  const jawab = prompt(
    `Whisper mendengar:\n"${lastTranscript}"\n\n` +
    `Perintah apa yang Anda maksud?\n` +
    `Ketik salah satu: next / prev / present / exit / skip`,
    lastTranscriptAction || 'next'
  );

  if (!jawab) return;
  const action = jawab.toLowerCase().trim();

  if (action === 'skip') {
    trainStatus.textContent = '↩ Dilewati.';
    return;
  }
  if (!['next', 'prev', 'present', 'exit'].includes(action)) {
    trainStatus.textContent = '⚠ Hanya: next / prev / present / exit / skip';
    return;
  }

  // Simpan alias
  aliases[lastTranscript.toLowerCase()] = action;
  await saveAliases();

  trainStatus.textContent = `✅ Dipelajari: "${lastTranscript}" → ${action}`;
  appendHeard(`🎓 Dilatih: "${lastTranscript}" → <b>${action}</b>`);

  // Kirim perintah yang benar sekarang
  try {
    await chrome.runtime.sendMessage({ type: 'VOICE_ACTION', action });
  } catch (e) {}
});

// ---------------- Tombol utama ----------------
toggleBtn.addEventListener('click', async () => {
  if (listening) { stopListening(); return; }
  if (!transcriber) {
    const ok = await initWhisper(modelSelect.value);
    if (!ok) return;
  }
  const perm = await checkMicPermission();
  if (perm === 'denied') {
    setMic('err', 'Izin DITOLAK — atur di ikon 🔒 address bar');
    appendHeard(`<span class="err">❌ Izin mikrofon diblokir.</span>`);
    return;
  }
  await startListening();
});

document.getElementById('clearBtn').addEventListener('click', () => {
  heardEl.innerHTML = '(Yang terdengar akan tampil di sini)';
  trainStatus.textContent = '';
});

// Ganti model → reload
modelSelect.addEventListener('change', async () => {
  const wasListening = listening;
  if (wasListening) stopListening();
  modelSelect.disabled = true;
  toggleBtn.disabled = true;
  toggleBtn.textContent = '⏳ Memuat model...';
  const ok = await initWhisper(modelSelect.value);
  if (ok && wasListening) await startListening();
});

// ---------------- Init ----------------
(async function init() {
  await loadAliases();
  console.log('[Alias] Dimuat:', aliases);

  const perm = await checkMicPermission();
  if (perm === 'granted') setMic('on', 'Izin mikrofon: GRANTED');
  else if (perm === 'denied') setMic('err', 'Izin DITOLAK');
  else setMic('off', 'Izin belum diberikan');

  // Muat model default (whisper-base)
  await initWhisper(currentModelName);
})();