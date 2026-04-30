const { getDb } = require('./database')

/**
 * Get the schedule for a specific date and day type
 * Returns array of { name, phone, role } for assigned members
 */
function getAssignedMembers(serviceDate, dayType) {
    const db = getDb()
    const rows = db.prepare(`
        SELECT tm.name, tm.phone, se.role
        FROM schedule_entries se
        JOIN team_members tm ON se.member_id = tm.id
        WHERE se.service_date = ? AND se.day_type = ?
        ORDER BY CASE se.role WHEN 'primary' THEN 0 ELSE 1 END, tm.name
    `).all(serviceDate, dayType)
    return rows
}

/**
 * Get next Thursday from a given date
 */
function getNextDay(fromDate, targetDay) {
    const parts = fromDate.split('-')
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    const current = date.getDay()
    const distance = (targetDay - current + 7) % 7 || 7
    date.setDate(date.getDate() + (current === targetDay ? 0 : distance))
    return formatISO(date)
}

/**
 * Get this week's Thursday and Sunday dates from a given date
 */
function getWeekDates(fromDate) {
    const parts = fromDate.split('-')
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    const day = date.getDay()

    // Find this week's Thursday (day 4)
    const thursDiff = (4 - day + 7) % 7
    const thursday = new Date(date)
    thursday.setDate(date.getDate() + thursDiff)

    // Find this week's Sunday (day 0) - the upcoming one
    const sunDiff = (7 - day) % 7 || 7
    const sunday = new Date(date)
    sunday.setDate(date.getDate() + sunDiff)

    return {
        thursday: formatISO(thursday),
        sunday: formatISO(sunday)
    }
}

/**
 * Format a local Date object as YYYY-MM-DD without timezone shift
 */
