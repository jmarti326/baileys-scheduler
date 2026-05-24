const bcrypt = require('bcrypt')
const { getDb } = require('./db/index')

const SALT_ROUNDS = 10

async function initUsersTable() {
    // Schema is initialised by the db adapter on startup — nothing to do here.
}

async function seedAdminFromEnv() {
    const db = await getDb()
    const adminUser = process.env.ADMIN_USER
    const adminPass = process.env.ADMIN_PASS

    if (!adminUser || !adminPass) return

    const existing = await db.get('SELECT id FROM users WHERE username = ?', adminUser)
    if (existing) return

    const hash = await bcrypt.hash(adminPass, SALT_ROUNDS)
    await db.run(
        'INSERT OR IGNORE INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)',
        adminUser, hash
    )
    console.log(`[AUTH] ✅ Admin user "${adminUser}" created from environment`)
}

async function authenticate(username, password) {
    const db = await getDb()
    const user = await db.get('SELECT * FROM users WHERE username = ?', username)
    if (!user) return null
    if (!await bcrypt.compare(password, user.password_hash)) return null
    return { id: user.id, username: user.username, is_admin: user.is_admin }
}

async function getUsers() {
    const db = await getDb()
    return db.all('SELECT id, username, is_admin, created_at FROM users ORDER BY created_at')
}

async function createUser(username, password, isAdmin = 0) {
    const db = await getDb()
    const hash = await bcrypt.hash(password, SALT_ROUNDS)
    await db.run(
        'INSERT OR IGNORE INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)',
        username, hash, isAdmin
    )
}

async function deleteUser(id) {
    const db = await getDb()
    await db.run('DELETE FROM users WHERE id = ?', id)
}

async function changePassword(id, newPassword) {
    const db = await getDb()
    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS)
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', hash, id)
}

async function hasAnyUsers() {
    const db = await getDb()
    const row = await db.get('SELECT 1 FROM users LIMIT 1')
    return !!row
}

function requireAuth(req, res, next) {
    if (req.session && req.session.userId) return next()
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' })
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
    requireAuth,
}
