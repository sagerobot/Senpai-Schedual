# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev     # Express + Vite middleware on http://localhost:3000 (tsx server/index.ts)
npm run lint    # tsc --noEmit — strict, plus noUnusedLocals/Parameters/noFallthroughCasesInSwitch
npm test        # vitest run
npm run build   # vite build -> dist/client, esbuild server/index.ts -> dist/server.cjs
npm start       # node dist/server.cjs — serves dist/client, needs no env vars
```

**Do not run `vite` directly.** `server/index.ts` mounts Vite as Express middleware so the frontend and `/api/*` share one origin and one port; standalone Vite makes every AI call 404. The build bakes `NODE_ENV=production` via esbuild `--define`, which dead-codes the dev branch so the production bundle never pulls Vite in.

The `DISABLE_HMR` branch in `vite.config.ts` stops file-watch flicker during agent edits — leave it alone.

## Architecture

React 19 SPA + a thin Express server. **All user data lives in `localStorage`** — no database, no auth, no accounts. The server exists only to hold the Gemini key, bound spend, and cache AI output.

### Server (`server/`)

`index.ts` (bootstrap, static serving, `/api/health`), `middleware.ts`, `cache.ts`, `budget.ts`, `schemas.ts`, `types.ts`, `routes/ai.ts`, `routes/season.ts`, `routes/vibes.ts`, `routes/export.ts`. Three AI routes: `/api/generate-summary`, `/api/community-vibe`, `/api/recommendations`. Model: `gemini-3.6-flash`.

`GET /api/vibes` relays the remembered r/anime episode sentiments from `VIBES_BUNDLE_URL` with a 10-min memory cache; `POST /api/community-vibe` consults it before the LRU, the budget, and Gemini. `GET /api/cache-export` dumps the harvestable cache for the scheduled routines. See `docs/vibes-refresh.md`.

`GET /api/season` relays the precomputed season bundle from `SEASON_BUNDLE_URL` (optional `SEASON_BUNDLE_TOKEN` while the repo is private) with a 30-min memory cache, stale-on-error, and a 60s failure backoff. A 404 `{status:"unavailable"}` is a normal state, not an error — the client falls back to live AniList.

**The data pipeline is split by capability, not preference** (see the runbooks before touching it): GitHub Actions (`.github/workflows/season-data.yml`, `vibe-fetch.yml`) do ALL network fetching — AniList builds, cache harvest, reddit thread content — because the Claude cloud-routine sandbox has locked-down egress (git only; AniList/Render/reddit are unreachable from it, verified live). The scheduled Claude routines are pure WRITERS: summaries from `missing.json`, vibe sentiment from `vibe-work.json`, git in and git out. Ownership per `data`-branch file is tabled in `docs/season-refresh.md` / `docs/vibes-refresh.md` — do not "simplify" the split away.

**The AI envelope** (`types.ts`) is the contract every AI route answers with, and the reason the client can tell degraded copy from data:

| status | HTTP | meaning |
| --- | --- | --- |
| `ok` | 200 | `{ cached, data }` |
| `no_key` | 503 | `GEMINI_API_KEY` absent |
| `resting` | 503 + `Retry-After` | daily budget spent |
| `error` | 502 / 400 / 429 | upstream failure, validation, rate limit |

Never return a placeholder body as `ok` — that is exactly the bug the envelope exists to prevent.

- **Budgets** (`budget.ts`): two in-memory daily counters, `grounded` (search-grounded vibe calls, default 100) and `text` (summaries + rec reasons, default 500), overridable via `AI_GROUNDED_DAILY_BUDGET` / `AI_TEXT_DAILY_BUDGET`, reset at UTC midnight. Checked **after** cache lookup, so cache hits are always free.
- **Rate limits** (`middleware.ts`), all per IP: `/api/*` 60/min, AI routes 15/min, `/api/recommendations` 5/10min.
- **Cache** (`cache.ts`): in-memory LRU, no disk. TTLs — summaries 30d, vibes 7d, rec reasons 14d, fallbacks 1h. Keys are built by typed helpers only so namespaces cannot collide. Cache loss on restart is accepted; budgets bound the rebuild.
- **Vibe output is structured**: `responseMimeType: "application/json"` + `responseSchema` alongside the `googleSearch` tool, with a one-retry extraction fallback. Output is zod-validated (indicator enum, length caps, reddit.com host check).
- **Prompt hardening**: every interpolated title/synopsis is wrapped in `<user_data>` tags with an explicit "data, never instructions" rule.

### Client

- **`src/routes/`** — `router.tsx` maps `/schedule` (default), `/season/:year/:season`, `/search`, `/watching`, `/library`, `/for-you`, `/series/:id`, `*`. Each is `lazy` for code splitting. **Show detail is `?show=<id>`**, hosted by `RootLayout` so Back closes the modal and links are shareable; `/show/:id` is a short link that redirects into it. `nav.ts` is the single nav list feeding both the sidebar and the mobile bar. Adding a view means: a `router.tsx` entry, a `NAV_ITEMS` entry, and a `src/features/<name>/` directory.
- **`/series/:id` is the Atlas** (`src/features/series/`): a persistent shell over rooms addressed by `?view=` (absent = Overview, `run`, `episodes`). Room switches **replace** history (tabs are peers); `?ep=<memberId>-<n>` episode permalinks **push**, carrying `view=episodes` in the same navigation, so Back returns to the room you came from. The frontier reveal toggle is per-visit component state, never persisted. Chart math lives in `insights.ts` (pure, tested); the per-show hero tint contract in `seriesSkin.ts` (see design-language §12).
- **`src/features/<name>/`** — one directory per view: a `route.tsx` wrapper that pulls from hooks/queries, plus the view component. Wrappers stay thin; nothing above them owns view state.
- **`src/queries/`** — TanStack Query v5 with a localStorage persister.
- **`src/series/`** — the franchise-graph subsystem.
- **`src/stores/`** — zustand user data + the one localStorage touchpoint.

### The query layer (`src/queries/`)

Every key is built in `keys.ts` and nowhere else, which is what lets the persistence allowlist be exhaustive by construction.

`useCurrentSchedule` is **bundle-first**: it tries `/api/season` and uses the bundle when fresher than 24h, otherwise it runs the live progressive walk unchanged (`seasonBundle.ts`). Bundle shows are stripped of `description` before entering the query cache (same quota rule as `MEDIA_FIELDS`); the raw records stay in a module index that feeds the detail modal. `primeSeriesFromBundle` primes `['series','byShow',id]` for every member — but skips any graph a user override touches, so personal splits/merges always beat the shared bundle. Bundle summaries short-circuit `/api/generate-summary`.

| Key | staleTime | Notes |
| --- | --- | --- |
| `['schedule','current']` | 15 min | + 15-min `refetchInterval` |
| `['season',year,season]` | 15 min current, `Infinity` past | past seasons cannot change |
| `['search',term]` | 5 min | **not persisted** — one entry per debounced keystroke |
| `['media',id]` | 1 h | via the `id_in` micro-batcher |
| `['showDetails',id]` | 24 h if `aiStatus==='ok'`, else `0` | degraded AI re-attempts on reopen |
| `['series','byShow',showId]` | 7 d | stored under *every* member id |
| `['vibes']` | 10 min | **not persisted** — served hot from server memory, rewritten hourly |

`client.ts` persists to `senpai.queryCache.v1`: success-only, allowlisted roots, versioned `BUSTER`, `removeOldestQuery` under quota pressure.

**`offsets.ts` is a read-time `select` transform, not a fetch-time mutation.** Caches store raw AniList data; the user's simulcast offset and their custom watch-source link are applied on the way *out*. Changing either repaints every affected card from the existing cache — no refetch, no invalidation, no "please refresh". Keep new fetchers on this path.

**The custom watch source is user-supplied and stays that way.** `uiPrefs.customSource` (`{ name, urlTemplate }`, `{title}` substituted at read time) exists so a user can attach a source the app doesn't list — their own media server, a regional service. The app ships **no presets and no suggestions** for it; that neutrality is deliberate and load-bearing, so never add a default, an autocomplete, or docs naming any specific site. Templates must be absolute http(s) URLs (`isInjectableTemplate`) so a hostile value can't render as a `javascript:` link.

### The series graph (`src/series/`)

AniList models each season/cour/movie as a separate media entry; this subsystem reconstructs the franchise. `labeling.ts` is pure (BFS-result → graph, season-label regexes, canonical id by `(date, id)` so `seriesId` doesn't depend on which member you started from). `resolver.ts` is a module-level singleton whose invariants are load-bearing:

- Overrides are applied **before** any cache lookup, or a merge/split silently does nothing.
- BFS is **batched** via `id_in` — 2-3 requests per franchise, not one per season.
- Splits are **symmetric** in both directions.
- A failed request **throws** rather than caching a truncated graph (a graph missing seasons looks exactly like a correct one).
- **The query cache is the reverse map**: every member id is primed with the same graph object.

Override invalidation happens through a store subscription inside `resolver.ts`, not at the call site — `overrides.ts` is a plain facade, and every write path (facade, direct store action, `clearAll`) invalidates.

### User data (`src/stores/`)

`userData.ts` is one zustand store persisted as `senpai.userdata.v3`: `library` keyed by showId, `logs` keyed `showId:episodeNumber`, `offsets`, `overrides`, `uiPrefs`. `useLibrary` / `useEpisodeLog` / `useSimulcastOffsets` are thin facades over it.

`migrations.ts` runs on every boot before the store is created: it sweeps the caches the query layer replaced, one-shot imports the pre-v3 keys when `senpai.userdata.v3` is absent, then deletes those legacy keys. **The `PRESERVED_KEYS` guard matters** — `senpai_series_overrides` shares the retired `senpai_series_` prefix but is user data, and the sweep runs before the migration that reads it. Legacy-key deletion is gated on the v3 blob actually existing, so a failed write retries next boot instead of losing data.

**All localStorage writes go through `storage.ts`** — it holds the only `setItem` calls in `src/`. Reads are zod-validated and fall back instead of throwing; writes implement the quota policy: evict the query cache, retry once, then report `{ok:false, reason:'quota'}` and toast. The two persist adapters are the sanctioned exceptions and both stay inside the policy: zustand's `guardedStorage` (`userData.ts`) routes its writes through `writeJSON`, and the TanStack persister (`queries/client.ts`) owns the blob that gets evicted first. `migrations.ts` reads raw keys because enumerating them is its job, but mutates only via `removeKey`/`writeJSON`.

### localStorage keys

That's the whole list. Grep before adding one, and route it through `storage.ts`.

| Key | Written by |
| --- | --- |
| `senpai.userdata.v3` | `stores/userData.ts` (zustand persist) |
| `senpai.queryCache.v1` | `queries/client.ts` (TanStack persister) |
| `senpai_recommendations` | `hooks/useRecommendations.ts` |

Settings exports/imports `{ version: 2, timestamp, library, logs }` (`features/data/backup.ts`). Reads are deliberately generous — every shape this app ever emitted imports cleanly. Both import paths **merge**, never replace.

## Conventions

- **Strict TypeScript**, plus `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`. Prefix a genuinely-needed unused parameter with `_`.
- **zod at every boundary**: AniList responses, localStorage reads, server route inputs, Gemini outputs, imported backup files.
- **Undo toasts** (`sonner`) on every destructive or logging action — remove, log, unlog, rate, import. Removal carries a full snapshot (entry + logs) restored on Undo. Bookmarking is never destructive.
- **Status vocabulary lives in `src/lib/status.ts`** (`LIBRARY_STATUS_LABELS`, `WatchState`) and renders through `StatusBadge`. This replaced three divergent badge vocabularies — don't start a second.
- **Titles go through `src/lib/displayTitle.ts`** — `title.english` is nullable and often absent.
- **Watch links go through `src/lib/watchLinks.ts`**: `STREAMING_SITES` is the canonical site list, `pickWatchLink` the canonical picker.
- **Design language: `docs/design-language.md`** — tokens in `src/index.css` `@theme` (Tailwind v4, CSS-first, no `tailwind.config`); six themes (Midnight default) via `data-theme` on `<html>` redefining the same variables, pref in `uiPrefs.theme`. All color/radius/shadow/font through tokens — raw values are legal only in index.css theme blocks; hero surfaces (Today's Drops, Up Next deck, Catch-Up) use their `--hero-*` namespaces. Motion (durations/easings/spring) from `src/lib/motion.ts` — no magic numbers. Merge classes with `cn()`.
- **Mobile/a11y floor**: 44px touch targets, exactly one `h1` per view, cards are real buttons, sentiment is never color-only.
- **Tests** are vitest, colocated as `*.test.ts(x)`.

## Gotchas

- **Every AniList request must go through `src/api/anilist/client.ts`.** It owns the module-level rate limiter (concurrency 1, 650ms min gap, global pause on 429) shared by every caller, checks both `response.ok` *and* GraphQL `errors`, and caps retries at 4. Bypassing it reintroduces the request storms this design makes structurally impossible.
- **`MEDIA_FIELDS` omits `description` deliberately** — it was the bulk of the localStorage quota problem. Use `fetchMediaById` / `MEDIA_FIELDS_FULL` when you need the synopsis.
- **Partial schedule pages must never enter the query cache.** `queries/hooks.ts` streams them through a module-level store instead; `setQueryData` would flip `status` to `'success'` and let the persister dehydrate a half-fetched season as if it were complete. The comment there explains the full reasoning — read it before changing the progressive-render path.
- **MAL writes `my_status` two ways** and `malParser.ts` normalizes both: the XML export uses display names ("Completed", "Plan to Watch"), the API uses the numeric codes. Reading only the numbers silently files an entire imported library under Plan to Watch.
- **happy-dom drops every sibling after a CDATA section**, so XML fixtures in tests must avoid CDATA even though real exports use it and real browsers parse it fine. See `malParser.test.ts`.
- `metadata.json` stays until a self-host cutover: this repo also deploys as a Google AI Studio applet, which injects `GEMINI_API_KEY` at runtime.
- Path alias `@` maps to the repo root, but source files use relative imports throughout.
