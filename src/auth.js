const bcrypt = require('bcrypt')
const { getDb } = require('./database')

const SALT_ROUNDS = 10

function initUsersTable() {
    const db = getDb()
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
    `)
}

function seedAdminFromEnv() {
    const db = getDb()
    const adminUser = process.env.ADMIN_USER
    const adminPass = process.env.ADMIN_PASS

    if (!adminUser || !adminPass) return

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUser)
    if (existing) return

    const hash = bcrypt.hashSync(adminPass, SALT_ROUNDS)
    db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)').run(adminUser, hash)
    console.log(`[AUTH] ✅ Admin user "${adminUser}" created from environment`)
}

function authenticate(username, password) {
    const db = getDb()
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
    if (!user) return null
    if (!bcrypt.compareSync(password, user.password_hash)) return null
    return { id: user.id, username: user.username, is_admin: user.is_admin }
}

function getUsers() {
    const db = getDb()
    return db.prepare('SELECT id, username, is_admin, created_at FROM users ORDER BY created_at').all()
}

function createUser(username, password, isAdmin = 0) {
    const db = getDb()
    const hash = bcrypt.hashSync(password, SALT_ROUNDS)
    db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)').run(username, hash, isAdmin)
}

function deleteUser(id) {
    const db = getDb()
    db.prepare('DELETE FROM users WHERE id = ?').run(id)
}

function changePassword(id, newPassword) {
    const db = getDb()
    const hash = bcrypt.hashSync(newPassword, SALT_ROUNDS)
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id)
}

function hasAnyUsers() {
    const db = getDb()
    return !!db.prepare('SELECT 1 FROM users LIMIT 1').get()
}

function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next()
    }
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized' })
    }
    return res.redirect('/login')
}

module.exports = {
    initUsersTable,
    seedAdminFromEnv,
    authenticate,
    getUsers,
    createUser,
    deleteUser,
    changePassword,
    hasAnyUsers,
    requireAuth
}
