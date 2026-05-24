const Database = require('better-sqlite3')
const path = require('path')

const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', '..', 'data', 'scheduler.db')

async function createDb() {
    const raw = new Database(DB_PATH)
    raw.pragma('journal_mode = WAL')
    raw.pragma('foreign_keys = ON')

    const db = {
        async get(sql, ...args) {
            return raw.prepare(sql).get(...args.flat()) ?? undefined
        },
        async all(sql, ...args) {
            return raw.prepare(sql).all(...args.flat())
        },
        async run(sql, ...args) {
            const info = raw.prepare(sql).run(...args.flat())
            return { changes: info.changes, lastInsertRowid: info.lastInsertRowid }
        },
        async exec(sql) {
            raw.exec(sql)
        },
        async transaction(fn) {
            const tx = raw.transaction(() => fn(db))
            return tx()
        },
        async initSchema() {
            raw.exec(`
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

                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    is_admin INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT (datetime('now'))
                );
            `)

            const insert = raw.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)')
            insert.run('group_jid', 'YOUR_GROUP_JID@g.us')
            insert.run('timezone', 'America/Puerto_Rico')
            insert.run('send_hour', '8')
            insert.run('send_minute', '0')
        },
        // Expose raw instance for session store (SQLite only)
        _raw: raw,
        _type: 'sqlite',
    }

    await db.initSchema()
    return db
}

module.exports = { createDb }

