/**
 * Gate a freshly built season bundle before it reaches the `data` branch:
 * `npx tsx scripts/check-gates.ts --new /tmp/season.json [--prev /tmp/prev-season.json]`
 *
 * Exit 0 means "commit this". Exit 1 means "do not", and the one-line reason is
 * on **stderr** so the workflow can put it straight into a GitHub issue.
 *
 * These checks were prose in docs/season-refresh.md for as long as a Claude
 * routine did the building and could read numbers off a report. The build moved
 * into GitHub Actions — which has open network egress but no judgement — so the
 * rules had to become arithmetic. `scripts/seasonGates.ts` is that arithmetic;
 * this file is the IO around it.
 *
 * The stricter guards inside build-season-data.ts still run first and still
 * matter more: it refuses to write an empty bundle, validates its own output
 * against the client's schema, and aborts the graph phase rather than emitting
 * a franchise that is missing seasons. This is the net under all of that, and
 * it is also the only check that sees the bundle *after* the merge steps.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { seasonBundleSchema } from '../src/lib/seasonBundle';
import { checkSeasonGates, type GateFacts } from './seasonGates';

interface Args {
  next: string;
  prev: string | null;
}

function parseArgs(argv: string[]): Args {
  let next: string | null = null;
  let prev: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--new' || arg === '--prev') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a path`);
      if (arg === '--new') next = value;
      else prev = value;
      i++;
      continue;
    }
    throw new Error(`Unknown argument "${arg}". Usage: check-gates --new path [--prev path]`);
  }

  if (next === null) throw new Error('Usage: check-gates --new path [--prev path]');
  return { next, prev };
}

interface Loaded {
  facts: GateFacts;
  /** Shows in the file before the client's schema had its say. */
  rawShows: number;
}

/**
 * Read a bundle the way the client reads it. The full schema is deliberate: a
 * malformed media record drops out of `shows` rather than failing the parse, so
 * `rawShows` is what catches a bundle that would silently shrink in a browser.
 */
async function load(path: string): Promise<Loaded> {
  const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { shows?: unknown }).shows)) {
    throw new Error('not a season bundle (no `shows` array)');
  }
  const rawShows = (raw as { shows: unknown[] }).shows.length;

  const bundle = seasonBundleSchema.parse(raw);
  return {
    rawShows,
    facts: {
      showIds: bundle.shows.map((show) => show.id),
      summaryIds: Object.keys(bundle.summaries).map(Number),
      generatedAt: bundle.generatedAt,
    },
  };
}

/** Missing or unreadable is "no previous bundle", which is a first run. */
async function loadPrevious(path: string | null): Promise<GateFacts | null> {
  if (path === null) return null;
  try {
    return (await load(path)).facts;
  } catch (err) {
    console.warn(
      `[gates] no usable previous bundle at ${path} (${err instanceof Error ? err.message : String(err)}) — ` +
        'the comparison gates cannot run this time.',
    );
    return null;
  }
}

function blocked(reason: string): never {
  console.error(`[gates] BLOCKED: ${reason}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  let next: Loaded;
  try {
    next = await load(resolve(args.next));
  } catch (err) {
    blocked(`${args.next} is unusable: ${err instanceof Error ? err.message : String(err)}`);
  }

  const prev = await loadPrevious(args.prev === null ? null : resolve(args.prev));
  const result = checkSeasonGates(next.facts, prev);
  const { stats } = result;

  console.log(`  shows      ${stats.shows}${stats.prevShows === null ? '' : ` (was ${stats.prevShows})`}`);
  if (stats.showDrift !== null) console.log(`  drift      ${(stats.showDrift * 100).toFixed(1)}%`);
  console.log(`  summaries  ${stats.summaries}${stats.prevSummaries === null ? '' : ` (was ${stats.prevSummaries})`}`);
  if (stats.summaryFloor !== null) console.log(`  floor      ${stats.summaryFloor} (${stats.departed} pruned)`);
  console.log(`  generated  ${next.facts.generatedAt}`);

  if (next.facts.showIds.length < next.rawShows) {
    blocked(
      `${next.rawShows - next.facts.showIds.length} of ${next.rawShows} show(s) fail the schema the client validates with`,
    );
  }
  if (!result.ok) blocked(result.reason ?? 'a gate failed');

  console.log('');
  console.log('[gates] all gates held.');
}

main().catch((err: unknown) => {
  console.error(`[gates] check failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
