/**
 * The pure half of the reddit fetch: which thread is the right one, and how
 * much of it fits in the packet.
 *
 * `scripts/fetch-reddit-threads.ts` is the CLI around this — it holds the OAuth
 * dance, the pacing, and the retries. Everything that decides *what counts as a
 * match* lives here, because that decision is the one with consequences: a
 * wrong thread means the hourly writer summarizes another show's episode and
 * the merge freezes it.
 *
 * The bar is deliberately set where false negatives are cheap and false
 * positives are not. A miss costs one `not_found`, which the client shrugs off;
 * a hit on the wrong season is a permanently wrong reading.
 *
 * No Node imports, no side effects, no clock reads, no network.
 */

/** Below this a candidate is not the episode's thread. */
export const MIN_THREAD_SCORE = 0.6;
/** Top-level comments kept per thread. */
export const MAX_COMMENTS_PER_THREAD = 30;
/** Enough to carry an opinion, short enough that 900 of them still fit. */
export const COMMENT_MAX_CHARS = 400;
/** Whole-packet ceiling. The writer reads this file; it must stay readable. */
export const PACKET_BUDGET_BYTES = 300 * 1024;

/** One work item from `vibes:prepare`, plus whatever we found for it. */
export interface ThreadCandidate {
  title: string;
  /** r/anime's bot lists the show's other names in the body — the best signal we get. */
  selftext?: string;
  num_comments?: number;
}

export interface ThreadTarget {
  title: string;
  episode: number;
}

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

/** Lowercase, letters and digits only, single-spaced. */
export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const EPISODE_PHRASE = /\b(?:episodes?|eps?)\.?\s*(\d{1,4})\b/i;
/** Everything from the episode phrase onward, plus any separator before it. */
const EPISODE_SUFFIX = /[\s\-–—:|]*\b(?:episodes?|eps?)\.?\s*\d{1,4}\b.*$/i;
/** `[Rewatch]`, `[Spoilers]` and friends, which dilute every similarity score. */
const LEADING_TAGS = /^(?:\s*\[[^\]]*\]\s*)+/;

/**
 * The episode a thread title is about, or null when it is not an episode
 * thread at all. r/anime's bot always numbers them; anything unnumbered is a
 * series discussion, a fan post, or a news item.
 */
export function episodeFromTitle(title: string): number | null {
  const match = EPISODE_PHRASE.exec(title);
  return match === null ? null : Number(match[1]);
}

/** The show part of a thread title: tags and the episode suffix removed. */
export function showPartOfTitle(title: string): string {
  return title.replace(LEADING_TAGS, '').replace(EPISODE_SUFFIX, '').trim();
}

const ORDINAL_PATTERNS = [
  /\b(?:season|part|cour)\s*(\d{1,2})\b/g,
  /\b(\d{1,2})(?:st|nd|rd|th)\s+(?:season|part|cour)\b/g,
  /\bs(\d{1,2})\b/g,
];

const ROMAN: Record<string, number> = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };

/**
 * Every season-ish number a title declares — "Season 2", "2nd Season", "Part 2",
 * "Cour 2", "S2", a trailing roman numeral ("Overlord IV"), a trailing digit.
 *
 * A first season declares nothing, so an empty set means "unmarked", which is
 * itself a claim: `ordinalsAgree` treats unmarked-vs-marked as a mismatch.
 * Numbers below 2 are ignored — nobody writes "Season 1", and titles like
 * "Steins;Gate 0" would otherwise read as one.
 */
export function seasonOrdinals(title: string): Set<number> {
  const normalized = normalizeTitle(title);
  const found = new Set<number>();

  for (const pattern of ORDINAL_PATTERNS) {
    for (const match of normalized.matchAll(pattern)) {
      const value = Number(match[1]);
      if (value >= 2) found.add(value);
    }
  }

  const last = normalized.split(' ').at(-1) ?? '';
  if (ROMAN[last] !== undefined) found.add(ROMAN[last]);
  else if (/^\d{1,2}$/.test(last) && Number(last) >= 2) found.add(Number(last));

  return found;
}

/**
 * Do two titles claim the same place in their franchise?
 *
 * Both unmarked agree (two first seasons). Both marked agree if they overlap at
 * all — "Dr. Stone: Science Future Part 2" and "Dr. Stone Season 4 Part 2" are
 * the same cour described differently, and demanding identical sets would throw
 * it away. One marked and one not is the near-miss this whole function exists
 * for: a season-2 work item against season 1's thread.
 */
export function ordinalsAgree(a: Set<number>, b: Set<number>): boolean {
  if (a.size === 0 && b.size === 0) return true;
  if (a.size === 0 || b.size === 0) return false;
  for (const value of a) if (b.has(value)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const value of a) if (b.has(value)) common++;
  return (2 * common) / (a.size + b.size);
}

function wordSet(value: string): Set<string> {
  return new Set(normalizeTitle(value).split(' ').filter((word) => word !== ''));
}

/** Character bigrams, spaces removed — "Dan Da Dan" and "Dandadan" score 1. */
function bigramSet(value: string): Set<string> {
  const flat = normalizeTitle(value).replace(/ /g, '');
  const out = new Set<string>();
  for (let i = 0; i + 1 < flat.length; i++) out.add(flat.slice(i, i + 2));
  return out;
}

/** Shorter than this, containment proves nothing — "K" is inside everything. */
const MIN_CONTAINMENT_CHARS = 6;
/** What containment is worth. Below 1 because it is evidence, not identity. */
const CONTAINMENT_SCORE = 0.9;

