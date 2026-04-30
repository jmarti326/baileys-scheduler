const Database = require('better-sqlite3')
const path = require('path')

const DB_PATH = path.join(__dirname, '..', 'data', 'scheduler.db')

let db

function getDb() {
    if (!db) {
        db = new Database(DB_PATH)
        db.pragma('journal_mode = WAL')
        db.pragma('foreign_keys = ON')
        initSchema()
    }
    return db
}

function initSchema() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS team_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL UNIQUE,
            active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS schedule_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service_date TEXT NOT NULL,
            day_type TEXT NOT NULL CHECK(day_type IN ('thursday', 'sunday')),
            member_id INTEGER NOT NULL,
            role TEXT NOT NULL DEFAULT 'primary' CHECK(role IN ('primary', 'backup')),
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (member_id) REFERENCES team_members(id),
            UNIQUE(service_date, member_id)
        );

        CREATE TABLE IF NOT EXISTS message_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_key TEXT NOT NULL UNIQUE,
            message_type TEXT NOT NULL,
            content TEXT,
            sent_at TEXT DEFAULT (datetime('now')),
            status TEXT DEFAULT 'sent'
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS group_aliases (
            jid TEXT PRIMARY KEY,
            alias TEXT NOT NULL
        );
    `)

    // Default settings
    const insert = db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)')
    insert.run('group_jid', 'YOUR_GROUP_JID@g.us')
    insert.run('timezone', 'America/Puerto_Rico')
    insert.run('send_hour', '8')
    insert.run('send_minute', '0')
}

module.exports = { getDb }
