const statusEl = document.getElementById('status');
const reqBtn = document.getElementById('reqBtn');

async function requestMic() {
  statusEl.className = 'status';
  statusEl.textContent = 'Meminta izin... Silakan klik "Allow" pada prompt.';
  reqBtn.disabled = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Berhasil! Matikan track agar tidak ada indikator merah terus-menerus
    stream.getTracks().forEach(t => t.stop());

    statusEl.className = 'status ok';
    statusEl.textContent = '✅ Izin diberikan! Menutup tab dalam 1 detik...';

    // Simpan flag bahwa izin sudah diberikan
    chrome.storage.local.set({ micPermission: true });

    // Beritahu background bahwa izin sudah OK
    try {
      await chrome.runtime.sendMessage({ type: 'PERMISSION_GRANTED' });
    } catch (e) {}

    setTimeout(() => window.close(), 1000);
  } catch (err) {
    statusEl.className = 'status err';
    let pesan = err.message;
    if (err.name === 'NotAllowedError') {
      pesan = 'Izin ditolak. Klik ikon 🔒/🎤 di address bar → Site settings → Microphone → Allow, lalu coba lagi.';
    }
    statusEl.textContent = '❌ ' + pesan;
    reqBtn.disabled = false;
  }
}

reqBtn.addEventListener('click', requestMic);

// Auto-request saat halaman dimuat (user sudah dalam konteks klik dari popup)
requestMic();