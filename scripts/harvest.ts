/**
 * Turn the live server's AI cache into merge inputs:
 * `npx tsx scripts/harvest.ts --export /tmp/export.json --season /tmp/season.json
 *    --out-summaries /tmp/hs.json --out-vibes /tmp/hv.json`
 *
 * The workflow curls `GET /api/cache-export` into `--export`; this script never
 * touches the network. It writes two files the existing merge scripts already
 * understand, and writes them even when they are empty — the caller can decide
 * whether an empty merge is worth running.
 *
 * All of the behaviour lives in `harvestCacheExport` (scripts/cacheHarvest.ts);
 * this is the file IO around it. Non-zero exit means the inputs were unusable,
 * which for the harvest is not fatal to the run — it is an optimization, and
 * the workflow guards every harvest step accordingly.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { seasonBundleSchema } from '../src/lib/seasonBundle';
import { harvestCacheExport, type ExportedEntry, type SeasonFacts } from './cacheHarvest';

interface Args {
  export: string;
  season: string;
  outSummaries: string;
  outVibes: string;
}

const FLAGS = ['--export', '--season', '--out-summaries', '--out-vibes'] as const;
const USAGE = 'Usage: harvest --export path --season path --out-summaries path --out-vibes path';

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!(FLAGS as readonly string[]).includes(arg)) throw new Error(`Unknown argument "${arg}". ${USAGE}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a path`);
    values.set(arg, value);
    i++;
  }

  for (const flag of FLAGS) {
    if (!values.has(flag)) throw new Error(`${flag} is required. ${USAGE}`);
  }
  return {
    export: values.get('--export')!,
    season: values.get('--season')!,
    outSummaries: values.get('--out-summaries')!,
    outVibes: values.get('--out-vibes')!,
  };
}

async function loadSeason(path: string): Promise<SeasonFacts> {
  const bundle = seasonBundleSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  const summarized = new Set<number>();
  for (const id of Object.keys(bundle.summaries)) summarized.add(Number(id));

  return {
    showIds: new Set(bundle.shows.map((show) => show.id)),
    summarized,
    titles: new Map(
      bundle.shows.map((show) => [
        show.id,
        show.title.userPreferred ?? show.title.english ?? show.title.romaji ?? `#${show.id}`,
      ]),
    ),
  };
}

async function loadExport(path: string): Promise<ExportedEntry[]> {
  const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
  const entries = (raw as { entries?: unknown })?.entries;
  if (!Array.isArray(entries)) {
    throw new Error(`${path} is not a cache export ({ exportedAt, entries: [...] })`);
  }
  return entries as ExportedEntry[];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const [season, entries] = await Promise.all([
    loadSeason(resolve(args.season)),
    loadExport(resolve(args.export)),
  ]);

  const { summaries, vibes, stats } = harvestCacheExport(entries, season);

  await Promise.all([
    writeFile(resolve(args.outSummaries), `${JSON.stringify(summaries, null, 2)}\n`, 'utf8'),
    writeFile(resolve(args.outVibes), `${JSON.stringify(vibes, null, 2)}\n`, 'utf8'),
  ]);

  console.log(`  export     ${stats.entries} entries (${stats.otherKeys} in namespaces we do not keep)`);
  console.log(
    `  summaries  ${stats.summariesKept} of ${stats.summaryKeys} (${stats.summariesAlreadyHeld} already in the bundle, ${stats.summariesOffSeason} off-season)`,
  );
  console.log(`  vibes      ${stats.vibesKept} of ${stats.vibeKeys}`);
  if (stats.malformed > 0) console.log(`  malformed  ${stats.malformed} row(s) skipped`);
  console.log(`  out        ${resolve(args.outSummaries)}, ${resolve(args.outVibes)}`);
}

main().catch((err: unknown) => {
  console.error(`[harvest] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
