# Deploying SubMemo to Render

SubMemo runs as **one Web Service** (the Node server serves both the API and the
built React UI) backed by **one managed Postgres** database. Locally it uses
SQLite; on Render it uses Postgres automatically — the same code, selected by the
`DATABASE_URL` environment variable.

## What persists
Everything lives in Postgres: topics, sources, extracts, atoms, reviews, **and the
PDF bytes themselves** (stored in `sources.pdf_data`). Render's web filesystem is
ephemeral, so nothing is kept on disk — a redeploy or restart loses no data.

## One-time deploy (Blueprint)
1. Push this repo to GitHub.
2. In Render: **New +** → **Blueprint** → select the repo. Render reads
   [`render.yaml`](render.yaml) and proposes a `submemo` web service + a
   `submemo-db` Postgres. Click **Apply**.
3. When prompted (or under the service's **Environment** tab), set the secret:
   - `GROQ_API_KEY` = your Groq key.
   (`DATABASE_URL` is wired automatically from the database; `GROQ_MODEL` defaults
   to `llama-3.3-70b-versatile`.)
4. Wait for the build (`npm install && npm run build`) and start (`npm start`).
5. Open the service URL. Check `https://<your-app>.onrender.com/api/health` —
   it should report `"db":"postgres"` and `"ai_enabled":true`.

## Manual alternative (no Blueprint)
1. **New +** → **Postgres** → create `submemo-db` (free plan). Copy its
   **Internal Database URL**.
2. **New +** → **Web Service** → connect the repo. Settings:
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Environment: `DATABASE_URL` = the internal URL, `GROQ_API_KEY` = your key,
     `GROQ_MODEL` = `llama-3.3-70b-versatile`.
3. Deploy.

## Notes
- **Node version** is pinned to 24 via [`.node-version`](.node-version) (needed for
  the built-in `node:sqlite` used locally; harmless on Render).
- The server binds `0.0.0.0` and reads `PORT` from the environment (Render sets it).
- Free Postgres is fine for personal use; PDFs are usually a few MB. The upload
  limit is 200 MB per file.
- Swapping the Groq key later: change `GROQ_API_KEY` in the Render dashboard and
  redeploy (or locally, edit `server/.env`).
