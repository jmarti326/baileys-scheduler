const express = require('express')
const path = require('path')
const { getDb } = require('./database')
const { connectBot } = require('./bot')
const { startScheduler } = require('./scheduler')
const routes = require('./routes')

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(express.json())
app.use(express.static(path.join(__dirname, '..', 'views')))

// API Routes
app.use(routes)

// Serve the UI
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'index.html'))
})

async function start() {
    // Initialize database
    getDb()
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
