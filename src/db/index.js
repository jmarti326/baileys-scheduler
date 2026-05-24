/**
 * DB adapter entry point.
 *
 * DATABASE_URL set → Postgres (Neon or any pg-compatible host)
 * DATABASE_URL absent → SQLite (local / Docker)
 *
 * All db calls are async:
 *   await db.get(sql, ...args)         → first row | undefined
 *   await db.all(sql, ...args)         → row[]
 *   await db.run(sql, ...args)         → { changes, lastInsertRowid }
 *   await db.exec(sql)                 → void  (DDL / multi-statement)
 *   await db.transaction(async fn)     → fn(db) wrapped in BEGIN/COMMIT
 *   await db.initSchema()              → create tables + seed defaults
 */

let instance

async function getDb() {
    if (instance) return instance

    if (process.env.DATABASE_URL) {
        const { createDb } = require('./postgres')
        instance = await createDb()
    } else {
        const { createDb } = require('./sqlite')
        instance = await createDb()
    }

    return instance
}

module.exports = { getDb }
