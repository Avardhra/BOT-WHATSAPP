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
const { createCanvas, registerFont } = require('canvas')

// ===== FFMPEG PATH =====
ffmpeg.setFfmpegPath(
  path.normalize('C:/Users/ASUS/Downloads/ffmpeg-8.0.1-essentials_build/ffmpeg-8.0.1-essentials_build/bin/ffmpeg.exe')
)

// ===== TEMP FOLDER =====
const tempDir = path.join(__dirname, 'temp')
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir)

// (opsional) register font kalau mau pakai font khusus
// registerFont(path.join(__dirname, 'fonts', 'YourFont.ttf'), { family: 'CustomFont' })

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

  // ===== FUNGSI HELPER: TEXT TO STICKER (PNG) =====
const createTextStickerBuffer = (text) => {
  const canvasSize = 512
  const canvas = createCanvas(canvasSize, canvasSize)
  const ctx = canvas.getContext('2d')

  // background putih
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvasSize, canvasSize)

  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'middle'

  const paddingX = 40
  const maxWidth = canvasSize - paddingX * 2
  let fontSize = 120

  const wrapWordsToLines = (words, size) => {
    ctx.font = `${size}px sans-serif`
    const lines = []
    let current = []

    for (const w of words) {
      const test = [...current, w]
      const left = test[0]
      const right = test.slice(1).join(' ')
      let width
      if (!right) {
        width = ctx.measureText(left).width
      } else {
        const leftW = ctx.measureText(left).width
        const rightW = ctx.measureText(right).width
        width = leftW + rightW + 40 // jarak kira-kira
      }
      if (width > maxWidth && current.length) {
        lines.push(current)
        current = [w]
      } else {
        current = test
      }
    }
    if (current.length) lines.push(current)
    return lines
  }

  const wordsAll = text.split(/\s+/).filter(Boolean)
  let linesWords = []

  while (fontSize > 24) {
    linesWords = wrapWordsToLines(wordsAll, fontSize)
    if (linesWords.length <= 2) break
    fontSize -= 4
  }

  ctx.font = `${fontSize}px sans-serif`

  if (linesWords.length > 2) {
    const flat = linesWords.flat()
    linesWords = [
      flat.slice(0, Math.ceil(flat.length / 2)),
      flat.slice(Math.ceil(flat.length / 2))
    ]
  }

  const lineHeight = fontSize + 6
  const totalHeight = linesWords.length * lineHeight
  const startY = canvasSize / 2 - totalHeight / 2 + lineHeight / 2

  linesWords.forEach((words, i) => {
    const y = startY + i * lineHeight

    if (words.length === 1) {
      ctx.textAlign = 'left'
      ctx.fillText(words[0], paddingX, y)
    } else {
      const left = words[0]
      const right = words.slice(1).join(' ')

      ctx.textAlign = 'left'
      ctx.fillText(left, paddingX, y)

      ctx.textAlign = 'right'
      ctx.fillText(right, canvasSize - paddingX, y)
    }
  })

  return canvas.toBuffer('image/png')
}

  // ===== MESSAGE =====
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

    // ===== COMMAND: TEXT TO STICKER =====
    if (text.startsWith('!tstick')) {
      const content = text.replace('!tstick', '').trim()
      if (!content) {
        return sock.sendMessage(jid, {
          text: '❌ Contoh: *!tstick apa ya kak ya*'
        })
      }

      try {
        // 1. buat PNG dari canvas
        const pngBuffer = createTextStickerBuffer(content)

        // 2. simpan PNG, convert ke webp dengan ffmpeg
        const inputPng = path.join(tempDir, `${Date.now()}_text.png`)
        const outputWebp = `${inputPng}.webp`
        fs.writeFileSync(inputPng, pngBuffer)

        await convertToSticker(inputPng, outputWebp)

        // 3. kirim sebagai sticker webp
        const stickerBuf = fs.readFileSync(outputWebp)
        await sock.sendMessage(jid, { sticker: stickerBuf })

        // 4. bersihkan file
        if (fs.existsSync(inputPng)) fs.unlinkSync(inputPng)
        if (fs.existsSync(outputWebp)) fs.unlinkSync(outputWebp)
      } catch (e) {
        console.error(e)
        await sock.sendMessage(jid, {
          text: '❌ Gagal membuat sticker teks.'
        })
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
