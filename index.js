const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadContentFromMessage
} = require('@whiskeysockets/baileys')

const qrcode = require('qrcode-terminal')
const fs = require('fs')
const path = require('path')
const axios = require('axios')
const { exec } = require('child_process')
const ffmpeg = require('fluent-ffmpeg')
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg')
const ffprobe = require('ffprobe-static')

// ===== FFMPEG PORTABLE (WINDOWS + LINUX) =====
ffmpeg.setFfmpegPath(ffmpegInstaller.path)
ffmpeg.setFfprobePath(ffprobe.path)

// ===== CONFIG OWNER (HANYA UNTUK INFO DI MENU) =====
const OWNER_NAME = 'GuptaAI Dev'
const OWNER_IG = 'https://www.instagram.com/gedevln12_'

// ===== TEMP FOLDER =====
const tempDir = path.join(__dirname, 'temp')
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir)

// ===== DETEKSI OS & PATH YT-DLP =====
const isWindows = process.platform === 'win32'
const ytdlpPath = isWindows
  ? path.join(__dirname, 'bin', 'yt-dlp.exe')
  : path.join(__dirname, 'bin', 'yt-dlp')

const ffmpegDir = path.dirname(ffmpegInstaller.path)

console.log('Platform:', process.platform)
console.log('YT-DLP PATH:', ytdlpPath)

// ===== LIST KATA KASAR =====
const badWords = [
  'anjing',
  'babi',
  'kontol',
  'memek',
  'goblok',
  'tolol',
  'bangsat',
  'pler',
  'bujang',
  'bujanh',
  'bajingan',
  'tai',
  'jancuk',
  'pantek',
  'brengsek',
  'setan',
  'sundal',
  'kampang',
  'desah',
  'ngentot',
  'pepek',
  'bacot',
  'banci',
  'celeng',
  'sialan',
  'bego',
  'gila',
  'idiot'
]

const normalizeText = (str) =>
  str
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()

const hasBadWord = (text) => {
  const norm = normalizeText(text)
  return badWords.some((w) => norm.includes(w))
}

