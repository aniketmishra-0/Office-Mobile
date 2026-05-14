# Office Mobile

**Google Sheet → Mobile Form. Instant.**

Live at [officemobile.vercel.app](https://officemobile.vercel.app)

---

## Overview

Office Mobile turns any Google Sheet into a mobile-first data entry form. Paste a link, customize fields, share the URL. Submissions land directly in your sheet.

---

## App Structure

The app has 3 core workflows:

```
┌─────────────────────────────────────────────────────┐
│  HOME (/)                                           │
│  ├── Form Builder (paste link / create new)         │
│  └── Library (saved forms list)                     │
├─────────────────────────────────────────────────────┤
│  DATA CORRECTION (/data-fill)                       │
│  └── Load sheet → filter → edit rows → save back    │
├─────────────────────────────────────────────────────┤
│  HISTORY (/history)                                 │
│  └── Load sheet → search entries → view details     │
└─────────────────────────────────────────────────────┘
```

### Pages

| Route | What it does |
|-------|-------------|
| `/` | **Home** — Sign in, build forms, manage your library |
| `/f/[id]` | **Fill Form** — Public form page anyone can submit |
| `/edit/[id]` | **Edit Form** — Modify fields, rules, share link (needs token) |
| `/data-fill` | **Data Correction** — Browse rows, find missing data, edit inline |
| `/history` | **History** — Search past entries across all columns |
| `/dashboard` | **Stats** — Charts, submission counts, top forms |
| `/privacy` | Privacy Policy |
| `/terms` | Terms of Service |

### Navigation (Menu)

From any page, tap the avatar → menu:
- Dashboard (stats)
- Data Correction
- Theme toggle (light/dark)
- Log out

---

## Features

### Form Builder (Home page)
- Paste a Google Sheet URL → auto-detect columns and field types
- Or create a new form from scratch (creates a sheet for you)
- Customize: labels, input types, required fields, reorder
- Keyword rules for type detection overrides
- Multi-tab support
- Publish → get a shareable form URL + QR code

### Form Filling (`/f/[id]`)
- Clean mobile-optimized input form
- Autofill suggestions from past entries
- AI auto-fill (pattern detection from history)
- Validation (required, email, phone, URL)
- Submissions go directly to your Google Sheet

### Data Correction (`/data-fill`)
- Load any sheet by URL
- Filter rows (contains, equals, empty, not empty)
- Sort by most missing / most filled
- Edit any cell inline → save back to sheet
- Saved filter presets
- Keyboard shortcuts (←→ navigate, E edit, ⌘+Enter save)

### History (`/history`)
- Load any sheet by URL
- Full-text search across all columns
- View complete entry details
- Read-only (no editing)

### Library (Home page)
- All saved forms in one list
- Open / Edit / Delete actions
- Search by title
- Quick link to History

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 · TypeScript · Tailwind CSS |
| Backend | FastAPI · Python · gspread |
| Database | SQLite (dev) · Neon PostgreSQL (prod) |
| Auth | Google OAuth 2.0 · Service Account |
| Deploy | Vercel (frontend) · GCP VM + pm2 (backend) |
| CI/CD | GitHub Actions |

---

## Design System

**"Ink on Rice Paper"** — calm editorial aesthetic.

- **Fonts**: Newsreader (serif, headings) + IBM Plex Mono (mono, UI labels)
- **Colors**: cream `#F7F3EE` · ink `#1A1714` · stone `#9C9488` · clay `#C8623A` (accent)
- **Dark mode**: warm near-black base, same terracotta accent
- **No shadows, no rounded containers** — flat, typographic, quiet

---

## Quick Start

### Prerequisites
- Python 3.12+
- Node.js 18+
- Google Cloud Project with Sheets API enabled
- Service Account JSON key

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Set: GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SERVICE_ACCOUNT_EMAIL
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Set: NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

### Google Setup

1. Create a Google Cloud Project
2. Enable Google Sheets API + Google Drive API
3. Create a Service Account → download JSON key
4. Share your sheet with the service account email (Editor)
5. Set up OAuth consent screen + credentials for user sign-in

---

## Deployment

### Backend (GCP VM)
Auto-deploys via GitHub Actions on push to `main`.

### Frontend (Vercel)
Auto-deploys from GitHub. Set `NEXT_PUBLIC_API_URL` env var.

---

## Development

```bash
# Run backend tests
cd backend && python -m pytest

# Build frontend
cd frontend && npm run build
```

---

## License

MIT
