/**
 * Merge agent-written summaries into a season bundle:
 * `npm run data:merge -- --bundle path --summaries path [--out path]`
 *
 * The summaries file is a JSON object of { "<showId>": "summary text" },
 * written by the scheduled Claude agent (see docs/season-refresh.md). This
 * validates each entry, folds them into the bundle, re-validates the whole
 * bundle against the client schema, and writes it compactly.
 *
 * `generatedAt` is deliberately left unchanged — merging summaries does not
 * make the schedule data any fresher, and the client's 24h staleness gate
 * keys off that field.
 *
 * Exit codes are load-bearing, same as build-season-data.ts: non-zero means
 * "do not commit this file".
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { seasonBundleSchema } from '../src/lib/seasonBundle';

const SUMMARY_MAX_CHARS = 1000;
const SUMMARY_MIN_CHARS = 40;

const summariesFileSchema = z.record(z.string(), z.string());

interface Args {
  bundle: string;
  summaries: string;
  out: string;
}

function parseArgs(argv: string[]): Args {
  let bundle: string | null = null;
  let summaries: string | null = null;
  let out: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--bundle' || arg === '--summaries' || arg === '--out') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a path`);
      if (arg === '--bundle') bundle = value;
      else if (arg === '--summaries') summaries = value;
      else out = value;
      i++;
      continue;
    }
    throw new Error(`Unknown argument "${arg}". Usage: data:merge -- --bundle path --summaries path [--out path]`);
  }

  if (bundle === null || summaries === null) {
    throw new Error('Usage: data:merge -- --bundle path --summaries path [--out path]');
  }
  return { bundle, summaries, out: out ?? bundle };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const bundle = seasonBundleSchema.parse(JSON.parse(await readFile(resolve(args.bundle), 'utf8')));
  const incoming = summariesFileSchema.parse(JSON.parse(await readFile(resolve(args.summaries), 'utf8')));

  const showIds = new Set(bundle.shows.map((s) => String(s.id)));

  let merged = 0;
  let skippedUnknown = 0;
  let skippedInvalid = 0;

  for (const [id, raw] of Object.entries(incoming)) {
    if (!showIds.has(id)) {
      // A show can leave the season between the work list and the merge; not fatal.
      skippedUnknown++;
      continue;
    }
    const summary = raw.trim().slice(0, SUMMARY_MAX_CHARS);
    // A summary this short is a refusal, an error message, or an empty string —
    // never a real 2-3 sentence summary. Skipping keeps the show on the work
    // list for the next run instead of baking junk into the bundle.
    if (summary.length < SUMMARY_MIN_CHARS) {
      skippedInvalid++;
      console.warn(`[merge] skipping ${id}: summary too short (${summary.length} chars)`);
      continue;
    }
    bundle.summaries[id] = summary;
    merged++;
  }

  const validated = seasonBundleSchema.safeParse(bundle);
  if (!validated.success) {
    throw new Error(
      `Merged bundle failed validation: ${validated.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }

  const json = `${JSON.stringify(bundle)}\n`;
  await writeFile(resolve(args.out), json, 'utf8');

  console.log(`  merged     ${merged}`);
  console.log(`  skipped    ${skippedUnknown} unknown id(s), ${skippedInvalid} invalid`);
  console.log(`  summaries  ${Object.keys(bundle.summaries).length} total of ${bundle.shows.length} shows`);
  console.log(`  out        ${resolve(args.out)} (${(json.length / 1_048_576).toFixed(2)} MB)`);
}

main().catch((err: unknown) => {
  console.error(`[merge] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
