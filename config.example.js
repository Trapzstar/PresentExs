// ============================================================
// presentExs — Config Template
// Copy file ini jadi `config.local.js` lalu isi nilai asli.
// ============================================================

window.PRESENTEXS_CONFIG = {
  // URL halaman mobile di Cloudflare Pages (untuk generate QR)
  PHONE_PAGE_URL: '',

  // ICE Servers untuk WebRTC (PeerJS)
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },

    // TURN pribadi (uncomment di config.local.js)
    // {
    //   urls: 'turn:your-turn-server.com:3478',
    //   username: 'your_username',
    //   credential: 'your_secret_credential'
    // },
  ]
};