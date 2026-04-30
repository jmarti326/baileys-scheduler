const cron = require('node-cron')
const { getDb } = require('./database')
const { sendTextMessage, sendPoll, getStatus } = require('./bot')
const { buildMondaySummary, buildWednesdayReminder, buildThursdayPoll, buildSaturdayReminder, buildSaturdayPoll } = require('./messages')

function getGroupJid() {
    const db = getDb()
    return db.prepare("SELECT value FROM app_settings WHERE key = 'group_jid'").get()?.value
}

function getToday() {
    // Get current date in AST timezone
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Puerto_Rico' })
}

function messageKey(type, date) {
    return `${date}:${type}`
}

function alreadySent(key) {
    const db = getDb()
    return !!db.prepare('SELECT 1 FROM message_logs WHERE message_key = ?').get(key)
}

function logMessage(key, type, content) {
    const db = getDb()
    db.prepare('INSERT OR IGNORE INTO message_logs (message_key, message_type, content) VALUES (?, ?, ?)').run(key, type, content)
}

/**
 * Send a scheduled message with idempotency check
 */
async function sendScheduledMessage(type, buildFn, forceSend = false, dateOverride = null) {
    const today = dateOverride || getToday()
    const key = messageKey(type, today)
    const groupJid = getGroupJid()

    if (!forceSend && alreadySent(key)) {
        console.log(`[SCHEDULER] ⏭️ Already sent: ${key}`)
        return { skipped: true, key }
    }

    if (getStatus() !== 'connected') {
        console.log(`[SCHEDULER] ❌ Bot not connected, skipping: ${type}`)
        return { error: 'Bot not connected' }
    }

    try {
        if (type === 'thursday-poll') {
            const { pollName, values, mentions } = buildThursdayPoll(today)
            await sendPoll(groupJid, pollName, values, 1, mentions)
            logMessage(key, type, pollName)
            console.log(`[SCHEDULER] ✅ Sent: ${type}`)
            return { sent: true, key, content: pollName }
        } else if (type === 'saturday-poll') {
            const { pollName, values, mentions } = buildSaturdayPoll(today)
            await sendPoll(groupJid, pollName, values, 1, mentions)
            logMessage(key, type, pollName)
            console.log(`[SCHEDULER] ✅ Sent: ${type}`)
            return { sent: true, key, content: pollName }
        } else {
            const { text, mentions } = buildFn(today)
            await sendTextMessage(groupJid, text, mentions)
            logMessage(key, type, text)
            console.log(`[SCHEDULER] ✅ Sent: ${type}`)
            return { sent: true, key, content: text }
        }
    } catch (err) {
        console.error(`[SCHEDULER] ❌ Failed to send ${type}:`, err.message)
        return { error: err.message }
    }
}

function startScheduler() {
    // Monday 8:00 AM AST - Weekly summary
    cron.schedule('0 8 * * 1', () => {
        console.log('[CRON] Monday summary triggered')
        sendScheduledMessage('monday-summary', buildMondaySummary)
    }, { timezone: 'America/Puerto_Rico' })

    // Wednesday 8:00 AM AST - Thursday reminder
    cron.schedule('0 8 * * 3', () => {
        console.log('[CRON] Wednesday reminder triggered')
        sendScheduledMessage('wednesday-reminder', buildWednesdayReminder)
    }, { timezone: 'America/Puerto_Rico' })

    // Thursday 8:00 AM AST - Thursday poll
    cron.schedule('0 8 * * 4', () => {
        console.log('[CRON] Thursday poll triggered')
        sendScheduledMessage('thursday-poll', null)
    }, { timezone: 'America/Puerto_Rico' })

    // Saturday 8:00 AM AST - Sunday reminder + poll
    cron.schedule('0 8 * * 6', () => {
        console.log('[CRON] Saturday reminder + poll triggered')
        sendScheduledMessage('saturday-reminder', buildSaturdayReminder)
        setTimeout(() => {
            sendScheduledMessage('saturday-poll', null)
        }, 3000) // small delay between messages
    }, { timezone: 'America/Puerto_Rico' })

    console.log('[SCHEDULER] ✅ Cron jobs started (Mon/Wed/Thu/Sat at 8:00 AM AST)')
}

module.exports = { startScheduler, sendScheduledMessage, getToday, getGroupJid }
