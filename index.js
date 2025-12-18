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

// ===== FFMPEG PATH =====
ffmpeg.setFfmpegPath(
  path.normalize('./ffmpeg-8.0.1-essentials_build/bin/ffmpeg.exe')
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
          text: '✅ Bot aktif dan siap membantu kamu.'
        })
      }

      if (btnId === 'sticker_btn') {
        return sock.sendMessage(jid, {
          text: '🧩 Kirim foto / video (maks 10 detik) lalu ketik *!sticker* atau reply dengan *!sticker* untuk ubah jadi sticker.'
        })
      }

      if (btnId === 'play_btn') {
        return sock.sendMessage(jid, {
          text: '🎵 Ketik: *!play <judul lagu>*\nContoh: !play sampai jadi debu'
        })
      }
    }

    // ===== MENU DENGAN TOMBOL =====
    if (text === '!menu') {
      const buttons = [
        { buttonId: 'test_btn', buttonText: { displayText: '🔁 Tes Bot' } },
        { buttonId: 'sticker_btn', buttonText: { displayText: '🧩 Buat Sticker' } },
        { buttonId: 'play_btn', buttonText: { displayText: '🎵 Play Musik' } }
      ]

      return sock.sendMessage(jid, {
        text: `╭━━━〔 🤖 Gupta WhatsApp Bot 〕━━━╮
┃
┃ 𝗙𝗜𝗧𝗨𝗥 𝗨𝗧𝗔𝗠𝗔
┃ • !sticker  → Ubah foto/video jadi sticker
┃ • !tstick <teks> → Sticker teks
┃ • !play <judul>
┃
┃ 𝗖𝗢𝗡𝗧𝗢𝗛
┃ • !sticker (kirim foto lalu ketik !sticker)
┃ • !tstick apa ya kak ya
┃ • !play sampai jadi debu
┃
┃ Ketik perintah di atas
╰━━━━━━━━━━━━━━━━━━━━╯`,
        footer: 'GuptaAI • Smart WhatsApp Assistant',
        buttons,
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

    // ===== COMMAND: TEXT TO STICKER (via API dummy) =====
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
        await sock.sendMessage(jid, { text: '❌ Gagal membuat sticker teks.' })
      }

      return
    }

    // ===== PLAY MP3 =====
    if (text.startsWith('!play ')) {
      const query = text.replace('!play ', '').trim()
      if (!query) return

      const output = path.join(tempDir, `${Date.now()}.mp3`)
      const ytdlpPath = path.join(__dirname, 'bin', 'yt-dlp.exe')
      const ffmpegDir = 'C:/Users/ASUS/Downloads/ffmpeg-8.0.1-essentials_build/ffmpeg-8.0.1-essentials_build/bin'

      await sock.sendMessage(jid, { text: '🎵 Mencari & mendownload lagu, tunggu sebentar...' })

      const cmd = `"${ytdlpPath}" --ffmpeg-location "${ffmpegDir}" -x --audio-format mp3 -o "${output}" "ytsearch1:${query}"`

      exec(cmd, async (err) => {
        if (err) {
          console.error(err)
          return sock.sendMessage(jid, {
            text: '❌ Gagal download lagu'
          })
        }

        await sock.sendMessage(jid, {
          audio: fs.readFileSync(output),
          mimetype: 'audio/mpeg'
        })

        fs.unlinkSync(output)
      })
    }
  })
}

startBot()
