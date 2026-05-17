# Office Mobile

**Your Spreadsheet. Your Way.**

Office Mobile turns any Google Sheet into a mobile-first data entry, viewing, and editing tool. Sign in with Google, paste a sheet URL, and instantly get 5 powerful ways to interact with your data — no setup, no extra accounts.

**Live:** [https://officemobile.vercel.app](https://officemobile.vercel.app)

---

## Table of Contents

- [How It Works](#how-it-works)
- [Features](#features)
  - [1. Google Sign-In (OAuth 2.0)](#1-google-sign-in-oauth-20)
  - [2. Dashboard — Main Hub](#2-dashboard--main-hub)
  - [3. Quick View — Spreadsheet Reader](#3-quick-view--spreadsheet-reader)
  - [4. Data Correction — Edit Existing Rows](#4-data-correction--edit-existing-rows)
  - [5. Form Fill — Collect New Entries](#5-form-fill--collect-new-entries)
  - [6. Multi-Header Filtering — Section-Based View](#6-multi-header-filtering--section-based-view)
  - [7. Data Cleaner — Find & Replace + Deduplication](#7-data-cleaner--find--replace--deduplication)
  - [8. Bulk Edit — Batch Data Entry](#8-bulk-edit--batch-data-entry)
  - [9. Dashboard Stats — Analytics](#9-dashboard-stats--analytics)
  - [10. My Sheets — Bookmarks](#10-my-sheets--bookmarks)
  - [11. Settings — Personalization](#11-settings--personalization)
  - [12. AI Auto-Fill](#12-ai-auto-fill)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Local Development](#local-development)
- [Deployment](#deployment)
- [Environment Variables](#environment-variables)

---

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│  1. Sign in with Google                                 │
│  2. Paste any Google Sheet URL                          │
│  3. Choose how to interact: View / Edit / Fill / Clean  │
│  4. All changes go directly back to your Google Sheet   │
└─────────────────────────────────────────────────────────┘
```

The app never stores your spreadsheet data on its servers. It reads from and writes to your Google Sheet in real-time using the Google Sheets API with your OAuth credentials.

---

## Features

### 1. Google Sign-In (OAuth 2.0)

**How it works:**

1. Click "Continue with Google" on the welcome screen
2. Google consent screen asks for Sheets + Drive permissions
3. After approval, a session is created tied to your Google email
4. Session lasts 30 days — no repeated logins needed

**Technical details:**
- Desktop: Opens a popup window for OAuth flow
- Mobile (iOS/Android): Same-tab redirect (Safari blocks popups)
- Session key is derived from your email hash — same account works across devices
- Permissions requested: `spreadsheets` (read/write sheets), `drive.file` (create new sheets)
- If you deny any permission, the app shows a clear error and asks you to retry

**What happens after login:**
- Your Google profile (name, email, avatar) appears in the top-right header
- All your saved forms and sheets are loaded from the database
- Preferences (theme, font, etc.) are synced from the server

---

### 2. Dashboard — Main Hub

The first screen after login. Two modes:

#### Paste Link Mode
1. Paste a Google Sheet URL into the input field
2. App validates the URL format and extracts the spreadsheet ID
3. Access check runs: determines if you have **edit** or **view-only** access
4. If valid, the "OPEN THIS SHEET →" button appears
5. Clicking it opens the **Open In** modal with 5 options:
   - **Quick View** — Read-only spreadsheet view
   - **Data Correction** — Edit existing rows
   - **Form Fill** — Mobile form for new entries
   - **Multi-Header Filtering** — Section-based view for complex sheets
   - **Data Cleaner** — Find & Replace, remove duplicates

#### Create New Mode
1. Switch to "CREATE NEW" tab
2. Enter a form title and add fields (name + type)
3. Available field types: Text, Number, Date, Time, Phone, Email, Long Text, Checkbox, URL, File
4. Click "Create" → a new Google Sheet is created in your Drive with headers matching your fields
5. A shareable form URL is generated

#### Library Section
- Shows all your saved forms with: title, field count, submission count, last updated
- Search forms by title
- Each form has: OPEN (view submissions), EDIT (modify form), × (delete)
- "CLEAR ALL" removes all saved forms

---

### 3. Quick View — Spreadsheet Reader

**Path:** `/history`

A read-only spreadsheet-style view of any Google Sheet tab.

**How to use:**
1. Paste sheet URL → select worksheet tab → loads all rows
2. Data appears in a scrollable table with column headers

**Features:**
- **Full-text search**: Type in the search bar → highlights matching cells across all columns
- **Column filters**: Click any column header → dropdown with all unique values for that column
- **Row detail**: Click any row → expands to show all fields in a card view
- **Copy data**: Copy filtered or all data to clipboard in TSV format (paste into Excel/Sheets)
- **Pagination**: Loads 200 rows at a time with "Load More" button
- **Checkbox detection**: Columns with only TRUE/FALSE values render as checkboxes

---

### 4. Data Correction — Edit Existing Rows

**Path:** `/data-fill`

Load a sheet and edit individual rows inline.

**How to use:**
1. Paste sheet URL → select tab → loads all rows
2. Browse rows in a list view
3. Click any row → opens detail view with all fields
4. Click "Edit" → fields become editable
5. Make changes → "Save" writes directly to the Google Sheet

**Features:**
- **Filters**: contains, equals, empty, not_empty — filter by any column
- **Sort**: Default order, most missing fields first, most filled first
- **Protected columns**: Owner-restricted columns show as read-only (grey)
- **Keyboard shortcuts**:
  - `←` `→` — Navigate between rows
  - `E` — Enter edit mode
  - `Ctrl+Enter` — Save changes
  - `Esc` — Cancel editing
  - `Tab` — Move between fields
- **Saved filter presets**: Save frequently used filter combinations
- **Access check**: Shows edit/read/none status with clear messaging

---

### 5. Form Fill — Collect New Entries

**Path:** `/form-fill` (via Dashboard)

Turn any Google Sheet into a mobile-friendly data entry form.

**How to use:**
1. Paste sheet URL → app reads row 1 as column headers
2. Each header becomes a form field with auto-detected type:
   - "Date" in header → date picker
   - "Email" in header → email input with validation
   - "Phone" / "Mobile" → phone input
   - "Amount" / "Price" → number input
3. Customize: rename fields, change types, reorder, mark required
4. Click "Publish" → generates a shareable form URL

**After publishing:**
- Share the form URL with anyone
- Each submission appends a new row to your Google Sheet
- View submissions history with timestamps
- QR code generated for easy mobile sharing

**Autofill suggestions:**
- As you type, the form suggests values from existing rows
- Select autofill columns to enable smart suggestions

---

### 6. Multi-Header Filtering — Section-Based View

**Path:** `/multi-header-filter`

Designed for sheets with mid-sheet header rows (like schedules, weekly plans, date-grouped data).

**How to use:**
1. Paste sheet URL → app detects section headers within the data
2. Each section appears as a collapsible accordion
3. Select up to 2 sections to view simultaneously

**Features:**
- **Day-of-week filter**: For schedule sheets, filter by Monday/Tuesday/etc.
- **Column visibility**: Hide/show specific columns
- **Text search**: Search within selected sections
- **Row detail + edit**: Click any row → view/edit inline
- **Calendar popup**: Shows current month for date reference
- **Edit access check**: Only allows editing if you have write permission

---

### 7. Data Cleaner — Find & Replace + Deduplication

**Path:** `/data-cleaner`

Two tools for cleaning messy data:

#### Find & Replace
1. Enter search text → highlights all matching cells in the table
2. Enter replacement text → click "Replace All"
3. All matching cells are updated in the Google Sheet in one batch

#### Duplicate Finder
1. Select which columns to check for duplicates
2. App highlights duplicate rows
3. Review duplicates → click "Delete Duplicates" to remove them
4. Confirmation dialog before any destructive action

---

### 8. Bulk Edit — Batch Data Entry

**Path:** `/bulk-edit`

Add multiple rows to a sheet at once.

**Three input modes:**

#### Paste Mode
1. Copy data from Excel/Sheets/CSV
2. Paste into the text area → auto-detects delimiter (tab, comma, pipe)
3. Column mapping UI if headers don't match exactly
4. Preview table shows parsed data
5. Click "Append" → all rows added to the sheet in one API call

#### Filter Mode
1. Load existing sheet data
2. Filter rows by criteria
3. Select rows for batch operations

#### Manual Mode
1. Enter rows one at a time via form fields
2. Add multiple rows before submitting

**Smart features:**
- Date format detection: DD-MMM-YYYY, DD/MM/YYYY, YYYY-MM-DD auto-converted
- Bulk apply date/time to all rows at once
- Inline cell editing in preview table
- Auto-save drafts to localStorage (recover if browser closes)

---

### 9. Dashboard Stats — Analytics

**Path:** `/dashboard`

Visual analytics for your form submissions.

- **Stat cards**: Total forms, total submissions, today's submissions
- **Line chart**: Submissions per day (last 30 days)
- **Bar chart**: Top forms by submission count
- **Recent list**: Last 10 submissions with relative timestamps ("2h ago", "3d ago")

---

### 10. My Sheets — Bookmarks

**Path:** `/my-sheets`

Save frequently used Google Sheets for one-tap access.

**How to use:**
1. Click "+" to add a sheet → enter URL + name
2. Saved sheets appear in a list
3. Click any sheet → Open In modal (same 5 options)
4. Actions: Rename, Copy Link, Delete

---

### 11. Settings — Personalization

Accessible from the avatar menu (top-right) on any screen.

**Five sections:**

| Section | What it does |
|---------|-------------|
| **Profile** | Shows your Google account (email, name, avatar). Sign out button. |
| **Theme** | Light (rice paper) / Dark (warm near-black) toggle. Applies instantly. |
| **Display** | Font family (6 options), font size (XS–XL), line spacing, corner style. Live preview. |
| **Text** | Customize hero title, subtitle, submit button label, success heading. |
| **Forms** | Manage all saved forms — edit, unauthorize, delete. |

**Available fonts:** System, Inter, Newsreader, IBM Plex Mono, Georgia, Merriweather

All preferences sync to the server — same settings on any device.

---

### 12. AI Auto-Fill

When filling a form, the app can predict field values based on your submission history.

**How it works:**
- Analyzes past submissions for patterns
- Detects day-of-week patterns (e.g., "Monday" always has "Morning" in the shift field)
- Detects recurring values (e.g., same batch name used 80% of the time)
- Shows predictions with confidence scores
- One tap to accept all AI suggestions

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, CSS-in-JS |
| Backend | FastAPI (Python 3.12), Uvicorn |
| Database | PostgreSQL (Neon serverless) |
| Auth | Google OAuth 2.0 |
| Sheets API | gspread + Google Sheets API v4 |
| Charts | Recharts |
| Hosting | Vercel (frontend), GCP Compute Engine (backend) |

---

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Frontend   │────▶│   Backend    │────▶│  Google Sheets   │
│  (Vercel)    │     │  (GCP/FastAPI)│     │      API         │
└──────────────┘     └──────────────┘     └─────────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  PostgreSQL  │
                     │   (Neon)     │
                     └──────────────┘
```

**Data flow:**
1. Frontend sends requests with session key (cookie + X-Session-Key header)
2. Backend middleware extracts session key → loads OAuth token from DB
3. Backend uses user's OAuth token to call Google Sheets API
4. Responses go back to frontend — no sheet data stored on server

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

# Run the server
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install

# Copy and fill environment variables
cp .env.local.example .env.local

# Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deployment

### Backend (GCP)
- Deployed via GitHub Actions on push to `main`
- SSH into GCP Compute Engine → git pull → restart uvicorn
- Nginx reverse proxy with SSL (nip.io domain)

### Frontend (Vercel)
- Auto-deploys on push to `main` via Vercel GitHub integration
- Environment variables set in Vercel dashboard

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service account credentials (JSON string) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email (shown in UI) |
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth 2.0 client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth 2.0 client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | OAuth callback URL |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL |

---

## Security

- All API requests use `credentials: include` + `X-Session-Key` header
- OAuth state parameter prevents CSRF attacks
- Session cookies: `HttpOnly`, `Secure`, `SameSite=None` (production)
- Request body size limited to 2MB (10MB for uploads)
- Formula injection prevention: cells starting with `=`, `+`, `-`, `@` are prefixed with `'`
- No sheet data stored on server — all reads/writes go directly to Google Sheets API

---

## License

Private repository. All rights reserved.
