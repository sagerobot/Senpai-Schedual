import { AnimeMedia } from '../types';

const ANILIST_URL = 'https://graphql.anilist.co';


function applyOffsets(mediaList: AnimeMedia[]): AnimeMedia[] {
  let offsets: Record<number, number> = {};
  try {
    const saved = localStorage.getItem('senpai_simulcast_offsets');
    if (saved) offsets = JSON.parse(saved);
  } catch(e) {}

  return mediaList.map(m => {
    let updatedLinks = m.externalLinks ? [...m.externalLinks] : [];
    if (!updatedLinks.some(link => link.site === 'CustomSource')) {
      updatedLinks.push({
        site: 'CustomSource',
        url: `https://example.invalid/browse?keyword=${encodeURIComponent(m.title.romaji || m.title.english || m.title.userPreferred || '')}`,
        icon: '',
        color: '#e85d04'
      });
    }

    const newM = { ...m, externalLinks: updatedLinks };

    if (newM.nextAiringEpisode && offsets[newM.id]) {
      const offsetSec = offsets[newM.id] * 60;
      return {
        ...newM,
        nextAiringEpisode: {
          ...newM.nextAiringEpisode,
          airingAt: newM.nextAiringEpisode.airingAt + offsetSec,
          timeUntilAiring: newM.nextAiringEpisode.timeUntilAiring + offsetSec
        }
      };
    }
    return newM;
  });
}
export async function fetchAnimeByIds(ids: number[]): Promise<AnimeMedia[]> {
  const query = `
    query ($ids: [Int]) {
      Page(page: 1, perPage: 50) {
        media(id_in: $ids, type: ANIME) {
          id
          idMal
          averageScore
          title {
            romaji
            english
            userPreferred
          }
          bannerImage trailer { id site thumbnail }
          studios(isMain: true) { nodes { name } }
          coverImage { extraLarge large color }
          startDate {
            year
            month
            day
          }
          nextAiringEpisode {
            airingAt
            timeUntilAiring
            episode
          }
          status
          format
          episodes
          externalLinks {
            url
            site
            icon
            color
          }
          genres
          description(asHtml: false)
          trending
          relations {
            edges {
              relationType
              node {
                id
                type
                averageScore
                title {
                  userPreferred
                }
              }
            }
          }
        }
      }
    }
  `;

  const results: AnimeMedia[] = [];
  // Batch in 50s
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const response = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { ids: batch }
      })
    });
    
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      await new Promise(r => setTimeout(r, retryAfter ? parseInt(retryAfter) * 1000 : 1000));
      i -= 50; // retry
      continue;
    }

    const data = await response.json();
    if (data.data?.Page?.media) {
      results.push(...data.data.Page.media);
    }
  }

  return applyOffsets(results);
}

export async function fetchAnimeByMalIds(
  malIds: number[], 
  onProgress?: (current: number, total: number) => void
): Promise<AnimeMedia[]> {
  const query = `
    query ($idMal_in: [Int]) {
      Page(page: 1, perPage: 50) {
        media(idMal_in: $idMal_in, type: ANIME) {
          id
          idMal
          title {
            english
            userPreferred
          }
          episodes
        }
      }
    }
  `;

  const results: AnimeMedia[] = [];
  for (let i = 0; i < malIds.length; i += 50) {
    const batch = malIds.slice(i, i + 50);
    const response = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { idMal_in: batch }
      })
    });

    if (response.status === 429) {
      await new Promise(r => setTimeout(r, 1500));
      i -= 50;
      continue;
    }

    const data = await response.json();
    if (data.data?.Page?.media) {
      results.push(...data.data.Page.media);
    }
    
    if (onProgress) {
      onProgress(Math.min(i + 50, malIds.length), malIds.length);
    }

    if (i + 50 < malIds.length) {
      // rate limit spacing
      await new Promise(r => setTimeout(r, 700));
    }
  }

  return applyOffsets(results);
}

