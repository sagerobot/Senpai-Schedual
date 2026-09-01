/**
 * Whether a paginated AniList walk should ask for another page.
 *
 * `pageInfo.hasNextPage` is derived from an estimated total, and the estimate
 * undercounts: through most of August 2026 the `status: RELEASING` walk was
 * told "no next page" after a single full page of 50, and the season bundle
 * shipped with 138 of the season's 244 shows for three weeks. A full page is
 * therefore always followed up, whatever the flag says; only a short page is
 * trusted as the end on its own. The follow-up costs one request, and comes
 * back empty when the total really was a multiple of the page size.
 */
export function hasMorePages(
  pageInfo: { hasNextPage: boolean } | null | undefined,
  received: number,
  pageSize: number,
): boolean {
  return pageInfo?.hasNextPage === true || received >= pageSize;
}
