export interface MalEntry {
  series_animedb_id: number;
  my_status: number; // 1: watching, 2: completed, 3: on_hold, 4: dropped, 6: plan_to_watch
  my_score: number;
  my_watched_episodes: number;
}

/**
 * MAL writes `my_status` two different ways: its XML export uses the display
 * names ("Completed", "Plan to Watch"), while its API uses the numeric codes
 * above. Reading only the numbers turns every entry of a real export into
 * `plan_to_watch`, silently, so both spellings are normalized to codes here.
 * Punctuation and case vary between MAL's own exports and the third-party
 * converters people run their lists through, hence the aggressive squash.
 */
const STATUS_CODES_BY_NAME: Record<string, number> = {
  watching: 1,
  completed: 2,
  onhold: 3,
  dropped: 4,
  plantowatch: 6,
};

function parseStatus(raw: string): number {
  const code = parseInt(raw, 10);
  if (Number.isFinite(code) && code > 0) return code;
  return STATUS_CODES_BY_NAME[raw.toLowerCase().replace(/[^a-z]/g, '')] ?? 0;
}

export function parseMalXml(xmlString: string): MalEntry[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  const animeNodes = xmlDoc.getElementsByTagName("anime");
  const entries: MalEntry[] = [];

  for (let i = 0; i < animeNodes.length; i++) {
    const node = animeNodes[i];
    const getText = (tag: string) => node.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
    const getId = (tag: string) => {
      const value = parseInt(getText(tag), 10);
      return Number.isFinite(value) ? value : 0;
    };

    const entry: MalEntry = {
      series_animedb_id: getId("series_animedb_id"),
      my_status: parseStatus(getText("my_status")),
      my_score: getId("my_score"),
      my_watched_episodes: getId("my_watched_episodes"),
    };

    if (entry.series_animedb_id > 0) {
      entries.push(entry);
    }
  }

  return entries;
}
