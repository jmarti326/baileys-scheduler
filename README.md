# 🎬 AV Scheduler Bot

A WhatsApp bot for automating audiovisual team scheduling reminders and attendance polls using [Baileys](https://github.com/WhiskeySockets/Baileys).

## Features

- **Automated messages** at 8:00 AM (configurable timezone):
  - **Monday**: Weekly schedule summary with tagged team members
  - **Wednesday**: Friendly reminder for Thursday's AV team
  - **Thursday**: Attendance poll for that day's team
  - **Saturday**: Sunday reminder + attendance poll
- **Web UI** (Tailwind CSS dark theme):
  - Manage team members (add/edit/remove)
  - Assign monthly schedule (primary + backup roles)
  - Manual send with date simulation for testing
  - Preview messages before sending
  - Message logs and connection status
- **Idempotent sends** — won't double-send if the container restarts
- **Docker ready** with persistent volumes

## Quick Start

### Prerequisites

- Node.js 20+
- A WhatsApp account to link

### Local Setup

```bash
git clone https://github.com/jmarti326/baileys-scheduler.git
cd baileys-scheduler
npm install
mkdir -p data
node src/index.js
```

1. Enter your phone number when prompted (with country code, e.g., `17871234567`)
2. Enter the pairing code in WhatsApp → Settings → Linked Devices → Link with phone number
3. Open http://localhost:3000

### Docker

```bash
docker compose up --build -d
```

The web UI is available at http://localhost:3000.

## Configuration

On first run, update the **Group JID** in Settings (or directly in the database). You can find your group's JID by checking the bot logs when a message arrives in that group.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Web UI port |
| `TZ` | `America/Puerto_Rico` | Container timezone |

## Usage

1. **Add team members** in the Team tab (name + phone with country code)
2. **Create the monthly schedule** in the Schedule tab — assign 2 primary + optional backup per Thursday/Sunday
3. **Test with Manual Send** — pick a simulated date and preview the message before sending
4. **Let it run** — cron handles the rest automatically

## Project Structure

```
baileys-scheduler/
├── src/
│   ├── index.js          # Entry point (Express + cron + bot)
│   ├── bot.js            # Baileys connection manager
│   ├── database.js       # SQLite schema & initialization
│   ├── messages.js       # Message builders (summary, reminders, polls)
│   ├── routes.js         # Express API routes
│   └── scheduler.js      # Cron job definitions
├── views/
│   └── index.html        # Web UI (Tailwind CSS)
├── data/                  # Runtime data (gitignored)
│   ├── auth_info/        # WhatsApp session credentials
│   └── scheduler.db      # SQLite database
├── Dockerfile
├── docker-compose.yml
└── migrate.js            # DB migration helper
```

## Disclaimer

This project uses Baileys which is **not affiliated with or endorsed by WhatsApp**. Use at your own discretion and responsibility. Do not use for spam or bulk messaging.

## License

MIT
