# CLAUDE.md — SubMemo 1.0

Guidance for any Claude (or human) continuing this project. Read this first.

## What this is

A local, single-user, **PDF-first incremental reading app** inspired by SuperMemo.
You read a PDF, save passages as **extracts**, mark them **understood**, **atomize**
them into atomic facts with AI, and **review** those facts on a spaced-repetition
schedule that walks each fact through a **progression ladder**.

The architecture deliberately **decouples a local engine/backend from capture
clients** so a future browser extension (2.0) can reuse the same engine without
rebuilding it. The full design rationale is in
`~/.claude/plans/i-want-to-build-jaunty-parnas.md`.

## Run it

```bash
npm install                 # workspaces: server + client
# Put GROQ_API_KEY in server/.env (see .env.example). If it's already a system
# env var, the server picks it up — /api/health reports "ai_enabled".
npm run dev                  # server on :5174, Vite client on :5173 (open this)
```

- `npm test` — engine unit tests (server, vitest).
- `npm --workspace server run ai:smoke` — hit Groq with a sample, prints JSON.
- `npm run build` — builds client into `client/dist`; `npm start` then serves the
  built UI + API from the server alone on :5174 (single origin).

## Persistence & deploy (1.2)

- **Dual DB driver, chosen at boot by `DATABASE_URL`.** Set ⇒ Postgres (`pg`);
  unset ⇒ local `node:sqlite` file (`data/submemo.sqlite`). Same schema, same SQL.
- **PDF bytes live in the DB** (`sources.pdf_data`, BLOB/BYTEA), not on disk, so
  data survives Render's ephemeral filesystem. Old rows with a `file_path` still
  serve via a disk fallback in `routes/sources.ts`.
- Deploys to **Render** as one Web Service + one Postgres via `render.yaml`; see
  `DEPLOY.md`. Server binds `0.0.0.0`, reads `PORT` from env. `/api/health`
  reports the live `db` engine.
- `config.ts` loads dotenv with **`override:true`** so editing `server/.env`
  replaces a stale system `GROQ_API_KEY` (on Render there's no `.env`, so the
  dashboard vars are used as-is).

## Critical environment facts (don't relearn these the hard way)

- **Node 24, Windows, no Visual Studio.** Native addons that compile (e.g.
  `better-sqlite3`) **fail** — there is no C++ toolchain. We use the **built-in
  `node:sqlite`** (`DatabaseSync`) locally and **`pg`** (pure JS) for Postgres. Do
  **not** reintroduce `better-sqlite3` or other node-gyp deps.
- **The DB layer is async** (`{ get, all, run, exec, transaction, engine }`,
  Promises). `node:sqlite` is sync, wrapped in resolved promises; `pg` is natively
  async. Routes `await` every DB call. Transactions take a callback that receives a
  `tx` querier (`db.transaction(async (tx) => …)`) — use `tx`, not `db`, inside.
- SQL is written with `?` placeholders; the Postgres backend rewrites them to
  `$1..$n`. Keep SQL portable (TEXT/INTEGER/REAL, `substr`, `CREATE … IF NOT
  EXISTS`). The one engine-specific bit is the `{{BYTES}}` token in `schema.sql`.
- Rows from both engines are plain objects with snake_case keys; cast with `as Type`.
- The PowerShell tool wraps native-command **stderr as red "NativeCommandError"
  text even on success** — check the actual exit code / real output, not the red.

## Layout & where things live

```
server/src/
  index.ts              Fastify bootstrap; registers routes; serves client/dist in prod
  config.ts             env (GROQ_API_KEY, GROQ_MODEL, PORT, DATABASE_URL) + AIProvider
  types.ts              shared domain types + STAGE_ORDER
  db/                   async DB layer: index.ts (picks backend + facade),
                        sqlite.ts, postgres.ts, migrate.ts, sql.ts, schema.sql,
                        types.ts; db.ts is a back-compat shim re-exporting index
  services/
    scheduler.ts        SM-2 — pure `sm2(state, grade)` + `scheduler` (Scheduler iface)
    progression.ts      pure `reviewSameStage(state,grade,now)` + `promote(state,now,{demo})`
    ai/{provider.ts,groq.ts,prompts.ts}   AIProvider iface, Groq impl, pinned prompts
  routes/{sources,extracts,review,topics,items}.ts
  scripts/aiSmoke.ts
client/src/
  api.ts                typed fetch wrapper for every endpoint
  pages/{Library,Reader,Review,Calendar}.tsx
  components/{PdfViewer,ExtractPanel,ReviewCard,GradeBar,DemoToggle}.tsx
data/                   gitignored: submemo.sqlite (+ WAL) and uploads/<id>.pdf
```

## Core domain model & invariants

- **Topic** (folder) → **Source** (a PDF/article) → **Extracts** (saved passages)
  → **KnowledgeItems** (atoms). Topics are **source-level** (`sources.topic_id`),
  set on the Library page; the article/source is the "subtopic" in Review. The
  per-extract `extracts.topic_id` column exists but is **unused**.