function formatISO(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

/**
 * Build Monday summary message
 */
function buildMondaySummary(today) {
    const { thursday, sunday } = getWeekDates(today)
    const thurTeam = getAssignedMembers(thursday, 'thursday')
    const sunTeam = getAssignedMembers(sunday, 'sunday')

    const mentions = []
    let text = `📋 *Resumen de la semana - Equipo Audiovisual*\n\n`

    text += `🗓️ *Jueves ${formatDate(thursday)}:*\n`
    if (thurTeam.length > 0) {
        thurTeam.forEach(m => {
            const prefix = m.role === 'backup' ? '  • ' : '  ⭐ '
            const suffix = m.role === 'backup' ? ' _(Backup)_' : ''
            text += `${prefix}@${m.phone}${suffix}\n`
            mentions.push(`${m.phone}@s.whatsapp.net`)
        })
    } else {
        text += `  ⚠️ Sin asignar\n`
    }

    text += `\n🗓️ *Domingo ${formatDate(sunday)}:*\n`
    if (sunTeam.length > 0) {
        sunTeam.forEach(m => {
            const prefix = m.role === 'backup' ? '  • ' : '  ⭐ '
            const suffix = m.role === 'backup' ? ' _(Backup)_' : ''
            text += `${prefix}@${m.phone}${suffix}\n`
            mentions.push(`${m.phone}@s.whatsapp.net`)
        })
    } else {
        text += `  ⚠️ Sin asignar\n`
    }

    text += `\n¡Bendiciones! 🙏`

    return { text, mentions }
}

/**
 * Build Wednesday reminder for Thursday team
 */
function buildWednesdayReminder(today) {
    const { thursday } = getWeekDates(today)
    const team = getAssignedMembers(thursday, 'thursday')
    const mentions = []

    let text = `👋 *Recordatorio amistoso*\n\n`
    text += `Mañana *jueves ${formatDate(thursday)}* les toca servir en audiovisual:\n\n`

    if (team.length > 0) {
        team.forEach(m => {
            const prefix = m.role === 'backup' ? '  • ' : '  ⭐ '
            const suffix = m.role === 'backup' ? ' _(Backup)_' : ''
            text += `${prefix}@${m.phone}${suffix}\n`
            mentions.push(`${m.phone}@s.whatsapp.net`)
        })
    } else {
        text += `  ⚠️ Sin asignar\n`
    }

    text += `\n¡Dios les bendiga! 🙌`

    return { text, mentions }
}

/**
 * Build Thursday poll for attendance confirmation
 */
function buildThursdayPoll(today) {
    const { thursday } = getWeekDates(today)
    const team = getAssignedMembers(thursday, 'thursday')
    const primaryTeam = team.filter(m => m.role === 'primary')
    const mentions = primaryTeam.map(m => `${m.phone}@s.whatsapp.net`)
    const names = primaryTeam.map(m => m.name).join(' y ')

    const pollName = `🎬 ${names} - ¿Pueden estar hoy jueves ${formatDate(thursday)}?`
    const values = ['✅ Sí, cuenten conmigo', '❌ No puedo hoy', '⏰ Llego tarde']

    return { pollName, values, mentions, team: primaryTeam }
}

/**
 * Build Saturday reminder for Sunday team
 */
function buildSaturdayReminder(today) {
    const parts = today.split('-')
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    date.setDate(date.getDate() + 1)
    const sunday = formatISO(date)
    const team = getAssignedMembers(sunday, 'sunday')
    const mentions = []

    let text = `👋 *Recordatorio amistoso*\n\n`
    text += `Mañana *domingo ${formatDate(sunday)}* les toca servir en audiovisual:\n\n`

    if (team.length > 0) {
        team.forEach(m => {
            const prefix = m.role === 'backup' ? '  • ' : '  ⭐ '
            const suffix = m.role === 'backup' ? ' _(Backup)_' : ''
            text += `${prefix}@${m.phone}${suffix}\n`
            mentions.push(`${m.phone}@s.whatsapp.net`)
        })
    } else {
        text += `  ⚠️ Sin asignar\n`
    }

    text += `\n¡Dios les bendiga! 🙌`

    return { text, mentions }
}

/**
 * Build Saturday poll for Sunday attendance
 */
function buildSaturdayPoll(today) {
    const parts = today.split('-')
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    date.setDate(date.getDate() + 1)
    const sunday = formatISO(date)
    const team = getAssignedMembers(sunday, 'sunday')
    const mentions = team.map(m => `${m.phone}@s.whatsapp.net`)
    const names = team.map(m => m.role === 'backup' ? `${m.name} (Backup)` : m.name).join(' y ')

    const pollName = `🎬 ${names} - ¿Pueden estar mañana domingo ${formatDate(sunday)}?`
    const values = ['✅ Sí, cuenten conmigo', '❌ No puedo', '⏰ Llego tarde']

    return { pollName, values, mentions, team }
}

function formatDate(dateStr) {
    const [year, month, day] = dateStr.split('-')
    return `${day}/${month}`
}

/**
 * Build personal DM messages for each assigned member
 * Returns array of { jid, text, role } for each person
 */
function buildPersonalNotifications(today, dayType) {
    const { thursday, sunday } = getWeekDates(today)
    const serviceDate = dayType === 'thursday' ? thursday : sunday
    const dayLabel = dayType === 'thursday' ? 'jueves' : 'domingo'
    const team = getAssignedMembers(serviceDate, dayType)

    return team.map(m => {
        const jid = `${m.phone}@s.whatsapp.net`
        let text

        if (m.role === 'primary') {
            text = `¡Hola ${m.name}! 👋\n\n` +
                   `Te escribo para recordarte que este *${dayLabel} ${formatDate(serviceDate)}* estás asignado/a como ⭐ *principal* en el equipo audiovisual.\n\n` +
                   `¡Contamos contigo! Dios te bendiga 🙏`
        } else {
            text = `¡Hola ${m.name}! 👋\n\n` +
                   `Te escribo para informarte que este *${dayLabel} ${formatDate(serviceDate)}* estás asignado/a como *backup* en el equipo audiovisual.\n\n` +
                   `Esto significa que si alguno de los principales no puede asistir, te estaríamos contactando. ¡Gracias por tu disponibilidad! 🙏`
        }

        return { jid, text, role: m.role, name: m.name, phone: m.phone }
    })
}

module.exports = {
    buildMondaySummary,
    buildWednesdayReminder,
    buildThursdayPoll,
    buildSaturdayReminder,
    buildSaturdayPoll,
    buildPersonalNotifications,
    getAssignedMembers,
    getWeekDates
}
