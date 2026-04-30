const express = require('express')
const { getDb } = require('./database')
const { getStatus } = require('./bot')
const { sendScheduledMessage, getToday, getGroupJid } = require('./scheduler')
const { buildMondaySummary, buildWednesdayReminder, buildThursdayPoll, buildSaturdayReminder, buildSaturdayPoll } = require('./messages')

const router = express.Router()

// --- API: Dashboard ---
router.get('/api/status', (req, res) => {
    const db = getDb()
    const recentLogs = db.prepare('SELECT * FROM message_logs ORDER BY sent_at DESC LIMIT 10').all()
    res.json({
        connection: getStatus(),
        groupJid: getGroupJid(),
        today: getToday(),
        recentLogs
    })
})

// --- API: Team Members ---
router.get('/api/team', (req, res) => {
    const db = getDb()
    const members = db.prepare('SELECT * FROM team_members ORDER BY name').all()
    res.json(members)
})

router.post('/api/team', (req, res) => {
    const db = getDb()
    const { name, phone } = req.body
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' })
    const cleanPhone = phone.replace(/[^0-9]/g, '')
    try {
        db.prepare('INSERT INTO team_members (name, phone) VALUES (?, ?)').run(name, cleanPhone)
        res.json({ success: true })
    } catch (err) {
        res.status(400).json({ error: err.message })
    }
})

router.delete('/api/team/:id', (req, res) => {
    const db = getDb()
    db.prepare('DELETE FROM team_members WHERE id = ?').run(req.params.id)
    res.json({ success: true })
})

router.put('/api/team/:id', (req, res) => {
    const db = getDb()
    const { name, phone } = req.body
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' })
    const cleanPhone = phone.replace(/[^0-9]/g, '')
    try {
        db.prepare('UPDATE team_members SET name = ?, phone = ? WHERE id = ?').run(name, cleanPhone, req.params.id)
        res.json({ success: true })
    } catch (err) {
        res.status(400).json({ error: err.message })
    }
})

// --- API: Schedule ---
router.get('/api/schedule', (req, res) => {
    const db = getDb()
    const entries = db.prepare(`
        SELECT se.id, se.service_date, se.day_type, se.role, tm.name, tm.phone, tm.id as member_id
        FROM schedule_entries se
        JOIN team_members tm ON se.member_id = tm.id
        ORDER BY se.service_date ASC, se.day_type, se.role ASC
    `).all()
    res.json(entries)
})

router.post('/api/schedule', (req, res) => {
    const db = getDb()
    const { service_date, day_type, member_id, role } = req.body
    if (!service_date || !day_type || !member_id) {
        return res.status(400).json({ error: 'service_date, day_type, and member_id required' })
    }
    const memberRole = role || 'primary'
    try {
        db.prepare('INSERT INTO schedule_entries (service_date, day_type, member_id, role) VALUES (?, ?, ?, ?)')
            .run(service_date, day_type, member_id, memberRole)
        res.json({ success: true })
    } catch (err) {
        res.status(400).json({ error: err.message })
    }
})

router.delete('/api/schedule/:id', (req, res) => {
    const db = getDb()
    db.prepare('DELETE FROM schedule_entries WHERE id = ?').run(req.params.id)
    res.json({ success: true })
})

// --- API: Manual Send / Preview ---
router.post('/api/preview', (req, res) => {
    const { type, date } = req.body
    const targetDate = date || getToday()

    try {
        let result = {}
        switch (type) {
            case 'monday-summary':
                result = buildMondaySummary(targetDate)
                break
            case 'wednesday-reminder':
                result = buildWednesdayReminder(targetDate)
                break
            case 'thursday-poll':
                result = buildThursdayPoll(targetDate)
                result = { text: `📊 POLL: ${result.pollName}\nOptions: ${result.values.join(', ')}`, mentions: result.mentions }
                break
            case 'saturday-reminder':
                result = buildSaturdayReminder(targetDate)
                break
            case 'saturday-poll':
                result = buildSaturdayPoll(targetDate)
                result = { text: `📊 POLL: ${result.pollName}\nOptions: ${result.values.join(', ')}`, mentions: result.mentions }
                break
            default:
                return res.status(400).json({ error: 'Invalid message type' })
        }
        res.json({ preview: result.text, mentions: result.mentions, type, date: targetDate })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

router.post('/api/send', async (req, res) => {
    const { type, force, date } = req.body

    const buildFns = {
        'monday-summary': buildMondaySummary,
        'wednesday-reminder': buildWednesdayReminder,
        'thursday-poll': null,
        'saturday-reminder': buildSaturdayReminder,
        'saturday-poll': null
    }

    if (!(type in buildFns)) {
        return res.status(400).json({ error: 'Invalid message type' })
    }

    const result = await sendScheduledMessage(type, buildFns[type], force === true, date)
    res.json(result)
})

// --- API: Settings ---
router.get('/api/settings', (req, res) => {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM app_settings').all()
    const settings = {}
    rows.forEach(r => settings[r.key] = r.value)
    res.json(settings)
})

router.post('/api/settings', (req, res) => {
    const db = getDb()
    const { key, value } = req.body
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value)
    res.json({ success: true })
})

// --- API: Logs ---
router.get('/api/logs', (req, res) => {
    const db = getDb()
    const logs = db.prepare('SELECT * FROM message_logs ORDER BY sent_at DESC LIMIT 50').all()
    res.json(logs)
})

module.exports = router
