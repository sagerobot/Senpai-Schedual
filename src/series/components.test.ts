import { describe, expect, it } from 'vitest';
import { groupConnectedComponents, isFranchiseEdge, type RelationBearing } from './components';

type Edge = [relationType: string, targetId: number, nodeType?: string];

function node(id: number, ...edges: Edge[]): RelationBearing {
  return {
    id,
    relations: {
      edges: edges.map(([relationType, targetId, nodeType = 'ANIME']) => ({
        relationType,
        node: { id: targetId, type: nodeType },
      })),
    },
  };
}

/** Component membership as sorted id lists, which is what the assertions care about. */
function idGroups(nodes: RelationBearing[]): number[][] {
  return groupConnectedComponents(nodes).map((group) => group.map((n) => n.id));
}

describe('isFranchiseEdge', () => {
  it('accepts only PREQUEL/SEQUEL edges to ANIME nodes', () => {
    expect(isFranchiseEdge('SEQUEL', 'ANIME')).toBe(true);
    expect(isFranchiseEdge('PREQUEL', 'ANIME')).toBe(true);
    expect(isFranchiseEdge('SIDE_STORY', 'ANIME')).toBe(false);
    expect(isFranchiseEdge('ADAPTATION', 'ANIME')).toBe(false);
    expect(isFranchiseEdge('SEQUEL', 'MANGA')).toBe(false);
    expect(isFranchiseEdge('SEQUEL', null)).toBe(false);
  });
});

describe('groupConnectedComponents', () => {
  it('joins a chain of sequels into one franchise', () => {
    expect(idGroups([node(1, ['SEQUEL', 2]), node(2, ['PREQUEL', 1], ['SEQUEL', 3]), node(3, ['PREQUEL', 2])])).toEqual([
      [1, 2, 3],
    ]);
  });

  it('keeps unrelated shows in separate components', () => {
    expect(idGroups([node(1, ['SEQUEL', 2]), node(2, ['PREQUEL', 1]), node(9)])).toEqual([[1, 2], [9]]);
  });

  it('joins on a one-directional edge — AniList sometimes lists only one side', () => {
    expect(idGroups([node(5, ['SEQUEL', 6]), node(6)])).toEqual([[5, 6]]);
  });

  it('does not join through SIDE_STORY, SPIN_OFF, or non-ANIME edges', () => {
    const nodes = [
      node(1, ['SIDE_STORY', 2], ['SPIN_OFF', 3], ['ADAPTATION', 4, 'MANGA']),
      node(2),
      node(3),
      node(4),
    ];
    expect(idGroups(nodes)).toEqual([[1], [2], [3], [4]]);
  });

  it('ignores edges to ids that were not fetched, rather than bridging through them', () => {
    // 1 and 2 both point at 99, which is absent. They are still two franchises:
    // the live resolver cannot follow a node AniList did not return either.
    expect(idGroups([node(1, ['SEQUEL', 99]), node(2, ['PREQUEL', 99])])).toEqual([[1], [2]]);
  });

  it('handles a node with no relations field at all', () => {
    expect(idGroups([{ id: 7 }, { id: 8, relations: null }])).toEqual([[7], [8]]);
  });

  it('produces the same partition regardless of input order', () => {
    const build = (): RelationBearing[] => [
      node(30, ['PREQUEL', 20]),
      node(10, ['SEQUEL', 20]),
      node(20, ['PREQUEL', 10], ['SEQUEL', 30]),
      node(40),
    ];
    const forward = idGroups(build());
    const reversed = idGroups(build().reverse());

    expect(forward).toEqual([[10, 20, 30], [40]]);
    expect(reversed).toEqual(forward);
  });

  it('deduplicates repeated ids in the input', () => {
    expect(idGroups([node(1), node(1, ['SEQUEL', 2]), node(2)])).toEqual([[1, 2]]);
  });

  it('returns nothing for an empty input', () => {
    expect(groupConnectedComponents([])).toEqual([]);
  });
});