// ================== START BOT ==================
async function startBot () {
  const { state, saveCreds } = await useMultiFileAuthState('./session')

  const sock = makeWASocket({
    auth: state,
    browser: ['Windows', 'Chrome', '120.0.0'],
    syncFullHistory: false
  })

  sock.ev.on('creds.update', saveCreds)

  // ===== CONNECTION =====
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) qrcode.generate(qr, { small: true })

    if (connection === 'open') console.log('🤖 GuptaAI Bot tersambung, siap ngegas!')

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode
      if (reason !== DisconnectReason.loggedOut) startBot()
    }
  })

  // ===== HELPER: AMBIL TEKS PESAN =====
  const getText = (msg) =>
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    ''

  // ===== HELPER: AMBIL MEDIA (LANGSUNG / REPLY) =====
  const getMediaFromMessage = async (m) => {
    let mediaMsg = null
    let mediaType = null

    if (m.message?.imageMessage) {
      mediaMsg = m.message.imageMessage
      mediaType = 'image'
    } else if (m.message?.videoMessage) {
      mediaMsg = m.message.videoMessage
      mediaType = 'video'
    } else if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      const quoted = m.message.extendedTextMessage.contextInfo.quotedMessage
      if (quoted.imageMessage) {
        mediaMsg = quoted.imageMessage
        mediaType = 'image'
      } else if (quoted.videoMessage) {
        mediaMsg = quoted.videoMessage
        mediaType = 'video'
      }
    }

    if (!mediaMsg || !mediaMsg.mediaKey) return null
    if (mediaMsg.seconds && mediaMsg.seconds > 10) {
      return { error: '⏱️ Videonya kepanjangan, maksimal 10 detik ya.' }
    }

    const stream = await downloadContentFromMessage(mediaMsg, mediaType)
    let buffer = Buffer.from([])
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk])
    }

    return { buffer, mediaType }
  }

  // ===== KONVERSI MEDIA JADI STICKER =====
  const convertToSticker = (inputPath, outputPath) => {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-vcodec libwebp',
          '-vf scale=512:512:force_original_aspect_ratio=increase,fps=15,crop=512:512',
          '-lossless 1',
          '-loop 0',
          '-preset default',
          '-an',
          '-vsync 0'
        ])
        .save(outputPath)
        .on('end', resolve)
        .on('error', reject)
    })
  }

  // ============ MESSAGE HANDLER ============
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return

    const jid = msg.key.remoteJid
    const isGroup = jid.endsWith('@g.us')
    const text = getText(msg).trim()

    console.log('DBG:', { jid, isGroup, text })

    // ===== ANTI KATA KASAR (hanya warning) =====
    if (text && hasBadWord(text)) {
      await sock.sendMessage(jid, {
        text: isGroup
          ? '🚷 *Ups...* kata yang dipakai lumayan pedes.\nCoba pakai bahasa yang lebih adem ya biar grupnya nyaman 😄'
          : '🚷 *Eh...* kata-katanya agak kasar.\nGuptaAI lebih suka ngobrol yang sopan dan santai ✨'
      })
    }

    // ===== BUTTON HANDLER =====
    if (msg.message?.templateButtonReplyMessage || msg.message?.buttonsResponseMessage) {
      const btnId =
        msg.message.templateButtonReplyMessage?.selectedId ||
        msg.message.buttonsResponseMessage?.selectedButtonId

      if (btnId === 'test_btn') {
        return sock.sendMessage(jid, {
          text: '✅ *GuptaAI ON!*\nSiap nemenin kamu 24/7, tinggal kirim perintah aja 😉'
        })
      }

      if (btnId === 'sticker_btn') {
        return sock.sendMessage(jid, {
          text: '✨ *Mode Sticker Aktif!*\n\n📸 Kirim foto / video (maks 10 detik)\n💬 Lalu ketik: *!sticker* atau reply dengan *!sticker*\n\nTaraaa~ jadi sticker siap dipake spam 😆'
        })
      }

      if (btnId === 'play_btn') {
        return sock.sendMessage(jid, {
          text: '🎧 *Mode Musik Aktif!*\n\nKetik: *!play judul lagu*\nContoh:\n• !play sampai jadi debu\n• !play ruang sendiri'
        })
      }

      if (btnId === 'owner_btn') {
        return sock.sendMessage(jid, {
          text:
            `🧑‍💻 *Owner GuptaAI Bot*\n\n` +
            `• Nama   : ${OWNER_NAME}\n` +
            `• IG     : ${OWNER_IG}\n` +
            `• WhatsApp : wa.me/6289652019925\n\n` +
            `Mau kerja sama, ada bug, atau pingin fitur baru?\nSilakan japri aja ya ✨`
        })
      }
    }

    // ===== MENU UTAMA =====
    if (text === '!menu') {
      const menuText =
`╭━━━〔 🌌 GuptaAI WhatsApp Bot 〕━━━╮
│
│  👋 Hai, selamat datang di *GuptaAI*!
│  Bot santai yang siap nemenin chat kamu.
│
│  🔮 *FITUR UTAMA*
│  • 🧩 *!sticker*        → Ubah foto/video jadi sticker
│  • ✍️ *!tstick <teks>*  → Bikin sticker teks aesthetic
│  • 🎵 *!play <judul>*   → Putar & kirim lagu
│
│  📌 *CONTOH*
│  • Kirim foto → ketik: *!sticker*
│  • *!tstick apa ya kak ya*
│  • *!play sampai jadi debu*
│
│  🧑‍💻 *OWNER & SOSMED*
│  • Instagram: @gedevln12_
│    ${OWNER_IG}
│
│  Pake tombol di bawah buat akses cepat 🚀
╰━━━━━━━━━━━━━━━━━━━━━━╯`

      return sock.sendMessage(jid, {
        text: menuText,
        footer: 'GuptaAI • Smart WhatsApp Assistant • Instagram: @gedevln12_ • wa.me/6289652019925',
        buttons: [
          { buttonId: 'test_btn', buttonText: { displayText: '⚙️ Cek Status Bot' }, type: 1 },
          { buttonId: 'sticker_btn', buttonText: { displayText: '🧩 Bikin Sticker' }, type: 1 },
          { buttonId: 'play_btn', buttonText: { displayText: '🎧 Dengerin Musik' }, type: 1 },
          { buttonId: 'owner_btn', buttonText: { displayText: '🧑‍💻 Kontak Owner' }, type: 1 }
        ],
        headerType: 1
      })
    }

    // ===== !sticker =====
    if (text === '!sticker') {
      const mediaData = await getMediaFromMessage(msg)
      if (!mediaData) {
        return sock.sendMessage(jid, {
          text: '🖼 *Belum ada media nih...*\n\nKirim dulu foto/video (maks 10 detik) atau reply ke foto/video,\nbaru ketik: *!sticker* 😊'
        })
      }
      if (mediaData.error) {
        return sock.sendMessage(jid, { text: `⚠️ ${mediaData.error}` })
      }

      const { buffer, mediaType } = mediaData
      const input = path.join(
        tempDir,
        `${Date.now()}.${mediaType === 'image' ? 'jpg' : 'mp4'}`
      )
      const output = `${input}.webp`

      fs.writeFileSync(input, buffer)

      try {
        await convertToSticker(input, output)
        const stickerBuf = fs.readFileSync(output)
        await sock.sendMessage(jid, { sticker: stickerBuf })
      } catch (e) {
        console.error(e)
        await sock.sendMessage(jid, {
          text: '💥 Ada yang error waktu bikin sticker.\nCoba ulang lagi, kalau masih gagal boleh lapor ke owner ya.'
        })
      } finally {
        if (fs.existsSync(input)) fs.unlinkSync(input)
        if (fs.existsSync(output)) fs.unlinkSync(output)
      }

      return
    }

    // ===== !tstick =====
    if (text.startsWith('!tstick')) {
      const content = text.replace('!tstick', '').trim()
      if (!content) {
        return sock.sendMessage(jid, {
          text: '✍️ Cara pakai:\n*tstick teks kamu*\n\nContoh:\n*tstick lagi rebahan mikirin kamu*'
        })
      }

      try {
        const { data } = await axios.get(
          `https://be-botwa-production.up.railway.app/t2s?text=${encodeURIComponent(content)}`,
          { responseType: 'arraybuffer' }
        )

        const buf = Buffer.from(data)
        await sock.sendMessage(jid, { sticker: buf })
      } catch (e) {
        console.error(e)
        await sock.sendMessage(jid, {
          text: '😵‍💫 Gagal bikin sticker teks.\nCoba beberapa saat lagi, atau kabari Developer kalau masih error.'
        })
      }

      return
    }

    // ===== !play =====
    if (text.startsWith('!play ')) {
      const query = text.replace('!play ', '').trim()
      if (!query) {
        return sock.sendMessage(jid, {
          text: '🎵 Ketik: *!play judul lagu*\nContoh: *!play sampai jadi debu*'
        })
      }

      const output = path.join(tempDir, `${Date.now()}.mp3`)

      await sock.sendMessage(jid, {
        text: `🔍 Lagi cari lagu: *${query}* \nTunggu bentar, lagi di-download...`
      })

      const cmd = `"${ytdlpPath}" --ffmpeg-location "${ffmpegDir}" -f bestaudio -x --audio-format mp3 -o "${output}" "ytsearch1:${query}"`

      exec(cmd, async (err) => {
        if (err) {
          console.error(err)
          return sock.sendMessage(jid, {
            text: '🚫 Gagal download lagu.\nCoba ganti judul lain atau cek koneksi kamu dulu ya.'
          })
        }

        if (!fs.existsSync(output)) {
          console.error('File output tidak ditemukan:', output)
          return sock.sendMessage(jid, {
            text: '❌ File audio tidak ketemu setelah proses download.\nCoba ulang lagi ya.'
          })
        }

        const audioBuf = fs.readFileSync(output)
        if (!audioBuf || !audioBuf.length) {
          console.error('Buffer audio kosong')
          fs.unlinkSync(output)
          return sock.sendMessage(jid, {
            text: '❌ Ada masalah waktu baca file audio.\nSilakan coba lagi.'
          })
        }

        await sock.sendMessage(jid, {
          audio: audioBuf,
          mimetype: 'audio/mpeg'
        })

        fs.unlinkSync(output)
      })
    }
  })
}

startBot()
