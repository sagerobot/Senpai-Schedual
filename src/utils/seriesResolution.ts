const ANILIST_URL = 'https://graphql.anilist.co';

export interface SeriesEntry {
  id: number;
  format: string;
  startDate: { year: number | null, month: number | null, day: number | null } | null;
  seasonLabel: string;
  title: string;
  isAttachment: boolean;
  episodes?: number;
}

export interface SeriesGraph {
  seriesId: number;
  title: string;
  entries: SeriesEntry[];
}

const resolveQuery = `query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    title { english userPreferred }
    format
    episodes
    startDate { year month day }
    relations {
      edges {
        relationType
        node {
          id
          type
        }
      }
    }
  }
}`;

function getSortableDate(d: { year: number | null, month: number | null, day: number | null } | null): string {
  if (!d || !d.year) return '9999-99-99';
  const month = d.month ? d.month.toString().padStart(2, '0') : '12';
  const day = d.day ? d.day.toString().padStart(2, '0') : '31';
  return `${d.year}-${month}-${day}`;
}

import { getOverrides } from './seriesOverrides';

export async function resolveSeriesGraph(startId: number): Promise<SeriesGraph | null> {
  const cachedStr = localStorage.getItem(`senpai_series_${startId}`);
  if (cachedStr) {
    try {
      return JSON.parse(cachedStr);
    } catch (e) {}
  }

  // Need to also check if this startId is part of a previously resolved graph.
  // Actually, we can just maintain a reverse map in localStorage.
  const reverseMapStr = localStorage.getItem('senpai_series_reverse_map');
  const reverseMap = reverseMapStr ? JSON.parse(reverseMapStr) : {};
  if (reverseMap[startId]) {
    const cachedSeriesStr = localStorage.getItem(`senpai_series_${reverseMap[startId]}`);
    if (cachedSeriesStr) {
      try {
        return JSON.parse(cachedSeriesStr);
      } catch(e) {}
    }
  }

  const visited = new Set<number>();
  const overrides = getOverrides();
  
  // Check if we should merge first
  if (overrides.merges[startId]) {
    startId = overrides.merges[startId];
  }
  const queue = [startId];
  const entriesMap = new Map<number, any>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    try {
      const r = await fetch(ANILIST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: resolveQuery, variables: { id } })
      });
      
      if (r.status === 429) {
        queue.unshift(id);
        await new Promise(res => setTimeout(res, 1000));
        continue;
      }
      
      const data = await r.json();
      if (!data.data?.Media) continue;
      const media = data.data.Media;
      
      entriesMap.set(id, media);

      for (const edge of (media.relations?.edges || [])) {
        if (edge.node.type === 'ANIME' && (edge.relationType === 'PREQUEL' || edge.relationType === 'SEQUEL')) {
          if (!visited.has(edge.node.id)) {
            if (!overrides.splits.includes(edge.node.id)) {
              queue.push(edge.node.id);
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to resolve graph for", id, e);
    }
  }

  if (entriesMap.size === 0) return null;

  const rawEntries = Array.from(entriesMap.values()).map(media => {
    const isAttachment = media.format === 'MOVIE' || media.format === 'OVA' || media.format === 'SPECIAL' || media.format === 'MUSIC';
    const rawTitle = media.title.english || media.title.userPreferred;
    
    // Attempt to extract season label
    let seasonLabel = rawTitle;
    const match = rawTitle.match(/(Season \d+|Part \d+|Final Season|Cour \d+|S\d+)/i);
    if (match) {
      // Find all matches, join them
      const matches = Array.from(rawTitle.matchAll(/(Season \d+|Part \d+|Final Season|Cour \d+|S\d+)/gi)).map(m => m[0]);
      if (matches.length > 0) seasonLabel = matches.join(' ');
    } else if (entriesMap.size > 1 && !isAttachment) {
      // No clear match, let's use the title but if it's the first one, 'Season 1'
      // We will refine this after sorting.
    }

    return {
      id: media.id,
      format: media.format,
      title: rawTitle,
      startDate: media.startDate,
      seasonLabel,
      isAttachment,
      episodes: media.episodes,
      sortDate: getSortableDate(media.startDate)
    };
  });

  rawEntries.sort((a, b) => a.sortDate.localeCompare(b.sortDate));

  // Determine canonical series id
  const seriesId = rawEntries[0].id;
  
  // Clean up season labels for the first entry
  if (rawEntries[0].seasonLabel === rawEntries[0].title) {
    rawEntries[0].seasonLabel = "Season 1";
  }
  
  // Give proper labels to others if they didn't match anything
  rawEntries.forEach((entry, idx) => {
    if (entry.seasonLabel === entry.title && idx > 0 && !entry.isAttachment) {
      // Just keep it as the title, maybe remove the series name if it's too long
      const mainTitle = rawEntries[0].title;
      if (entry.title.startsWith(mainTitle)) {
        const sub = entry.title.slice(mainTitle.length).trim();
        if (sub.startsWith(':') || sub.startsWith('-')) entry.seasonLabel = sub.slice(1).trim();
        else if (sub) entry.seasonLabel = sub;
      }
    }
    // ensure attachments just use their title or suffix
    if (entry.isAttachment) {
      const mainTitle = rawEntries[0].title;
      if (entry.title.startsWith(mainTitle)) {
         let sub = entry.title.slice(mainTitle.length).trim();
         if (sub.startsWith(':') || sub.startsWith('-')) sub = sub.slice(1).trim();
         entry.seasonLabel = sub || entry.format;
      } else {
        entry.seasonLabel = entry.title;
      }
    }
  });

  const graph: SeriesGraph = {
    seriesId,
    title: rawEntries[0].title,
    entries: rawEntries.map(e => ({
      id: e.id,
      format: e.format,
      startDate: e.startDate,
      seasonLabel: e.seasonLabel,
      title: e.title,
      isAttachment: e.isAttachment,
      episodes: e.episodes
    }))
  };

  // Cache
  localStorage.setItem(`senpai_series_${seriesId}`, JSON.stringify(graph));
  for (const entry of graph.entries) {
    reverseMap[entry.id] = seriesId;
  }
  localStorage.setItem('senpai_series_reverse_map', JSON.stringify(reverseMap));

  return graph;
}

export function getCachedSeriesGraph(id: number): SeriesGraph | null {
  const reverseMapStr = localStorage.getItem('senpai_series_reverse_map');
  if (!reverseMapStr) return null;
  const reverseMap = JSON.parse(reverseMapStr);
  const seriesId = reverseMap[id] || id;
  const graphStr = localStorage.getItem(`senpai_series_${seriesId}`);
  if (!graphStr) return null;
  try {
    return JSON.parse(graphStr);
  } catch (e) {
    return null;
  }
}

export function getAllCachedSeries(): SeriesGraph[] {
  const graphs: SeriesGraph[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('senpai_series_') && key !== 'senpai_series_reverse_map') {
      try {
        graphs.push(JSON.parse(localStorage.getItem(key)!));
      } catch (e) {}
    }
  }
  return graphs;
}
