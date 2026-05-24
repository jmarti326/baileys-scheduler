/**
 * migrate-sqlite-to-neon.js
 *
 * One-shot migration: copies all data from the local SQLite database to Neon Postgres.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node migrate-sqlite-to-neon.js [--sqlite-path ./data/scheduler.db]
 *
 * Safe to re-run — uses INSERT ... ON CONFLICT DO NOTHING for all rows.
 */

'use strict'

const Database = require('better-sqlite3')
const { Pool } = require('pg')
const path = require('path')

const args = process.argv.slice(2)
const sqlitePathArg = args[args.indexOf('--sqlite-path') + 1]
const SQLITE_PATH = sqlitePathArg || path.join(__dirname, 'data', 'scheduler.db')
const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
    console.error('❌  DATABASE_URL environment variable is required')
    process.exit(1)
}

async function migrate() {
    console.log(`📂  Reading SQLite from: ${SQLITE_PATH}`)
    const sqlite = new Database(SQLITE_PATH, { readonly: true })
    const pool = new Pool({ connectionString: DATABASE_URL, max: 5 })

    try {
        // ── team_members ──────────────────────────────────────────────────────
        const members = sqlite.prepare('SELECT * FROM team_members').all()
        console.log(`👥  Migrating ${members.length} team members...`)
        for (const m of members) {
            await pool.query(
                `INSERT INTO team_members (id, name, phone, active, created_at)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT DO NOTHING`,
                [m.id, m.name, m.phone, m.active, m.created_at]
            )
        }

        // ── schedule_entries ──────────────────────────────────────────────────
        const entries = sqlite.prepare('SELECT * FROM schedule_entries').all()
        console.log(`📅  Migrating ${entries.length} schedule entries...`)
        for (const e of entries) {
            await pool.query(
                `INSERT INTO schedule_entries (id, service_date, day_type, member_id, role, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT DO NOTHING`,
                [e.id, e.service_date, e.day_type, e.member_id, e.role, e.created_at]
            )
        }

        // ── message_logs ──────────────────────────────────────────────────────
        const logs = sqlite.prepare('SELECT * FROM message_logs').all()
        console.log(`📋  Migrating ${logs.length} message logs...`)
        for (const l of logs) {
            await pool.query(
                `INSERT INTO message_logs (id, message_key, message_type, content, sent_at, status)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT DO NOTHING`,
                [l.id, l.message_key, l.message_type, l.content, l.sent_at, l.status]
            )
        }

        // ── app_settings ──────────────────────────────────────────────────────
        const settings = sqlite.prepare('SELECT * FROM app_settings').all()
        console.log(`⚙️   Migrating ${settings.length} settings...`)
        for (const s of settings) {
            await pool.query(
                `INSERT INTO app_settings (key, value) VALUES ($1, $2)
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
                [s.key, s.value]
            )
        }

        // ── group_aliases ─────────────────────────────────────────────────────
        let aliases = []
        try {
            aliases = sqlite.prepare('SELECT * FROM group_aliases').all()
        } catch {}
        console.log(`🏷️   Migrating ${aliases.length} group aliases...`)
        for (const a of aliases) {
            await pool.query(
                `INSERT INTO group_aliases (jid, alias) VALUES ($1, $2)
                 ON CONFLICT DO NOTHING`,
                [a.jid, a.alias]
            )
        }

        // ── users ─────────────────────────────────────────────────────────────
        let users = []
        try {
            users = sqlite.prepare('SELECT * FROM users').all()
        } catch {}
        console.log(`🔑  Migrating ${users.length} users...`)
        for (const u of users) {
            await pool.query(
                `INSERT INTO users (id, username, password_hash, is_admin, created_at)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT DO NOTHING`,
                [u.id, u.username, u.password_hash, u.is_admin, u.created_at]
            )
        }

        // ── reset sequences so future INSERTs don't collide with migrated IDs ─
        console.log('🔄  Resetting Postgres sequences...')
        for (const table of ['team_members', 'schedule_entries', 'message_logs', 'users']) {
            await pool.query(
                `SELECT setval(pg_get_serial_sequence('${table}', 'id'),
                               COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`
            )
        }

        console.log('✅  Migration complete!')
    } finally {
        sqlite.close()
        await pool.end()
    }
}

migrate().catch(err => {
    console.error('❌  Migration failed:', err)
    process.exit(1)
})
