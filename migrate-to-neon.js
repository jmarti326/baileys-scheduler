/**
 * migrate-to-neon.js — Pure-JS migration (no native SQLite bindings needed)
 * Uses sql.js to read SQLite and pg to write to Neon Postgres.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node migrate-to-neon.js [--sqlite-path ./data/scheduler.db]
 */

'use strict'

const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

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

    const initSqlJs = require('sql.js')
    const SQL = await initSqlJs()
    const buffer = fs.readFileSync(SQLITE_PATH)
    const sqlite = new SQL.Database(buffer)

    const pool = new Pool({ connectionString: DATABASE_URL, max: 5 })

    function query(sql) {
        const result = sqlite.exec(sql)
        if (!result.length) return []
        const { columns, values } = result[0]
        return values.map(row => {
            const obj = {}
            columns.forEach((col, i) => obj[col] = row[i])
            return obj
        })
    }

    try {
        // ── team_members ──
        const members = query('SELECT * FROM team_members')
        console.log(`👥  Migrating ${members.length} team members...`)
        for (const m of members) {
            await pool.query(
                `INSERT INTO team_members (id, name, phone, active, created_at)
                 VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
                [m.id, m.name, m.phone, m.active, m.created_at]
            )
        }

        // ── schedule_entries ──
        const entries = query('SELECT * FROM schedule_entries')
        console.log(`📅  Migrating ${entries.length} schedule entries...`)
        for (const e of entries) {
            await pool.query(
                `INSERT INTO schedule_entries (id, service_date, day_type, member_id, role, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
                [e.id, e.service_date, e.day_type, e.member_id, e.role, e.created_at]
            )
        }

        // ── message_logs ──
        const logs = query('SELECT * FROM message_logs')
        console.log(`📋  Migrating ${logs.length} message logs...`)
        for (const l of logs) {
            await pool.query(
                `INSERT INTO message_logs (id, message_key, message_type, content, sent_at, status)
                 VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
                [l.id, l.message_key, l.message_type, l.content, l.sent_at, l.status]
            )
        }

        // ── app_settings ──
        const settings = query('SELECT * FROM app_settings')
        console.log(`⚙️   Migrating ${settings.length} settings...`)
        for (const s of settings) {
            await pool.query(
                `INSERT INTO app_settings (key, value) VALUES ($1, $2)
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
                [s.key, s.value]
            )
        }

        // ── group_aliases ──
        let aliases = []
        try { aliases = query('SELECT * FROM group_aliases') } catch {}
        console.log(`🏷️   Migrating ${aliases.length} group aliases...`)
        for (const a of aliases) {
            await pool.query(
                `INSERT INTO group_aliases (jid, alias) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [a.jid, a.alias]
            )
        }

        // ── users ──
        let users = []
        try { users = query('SELECT * FROM users') } catch {}
        console.log(`🔑  Migrating ${users.length} users...`)
        for (const u of users) {
            await pool.query(
                `INSERT INTO users (id, username, password_hash, is_admin, created_at)
                 VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
                [u.id, u.username, u.password_hash, u.is_admin, u.created_at]
            )
        }

        // ── reset sequences ──
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
