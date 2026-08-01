export interface ShowDetails {
  mal?: {
    score: number | null;
    synopsis: string | null;
  };
  kitsu?: {
    averageRating: string | null;
    synopsis: string | null;
  };
  aiSummary?: string;
}

const CACHE_KEY_PREFIX = 'anime_details_';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export async function fetchShowDetails(idMal: number | null, title: string, anilistSynopsis: string, showId: number): Promise<ShowDetails> {
  const cacheKey = `${CACHE_KEY_PREFIX}${showId}`;
  const cachedStr = localStorage.getItem(cacheKey);
  
  if (cachedStr) {
    try {
      const cached = JSON.parse(cachedStr);
      if (Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
      }
    } catch (e) {
      // ignore bad cache
    }
  }

  const details: ShowDetails = {};
  
  const [jikanRes, kitsuRes] = await Promise.allSettled([
    idMal ? fetch(`https://api.jikan.moe/v4/anime/${idMal}`).then(r => r.json()) : Promise.resolve(null),
    fetch(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(title)}`).then(r => r.json())
  ]);

  if (jikanRes.status === 'fulfilled' && jikanRes.value?.data) {
    details.mal = {
      score: jikanRes.value.data.score || null,
      synopsis: jikanRes.value.data.synopsis || null,
    };
  }

  if (kitsuRes.status === 'fulfilled' && kitsuRes.value?.data?.length > 0) {
    // try to find closest match or just take first
    const bestMatch = kitsuRes.value.data[0];
    details.kitsu = {
      averageRating: bestMatch.attributes.averageRating || null,
      synopsis: bestMatch.attributes.synopsis || null,
    };
  }
  
  let synopsesText = `AniList:\n${anilistSynopsis}\n`;
  if (details.mal?.synopsis) synopsesText += `\nMyAnimeList:\n${details.mal.synopsis}\n`;
  if (details.kitsu?.synopsis) synopsesText += `\nKitsu:\n${details.kitsu.synopsis}\n`;

  // fetch AI summary
  try {
    const aiRes = await fetch('/api/generate-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showId: showId.toString(), synopses: synopsesText })
    });
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      details.aiSummary = aiData.summary;
    }
  } catch (e) {
    console.error("Failed to fetch AI summary", e);
  }

  // save to cache
  localStorage.setItem(cacheKey, JSON.stringify({
    timestamp: Date.now(),
    data: details
  }));

  return details;
}
