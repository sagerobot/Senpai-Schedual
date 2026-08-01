import { z } from "zod";

// ---------------------------------------------------------------------------
// Input schemas — invalid input => 400 { status: "error", message }
// ---------------------------------------------------------------------------

const positiveInt = z.coerce.number().int().positive();

export const summaryInputSchema = z.object({
  showId: positiveInt,
  synopses: z.string().min(10).max(8000),
});

// forceRefresh is intentionally NOT in this schema and is ignored server-side:
// a client must never be able to force a paid grounded call past the cache.
export const vibeInputSchema = z.object({
  showId: positiveInt,
  episodeNumber: z.coerce.number().int().min(1).max(2000),
  title: z.string().min(1).max(150),
});

export const recommendationsInputSchema = z.object({
  libraryIds: z.array(z.number().int()).max(3000),
  topEntries: z
    .array(
      z.object({
        showId: z.number().int(),
        showScore: z.number().min(0).max(10),
      }),
    )
    .min(1)
    .max(15),
  notInterestedIds: z.array(z.number().int()).max(500).default([]),
});

/** Short, single-line message for a 400 response. */
export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request body";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

// ---------------------------------------------------------------------------
// Output schemas — validate/clamp what Gemini returns before caching/serving
// ---------------------------------------------------------------------------

const clampedBullets = z
  .array(z.string().transform((s) => s.slice(0, 120)))
  .catch([])
  .transform((items) => items.slice(0, 5));

export const vibeOutputSchema = z.object({
  summary: z.string().transform((s) => s.slice(0, 600)),
  goods: clampedBullets,
  bads: clampedBullets,
  indicator: z.enum(["positive", "mixed", "negative"]).catch("mixed"),
  upvotes: z.coerce.number().int().nonnegative().catch(0),
  comments: z.coerce.number().int().nonnegative().catch(0),
  url: z.string().catch(""),
});

export type VibeData = z.infer<typeof vibeOutputSchema>;

export const summaryOutputSchema = z
  .string()
  .min(1)
  .transform((s) => s.slice(0, 1000));
