# Office Mobile

**Your Spreadsheet. Your Way.**

Office Mobile turns any Google Sheet into a mobile-first data entry, viewing, and editing tool. Sign in with Google, paste a sheet URL, and instantly get powerful ways to interact with your data — no setup, no extra accounts.

**Live:** [https://officemobile.vercel.app](https://officemobile.vercel.app)

---

## Table of Contents

- [How It Works](#how-it-works)
- [Core Workflow](#core-workflow)
- [Features](#features)
  - [1. Google Sign-In (OAuth 2.0)](#1-google-sign-in-oauth-20)
  - [2. Dashboard — Main Hub](#2-dashboard--main-hub)
  - [3. Paste Any Sheet Link → Instant Form](#3-paste-any-sheet-link--instant-form)
  - [4. Create New Sheet + Form](#4-create-new-sheet--form)
  - [5. Edit Existing Forms](#5-edit-existing-forms)
  - [6. Add Sub-Sheets (Multiple Worksheet Tabs)](#6-add-sub-sheets-multiple-worksheet-tabs)
  - [7. Form Fill — Collect New Entries](#7-form-fill--collect-new-entries)
  - [8. Quick View — Spreadsheet Reader](#8-quick-view--spreadsheet-reader)
  - [9. Data Correction — Edit Existing Rows](#9-data-correction--edit-existing-rows)
  - [10. Multi-Header Filtering — Section-Based View](#10-multi-header-filtering--section-based-view)
  - [11. Data Cleaner — Find & Replace + Deduplication](#11-data-cleaner--find--replace--deduplication)
  - [12. Bulk Edit — Batch Data Entry](#12-bulk-edit--batch-data-entry)
  - [13. Dashboard Stats — Analytics](#13-dashboard-stats--analytics)
  - [14. My Sheets — Bookmarks](#14-my-sheets--bookmarks)
  - [15. Settings — Personalization](#15-settings--personalization)
  - [16. AI Auto-Fill](#16-ai-auto-fill)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [API Endpoints](#api-endpoints)
- [Local Development](#local-development)
- [Deployment](#deployment)
- [Environment Variables](#environment-variables)
- [Security](#security)

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Sign in with Google                                         │
│  2. Paste any Google Sheet URL  OR  Create a new sheet          │
│  3. App reads headers → auto-generates a mobile form            │
│  4. Share the form link — anyone can fill it                    │
│  5. Submissions go directly to your Google Sheet in real-time   │
│  6. Edit the form anytime — add/remove fields, change types     │
│  7. Add more worksheet tabs as sub-sheets under the same link   │
└─────────────────────────────────────────────────────────────────┘
```

The app never stores your spreadsheet data on its servers. It reads from and writes to your Google Sheet in real-time using the Google Sheets API with your OAuth credentials.

---

## Core Workflow

### Turn Any Google Sheet Into a Form (3 Steps)

1. **Paste your Google Sheet link** into the dashboard
2. **Select a worksheet tab** — the app reads row 1 as column headers and auto-detects field types (date, email, phone, number, etc.)
3. **Publish** — you get a shareable form URL instantly

That's it. Anyone with the link can fill the form, and every submission appends a row to your sheet.

### Edit the Form Later

- Open your form from the Library
- Change field labels, types, order, or required status
- Add/remove fields (syncs headers back to the sheet)
- Changes are live immediately — no re-publishing needed

### Add Sub-Sheets (Multiple Tabs)

- A single Google Sheet can have multiple worksheet tabs
- Each tab can become its own form
- Use the "Select Worksheet" dropdown when pasting a sheet URL
- All tabs from the same sheet are grouped together in the Library

---

## Features

### 1. Google Sign-In (OAuth 2.0)

1. Click "Continue with Google" on the welcome screen
2. Google consent screen asks for Sheets + Drive permissions
3. After approval, a session is created tied to your Google email
4. Session lasts 30 days — no repeated logins needed

**Technical details:**
- Desktop: Opens a popup window for OAuth flow
- Mobile (iOS/Android): Same-tab redirect (Safari blocks popups)
- Session key is derived from your email hash — same account works across devices
- Permissions: `spreadsheets` (read/write), `drive.file` (create new sheets)

---

### 2. Dashboard — Main Hub

The first screen after login. Two modes:

#### Paste Link Mode
1. Paste a Google Sheet URL into the input field
2. App validates the URL and checks your access level (edit/view-only)
3. Choose how to interact: Quick View, Data Correction, Form Fill, Multi-Header Filter, or Data Cleaner

#### Create New Mode
1. Switch to "CREATE NEW" tab
2. Enter a form title and define fields (name + type)
3. Click "Create" → a new Google Sheet is created in your Drive
4. A shareable form URL is generated automatically

#### Library
- All your saved forms: title, field count, submissions, last updated
- Search by title
- Actions: Open, Edit, Delete
- "CLEAR ALL" removes all saved forms

---

### 3. Paste Any Sheet Link → Instant Form

This is the fastest way to create a form from an existing sheet.

**How it works:**

1. Copy the URL of any Google Sheet you have access to
2. Paste it in the Dashboard input
3. App calls the Google Sheets API to read row 1 (headers)
4. Each header becomes a form field with auto-detected type:
   - "Date" / "DOB" in header → date picker
   - "Email" in header → email input with validation
   - "Phone" / "Mobile" / "Contact" → phone input
   - "Amount" / "Price" / "Salary" → number input
   - "Address" / "Description" / "Notes" → textarea (long text)
   - "URL" / "Link" / "Website" → URL input
   - Everything else → text input
5. Preview the form → customize if needed → Publish
6. Get a shareable link like `https://officemobile.vercel.app/f/abc123`

**What you can customize before publishing:**
- Rename field labels
- Change field types
- Reorder fields (drag & drop)
- Mark fields as required
- Set autofill columns (for smart suggestions from existing data)
- Choose which columns to include/exclude

**After publishing:**
- Share the form URL with anyone (no login required to fill)
- Each submission appends a new row to your Google Sheet
- View submission history with timestamps
- QR code generated for easy mobile sharing

---

### 4. Create New Sheet + Form

If you don't have a sheet yet:

1. Go to Dashboard → "CREATE NEW" tab
2. Enter a form title (becomes the sheet name)
3. Add fields one by one:
   - Field name (becomes the column header)
   - Field type (Text, Number, Date, Time, Phone, Email, Long Text, Checkbox, URL, File)
4. Click "Create"
5. App creates a new Google Sheet in your Drive with headers matching your fields
6. A form URL is generated — ready to share

The created sheet appears in your Google Drive and you can open it in Google Sheets anytime.

---

### 5. Edit Existing Forms

Every form you create gets an edit token. You can modify the form at any time.

**How to edit:**
1. Go to Library → click the edit icon on any form
2. Or use the edit URL: `/edit/{form_id}?token={edit_token}`

**What you can change:**
- **Form title** — update the display name
- **Field labels** — rename any field
- **Field types** — change between text, number, date, email, phone, etc.
- **Field order** — drag to reorder
- **Required status** — toggle required/optional
- **Add new fields** — adds a new column to the sheet
- **Remove fields** — hides the column from the form (doesn't delete sheet data)
- **Autofill columns** — choose which columns provide smart suggestions
- **Custom keyword rules** — define patterns for auto-type detection

**Header sync:** When you add or rename fields, the app automatically updates row 1 of your Google Sheet to match. Your existing data stays intact.

---

### 6. Add Sub-Sheets (Multiple Worksheet Tabs)

A single Google Sheet can have multiple worksheet tabs (Sheet1, Sheet2, etc.). Office Mobile supports all of them.

**How it works:**

1. Paste a Google Sheet URL that has multiple tabs
2. App lists all available worksheet tabs
3. Select any tab → it reads that tab's headers → creates a form for that specific tab
4. Each tab gets its own form URL

**Use cases:**
- One sheet for "January", "February", "March" — each month is a separate form
- One sheet with "Students", "Teachers", "Staff" tabs — each has its own entry form
- One sheet with "Morning Shift", "Evening Shift" — different forms for different teams

**In the Library:**
- Forms from the same spreadsheet are grouped together
- You can see which worksheet tab each form belongs to
- The "Lookup by Sheet" feature shows all tabs (with and without forms) for any sheet URL

---

### 7. Form Fill — Collect New Entries

**Path:** `/f/{form_id}`

The public-facing form that anyone can fill.

**Features:**
- Mobile-first responsive design
- Auto-detected field types with proper input keyboards
- Required field validation
- Autofill suggestions from existing sheet data
- AI Auto-Fill predictions based on submission patterns
- Success screen with "Submit Another" option
- Works without login (form filler doesn't need a Google account)

**Submission flow:**
1. User fills the form fields
2. Clicks "Submit"
3. Backend validates required fields
4. Appends a new row to the Google Sheet via API
5. Saves submission record in the database
6. Shows success confirmation

---

### 8. Quick View — Spreadsheet Reader

**Path:** `/history`

A read-only spreadsheet-style view of any Google Sheet tab.

**Features:**
- Full-text search with cell highlighting
- Column filters (dropdown with unique values)
- Row detail view (click to expand)
- Copy data to clipboard (TSV format)
- Pagination (200 rows at a time)
- Checkbox detection (TRUE/FALSE columns render as toggles)

---

### 9. Data Correction — Edit Existing Rows

**Path:** `/data-fill`

Load a sheet and edit individual rows inline.

**Features:**
- Browse all rows in a list view
- Click any row → detail view → edit mode
- Changes write directly to the Google Sheet
- Filters: contains, equals, empty, not_empty
- Sort: default, most missing, most filled
- Protected columns shown as read-only
- Keyboard shortcuts: ← → (navigate), E (edit), Ctrl+Enter (save), Esc (cancel)
- Saved filter presets

---

### 10. Multi-Header Filtering — Section-Based View

**Path:** `/multi-header-filter`

For sheets with mid-sheet header rows (schedules, weekly plans, date-grouped data).

**Features:**
- Auto-detects section headers within data
- Collapsible accordion sections
- View up to 2 sections simultaneously
- Day-of-week filter for schedules
- Column visibility toggle
- Inline row editing

---

### 11. Data Cleaner — Find & Replace + Deduplication

**Path:** `/data-cleaner`

#### Find & Replace
- Search text → highlights matching cells
- Replace all in one batch operation

#### Duplicate Finder
- Select columns to check
- Highlights duplicate rows
- Delete duplicates with confirmation

---

### 12. Bulk Edit — Batch Data Entry

**Path:** `/bulk-edit`

Add multiple rows at once. Three input modes:

- **Paste Mode** — Copy from Excel/CSV, auto-detect delimiter, column mapping
- **Filter Mode** — Load existing data, filter, batch operations
- **Manual Mode** — Enter rows one at a time via form fields

Smart features: date format detection, bulk apply date/time, inline cell editing, auto-save drafts.

---

### 13. Dashboard Stats — Analytics

**Path:** `/dashboard`

- Stat cards: total forms, total submissions, today's submissions
- Line chart: submissions per day (last 30 days)
- Bar chart: top forms by submission count
- Recent submissions list with relative timestamps

---

### 14. My Sheets — Bookmarks

**Path:** `/my-sheets`

Save frequently used Google Sheets for one-tap access. Add by URL, rename, delete.

---

### 15. Settings — Personalization

| Section | What it does |
|---------|-------------|
| **Profile** | Google account info, sign out |
| **Theme** | Light / Dark toggle |
| **Display** | Font family (6 options), size (XS–XL), line spacing, corner style |
| **Text** | Customize hero title, subtitle, button labels |
| **Forms** | Manage all saved forms |

Available fonts: System, Inter, Newsreader, IBM Plex Mono, Georgia, Merriweather

All preferences sync across devices.

---

### 16. AI Auto-Fill

Predicts field values based on submission history.

- Detects day-of-week patterns (e.g., "Monday" → "Morning Shift")
- Detects recurring values (e.g., same batch name 80% of the time)
- Shows predictions with confidence scores
- One tap to accept all suggestions

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend | FastAPI (Python 3.12), Uvicorn |
| Database | PostgreSQL (Neon serverless) |
| Auth | Google OAuth 2.0 |
| Sheets API | gspread + Google Sheets API v4 |
| Charts | Recharts |
| Hosting | Vercel (frontend), GCP Compute Engine (backend) |

---

## Architecture

```
┌──────────────────┐       ┌──────────────────┐       ┌─────────────────┐
│    Frontend      │──────▶│     Backend      │──────▶│  Google Sheets  │
│ (Vercel/Next.js) │       │ (GCP/FastAPI)    │       │      API        │
└──────────────────┘       └──────────────────┘       └─────────────────┘
                                    │
                                    ▼
                           ┌──────────────────┐
                           │   PostgreSQL     │
                           │    (Neon)        │
                           └──────────────────┘
```

**Data flow:**
1. Frontend sends requests with session key (cookie + X-Session-Key header)
2. Backend middleware extracts session key → loads OAuth token from Postgres
3. Backend uses user's OAuth token to call Google Sheets API
4. Responses go back to frontend — no sheet data stored on server
5. Form metadata (field config, edit tokens) stored in Postgres
6. Submissions logged in Postgres + appended to Google Sheet

---

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/google/login` | Start OAuth flow |
| GET | `/api/auth/google/callback` | OAuth callback |
| GET | `/api/auth/status` | Check login status |
| POST | `/api/auth/logout` | End session |

### Forms
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/forms` | Create a new form |
| GET | `/api/forms/library` | List all user's forms |
| GET | `/api/forms/{id}` | Get public form (for filling) |
| GET | `/api/forms/{id}/edit` | Get form for editing (requires token) |
| PATCH | `/api/forms/{id}` | Update form config |
| DELETE | `/api/forms/{id}` | Delete a form |
| POST | `/api/forms/{id}/submit` | Submit form data |
| GET | `/api/forms/{id}/suggestions` | Get autofill suggestions |
| GET | `/api/forms/{id}/ai-suggestions` | Get AI predictions |
| GET | `/api/forms/lookup/by-sheet` | List all tabs for a sheet |

### Sheets
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sheet/create` | Create new Google Sheet |
| POST | `/api/sheet/preview` | Preview headers from a sheet URL |
| GET | `/api/sheet/worksheets` | List worksheet tabs |
| GET | `/api/sheet/access` | Check access level |
| GET | `/api/sheet/history` | Read all rows from a tab |
| GET | `/api/sheet/sections` | Read sections (multi-header) |
| PATCH | `/api/sheet/row` | Update a single row |
| POST | `/api/sheet/batch-append` | Append multiple rows |
| POST | `/api/sheet/batch-delete` | Delete multiple rows |
| POST | `/api/sheet/batch-update` | Update multiple rows |
| GET | `/api/sheet/protected-columns` | Get protected columns |

### Other
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/config/public` | Public config (service account email) |
| GET/PUT | `/api/preferences` | User preferences |
| GET/POST/DELETE | `/api/saved-sheets` | Bookmarked sheets |

---

## Local Development

### Prerequisites
- Python 3.12+
- Node.js 18+
- PostgreSQL (or Neon connection string)
- Google Cloud project with OAuth 2.0 credentials

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Copy and fill environment variables
cp .env.example .env
# Edit .env with your credentials

# Run the server
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install

# Copy and fill environment variables
cp .env.local.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8000

# Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deployment

### Backend (GCP Compute Engine)

- Auto-deploys via GitHub Actions on push to `main`
- Workflow: SSH into GCP VM → git pull → install deps → restart uvicorn via pm2
- Caddy reverse proxy with automatic HTTPS (nip.io domain)
- Deploy script: `scripts/deploy-backend.sh`
- Production URL: `https://34.24.168.162.nip.io`

### Frontend (Vercel)

- Auto-deploys on push to `main` via Vercel GitHub integration
- Environment variables set in Vercel dashboard
- Production URL: `https://officemobile.vercel.app`

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service account credentials (JSON string) |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | Path to service account JSON file |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email (shown in UI) |
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth 2.0 client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth 2.0 client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | OAuth callback URL |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL |

---

## Security

- OAuth 2.0 with state parameter (CSRF protection)
- Session cookies: `HttpOnly`, `Secure`, `SameSite=None` (production)
- Request body size limit: 2MB (10MB for uploads)
- Formula injection prevention: cells starting with `=`, `+`, `-`, `@` are prefixed with `'`
- No sheet data stored on server — all reads/writes go directly to Google Sheets API
- CORS restricted to explicit origins (no wildcards)
- Protected columns enforced (owner-restricted columns are read-only)

---

## License

Private repository. All rights reserved.
