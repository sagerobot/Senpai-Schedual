/**
 * Connected-component grouping over franchise edges. Pure — no I/O, no cache.
 *
 * The live resolver walks one franchise at a time from a starting show. The
 * season-bundle build does the opposite: it fetches every node first, then has
 * to work out which nodes belong together. That is this module.
 *
 * The two must agree, so the edge rule is defined here once and shared: only
 * `PREQUEL`/`SEQUEL` edges to `ANIME` nodes join two shows — the same predicate
 * `resolver.ts` applies during BFS.
 *
 * Edges pointing at ids that are not in the input set are ignored rather than
 * used to bridge two components. That matches the resolver, which cannot follow
 * a node AniList did not return, and it keeps two franchises from merging
 * through a show nobody fetched.
 */

export interface RelationBearing {
  id: number;
  relations?: {
    edges: { relationType: string; node: { id: number; type: string | null } }[];
  } | null;
}

export function isFranchiseEdge(relationType: string, nodeType: string | null): boolean {
  if (nodeType !== 'ANIME') return false;
  return relationType === 'PREQUEL' || relationType === 'SEQUEL';
}

class UnionFind {
  private parent = new Map<number, number>();

  add(id: number): void {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: number): number {
    let root = id;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // Path compression, iteratively — franchise chains are short but a
    // pathological relation web should not recurse.
    let cursor = id;
    while (this.parent.get(cursor) !== root) {
      const next = this.parent.get(cursor)!;
      this.parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;
    // Smaller id wins, so the component's representative — and therefore the
    // output ordering — depends only on the member set, never on input order.
    if (rootA < rootB) this.parent.set(rootB, rootA);
    else this.parent.set(rootA, rootB);
  }
}

/**
 * Partition `nodes` into franchises.
 *
 * Output is fully deterministic: members within a component are sorted by id,
 * and components are sorted by their lowest member id. The bundle is committed
 * to git, so a run that discovers nothing new must produce a byte-identical file.
 */
export function groupConnectedComponents<T extends RelationBearing>(nodes: T[]): T[][] {
  const byId = new Map<number, T>();
  for (const node of nodes) byId.set(node.id, node);

  const uf = new UnionFind();
  for (const id of byId.keys()) uf.add(id);

  for (const node of byId.values()) {
    for (const edge of node.relations?.edges ?? []) {
      if (!isFranchiseEdge(edge.relationType, edge.node.type)) continue;
      if (!byId.has(edge.node.id)) continue;
      uf.union(node.id, edge.node.id);
    }
  }

  const components = new Map<number, T[]>();
  for (const [id, node] of byId) {
    const root = uf.find(id);
    const bucket = components.get(root);
    if (bucket === undefined) components.set(root, [node]);
    else bucket.push(node);
  }

  return [...components.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, members]) => members.sort((a, b) => a.id - b.id));
}
