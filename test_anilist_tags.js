const ANILIST_URL = 'https://graphql.anilist.co';

async function fetchTags() {
  const query = `
    query {
      MediaTagCollection {
        name
      }
    }
  `;
  const response = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  const data = await response.json();
  const tags = data.data.MediaTagCollection.map(t => t.name).filter(n => n.toLowerCase().includes('dub'));
  console.log("Tags:", tags);
}
fetchTags();
