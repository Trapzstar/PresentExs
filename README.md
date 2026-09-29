# presentExs

> Chrome extension untuk kontrol Google Slides dengan voice control, subtitle, dan toolbar mengambang.

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue" alt="Manifest V3">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License MIT">
  <img src="https://img.shields.io/badge/Status-MVP-yellow" alt="Status MVP">
</p>

---

## ✨ Fitur

- 🎙️ **Voice Control** — Kontrol slide dengan suara. Support dua engine:
  - **Whisper lokal** (offline, akurat, via transformers.js)
  - **Web Speech API** (ringan, butuh internet, akurasi tinggi)
- 💬 **Subtitle Real-time** — Tampilkan teks ucapan presenter sebagai subtitle di atas slide, dengan kustomisasi font, warna, dan opacity.
- 🎛️ **Floating Toolbar** — Toolbar mengambang dengan auto-hide, drag, snap ke tepi layar, dan toggle cepat.
- 📱 **Remote via HP** — Kontrol presentasi dari HP dengan pairing via QR code (P2P WebRTC).
- 🔗 **Kontrol Google Slides** — Present mode, next/prev slide, dan exit — bekerja di editor maupun slideshow mode.

---

## 🚀 Instalasi

### Prerequisites

- Google Chrome (versi 116+)
- Google Slides presentasi untuk ditest
- (Opsional) Node.js kalau mau kontribusi development

### Langkah Instalasi

1. **Clone repo ini**
   ```bash
   git clone https://github.com/USERNAME/presentexs.git
   cd presentexs