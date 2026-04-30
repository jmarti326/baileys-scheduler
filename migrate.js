const Database = require('better-sqlite3')
const db = new Database('./data/scheduler.db')

try {
    db.exec("ALTER TABLE schedule_entries ADD COLUMN role TEXT NOT NULL DEFAULT 'primary'")
    console.log('✅ role column added')
} catch(e) {
    if (e.message.includes('duplicate')) console.log('role column already exists, skipping')
    else console.log('Note:', e.message)
}

try {
    db.exec(`CREATE TABLE IF NOT EXISTS group_aliases (
        jid TEXT PRIMARY KEY,
        alias TEXT NOT NULL
    )`)
    console.log('✅ group_aliases table ready')
} catch(e) {
    console.log('Note:', e.message)
}

db.close()
