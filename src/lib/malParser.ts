export interface MalEntry {
  series_animedb_id: number;
  my_status: number; // 1: watching, 2: completed, 3: on_hold, 4: dropped, 6: plan_to_watch
  my_score: number;
  my_watched_episodes: number;
}

export function parseMalXml(xmlString: string): MalEntry[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  const animeNodes = xmlDoc.getElementsByTagName("anime");
  const entries: MalEntry[] = [];

  for (let i = 0; i < animeNodes.length; i++) {
    const node = animeNodes[i];
    const getId = (tag: string) => {
      const el = node.getElementsByTagName(tag)[0];
      return el ? parseInt(el.textContent || "0", 10) : 0;
    };

    const entry: MalEntry = {
      series_animedb_id: getId("series_animedb_id"),
      my_status: getId("my_status"),
      my_score: getId("my_score"),
      my_watched_episodes: getId("my_watched_episodes"),
    };

    if (entry.series_animedb_id > 0) {
      entries.push(entry);
    }
  }

  return entries;
}
