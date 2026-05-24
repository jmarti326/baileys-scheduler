const cron = require('node-cron')
const { getDb } = require('./db/index')
const { sendTextMessage, sendPoll, getStatus } = require('./bot')
const { buildMondaySummary, buildWednesdayReminder, buildThursdayPoll, buildSaturdayReminder, buildSaturdayPoll } = require('./messages')

async function getGroupJid() {
    const db = await getDb()
    const row = await db.get("SELECT value FROM app_settings WHERE key = 'group_jid'")
    return row?.value
}

function getToday() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Puerto_Rico' })
}

function messageKey(type, date) {
    return `${date}:${type}`
}

async function alreadySent(key) {
    const db = await getDb()
    const row = await db.get('SELECT 1 FROM message_logs WHERE message_key = ?', key)
    return !!row
}

async function logMessage(key, type, content) {
    const db = await getDb()
    await db.run(
        'INSERT OR IGNORE INTO message_logs (message_key, message_type, content) VALUES (?, ?, ?)',
        key, type, content
    )
}

async function sendScheduledMessage(type, buildFn, forceSend = false, dateOverride = null, groupJidOverride = null) {
    const today = dateOverride || getToday()
    const key = messageKey(type, today)
    const groupJid = groupJidOverride || await getGroupJid()

    if (!forceSend && await alreadySent(key)) {
        console.log(`[SCHEDULER] ⏭️ Already sent: ${key}`)
        return { skipped: true, key }
    }

    if (getStatus() !== 'connected') {
        console.log(`[SCHEDULER] ❌ Bot not connected, skipping: ${type}`)
        return { error: 'Bot not connected' }
    }

    try {
        if (type === 'thursday-poll') {
            const { pollName, values, mentions } = await buildThursdayPoll(today)
            await sendPoll(groupJid, pollName, values, 1, mentions)
            await logMessage(key, type, pollName)
            console.log(`[SCHEDULER] ✅ Sent: ${type}`)
            return { sent: true, key, content: pollName }
        } else if (type === 'saturday-poll') {
            const { pollName, values, mentions } = await buildSaturdayPoll(today)
            await sendPoll(groupJid, pollName, values, 1, mentions)
            await logMessage(key, type, pollName)
            console.log(`[SCHEDULER] ✅ Sent: ${type}`)
            return { sent: true, key, content: pollName }
        } else {
            const { text, mentions } = await buildFn(today)
            await sendTextMessage(groupJid, text, mentions)
            await logMessage(key, type, text)
            console.log(`[SCHEDULER] ✅ Sent: ${type}`)
            return { sent: true, key, content: text }
        }
    } catch (err) {
        console.error(`[SCHEDULER] ❌ Failed to send ${type}:`, err.message)
        return { error: err.message }
    }
}

function startScheduler() {
    cron.schedule('5 9 * * 1', () => {
        console.log('[CRON] Monday summary triggered')
        sendScheduledMessage('monday-summary', buildMondaySummary)
    }, { timezone: 'America/Puerto_Rico' })

    cron.schedule('5 9 * * 3', () => {
        console.log('[CRON] Wednesday reminder triggered')
        sendScheduledMessage('wednesday-reminder', buildWednesdayReminder)
    }, { timezone: 'America/Puerto_Rico' })

    cron.schedule('5 9 * * 4', () => {
        console.log('[CRON] Thursday poll triggered')
        sendScheduledMessage('thursday-poll', null)
    }, { timezone: 'America/Puerto_Rico' })

    cron.schedule('5 9 * * 6', () => {
        console.log('[CRON] Saturday reminder + poll triggered')
        sendScheduledMessage('saturday-reminder', buildSaturdayReminder)
        setTimeout(() => {
            sendScheduledMessage('saturday-poll', null)
        }, 3000)
    }, { timezone: 'America/Puerto_Rico' })

    // Poll for queued sends from the API every 10 seconds
    setInterval(processPendingSends, 10000)

    console.log('[SCHEDULER] ✅ Cron jobs started (Mon/Wed/Thu/Sat at 9:05 AM AST)')
}

async function processPendingSends() {
    try {
        const db = await getDb()
        const pending = await db.all(
            "SELECT * FROM pending_sends WHERE status = 'pending' ORDER BY created_at ASC LIMIT 5"
        )
        if (!pending.length) return

        const buildFns = {
            'monday-summary': buildMondaySummary,
            'wednesday-reminder': buildWednesdayReminder,
            'thursday-poll': null,
            'saturday-reminder': buildSaturdayReminder,
            'saturday-poll': null,
        }

        for (const item of pending) {
            const result = await sendScheduledMessage(
                item.type, buildFns[item.type],
                item.force_send, item.date, item.group_jid
            )
            await db.run(
                "UPDATE pending_sends SET status = 'done', result = ?, processed_at = datetime('now') WHERE id = ?",
                JSON.stringify(result), item.id
            )
            console.log(`[QUEUE] Processed: ${item.type} → ${result.sent ? 'sent' : result.error || 'skipped'}`)
        }
    } catch (e) {
        // Non-critical — will retry next interval
    }
}

module.exports = { startScheduler, sendScheduledMessage, getToday, getGroupJid }
