Neon Postgres setup (quick)

1) Create a Neon DB (follow neon.tech dashboard). Copy the connection string.

2) In your project, set the `DATABASE_URL` environment variable (example in `.env.example`). For local dev:

```bash
export DATABASE_URL="postgres://<user>:<pass>@<host>/<db>"
```

3) Install backend deps (inside project venv):

```bash
source .venv/bin/activate
pip install -r backend/requirements.txt
```

4) Run the init script to create minimal tables:

```bash
python backend/scripts/init_db.py
```

5) After this, you can use `app/db.py` helpers to run queries against Neon.

Notes:
- The app continues to fall back to SQLite (FORM_DB_PATH) if `DATABASE_URL` is not set. Use Postgres for metadata and future features.
- For production, store the Neon connection string securely (Secrets / env vars) and prefer a Neon read-replica configuration if needed.
