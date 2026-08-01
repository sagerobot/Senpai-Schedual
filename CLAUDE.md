# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev     # Express + Vite middleware on http://localhost:3000 (via tsx server.ts)
npm run lint    # tsc --noEmit — the only static check in the repo
npm run build   # vite build + esbuild bundle of server.ts -> dist/server.cjs
npm start       # node dist/server.cjs (serves dist/ statically; set NODE_ENV=production)
```

**Do not run `vite` directly.** `server.ts` mounts Vite as Express middleware so that the frontend and the `/api/*` routes share one origin and one port. Running Vite standalone makes every AI/recommendation call 404.

There is no test runner. The root-level `test_anilist.js`, `test_anilist_tags.js`, and `test-union-find.js` are ad-hoc scratch scripts run with `node <file>`; they assert nothing and just print.

`GEMINI_API_KEY` (see `.env.example`) drives all AI routes. Without it the server still boots — every AI route returns a placeholder payload rather than an error, so a missing key looks like degraded copy, not a crash.

## Architecture

React 19 SPA + a thin Express server. **All user data lives in `localStorage`** — there is no database, no auth, no user accounts. The server exists only to hold the Gemini API key and to cache AI output.

### Server (`server.ts`)

Four POST routes, all of which swallow errors and return a fallback body instead of a non-200:

- `/api/generate-summary` — spoiler-free show summary from merged AniList/MAL/Kitsu synopses
- `/api/community-vibe` — Gemini + `googleSearch` tool scrapes r/anime episode discussion sentiment; the model is asked to return raw JSON and the handler strips ` ```json ` fences by hand
- `/api/recommendations` — the full recommendation pipeline (below)
- `/api/graphql` — an AniList proxy that **no client code currently uses** (the frontend calls AniList directly)

All AI output is cached in `ai_summary_cache.json`, a single flat map committed to the repo and rewritten on every miss. Key namespaces: bare `<showId>` for summaries, `vibe_<showId>_ep<n>`, `rec_reason_<showId>_<sourceTitles>`. Gemini model used throughout: `gemini-3.6-flash`.

### Client data flow

`src/App.tsx` owns essentially all state (anime list, view mode, selected show) and threads it down as props. `viewMode` is a plain string union switch — no router, no context, no state library. Adding a view means: extend `ViewMode` in `src/types.ts`, add a `navItems` entry, add a conditional block in the main area.

`src/api/anilist.ts` talks to `https://graphql.anilist.co` from the browser. Each fetcher inlines its own copy of the media field selection and handles HTTP 429 with a sleep-and-retry plus deliberate inter-page spacing.

**Every fetcher must return through `applyOffsets()`.** That function does two non-obvious things to every result: it injects a synthetic `CustomSource` entry into `externalLinks`, and it shifts `nextAiringEpisode.airingAt`/`timeUntilAiring` by the user's per-show simulcast offset from `senpai_simulcast_offsets`. Skipping it produces shows whose countdowns silently ignore user corrections.

### The series graph — the central abstraction

AniList models each season/cour/movie as a separate media entry. `src/utils/seriesResolution.ts` reconstructs the franchise: BFS from a show id across `PREQUEL`/`SEQUEL` relation edges, sort entries by start date, treat the earliest as the canonical `seriesId`, and derive a short `seasonLabel` per entry by pattern-matching (`Season N`, `Part N`, `Final Season`, `Cour N`) or by stripping the parent title prefix. `MOVIE`/`OVA`/`SPECIAL`/`MUSIC` are flagged `isAttachment` and sort/label separately.

Caching is two-tier in `localStorage`: `senpai_series_<seriesId>` holds the graph, and `senpai_series_reverse_map` maps *every* member id back to its `seriesId` so any season resolves without a refetch.

Users can correct bad graphs via `src/utils/seriesOverrides.ts` (`senpai_series_overrides`): `merges` redirects a show id to another series before BFS starts, `splits` prunes an edge so a spinoff becomes standalone. **Writing overrides deletes the reverse map** to force re-resolution — cached per-series graphs are left behind and go stale.

Consumers: `SeriesTitle` (renders franchise + season as two lines), `useSeriesGraph` (single show), `useLibrarySeries` (resolves an entire library, sequentially, with an `active` flag guarding against unmount), `LibraryView`/`SeriesCard` (groups library rows), `CatchUpQueue` (groups queue rows, with a union-find pass over `relations` as a fallback for shows with no cached graph).

### Recommendations pipeline

`useRecommendations` collapses scored library entries into *series* (averaging scores across seasons via the series graphs), takes the top 15, and sends them plus the full set of series-member ids to exclude. The server fetches AniList `recommendations` for those sources and scores candidates as `Σ (sourceScore/10) × log(1 + recVoteCount)`, keeps the top 12, then asks Gemini for a one-sentence rationale per candidate. Recomputation is throttled client-side: it only re-runs when the count of scored entries has drifted by ≥5, or when the cached list is empty.

### MAL import

`LibraryView` accepts a MAL XML export (transparently gunzipping `.gz` via `DecompressionStream`), parses it with `src/lib/malParser.ts`, batch-resolves MAL ids to AniList ids 50 at a time, maps MAL status codes (1/2/3/4/6) to `LibraryStatus`, and **synthesizes one `EpisodeLog` per watched episode** so imported history participates in catch-up and recap features.

## localStorage keys

Persistence is scattered across hooks and components rather than centralized, so grep before adding a key.

| Key | Written by |
| --- | --- |
| `anime_library` | `useLibrary` (migrates from legacy `anime_favorites` on first load) |
| `anime_episode_logs` | `useEpisodeLog` |
| `senpai_cached_schedule_v2` / `_time_v2` | `App.tsx` (15-min TTL, background refresh on an interval) |
| `senpai_series_<id>`, `senpai_series_reverse_map` | `seriesResolution.ts` |
| `senpai_series_overrides` | `seriesOverrides.ts` |
| `senpai_simulcast_offsets` | `useSimulcastOffsets`, read by `applyOffsets` |
| `senpai_recommendations` | `useRecommendations` |
| `senpai_library_cache`, `senpai_favorites_cache` | `LibraryView`, `FavoritesView` (fetched-show dictionaries) |
| `anime_details_<showId>` | `api/showDetails.ts` (24h TTL) |
| `schedule_includeMovies`, `schedule_audioType`, `schedule_selectedSources` | `DailySchedule` |

`DataSyncModal` exports/imports `{ version, timestamp, library, logs }`; both import paths merge rather than replace (`setLibraryBulk` upserts by `showId`, `setLogsBulk` skips existing `showId-episodeNumber` pairs).

## Conventions and repo debris

- Tailwind v4 configured CSS-first via `@theme` in `src/index.css` — there is no `tailwind.config`. Fonts (Inter / Space Grotesk / JetBrains Mono) come from a Google Fonts `@import`. Dark palette only; class merging via `cn()` in `src/lib/utils.ts`.
- Path alias `@` maps to the repo root (both `vite.config.ts` and `tsconfig.json`), though source files use relative imports throughout.
- `src/hooks/useFavorites.ts` is dead code superseded by `useLibrary`; "favorites" in the UI now means `library.filter(status === 'watching')`.
- `patch_*.cjs`, `fix.cjs`, `*.txt` at the root, and `src/components/*.tsx.patch` are one-off scratch artifacts from earlier automated edits. They are not part of the build and are not run by any script — don't treat them as source of truth.
- `src/components/MockupsView.tsx` ("UI Playground" nav item) is a static design-comparison sandbox with hardcoded mock data, not production UI.
- This project targets Google AI Studio deployment: `metadata.json` declares the applet, and AI Studio injects `GEMINI_API_KEY`/`APP_URL` at runtime. The `DISABLE_HMR` branch in `vite.config.ts` exists to stop file-watch flicker during agent edits — leave it alone.
