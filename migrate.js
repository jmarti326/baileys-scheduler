const Database = require('better-sqlite3')
const db = new Database('./data/scheduler.db')
try {
    db.exec("ALTER TABLE schedule_entries ADD COLUMN role TEXT NOT NULL DEFAULT 'primary'")
    console.log('✅ role column added')
} catch(e) {
    if (e.message.includes('duplicate')) {
        console.log('Column already exists, skipping')
    } else {
        console.log('Error:', e.message)
    }
}
db.close()
