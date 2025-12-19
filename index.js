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

// ===== CONFIG OWNER / ADMIN =====
const OWNER_NAME = 'GuptaAI Dev'
const OWNER_IG = 'https://www.instagram.com/gedevln12_'
// nomor owner (tanpa +)
const ADMIN_NUMBER = '6289652019925@s.whatsapp.net'

// ===== TEMP FOLDER =====
const tempDir = path.join(__dirname, 'temp')
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir)

// ===== SIMPLE STORAGE UNTUK CUSTOMER & KODE =====
const dataFile = path.join(__dirname, 'customers.json')

let customers = {}

// load data di awal
if (fs.existsSync(dataFile)) {
  try {
    customers = JSON.parse(fs.readFileSync(dataFile, 'utf-8'))
  } catch {
    customers = {}
  }
}

// simpan ke file
const saveCustomers = () => {
  fs.writeFileSync(dataFile, JSON.stringify(customers, null, 2))
}

// generate kode 4 huruf
const generateCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// cek user sudah verif atau belum
const isVerifiedUser = (jid) => {
  const user = customers[jid]
  return user && user.isVerified === true
}

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
  'bangsat'
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

    if (connection === 'open') console.log('✅ BOT CONNECTED')

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode
      if (reason !== DisconnectReason.loggedOut) startBot()
    }
  })

  // CEK BOT ADMIN DI GROUP
  const isBotAdminInGroup = async (jid) => {
    try {
      const groupMeta = await sock.groupMetadata(jid)
      const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net'
      const me = groupMeta.participants.find((p) => p.id === botNumber)
      return !!me && me.admin != null
    } catch (e) {
      console.error('Gagal cek groupMetadata:', e)
      return false
    }
  }

  const getText = (msg) =>
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    ''

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
      return { error: '⚠️ Video maksimal 10 detik.' }
    }

    const stream = await downloadContentFromMessage(mediaMsg, mediaType)
    let buffer = Buffer.from([])
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk])
    }

    return { buffer, mediaType }
  }

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
    const senderJid = isGroup
      ? (msg.key.participant || msg.participant || '')
      : jid
    const fromMe = msg.key.fromMe === true

    const text = getText(msg).trim()

    // owner = nomor ADMIN_NUMBER ATAU pesan dari device bot sendiri (handle @lid) [web:60][web:96]
    const isAdminMain = senderJid === ADMIN_NUMBER || fromMe

    console.log('senderJid:', senderJid, 'isGroup:', isGroup, 'fromMe:', fromMe, 'isAdminMain:', isAdminMain)

    // ===== ANTI KATA KASAR =====
    if (text && hasBadWord(text)) {
      if (isGroup) {
        const botIsAdmin = await isBotAdminInGroup(jid)
        if (botIsAdmin) {
          try {
            await sock.sendMessage(jid, { delete: msg.key })
            await sock.sendMessage(jid, {
              text: '🚫 Pesan dihapus karena mengandung kata tidak pantas.\nMohon gunakan bahasa yang lebih sopan.'
            })
          } catch (e) {
            console.error('Gagal hapus pesan kasar:', e)
          }
        } else {
          await sock.sendMessage(jid, {
            text: '⚠️ Terdeteksi kata tidak pantas, tapi bot bukan admin sehingga tidak bisa menghapus pesan.'
          })
        }
      } else {
        await sock.sendMessage(jid, {
          text: '🚫 Mohon jangan gunakan kata-kata kasar.'
        })
      }
    }

    // ===== BUTTON HANDLER =====
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
            `• Instagram : ${OWNER_IG}\n` +
            `• WhatsApp : wa.me/6289652019925\n\n` +
            `Silakan hubungi via DM Instagram atau WhatsApp untuk kerja sama, bug report, atau request fitur baru.`
        })
      }
    }

    // ===== SISTEM KODE RAHASIA =====

    // hanya owner
    if (text.startsWith('!addcustomer') && isAdminMain) {
      const parts = text.split(' ')
      if (parts.length < 2) {
        return sock.sendMessage(jid, {
          text: 'ℹ️ Format: *!addcustomer 628xxxxxxxxxx*'
        })
      }
      const num = parts[1].replace(/[^0-9]/g, '')
      if (!num) {
        return sock.sendMessage(jid, {
          text: '❌ Nomor tidak valid.'
        })
      }
      const customerJid = num + '@s.whatsapp.net'

      if (!customers[customerJid]) {
        customers[customerJid] = {
          isVerified: false,
          code: null
        }
        saveCustomers()
        return sock.sendMessage(jid, {
          text: `✅ Customer baru ditambahkan:\n• ${customerJid}`
        })
      } else {
        return sock.sendMessage(jid, {
          text: `ℹ️ Customer sudah terdaftar:\n• ${customerJid}`
        })
      }
    }

    if (text.startsWith('!genkode') && isAdminMain) {
      const parts = text.split(' ')
      if (parts.length < 2) {
        return sock.sendMessage(jid, {
          text: 'ℹ️ Format: *!genkode 628xxxxxxxxxx*'
        })
      }
      const num = parts[1].replace(/[^0-9]/g, '')
      if (!num) {
        return sock.sendMessage(jid, {
          text: '❌ Nomor tidak valid.'
        })
      }
      const customerJid = num + '@s.whatsapp.net'

      if (!customers[customerJid]) {
        customers[customerJid] = {
          isVerified: false,
          code: null
        }
      }

      const newCode = generateCode()
      customers[customerJid].code = newCode
      customers[customerJid].isVerified = false
      saveCustomers()

      await sock.sendMessage(jid, {
        text:
          `🔐 Kode rahasia untuk customer:\n` +
          `• JID : ${customerJid}\n` +
          `• Kode: *${newCode}*`
      })

      await sock.sendMessage(customerJid, {
        text:
          `🔐 Halo, ini kode rahasiamu dari *GuptaAI Bot*:\n` +
          `Kode: *${newCode}*\n\n` +
          `Silakan kirim ke bot dengan format: *!kode ${newCode}*`
      })

      return
    }

    if (text.startsWith('!kode ')) {
      const inputCode = text.replace('!kode', '').trim().toUpperCase()

      if (!customers[senderJid] || !customers[senderJid].code) {
        return sock.sendMessage(jid, {
          text:
            '❌ Kamu belum terdaftar atau belum dibuatkan kode.\n' +
            'Silakan hubungi developer di wa.me/6289652019925 untuk meminta kode 4 huruf.'
        })
      }

      if (customers[senderJid].code === inputCode) {
        customers[senderJid].isVerified = true
        saveCustomers()
        return sock.sendMessage(jid, {
          text: '✅ Kode benar. Kamu sekarang sudah terverifikasi dan bisa menggunakan bot.'
        })
      } else {
        return sock.sendMessage(jid, {
          text: '❌ Kode salah. Silakan cek lagi atau hubungi developer di wa.me/6289652019925.'
        })
      }
    }

    const requireVerified = async () => {
      if (!isVerifiedUser(senderJid)) {
        await sock.sendMessage(jid, {
          text:
            '🔒 Akses terbatas.\n' +
            'Kamu belum memasukkan kode rahasia 4 huruf.\n\n' +
            'Silakan hubungi developer di wa.me/6289652019925 untuk meminta kode, lalu kirim ke bot dengan format: *!kode ABCD*.'
        })
        return false
      }
      return true
    }

    // ===== MENU ADMIN (HANYA OWNER) =====
    if (text === '!menuadmin') {
      if (!isAdminMain) {
        return sock.sendMessage(jid, {
          text: '❌ Menu admin hanya bisa dipakai oleh developer (owner bot).'
        })
      }

      const adminMenu =
`╭──〔 🔧 Admin Menu 〕──╮
│ • !addcustomer 628xxx
│ • !genkode 628xxx
│ • (tambah perintah admin lain di sini)
╰────────────────────╯`

      return sock.sendMessage(jid, { text: adminMenu })
    }

    // ===== MENU UTAMA =====
    if (text === '!menu') {
      const menuText =
`╭───〔 🤖 GuptaAI WhatsApp Bot 〕───╮
│
│  Hi, selamat datang di *GuptaAI Bot*!
│  Bot ini siap bantu kamu 24/7. 
│
│  FITUR UTAMA
│  • !sticker        → Ubah foto/video jadi sticker
│  • !tstick <teks>  → Sticker teks aesthetic
│  • !play <judul>   → Download & kirim musik
│
│  SISTEM KODE RAHASIA
│  • Minta kode ke developer: wa.me/6289652019925
│  • Verifikasi: *!kode ABCD* (contoh)
│
│  CONTOH PENGGUNAAN
│  • Kirim foto lalu ketik:  *!sticker*
│  • *!tstick apa ya kak ya*
│  • *!play sampai jadi debu*
│
│  OWNER & SOCIAL
│  • Instagram: @gedevln12_
│    ${OWNER_IG}
│
│  Gunakan tombol cepat di bawah
│  untuk akses fitur dengan sekali klik.
╰─────────────────────╯`

      return sock.sendMessage(jid, {
        text: menuText,
        footer: 'GuptaAI • Smart WhatsApp Assistant • Instagram: @gedevln12_ • wa.me/6289652019925',
        buttons: [
          { buttonId: 'test_btn', buttonText: { displayText: '🔁 Tes Bot' }, type: 1 },
          { buttonId: 'sticker_btn', buttonText: { displayText: '🧩 Buat Sticker' }, type: 1 },
          { buttonId: 'play_btn', buttonText: { displayText: '🎵 Play Musik' }, type: 1 },
          { buttonId: 'owner_btn', buttonText: { displayText: '👤 Owner / Instagram' }, type: 1 }
        ],
        headerType: 1
      })
    }

    // ===== !sticker =====
    if (text === '!sticker') {
      // kalau mau paksa verif:
      // const ok = await requireVerified()
      // if (!ok) return

      const mediaData = await getMediaFromMessage(msg)
      if (!mediaData) {
        return sock.sendMessage(jid, {
          text: '🖼 Kirim foto / video (max 10 detik) atau reply ke foto/video lalu ketik *!sticker*.'
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

    // ===== !tstick =====
    if (text.startsWith('!tstick')) {
      const content = text.replace('!tstick', '').trim()
      if (!content) {
        return sock.sendMessage(jid, {
          text: 'ℹ️ Contoh: *!tstick apa ya kak ya*'
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
          text: '❌ Gagal membuat sticker teks. Silakan hubungi Developer jika masalah berlanjut.'
        })
      }

      return
    }

    // ===== !play =====
    if (text.startsWith('!play ')) {
      const query = text.replace('!play ', '').trim()
      if (!query) return

      const output = path.join(tempDir, `${Date.now()}.mp3`)

      await sock.sendMessage(jid, {
        text: '⏳ Mencari & mendownload lagu, tunggu sebentar...'
      })

      const cmd = `"${ytdlpPath}" --ffmpeg-location "${ffmpegDir}" -f bestaudio -x --audio-format mp3 -o "${output}" "ytsearch1:${query}"`

      exec(cmd, async (err) => {
        if (err) {
          console.error(err)
          return sock.sendMessage(jid, {
            text: '❌ Gagal download lagu. Silakan coba lagi atau hubungi Developer.'
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