export async function fetchCurrentSeasonAnime(): Promise<AnimeMedia[]> {
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth();
  
  let season = 'WINTER';
  if (month >= 3 && month <= 5) season = 'SPRING';
  else if (month >= 6 && month <= 8) season = 'SUMMER';
  else if (month >= 9 && month <= 11) season = 'FALL';

  const querySeason = `
    query ($season: MediaSeason, $seasonYear: Int, $page: Int) {
      Page(page: $page, perPage: 50) {
        pageInfo {
          hasNextPage
        }
        media(season: $season, seasonYear: $seasonYear, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
          id
          idMal
          averageScore
          title {
            romaji
            english
            userPreferred
          }
          bannerImage trailer { id site thumbnail }
          studios(isMain: true) { nodes { name } }
          coverImage { extraLarge large color }
          startDate {
            year
            month
            day
          }
          nextAiringEpisode {
            airingAt
            timeUntilAiring
            episode
          }
          status
          format
          episodes
          externalLinks {
            url
            site
            icon
            color
          }
          genres
          description(asHtml: false)
          trending
          relations {
            edges {
              relationType
              node {
                id
                type
                averageScore
                title {
                  userPreferred
                }
              }
            }
          }
        }
      }
    }
  `;

  const queryReleasing = `
    query ($page: Int) {
      Page(page: $page, perPage: 50) {
        pageInfo {
          hasNextPage
        }
        media(status: RELEASING, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
          id
          idMal
          averageScore
          title {
            romaji
            english
            userPreferred
          }
          bannerImage trailer { id site thumbnail }
          studios(isMain: true) { nodes { name } }
          coverImage { extraLarge large color }
          startDate {
            year
            month
            day
          }
          nextAiringEpisode {
            airingAt
            timeUntilAiring
            episode
          }
          status
          format
          episodes
          externalLinks {
            url
            site
            icon
            color
          }
          genres
          description(asHtml: false)
          trending
          relations {
            edges {
              relationType
              node {
                id
                type
                averageScore
                title {
                  userPreferred
                }
              }
            }
          }
        }
      }
    }
  `;

  const allMediaMap = new Map<number, AnimeMedia>();

  // Helper to fetch paginated query
  async function fetchPaginated(query: string, variables: any) {
    let page = 1;
    let hasNextPage = true;
    while (hasNextPage) {
      const response = await fetch(ANILIST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { ...variables, page }
        })
      });

      if (response.status === 429) {
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }

      const data = await response.json();
      if (data.data?.Page?.media) {
        for (const anime of data.data.Page.media) {
          allMediaMap.set(anime.id, anime);
        }
      }
      
      hasNextPage = data.data?.Page?.pageInfo?.hasNextPage || false;
      page++;
      
      if (hasNextPage) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
  }

  await fetchPaginated(querySeason, { season, seasonYear: year });
  await fetchPaginated(queryReleasing, {});

  return applyOffsets(Array.from(allMediaMap.values()));
}
export async function searchAnime(search: string): Promise<AnimeMedia[]> {
  const query = `
    query ($search: String) {
      Page(page: 1, perPage: 50) {
        media(search: $search, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
          id
          idMal
          averageScore
          title { romaji english userPreferred }
          bannerImage trailer { id site thumbnail }
          studios(isMain: true) { nodes { name } }
          coverImage { extraLarge large color }
          startDate { year month day }
          nextAiringEpisode { airingAt timeUntilAiring episode }
          status
          format
          episodes
          externalLinks { url site icon color }
          genres
          description(asHtml: false)
          trending
          relations { edges { relationType node { id type averageScore title { userPreferred } } } }
        }
      }
    }
  `;
  const response = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query, variables: { search } })
  });
  const data = await response.json();
  return applyOffsets(data.data?.Page?.media || []);
}

export async function fetchAnimeBySeason(season: string, seasonYear: number): Promise<AnimeMedia[]> {
  const querySeason = `
    query ($season: MediaSeason, $seasonYear: Int, $page: Int) {
      Page(page: $page, perPage: 50) {
        pageInfo { hasNextPage }
        media(season: $season, seasonYear: $seasonYear, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
          id
          idMal
          averageScore
          title { romaji english userPreferred }
          bannerImage trailer { id site thumbnail }
          studios(isMain: true) { nodes { name } }
          coverImage { extraLarge large color }
          startDate { year month day }
          nextAiringEpisode { airingAt timeUntilAiring episode }
          status
          format
          episodes
          externalLinks { url site icon color }
          genres
          description(asHtml: false)
          trending
          relations { edges { relationType node { id type averageScore title { userPreferred } } } }
        }
      }
    }
  `;
  const results: AnimeMedia[] = [];
  let page = 1;
  let hasNextPage = true;
  while (hasNextPage) {
    const response = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: querySeason, variables: { season, seasonYear, page } })
    });
    if (response.status === 429) {
      await new Promise(r => setTimeout(r, 1500));
      continue;
    }
    const data = await response.json();
    if (data.data?.Page?.media) results.push(...data.data.Page.media);
    hasNextPage = data.data?.Page?.pageInfo?.hasNextPage || false;
    page++;
    if (hasNextPage) await new Promise(r => setTimeout(r, 300));
  }
  return applyOffsets(results);
}