function contains(haystack: string, needle: string): boolean {
  const target = normalizeTitle(needle);
  return target.length >= MIN_CONTAINMENT_CHARS && normalizeTitle(haystack).includes(target);
}

/**
 * How much a candidate's show name looks like the work item's.
 *
 * Three measures, best one wins, because they fail in different places. Word
 * overlap handles ordinary rewordings; character bigrams handle transliteration
 * spacing ("Dan Da Dan"); containment handles the case neither can — AniList
 * hands us a romaji title and r/anime uses the English one, which share no
 * words and few letters. The bot's post body lists the show's other names, so
 * finding the romaji title in there is close to proof.
 */
export function titleSimilarity(candidate: ThreadCandidate, target: ThreadTarget): number {
  const showPart = showPartOfTitle(candidate.title);
  if (contains(showPart, target.title) || contains(candidate.selftext ?? '', target.title)) {
    return CONTAINMENT_SCORE;
  }
  return Math.max(dice(wordSet(showPart), wordSet(target.title)), dice(bigramSet(showPart), bigramSet(target.title)));
}

/**
 * 0 to 1, where 0 means "certainly not this episode's thread".
 *
 * Two hard gates run before any similarity: the episode number must match
 * exactly, and the season markers must agree. Both are cheap, and both catch
 * the failure that actually happens — reddit's relevance search returning the
 * previous season's thread for the same episode number.
 */
export function scoreThread(candidate: ThreadCandidate, target: ThreadTarget): number {
  if (episodeFromTitle(candidate.title) !== target.episode) return 0;
  if (!ordinalsAgree(seasonOrdinals(showPartOfTitle(candidate.title)), seasonOrdinals(target.title))) return 0;

  const bonus = /\bdiscussion\b/i.test(candidate.title) ? 0.1 : 0;
  return Math.min(1, titleSimilarity(candidate, target) + bonus);
}

/** The best-scoring candidate, or null when none of them clears the bar. */
export function pickThread<T extends ThreadCandidate>(candidates: T[], target: ThreadTarget): T | null {
  let best: T | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = scoreThread(candidate, target);
    if (score < MIN_THREAD_SCORE) continue;
    // Ties go to the busier thread: more comments, more to read.
    if (score > bestScore || (score === bestScore && (candidate.num_comments ?? 0) > (best?.num_comments ?? 0))) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

/** The r/anime search string. The bot titles threads almost exactly this way. */
export function searchQuery(target: ThreadTarget): string {
  return `${target.title} episode ${target.episode} discussion`;
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

const USERNAME = /\/?\bu\/[A-Za-z0-9_-]{2,21}/g;
const EMPTY_BODIES = new Set(['[deleted]', '[removed]', '']);

export interface RawComment {
  body?: unknown;
  author?: unknown;
}

/**
 * One comment, ready to hand to the writer — or null when there is nothing
 * there to read.
 *
 * Usernames go because the writer has no business attributing anything to a
 * named person, and because the author field never leaves this script. Spoiler
 * markers (`>!like this!<`) deliberately stay: the writer has to produce a
 * spoiler-free summary, and reddit already labelled the spoilers.
 */
export function cleanComment(comment: RawComment): string | null {
  if (comment.author === 'AutoModerator') return null;
  if (typeof comment.body !== 'string') return null;

  const collapsed = comment.body.replace(USERNAME, '[user]').replace(/\s+/g, ' ').trim();
  if (EMPTY_BODIES.has(collapsed)) return null;

  return collapsed.length > COMMENT_MAX_CHARS
    ? `${collapsed.slice(0, COMMENT_MAX_CHARS - 1)}…`
    : collapsed;
}

/** The kept comments of one thread, in the order reddit sorted them. */
export function packComments(comments: RawComment[], limit = MAX_COMMENTS_PER_THREAD): string[] {
  const out: string[] = [];
  for (const comment of comments) {
    if (out.length >= limit) break;
    const cleaned = cleanComment(comment);
    if (cleaned !== null) out.push(cleaned);
  }
  return out;
}

function encodedSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/**
 * Shrink the packet to the budget by dropping the longest comments first.
 *
 * Longest-first is what keeps the packet *representative*: a thread's opinion
 * lives in the number of people saying a thing, not in the length of any one
 * post, and the long ones are episode-by-episode recaps far more often than
 * they are sentiment. Nothing is ever dropped down to zero comments — an item
 * with no material left would be indistinguishable from a thread nobody
 * commented on.
 */
export function trimToBudget<T extends { comments: string[] }>(
  items: T[],
  budgetBytes = PACKET_BUDGET_BYTES,
): { items: T[]; dropped: number } {
  let dropped = 0;

  while (encodedSize(items) > budgetBytes) {
    let target: T | null = null;
    let index = -1;

    for (const item of items) {
      if (item.comments.length <= 1) continue;
      for (let i = 0; i < item.comments.length; i++) {
        const length = item.comments[i].length;
        // Ties go to whichever item still has the most left, so a packet of
        // similarly-sized comments loses one from each rather than gutting the
        // first thread and leaving the rest untouched.
        const better =
          target === null ||
          length > target.comments[index].length ||
          (length === target.comments[index].length && item.comments.length > target.comments.length);
        if (better) {
          target = item;
          index = i;
        }
      }
    }

    if (target === null) break; // nothing left that we are willing to drop
    target.comments.splice(index, 1);
    dropped++;
  }

  return { items, dropped };
}
