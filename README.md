# Office Mobile

Turn any Google Sheet into a mobile data entry form. No coding required.

## Features

- **Mobile-first PWA**: Installable on phones, works offline
- **Auto form generation**: Paste a Google Sheet URL, get a form instantly
- **Customizable fields**: Edit labels, change input types, mark required
- **Keyword rules**: Override default field type detection with custom rules
- **Direct to Sheet**: Submissions append directly to your Google Sheet
- **Shareable links**: Get public form links and private edit links

## Tech Stack

- **Backend**: FastAPI (Python) + gspread + SQLite
- **Frontend**: Next.js 14 (App Router) + Tailwind CSS + TypeScript
- **Deployment**: Railway (backend) + Vercel (frontend)
- **Auth**: Google Service Account (MVP), OAuth planned

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 18+
- Google Cloud Project with Sheets API enabled
- Service Account with JSON key

### Backend Setup

1. Clone the repo
2. `cd backend`
3. `python -m venv venv && source venv/bin/activate` (or `venv\Scriptsctivate` on Windows)
4. `pip install -r requirements.txt`
5. Copy `.env.example` to `.env` and fill in:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` or `GOOGLE_SERVICE_ACCOUNT_FILE`
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
6. `uvicorn app.main:app --reload`

### Frontend Setup

1. `cd frontend`
2. `npm install`
3. Copy `.env.local.example` to `.env.local`
4. `npm run dev`

### Google Setup

1. Create a Google Cloud Project
2. Enable Google Sheets API
3. Create a Service Account
4. Download the JSON key file
5. Share your Google Sheet with the service account email (Editor access)

## Deployment

### Backend (Railway)

1. Connect GitHub repo
2. Set environment variables in Railway dashboard
3. Deploy

### Frontend (Vercel)

1. Connect GitHub repo
2. Set `NEXT_PUBLIC_API_URL` environment variable
3. Deploy

## Usage

1. Open the app
2. Paste your Google Sheet URL
3. Customize fields if needed
4. Save form and get shareable link
5. Share the link with form fillers

## Development

### Running Tests

Backend: `cd backend && python -m pytest`

### Code Quality

- Backend: Black, isort, mypy
- Frontend: ESLint, Prettier

## License

MIT

## Contributing

PRs welcome! Please open issues for bugs or feature requests.
