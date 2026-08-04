/**
 * Print the Western-watchable roster from a season bundle: stdin season.json,
 * stdout [{id, title, english}]. The site test is the app's own STREAMING_SITES
 * (same substring match as pickWatchLink) so "watchable in the West" means the
 * same thing here as in the UI. Python tools shell out to this instead of
 * duplicating the list.
 *
 *   git show origin/data:season.json | npx tsx tools/codex-vibes/western_roster.ts
 */

import { STREAMING_SITES } from '../../src/lib/watchLinks';

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  const bundle = JSON.parse(raw) as {
    shows?: {
      id: number;
      title: { userPreferred: string | null; romaji: string | null; english: string | null };
      externalLinks?: ({ site?: string | null } | null)[] | null;
    }[];
  };
  const roster = (bundle.shows ?? [])
    .filter((s) =>
      (s.externalLinks ?? []).some(
        (l) => l?.site != null && STREAMING_SITES.some((w) => l.site!.toLowerCase().includes(w.toLowerCase())),
      ),
    )
    .map((s) => ({
      id: s.id,
      title: s.title.userPreferred ?? s.title.romaji ?? s.title.english ?? String(s.id),
      english: s.title.english,
    }));
  process.stdout.write(`${JSON.stringify(roster, null, 1)}\n`);
});
