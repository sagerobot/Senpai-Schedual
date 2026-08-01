const queue = [
  { id: 1, relations: { edges: [{ node: { id: 2, type: 'ANIME' } }] } },
  { id: 2, relations: { edges: [{ node: { id: 1, type: 'ANIME' } }] } },
  { id: 3, relations: {} },
];

const parent = new Map();
for (const item of queue) parent.set(item.id, item.id);

function find(i) {
  if (parent.get(i) === i) return i;
  const p = find(parent.get(i));
  parent.set(i, p);
  return p;
}

function union(i, j) {
  const rootI = find(i);
  const rootJ = find(j);
  if (rootI !== rootJ) parent.set(rootI, rootJ);
}

for (const item of queue) {
  if (!item.relations?.edges) continue;
  for (const edge of item.relations.edges) {
    if (edge.node.type === 'ANIME' && parent.has(edge.node.id)) {
      union(item.id, edge.node.id);
    }
  }
}

const groups = new Map();
for (const item of queue) {
  const root = find(item.id);
  if (!groups.has(root)) groups.set(root, []);
  groups.get(root).push(item);
}
console.log(Array.from(groups.values()));
