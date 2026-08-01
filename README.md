# Senpai Schedule

Track upcoming anime releases, see a daily airing schedule with countdowns in your local timezone, log the episodes you watch, and let the catch-up queue tell you what to watch next. AI-assisted extras (spoiler-free show summaries, community vibe checks from r/anime, personalized recommendations) are powered by Gemini and are strictly optional — the app works fully without an API key.

## Your data

**Everything you track lives in your browser's localStorage.** There are no accounts and no server-side user data. That means:

- Each browser/device keeps its own library. Use **Data & Settings → Export** to back up a JSON file (`{ version: 2, timestamp, library, logs }`) and **Import** to load it on another device. Import **merges** rather than replaces, so it is safe to run against a device that already has data.
- Clearing site data clears your library — export first.
- You can import your MyAnimeList history (XML export, `.gz` supported) from the Library view; watched episodes are reconstructed so catch-up and recap features work on imported history.

## Quickstart (local)

Requires Node.js ≥ 20.

```bash
npm install
cp .env.example .env   # optional — only needed for AI features
npm run dev            # Express + Vite middleware on http://localhost:3000
```

**Do not run `vite` directly** — the Express server mounts Vite as middleware so the frontend and `/api/*` share one origin. Running Vite standalone makes every AI call 404.

Other scripts:

```bash
npm run lint   # strict TypeScript check
npm test       # vitest
npm run build  # client -> dist/client, server bundle -> dist/server.cjs
npm start      # serve the production build (no env vars needed)
```

## AI features and cost

All AI routes live on the server so the Gemini key never reaches the browser. Without `GEMINI_API_KEY` the routes respond with an explicit "AI off" status and the UI degrades gracefully.

Cost is bounded by design:

- Responses are cached server-side (summaries 30 days, vibe checks 7 days, recommendation reasons 14 days) and shared across all visitors.
- Community vibe checks are **click-to-load** — nothing fires automatically.
- Per-IP rate limits: 60 req/min general, 15 req/min on AI routes, 5 req/10 min on recommendations.
- Daily call budgets with a graceful "AI is resting" state:

| Env var | Default | Meaning |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | Enables AI features (AI Studio injects this automatically) |
| `AI_GROUNDED_DAILY_BUDGET` | `100` | Max Google-Search-grounded calls/day (vibe checks — the only line item that really costs money) |
| `AI_TEXT_DAILY_BUDGET` | `500` | Max plain text-generation calls/day (summaries, rec reasons) |
| `PORT` | `3000` | Server port (PaaS platforms inject this) |
| `TRUST_PROXY_HOPS` | `1` | Express trust-proxy setting for correct per-IP limits behind a proxy |

Realistic cost for a small friend group: **$0–5/month** (grounded search has a free tier; everything else is fractions of a cent). The budgets cap worst-case abuse at roughly $45/month. Code caps *calls* — set a billing alert on the Google Cloud project backing your key to cap *dollars*.

## Deploying

**Google AI Studio (current path):** the repo is an AI Studio applet (`metadata.json`); AI Studio injects `GEMINI_API_KEY` and deploys to Cloud Run. No extra configuration needed.

**Self-hosting (Render / Fly / Railway / any Docker host):**

```bash
docker build -t senpai-schedule .
docker run -p 8080:8080 -e GEMINI_API_KEY=your-key senpai-schedule
```

Health check endpoint: `GET /api/health` → `{ ok: true, ai: "ready" | "no_key" | "resting" }`.

## Data sources & disclaimers

- Schedule/show data comes from [AniList](https://anilist.co); ratings and synopses are enriched from MyAnimeList (via Jikan) and Kitsu. This is an unofficial fan project, unaffiliated with any of them.
- AI summaries and vibe checks are machine-generated and can be wrong; vibe checks summarize public r/anime discussion sentiment.
- Watch links point to the streaming platforms AniList lists for each show.

## Contributing

CI runs `npm run lint` (strict tsc), `npm test`, and `npm run build` on every PR. Architecture notes for coding agents live in `CLAUDE.md`.
