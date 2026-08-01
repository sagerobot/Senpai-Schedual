const ANILIST_URL = 'https://graphql.anilist.co';

async function fetchAiring() {
  const query = `
    query ($page: Int) {
      Page(page: $page, perPage: 50) {
        pageInfo {
          hasNextPage
        }
        media(status: RELEASING, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
          id
          title { english }
          format
        }
      }
    }
  `;
  const response = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { page: 1 } })
  });
  const data = await response.json();
  console.log(data.data.Page.media.length, "releasing anime");
}
fetchAiring();
