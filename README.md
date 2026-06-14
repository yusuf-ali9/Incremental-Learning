# SubMemo 1.0

A local, PDF-first, SuperMemo-inspired incremental reading app.

## What it does

SubMemo turns PDF reading into durable active knowledge by following the SuperMemo
knowledge funnel:

1. **Upload** a PDF.
2. **Read** it in a built-in PDF.js viewer.
3. **Select** an important passage and save it as an **Extract**.
4. **Understand** — mark whether you understand the extract. Not-understood
   extracts are gated out of review.
5. **Atomize** — AI breaks the extract into atomic, minimum-information facts.
6. Each fact then advances through a **progression ladder**, scheduled by spaced
   repetition: **first encounter → cloze deletion → Socratic questioning**.
7. **Review** facts when they are due.
8. **Grade** — at the Socratic stage, AI acts as a tutor that grades your
   free-response answer and asks a follow-up question.

A **Demo mode** toggle skips the spaced-repetition wait so you can walk a fact
through all stages immediately (for testing). Normal mode schedules everything
with the SM-2 algorithm.

All data is stored locally in SQLite. The only thing that leaves your machine is
the text sent to the Groq API for atomization, cloze, and Socratic grading.

## SuperMemo principles applied

- **Do not learn what you do not understand** — extracts marked not-understood are
  gated from review.
- **Minimum information principle** — AI atomization produces one-fact units.
- **Spaced repetition** — SM-2 (swappable for FSRS later).
- **Active recall** — cloze and free-response questions, not passive recognition.

## Setup

```bash
npm install
cp .env.example server/.env     # then put your GROQ_API_KEY in server/.env
npm run dev                     # open http://localhost:5173
```

`/api/health` shows whether the AI key was found (`ai_enabled`).

### Useful commands

| Command | What |
| --- | --- |
| `npm run dev` | Run server (:5174) + Vite client (:5173) for development |
| `npm test` | Engine unit tests (SM-2 + progression) |
| `npm --workspace server run ai:smoke` | Verify Groq works end-to-end |
| `npm run build` && `npm start` | Build the client and serve everything from :5174 |

## Tech

- **Backend:** Node + TypeScript, Fastify, built-in `node:sqlite`.
- **Frontend:** React + Vite, `react-pdf` (PDF.js).
- **AI:** Groq (OpenAI-compatible), behind an `AIProvider` interface so it can be
  swapped or augmented (e.g. Claude) later.
- **Scheduler:** SM-2, behind a `Scheduler` interface.

## Roadmap (2.0)

A thin browser extension as a second capture client: a floating icon, a topic
switcher, highlight-anywhere → atomize under a topic. It will POST to the same
local API — the engine is already decoupled for exactly this.

See `CLAUDE.md` for architecture and contributor notes.
