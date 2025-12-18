# 🤖 WhatsApp Bot (Sticker & Music)

Bot WhatsApp berbasis **Node.js + Baileys** dengan fitur utama **auto sticker** dan **download lagu YouTube (MP3)**. Cocok untuk belajar, eksperimen, maupun dipakai di grup WhatsApp.

---

## ✨ Fitur Utama

* 📸 **Auto Sticker**

  * Kirim **foto** → otomatis jadi sticker
  * Kirim **video (≤10 detik)** → otomatis jadi sticker

* 🎵 **YouTube MP3 Downloader**

  * Cari lagu langsung dari YouTube
  * Kirim hasilnya dalam bentuk **audio MP3**

* 📜 **Menu Interaktif**

  * Perintah `!menu` untuk melihat fitur bot

* 🔄 **Auto Reconnect**

  * Bot otomatis reconnect jika koneksi terputus

---

## 🛠️ Teknologi yang Digunakan

* **Node.js**
* **@whiskeysockets/baileys** (WhatsApp Web API)
* **FFmpeg** (konversi video & audio)
* **yt-dlp** (download YouTube audio)
* **PM2** (opsional, untuk 24/7 di VPS)

---

## 📂 Struktur Folder

```
BOT-WA/
├─ index.js              # Main bot file
├─ package.json
├─ session/              # Session WhatsApp (auto-generated)
├─ temp/                 # File sementara (auto-generated)
├─ bin/
│  └─ yt-dlp.exe         # YouTube downloader (Windows)
└─ README.md
```

---

## ⚙️ Instalasi

### 1️⃣ Clone & Install Dependency

```bash
npm install
```

### 2️⃣ Install FFmpeg

* Download FFmpeg (binary): [https://www.gyan.dev/ffmpeg/builds/](https://www.gyan.dev/ffmpeg/builds/)
* Extract dan pastikan ada file:

```
ffmpeg.exe
ffprobe.exe
```

* Catat path FFmpeg, contoh:

```
C:/ffmpeg/bin/ffmpeg.exe
```

---

### 3️⃣ Download yt-dlp

* Download: [https://github.com/yt-dlp/yt-dlp/releases](https://github.com/yt-dlp/yt-dlp/releases)
* Simpan sebagai:

```
BOT-WA/bin/yt-dlp.exe
```

---

## ▶️ Menjalankan Bot

```bash
node index.js
```

* Scan QR menggunakan **WhatsApp > Linked Devices**
* Jika sudah connect, bot siap digunakan 🎉

---

## 📖 Daftar Perintah

| Perintah              | Fungsi                      |
| --------------------- | --------------------------- |
| `!menu`               | Menampilkan menu bot        |
| kirim foto            | Auto convert ke sticker     |
| kirim video ≤10 detik | Auto convert ke sticker     |
| `!play <judul lagu>`  | Download lagu YouTube (MP3) |

Contoh:

```
!play despacito
```

---

## 🚀 Deploy & 24/7

❌ **Tidak disarankan di Vercel / Netlify** (serverless)

✅ Rekomendasi hosting:

* **VPS (Ubuntu)** – paling stabil
* **Railway**
* **Render (paid / anti-sleep)**

Gunakan **PM2** agar bot tetap hidup:

```bash
npm install -g pm2
pm2 start index.js --name bot-wa
pm2 save
pm2 startup
```

---

## ⚠️ Catatan Penting

* Folder `session/` **jangan dibagikan** (berisi data login WhatsApp)
* Folder `temp/` aman dihapus, akan dibuat ulang otomatis
* Video untuk sticker **maksimal 10 detik**

---

## 🧠 Troubleshooting Singkat

* ❌ `ffmpeg not found`
  → Pastikan path FFmpeg benar

* ❌ `Cannot derive from empty media key`
  → Media tidak valid / ephemeral

* ❌ `yt-dlp error`
  → Pastikan `--ffmpeg-location` sudah benar

---

## 📄 License

MIT License – bebas digunakan untuk belajar dan pengembangan.

---

## 🙌 Credits

* Baileys – WhatsApp Web API
* FFmpeg
* yt-dlp

---

🔥 **Happy Coding & Selamat Ngoding Bot WhatsApp!**
