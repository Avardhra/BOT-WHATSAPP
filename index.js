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
    path.normalize('C:/Users/ASUS/Downloads/ffmpeg-8.0.1-essentials_build/ffmpeg-8.0.1-essentials_build/bin/ffmpeg.exe')
)

// ===== TEMP FOLDER =====
const tempDir = path.join(__dirname, 'temp')
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir)

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

    // ===== MESSAGE =====
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message) return

        const jid = msg.key.remoteJid
        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            ''

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
                    text: '🧩 Kirim foto / video (maks 10 detik), lalu bot akan ubah jadi sticker.'
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
┃ • !sticker  → Ubah foto jadi sticker
┃ • !play <judul>
┃
┃ 𝗖𝗢𝗡𝗧𝗢𝗛
┃ • !play sampai jadi debu
┃
┃ Ketik perintah di atas
╰━━━━━━━━━━━━━━━━━━━━╯`,
                footer: 'GuptaAI • Smart WhatsApp Assistant',
                buttons,
                headerType: 1
            })
        }

        // ===== STICKER =====
        if (msg.message.imageMessage || msg.message.videoMessage) {
            const media =
                msg.message.imageMessage || msg.message.videoMessage

            if (!media.mediaKey) return

            if (media.seconds && media.seconds > 10) {
                return sock.sendMessage(jid, { text: '❌ Video max 10 detik' })
            }

            const mediaType = msg.message.imageMessage ? 'image' : 'video'

            const stream = await downloadContentFromMessage(media, mediaType)
            let buffer = Buffer.from([])
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk])
            }

            const input = path.join(
                tempDir,
                `${Date.now()}.${mediaType === 'image' ? 'jpg' : 'mp4'}`
            )
            const output = `${input}.webp`

            fs.writeFileSync(input, buffer)

            await new Promise((resolve, reject) => {
                ffmpeg(input)
                    .outputOptions([
                        '-vcodec libwebp',
                        '-vf scale=512:512:force_original_aspect_ratio=increase,fps=15,crop=512:512',
                        '-lossless 1',
                        '-loop 0',
                        '-preset default',
                        '-an',
                        '-vsync 0'
                    ])
                    .save(output)
                    .on('end', resolve)
                    .on('error', reject)
            })

            await sock.sendMessage(jid, {
                sticker: fs.readFileSync(output)
            })

            fs.unlinkSync(input)
            fs.unlinkSync(output)
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
