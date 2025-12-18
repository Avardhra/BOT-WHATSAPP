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

// ===== CONFIG OWNER =====
const OWNER_NAME = 'GuptaAI Dev'
const OWNER_IG = 'https://www.instagram.com/gedevln12_'

// ===== FFMPEG PATH (PAKAI FOLDER PROJECT) =====
const ffmpegBinDir = path.join(__dirname, 'ffmpeg-8.0.1-essentials_build', 'bin')

ffmpeg.setFfmpegPath(
  path.join(ffmpegBinDir, 'ffmpeg.exe')
)

// ===== TEMP FOLDER =====
const tempDir = path.join(__dirname, 'temp')
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir)

// ================== START BOT ==================
async function startBot() {
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

    if (connection === 'open') console.log('✅ BOT CONNECTED')

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode
      if (reason !== DisconnectReason.loggedOut) startBot()
    }
  })

  // ===== FUNGSI HELPER: AMBIL TEKS PESAN =====
  const getText = (msg) =>
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    ''

  // ===== FUNGSI HELPER: AMBIL MEDIA (LANGSUNG / REPLY) =====
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
      return { error: '❌ Video max 10 detik' }
    }

    const stream = await downloadContentFromMessage(mediaMsg, mediaType)
    let buffer = Buffer.from([])
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk])
    }

    return { buffer, mediaType }
  }

  // ===== FUNGSI HELPER: KONVERSI MEDIA JADI STICKER =====
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

  // ================== MESSAGE HANDLER ==================
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return

    const jid = msg.key.remoteJid
    const text = getText(msg).trim()

    // ===== HANDLER REPLY BUTTON =====
    if (msg.message?.templateButtonReplyMessage || msg.message?.buttonsResponseMessage) {
      const btnId =
        msg.message.templateButtonReplyMessage?.selectedId ||
        msg.message.buttonsResponseMessage?.selectedButtonId

      if (btnId === 'test_btn') {
        return sock.sendMessage(jid, {
          text: '✅ Bot aktif dan siap bantu kamu 24/7.'
        })
      }

      if (btnId === 'sticker_btn') {
        return sock.sendMessage(jid, {
          text: '🧩 Kirim foto / video (maks 10 detik), lalu ketik *!sticker* atau reply dengan *!sticker* untuk diubah jadi sticker.'
        })
      }

      if (btnId === 'play_btn') {
        return sock.sendMessage(jid, {
          text: '🎵 Format: *!play <judul lagu>*\nContoh: !play sampai jadi debu'
        })
      }

      if (btnId === 'owner_btn') {
        return sock.sendMessage(jid, {
          text:
            `👤 Owner GuptaAI Bot\n\n` +
            `• Nama : ${OWNER_NAME}\n` +
            `• Instagram : ${OWNER_IG}\n\n` +
            `Silakan hubungi via DM Instagram untuk kerja sama, bug report, atau request fitur baru.`
        })
      }
    }

    // ===== MENU DENGAN TOMBOL KLASIK (FIX) =====
    if (text === '!menu') {
      const menuText =
`╭───〔 🤖 GuptaAI WhatsApp Bot 〕───╮
│
│  Hi, selamat datang di *GuptaAI Bot*!
│  Bot ini siap bantu kamu 24/7. 
│
│  FITUR UTAMA
│  • !sticker       → Ubah foto/video jadi sticker
│  • !tstick <teks> → Sticker teks aesthetic
│  • !play <judul>  → Download & kirim musik
│
│  CONTOH PENGGUNAAN
│  • Kirim foto lalu ketik:  *!sticker*
│  • *tstick apa ya kak ya*
│  • *!play sampai jadi debu*
│
│  OWNER & SOCIAL
│  • Instagram: @gedevln12_
│    ${OWNER_IG}
│
│  Gunakan tombol cepat di bawah
│  untuk akses fitur dengan sekali klik.
╰────────────────────────────────╯`

      return sock.sendMessage(jid, {
        text: menuText,
        footer: 'GuptaAI • Smart WhatsApp Assistant • Instagram: @gedevln12_',
        buttons: [
          { buttonId: 'test_btn', buttonText: { displayText: '🔁 Tes Bot' }, type: 1 },
          { buttonId: 'sticker_btn', buttonText: { displayText: '🧩 Buat Sticker' }, type: 1 },
          { buttonId: 'play_btn', buttonText: { displayText: '🎵 Play Musik' }, type: 1 },
          { buttonId: 'owner_btn', buttonText: { displayText: '👤 Owner / Instagram' }, type: 1 }
        ],
        headerType: 1
      })
    }

    // ===== COMMAND: !sticker (image/video / reply image/video) =====
    if (text === '!sticker') {
      const mediaData = await getMediaFromMessage(msg)
      if (!mediaData) {
        return sock.sendMessage(jid, {
          text: '❌ Kirim foto / video (max 10 detik) atau reply ke foto/video lalu ketik *!sticker*.'
        })
      }
      if (mediaData.error) {
        return sock.sendMessage(jid, { text: mediaData.error })
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
          text: '❌ Gagal membuat sticker.'
        })
      } finally {
        if (fs.existsSync(input)) fs.unlinkSync(input)
        if (fs.existsSync(output)) fs.unlinkSync(output)
      }

      return
    }

    // ===== COMMAND: TEXT TO STICKER (via API) =====
    if (text.startsWith('!tstick')) {
      const content = text.replace('!tstick', '').trim()
      if (!content) {
        return sock.sendMessage(jid, {
          text: '❌ Contoh: *!tstick apa ya kak ya*'
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
        await sock.sendMessage(jid, { text: '❌ Gagal membuat sticker teks. | Hubungi Developer untuk memberi tahu keluhan!' })
      }

      return
    }

    // ===== PLAY MP3 =====
    if (text.startsWith('!play ')) {
      const query = text.replace('!play ', '').trim()
      if (!query) return

      const output = path.join(tempDir, `${Date.now()}.mp3`)
      const ytdlpPath = path.join(__dirname, 'bin', 'yt-dlp.exe')
      const ffmpegDir = ffmpegBinDir

      await sock.sendMessage(jid, { text: '🎵 Mencari & mendownload lagu, tunggu sebentar...' })

      const cmd = `"${ytdlpPath}" --ffmpeg-location "${ffmpegDir}" -x --audio-format mp3 -o "${output}" "ytsearch1:${query}"`

      exec(cmd, async (err) => {
        if (err) {
          console.error(err)
          return sock.sendMessage(jid, {
            text: '❌ Gagal download lagu. | Hubungi Developer untuk memberi tahu keluhan!'
          })
        }

        if (!fs.existsSync(output)) {
          console.error('File output tidak ditemukan:', output)
          return sock.sendMessage(jid, {
            text: '❌ File audio tidak ditemukan setelah proses download.'
          })
        }

        const audioBuf = fs.readFileSync(output)
        if (!audioBuf || !audioBuf.length) {
          console.error('Buffer audio kosong')
          fs.unlinkSync(output)
          return sock.sendMessage(jid, {
            text: '❌ Gagal membaca file audio.'
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
