/**
 * Pure franchise labeling. No I/O, no cache, no store.
 *
 * The season-label rules are tuned against real AniList titles and every tweak
 * is visible on every card, so change them only with a fixture to match.
 *
 * The canonical-id tiebreak matters more than it looks. Sorting by date alone
 * leaves `seriesId` dependent on Map insertion order, i.e. on which show the
 * BFS happened to start from, so the same franchise groups under two different
 * ids in two different views. Sorting by `(date, id)` makes both the canonical
 * id and the entry order a function of the member set alone.
 */

export interface FuzzyDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

export interface SeriesEntry {
  id: number;
  format: string;
  startDate: FuzzyDate | null;
  seasonLabel: string;
  title: string;
  isAttachment: boolean;
  episodes?: number;
}

export interface SeriesGraph {
  /** The earliest member (ties broken by id) — the franchise's stable identity. */
  seriesId: number;
  title: string;
  entries: SeriesEntry[];
}

/** The AniList fields labeling needs; a superset is fine (MEDIA_CORE records fit). */
export interface SeriesMember {
  id: number;
  title: { english: string | null; romaji: string | null; userPreferred: string | null };
  format: string | null;
  episodes: number | null;
  startDate: FuzzyDate | null;
}

const ATTACHMENT_FORMATS = ['MOVIE', 'OVA', 'SPECIAL', 'MUSIC'];
const SEASON_LABEL_PATTERN = /(Season \d+|Part \d+|Final Season|Cour \d+|S\d+)/gi;

/** Movies, OVAs, specials and music videos hang off a franchise; they are not seasons of it. */
export function isAttachmentFormat(format: string | null): boolean {
  return format !== null && ATTACHMENT_FORMATS.includes(format);
}

/** The season markers a title carries — "Season 2", "Part 2 Final Season" — or null. */
export function seasonMarker(title: string): string | null {
  const matches = Array.from(title.matchAll(SEASON_LABEL_PATTERN)).map((m) => m[0]);
  return matches.length > 0 ? matches.join(' ') : null;
}

/** Watch order: by start date, unknown dates last. Callers tiebreak by id. */
export function getSortableDate(d: FuzzyDate | null): string {
  if (!d || !d.year) return '9999-99-99';
  const month = d.month ? d.month.toString().padStart(2, '0') : '12';
  const day = d.day ? d.day.toString().padStart(2, '0') : '31';
  return `${d.year}-${month}-${day}`;
}

/**
 * Build the graph for one franchise from its members.
 *
 * Overrides (merges and splits) must already have been applied by the caller —
 * this function only sees the member set it is given, which is what makes it
 * testable without a network or a store.
 */
export function buildSeriesGraph(members: SeriesMember[]): SeriesGraph {
  if (members.length === 0) {
    throw new Error('buildSeriesGraph called with no members');
  }

  const rawEntries = members.map((media) => {
    const isAttachment = isAttachmentFormat(media.format);
    const rawTitle = media.title.english || media.title.userPreferred || media.title.romaji || `Anime #${media.id}`;

    // A title carrying its own season marker labels itself; anything else is
    // labelled below, after sorting, from its position and its parent's title.
    const seasonLabel = seasonMarker(rawTitle) ?? rawTitle;

    return {
      id: media.id,
      format: media.format ?? '',
      title: rawTitle,
      startDate: media.startDate,
      seasonLabel,
      isAttachment,
      episodes: media.episodes ?? undefined,
      sortDate: getSortableDate(media.startDate),
    };
  });

  rawEntries.sort((a, b) => {
    const byDate = a.sortDate.localeCompare(b.sortDate);
    return byDate !== 0 ? byDate : a.id - b.id;
  });

  const root = rawEntries[0];
  const seriesId = root.id;

  if (root.seasonLabel === root.title) {
    root.seasonLabel = 'Season 1';
  }

  rawEntries.forEach((entry, idx) => {
    if (entry.seasonLabel === entry.title && idx > 0 && !entry.isAttachment) {
      // No marker in the title: strip the franchise prefix and use the subtitle.
      const mainTitle = root.title;
      if (entry.title.startsWith(mainTitle)) {
        const sub = entry.title.slice(mainTitle.length).trim();
        if (sub.startsWith(':') || sub.startsWith('-')) entry.seasonLabel = sub.slice(1).trim();
        else if (sub) entry.seasonLabel = sub;
      }
    }
    // Movies/OVAs/specials never carry a season number; they get their subtitle
    // (or their format) so they read as attachments rather than seasons.
    if (entry.isAttachment) {
      const mainTitle = root.title;
      if (entry.title.startsWith(mainTitle)) {
        let sub = entry.title.slice(mainTitle.length).trim();
        if (sub.startsWith(':') || sub.startsWith('-')) sub = sub.slice(1).trim();
        entry.seasonLabel = sub || entry.format;
      } else {
        entry.seasonLabel = entry.title;
      }
    }
  });

  return {
    seriesId,
    title: root.title,
    entries: rawEntries.map((e) => ({
      id: e.id,
      format: e.format,
      startDate: e.startDate,
      seasonLabel: e.seasonLabel,
      title: e.title,
      isAttachment: e.isAttachment,
      episodes: e.episodes,
    })),
  };
}
