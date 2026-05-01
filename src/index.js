const express = require('express')
const session = require('express-session')
const SqliteStore = require('better-sqlite3-session-store')(session)
const path = require('path')
const { getDb } = require('./database')
const { connectBot } = require('./bot')
const { startScheduler } = require('./scheduler')
const { initUsersTable, seedAdminFromEnv, requireAuth, hasAnyUsers, authenticate, createUser } = require('./auth')
const routes = require('./routes')

const app = express()
const PORT = process.env.PORT || 3000

// Session secret is required
const SESSION_SECRET = process.env.SESSION_SECRET
if (!SESSION_SECRET) {
    console.error('[APP] ❌ SESSION_SECRET environment variable is required')
    process.exit(1)
}

// Middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Session middleware
app.use(session({
    store: new SqliteStore({
        client: getDb(),
        expired: { clear: true, intervalMs: 900000 }
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production' && process.env.TRUST_PROXY === '1',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}))

if (process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1)
}

// Serve login page (public)
app.get('/login', (req, res) => {
    if (req.session.userId) return res.redirect('/')
    res.sendFile(path.join(__dirname, '..', 'views', 'login.html'))
})

// Login API (public)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' })
    }
    const user = authenticate(username, password)
    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' })
    }
    req.session.regenerate((err) => {
        if (err) return res.status(500).json({ error: 'Session error' })
        req.session.userId = user.id
        req.session.username = user.username
        req.session.isAdmin = user.is_admin
        res.json({ success: true, username: user.username })
    })
})

// Setup page (only when no users exist)
app.get('/setup', (req, res) => {
    if (hasAnyUsers()) return res.redirect('/login')
    res.sendFile(path.join(__dirname, '..', 'views', 'setup.html'))
})

app.post('/api/setup', (req, res) => {
    if (hasAnyUsers()) return res.status(403).json({ error: 'Setup already complete' })
    const { username, password } = req.body
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' })
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })
    createUser(username, password, 1)
    console.log(`[AUTH] ✅ Initial admin "${username}" created via setup`)
    res.json({ success: true })
})

// Logout API (public - just destroys session)
app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true })
    })
})

// Protect everything else
app.use(requireAuth)

// Static files (after auth)
app.use(express.static(path.join(__dirname, '..', 'views')))

// API Routes (protected)
app.use(routes)

// Serve the UI (protected)
app.get('/', (req, res) => {
    if (!hasAnyUsers()) return res.redirect('/setup')
    res.sendFile(path.join(__dirname, '..', 'views', 'index.html'))
})

async function start() {
    // Initialize database
    getDb()
    initUsersTable()
    seedAdminFromEnv()
    console.log('[APP] ✅ Database ready')

    // Connect WhatsApp bot
    await connectBot()
    console.log('[APP] ✅ Bot connecting...')

    // Start cron scheduler
    startScheduler()

    // Start web server
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[APP] 🌐 Web UI available at http://localhost:${PORT}`)
    })
}

start().catch(err => {
    console.error('[APP] Fatal error:', err)
    process.exit(1)
})
