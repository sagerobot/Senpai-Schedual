import { z } from 'zod';

/**
 * Zod schemas that tell the truth about AniList nullability. The old
 * hand-written `AnimeMedia` interface claimed almost everything was non-null;
 * these schemas match what the API actually returns. Property names are kept
 * identical to the old interface so consumers keep compiling.
 *
 * Unknown extra fields never throw: `z.object()` strips unrecognized keys.
 */

const TitleSchema = z.object({
  romaji: z.string().nullable(),
  english: z.string().nullable(),
  userPreferred: z.string().nullable(),
});

const FuzzyDateSchema = z.object({
  year: z.number().nullable(),
  month: z.number().nullable(),
  day: z.number().nullable(),
});

/**
 * AniList can return links with a null url; those are useless to every
 * consumer, so the transform drops them — the output type has `url: string`.
 */
const RawExternalLinkSchema = z.object({
  url: z.string().nullable(),
  site: z.string(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
});

export interface ExternalLink {
  url: string;
  site: string;
  icon: string | null;
  color: string | null;
}

const ExternalLinksSchema = z
  .array(RawExternalLinkSchema)
  .nullable()
  .transform((links): ExternalLink[] =>
    (links ?? []).flatMap((l) => (l.url === null ? [] : [{ ...l, url: l.url }])),
  );

const NextAiringEpisodeSchema = z.object({
  airingAt: z.number(),
  timeUntilAiring: z.number(),
  episode: z.number(),
});

const RelationsSchema = z.object({
  edges: z
    .array(
      z.object({
        relationType: z.string(),
        node: z.object({
          id: z.number(),
          type: z.string().nullable(),
          averageScore: z.number().nullable(),
          title: z.object({ userPreferred: z.string().nullable() }),
        }),
      }),
    )
    .nullable()
    .transform((v) => v ?? []),
});

export const MediaSchema = z.object({
  id: z.number(),
  idMal: z.number().nullable(),
  averageScore: z.number().nullable(),
  title: TitleSchema,
  bannerImage: z.string().nullable(),
  studios: z
    .object({
      nodes: z
        .array(z.object({ name: z.string() }))
        .nullable()
        .transform((v) => v ?? []),
    })
    .optional(),
  coverImage: z.object({
    extraLarge: z.string().nullable().optional(),
    large: z.string(),
    color: z.string().nullable(),
  }),
  trailer: z
    .object({
      id: z.string().nullable(),
      site: z.string().nullable(),
      thumbnail: z.string().nullable(),
    })
    .nullable()
    .optional(),
  startDate: FuzzyDateSchema.nullable(),
  nextAiringEpisode: NextAiringEpisodeSchema.nullable(),
  status: z.string().nullable(),
  format: z.string().nullable(),
  episodes: z.number().nullable(),
  externalLinks: ExternalLinksSchema,
  genres: z
    .array(z.string())
    .nullable()
    .transform((v) => v ?? []),
  /** Present only on the by-id detail fetch (MEDIA_FIELDS_FULL). */
  description: z.string().nullable().optional(),
  trending: z.number().nullable().optional(),
  relations: RelationsSchema.nullable().optional(),
});

export type AnimeMedia = z.infer<typeof MediaSchema>;

/**
 * The reduced record returned by the MAL-resolution query (MEDIA_CORE).
 * Deliberately NOT an AnimeMedia — the old client lied about that.
 */
export const MalResolvedMediaSchema = z.object({
  id: z.number(),
  idMal: z.number().nullable(),
  title: TitleSchema,
  format: z.string().nullable(),
  episodes: z.number().nullable(),
  startDate: FuzzyDateSchema.nullable(),
  relations: z
    .object({
      edges: z
        .array(
          z.object({
            relationType: z.string(),
            node: z.object({ id: z.number(), type: z.string().nullable() }),
          }),
        )
        .nullable()
        .transform((v) => v ?? []),
    })
    .nullable()
    .optional(),
});

export type MalResolvedMedia = z.infer<typeof MalResolvedMediaSchema>;
