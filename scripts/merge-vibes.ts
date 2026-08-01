/**
 * Fold agent-written vibe readings into the vibes file:
 * `npm run vibes:merge -- --vibes path --in /tmp/new-vibes.json [--out path]`
 *
 * The input is a JSON array of entry-shaped objects the scheduled agent wrote
 * (see docs/vibes-refresh.md), each carrying the `kind` and `title` of the work
 * item it came from. `kind` is what decides `settled` — the agent never does —
 * and `title` is what a broken thread URL is repaired from.
 *
 * All of the behaviour lives in `mergeVibeEntries` (scripts/vibeWork.ts); this
 * is the file IO around it. Exit codes are load-bearing, same as the season
 * scripts: non-zero means "do not commit this file".
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  emptyVibesFile,
  parseVibesFile,
  vibesFileSchema,
  VIBES_FILE_VERSION,
  type VibesFile,
} from '../src/lib/vibesFile';
import { mergeVibeEntries } from './vibeWork';

interface Args {
  vibes: string;
  in: string;
  out: string;
}

function parseArgs(argv: string[]): Args {
  let vibes: string | null = null;
  let input: string | null = null;
  let out: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--vibes' || arg === '--in' || arg === '--out') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a path`);
      if (arg === '--vibes') vibes = value;
      else if (arg === '--in') input = value;
      else out = value;
      i++;
      continue;
    }
    throw new Error(`Unknown argument "${arg}". Usage: vibes:merge -- --vibes path --in path [--out path]`);
  }

  if (vibes === null || input === null) {
    throw new Error('Usage: vibes:merge -- --vibes path --in path [--out path]');
  }
  return { vibes, in: input, out: out ?? vibes };
}

async function loadVibes(path: string): Promise<VibesFile> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    console.warn(`[vibes] no vibes file at ${path}; starting a new one.`);
    return emptyVibesFile();
  }
  // Unlike a missing file, an unreadable one is fatal — writing over it would
  // discard every reading it holds, and readings are the whole point.
  const parsed = parseVibesFile(JSON.parse(raw));
  if (parsed === null) throw new Error(`vibes file at ${path} is not a valid vibes file`);
  return parsed;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const stored = await loadVibes(resolve(args.vibes));
  const before = Object.keys(stored.entries).length;

  const incoming: unknown = JSON.parse(await readFile(resolve(args.in), 'utf8'));
  if (!Array.isArray(incoming)) throw new Error(`${args.in} must contain a JSON array of vibe entries`);

  const result = mergeVibeEntries(stored.entries, incoming, Date.now());

  for (const rejection of result.rejected) {
    console.warn(`[vibes] skipping ${rejection.key}: ${rejection.reason}`);
  }

  const file: VibesFile = { version: VIBES_FILE_VERSION, entries: result.entries };

  // Re-validate the whole file the way every reader will. The lenient entry
  // parse drops anything malformed, so a count that moved here means we were
  // about to write something a reader would silently throw away.
  const validated = vibesFileSchema.safeParse(file);
  if (!validated.success) {
    throw new Error(
      `Merged vibes file failed validation: ${validated.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  const after = Object.keys(validated.data.entries).length;
  if (after !== Object.keys(file.entries).length) {
    throw new Error(`Re-validation dropped ${Object.keys(file.entries).length - after} entry/entries — refusing to write`);
  }
  if (after < before) {
    throw new Error(`Entry count fell from ${before} to ${after} — refusing to write`);
  }

  const json = `${JSON.stringify(file)}\n`;
  await writeFile(resolve(args.out), json, 'utf8');

  console.log(`  incoming   ${incoming.length}`);
  console.log(`  merged     ${result.merged}`);
  console.log(`  frozen     ${result.frozen} (settled entries left untouched)`);
  console.log(`  rejected   ${result.rejected.length}`);
  console.log(`  entries    ${after} total (${before} before)`);
  console.log(`  out        ${resolve(args.out)} (${(json.length / 1_048_576).toFixed(2)} MB)`);
}

main().catch((err: unknown) => {
  console.error(`[vibes] merge failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
