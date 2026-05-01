const express = require('express')
const { getDb } = require('./database')
const { getStatus, getSocket } = require('./bot')
const { sendScheduledMessage, getToday, getGroupJid } = require('./scheduler')
const { buildMondaySummary, buildWednesdayReminder, buildThursdayPoll, buildSaturdayReminder, buildSaturdayPoll, buildPersonalNotifications } = require('./messages')
const { getUsers, createUser, deleteUser, changePassword } = require('./auth')
const bcrypt = require('bcrypt')

const router = express.Router()

// --- API: Dashboard ---
router.get('/api/status', (req, res) => {
    const db = getDb()
    const recentLogs = db.prepare('SELECT * FROM message_logs ORDER BY sent_at DESC LIMIT 10').all()
    const groupJid = getGroupJid()
    const alias = db.prepare('SELECT alias FROM group_aliases WHERE jid = ?').get(groupJid)
    res.json({
        connection: getStatus(),
        groupJid,
        groupAlias: alias?.alias || null,
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
        ORDER BY se.service_date ASC, se.day_type, CASE se.role WHEN 'primary' THEN 0 ELSE 1 END
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

// --- API: Calendar (monthly view) ---
router.get('/api/calendar/:year/:month', (req, res) => {
    const db = getDb()
    const year = parseInt(req.params.year)
    const month = parseInt(req.params.month) // 1-12
    if (!year || !month || month < 1 || month > 12) {
        return res.status(400).json({ error: 'Invalid year/month' })
    }
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const entries = db.prepare(`
        SELECT se.id, se.service_date, se.day_type, se.role, tm.name, tm.id as member_id
        FROM schedule_entries se
        JOIN team_members tm ON se.member_id = tm.id
        WHERE se.service_date >= ? AND se.service_date <= ?
        ORDER BY se.service_date ASC, CASE se.role WHEN 'primary' THEN 0 ELSE 1 END, tm.name
    `).all(startDate, endDate)

    // Group by date
    const byDate = {}
    entries.forEach(e => {
        if (!byDate[e.service_date]) byDate[e.service_date] = []
        byDate[e.service_date].push(e)
    })

    res.json({ year, month, lastDay, entries: byDate })
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
    const { type, force, date, groupJid } = req.body

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

    const result = await sendScheduledMessage(type, buildFns[type], force === true, date, groupJid)
    res.json(result)
})

// --- API: Personal DMs ---
router.post('/api/personal/preview', (req, res) => {
    const { date, dayType } = req.body
    const targetDate = date || getToday()
    const type = dayType || 'thursday'
    try {
        const notifications = buildPersonalNotifications(targetDate, type)
        res.json(notifications)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

router.post('/api/personal/send', async (req, res) => {
    const { date, dayType, phone } = req.body
    const targetDate = date || getToday()
    const type = dayType || 'thursday'

    if (getStatus() !== 'connected') {
        return res.status(503).json({ error: 'Bot not connected' })
    }

    try {
        const { sendTextMessage } = require('./bot')
        const notifications = buildPersonalNotifications(targetDate, type)
        const toSend = phone ? notifications.filter(n => n.phone === phone) : notifications
        const results = []

        for (const n of toSend) {
            await sendTextMessage(n.jid, n.text)
            results.push({ name: n.name, role: n.role, sent: true })
        }

        res.json({ sent: results.length, results })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
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

// --- API: Groups (fetch from WhatsApp) ---
router.get('/api/groups', async (req, res) => {
    const sock = getSocket()
    if (!sock || getStatus() !== 'connected') {
        return res.status(503).json({ error: 'Bot not connected' })
    }
    try {
        const db = getDb()
        const aliases = {}
        db.prepare('SELECT jid, alias FROM group_aliases').all().forEach(r => aliases[r.jid] = r.alias)

        const groups = await sock.groupFetchAllParticipating()
        const list = Object.values(groups).map(g => ({
            jid: g.id,
            name: g.subject,
            alias: aliases[g.id] || null,
            participants: g.participants?.length || 0
        })).sort((a, b) => (a.alias || a.name).localeCompare(b.alias || b.name))
        res.json(list)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

router.post('/api/groups/alias', (req, res) => {
    const db = getDb()
    const { jid, alias } = req.body
    if (!jid || !alias) return res.status(400).json({ error: 'jid and alias required' })
    db.prepare('INSERT OR REPLACE INTO group_aliases (jid, alias) VALUES (?, ?)').run(jid, alias.trim())
    res.json({ success: true })
})

// --- API: Logs ---
router.get('/api/logs', (req, res) => {
    const db = getDb()
    const logs = db.prepare('SELECT * FROM message_logs ORDER BY sent_at DESC LIMIT 50').all()
    res.json(logs)
})

// --- API: Users (admin only) ---
router.get('/api/users', (req, res) => {
    if (!req.session.isAdmin) return res.status(403).json({ error: 'Admin only' })
    res.json(getUsers())
})

router.post('/api/users', (req, res) => {
    if (!req.session.isAdmin) return res.status(403).json({ error: 'Admin only' })
    const { username, password, isAdmin } = req.body
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' })
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })
    try {
        createUser(username, password, isAdmin ? 1 : 0)
        res.json({ success: true })
    } catch (err) {
        res.status(400).json({ error: err.message })
    }
})

router.delete('/api/users/:id', (req, res) => {
    if (!req.session.isAdmin) return res.status(403).json({ error: 'Admin only' })
    const id = parseInt(req.params.id)
    if (id === req.session.userId) return res.status(400).json({ error: 'Cannot delete yourself' })
    deleteUser(id)
    res.json({ success: true })
})

router.post('/api/users/change-password', (req, res) => {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' })
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })

    const db = getDb()
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId)
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
        return res.status(401).json({ error: 'Current password is incorrect' })
    }
    changePassword(req.session.userId, newPassword)
    res.json({ success: true })
})

// --- API: Current user ---
router.get('/api/me', (req, res) => {
    res.json({ username: req.session.username, isAdmin: req.session.isAdmin })
})

module.exports = router