- An extract has `understood` (0/1). **Atoms are gated out of review unless their
  extract is understood = 1.** Atoms also have **`status`** = `active` |
  `suspended` (kept as a known fact, unscheduled) | `archived` (dropped); only
  `active` atoms appear in review/calendar. These filters live in `review.ts` SQL.
- **Progression ladder** = `encounter → cloze → socratic` (chunking dropped).
  `STAGE_ORDER` in `types.ts` is the source of truth; `socratic` is terminal.
- **SM-2 grades**: Again→q2 (the only lapse), Hard→q3, Good→q4, Easy→q5.
- **Progression is MANUAL (1.1), not grade-driven.** Two pure functions in
  `progression.ts`:
  - `reviewSameStage(state, grade, now)` — normal-mode grading: SM-2 reschedule
    **at the same stage** (never advances).
  - `promote(state, now, {demo})` — the explicit "approve this transition" /
    demo auto-step: advance one stage (terminal stays), EF carries, interval
    resets to 1, due `now` in demo else `+1 day`.
  Normal grade ⇒ `reviewSameStage`. **Demo grade ⇒ `promote`** (walks the item
  forward; the client re-surfaces the same item at its new stage until socratic).
- **Lazy AI generation** happens in `promoteItem()` (`routes/items.ts`): the cloze
  / Socratic question is generated **when an item advances into that stage**. If
  generation fails (offline), the promote is aborted (502) so no item is stranded
  at a stage with no card. `promoteItem` is shared by the promote endpoint and the
  demo branch of `/grade`.

## Review flow & endpoints

- `GET /api/review/session?demo=0|1` — the queue **grouped Topic → Source → items**
  (`{topics:[{sources:[{items}]}], ungrouped:[…]}`), filtered to understood +
  `status='active'` + (due | demo). Drives the 3-level Review UI.
- `POST /api/review/:id/socratic-answer {user_answer, question?}` — AI grades a
  free answer against the original question or a passed-in **follow-up**. No SR
  change. The client loops this for the multi-turn Socratic dialogue.
- `POST /api/review/:id/grade {grade, demo}` — normal: `reviewSameStage`; demo:
  `promoteItem`. Writes a `reviews` row, returns the updated item.
- `POST /api/items/:id/promote` — manual stage advance (+ lazy gen).
- `PATCH /api/items/:id/status {status}` — drop / keep-as-known / reactivate. In
  the Review UI these (`Mark mastered`=suspend, `Remove`=archive) live behind a
  **"⋯ Manage"** menu with confirms, so they aren't fat-fingered (they were the
  1.1 review bug). `POST /api/sources/:id/reactivate` bulk-restores a source's
  suspended/archived atoms (the ExtractPanel "Reactivate all" button).
- `PATCH /api/sources/:id {topic_id}` — assign/move/un-group a source.
- `DELETE /api/topics/:id` — sources fall back to ungrouped (ON DELETE SET NULL).
- `GET /api/calendar?year=&month=` → `{days:{'YYYY-MM-DD':count}, overdue}`;
  `GET /api/calendar/day?date=` → items due that day (today also includes overdue).
  Dates are grouped by **UTC** (`substr(due_date,1,10)`).

## Schema migrations
`schema.sql` is CREATE-IF-NOT-EXISTS only, so new **columns** on existing tables
are added by `migrate()` in `db/migrate.ts` via guarded `ALTER TABLE`. Column
existence is checked per engine (`PRAGMA table_info` for SQLite,
`information_schema.columns` for Postgres). Indexes on added columns are created
**after** the columns exist (in `migrate()`), not in `schema.sql`. Add future
column changes the same way; keep the DDL portable across both engines.

## AI

- All AI is behind `AIProvider` (`services/ai/provider.ts`). Only `GroqProvider`
  exists. **To add Claude/OpenAI: implement the interface and swap the one line in
  `config.ts`.** No engine changes needed.
- Groq uses the OpenAI-compatible endpoint with `response_format: json_object`.
  Prompts are version-pinned constants in `prompts.ts` (`PROMPT_VERSION`).
- `GROQ_MODEL` defaults to `llama-3.3-70b-versatile`. Groq's catalog shifts —
  if calls 400 with "model not found", update the env var.

## Known limitations / deferred (don't treat as bugs)

- No OCR — image-only PDFs yield no selectable text.
- Highlight re-rendering uses a **fixed PDF scale (1.2)** in `PdfViewer.tsx`; saved
  rects assume that scale. Changing scale would misplace old highlights.
- No browser extension / URL ingestion yet (postponed). The schema already has
  `topics` + `sources.type='web'` so a future capture client is a no-op migration.
- Calendar groups due dates by **UTC**, so a late-evening local due time can show
  on the next day. Fine for single-user local use; revisit if it bothers you.
- `re-atomize` appends new atoms; it does not dedupe against existing ones.

## If you extend this

- Swapping SM-2 for FSRS: implement `Scheduler` and have `progression.ts` use it;
  keep `progress()`'s signature so routes/tests don't change.
- Keep pure logic (scheduler, progression) free of DB/AI so the unit tests stay
  the correctness backbone. Add tests there first.
