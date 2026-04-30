const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('baileys')
const pino = require('pino')
const path = require('path')

const logger = pino({ level: 'silent' })
const AUTH_PATH = path.join(__dirname, '..', 'data', 'auth_info')

let sock = null
let connectionStatus = 'disconnected'

async function connectBot() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH)
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
        version,
        logger,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        generateHighQualityLinkPreview: true,
    })

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
            connectionStatus = 'waiting_for_qr'
            console.log('[BOT] QR code generated - use pairing code instead')
        }

        if (connection === 'open') {
            connectionStatus = 'connected'
            console.log('[BOT] ✅ Connected to WhatsApp')
        }

        if (connection === 'close') {
            connectionStatus = 'disconnected'
            const statusCode = lastDisconnect?.error?.output?.statusCode
            const reason = lastDisconnect?.error?.message || 'unknown'
            console.log(`[BOT] ⚠️ Connection closed (code: ${statusCode}, reason: ${reason})`)
            if (statusCode !== DisconnectReason.loggedOut) {
                // Avoid rapid reconnect loops
                const delay = statusCode === 408 || statusCode === 503 ? 15000 : 5000
                console.log(`[BOT] 🔄 Reconnecting in ${delay/1000}s...`)
                setTimeout(connectBot, delay)
            } else {
                console.log('[BOT] ❌ Logged out')
                connectionStatus = 'logged_out'
            }
        }
    })

    sock.ev.on('creds.update', saveCreds)

    // Track groups we're part of
    sock.ev.on('messages.upsert', ({ messages }) => {
        for (const msg of messages) {
            const jid = msg.key.remoteJid
            if (jid?.endsWith('@g.us')) {
                // Store group JID when we see messages from it
                const groupsFile = path.join(__dirname, '..', 'data', 'groups.json')
                let groups = {}
                try { groups = JSON.parse(require('fs').readFileSync(groupsFile, 'utf8')) } catch {}
                if (!groups[jid]) {
                    groups[jid] = { name: null, jid }
                    require('fs').writeFileSync(groupsFile, JSON.stringify(groups, null, 2))
                }
            }
        }
    })

    return sock
}

function getSocket() {
    return sock
}

function getStatus() {
    return connectionStatus
}

async function sendTextMessage(jid, text, mentions = []) {
    if (!sock || connectionStatus !== 'connected') {
        throw new Error('Bot is not connected')
    }
    return await sock.sendMessage(jid, { text, mentions })
}

async function sendPoll(jid, name, values, selectableCount = 1, mentions = []) {
    if (!sock || connectionStatus !== 'connected') {
        throw new Error('Bot is not connected')
    }
    return await sock.sendMessage(jid, {
        poll: { name, values, selectableCount },
        mentions
    })
}

module.exports = { connectBot, getSocket, getStatus, sendTextMessage, sendPoll }
