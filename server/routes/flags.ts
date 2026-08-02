import { Router } from "express";
import { z } from "zod";
import { flagLimiter } from "../middleware";

/**
 * POST /api/vibe-flag — a visitor says a stored sentiment reading is wrong.
 *
 * Settled vibe entries are frozen against every automated writer on purpose,
 * so a bad one (wrong thread, a leaked spoiler, a misread) needs a human-shaped
 * correction loop: flags accumulate here as anonymous per-episode counters,
 * ride out through `GET /api/cache-export` for review, and the fix is the
 * sanctioned manual one — delete the key on the `data` branch and let the
 * pipeline regenerate it.
 *
 * Flags are advisory only. Nothing is ever auto-deleted from a flag — that
 * would hand every entry a heckler's veto — and nothing about the flagger is
 * kept: no id, no IP, just counts per (episode, reason).
 */

export const flagsRouter = Router();

const REASONS = ["wrong_thread", "spoiler", "inaccurate"] as const;
export type FlagReason = (typeof REASONS)[number];

const flagInputSchema = z.object({
  showId: z.number().int().positive(),
  episode: z.number().int().min(1).max(2000),
  reason: z.enum(REASONS),
});

interface FlagRecord {
  showId: number;
  episode: number;
  counts: Record<FlagReason, number>;
  firstAt: string;
  lastAt: string;
}

/** Bounded: a flood of junk flags evicts the stalest key, never grows memory. */
const MAX_FLAGGED_EPISODES = 300;
const flags = new Map<string, FlagRecord>();

function recordFlag(showId: number, episode: number, reason: FlagReason): void {
  const key = `${showId}:${episode}`;
  const now = new Date().toISOString();
  const existing = flags.get(key);
  if (existing) {
    existing.counts[reason]++;
    existing.lastAt = now;
    return;
  }
  if (flags.size >= MAX_FLAGGED_EPISODES) {
    let oldestKey: string | null = null;
    let oldestAt = "";
    for (const [k, v] of flags) {
      if (oldestKey === null || v.lastAt < oldestAt) {
        oldestKey = k;
        oldestAt = v.lastAt;
      }
    }
    if (oldestKey !== null) flags.delete(oldestKey);
  }
  flags.set(key, {
    showId,
    episode,
    counts: { wrong_thread: 0, spoiler: 0, inaccurate: 0, [reason]: 1 } as Record<FlagReason, number>,
    firstAt: now,
    lastAt: now,
  });
}

/** For /api/cache-export: everything flagged, for the review pass. */
export function exportableFlags(): FlagRecord[] {
  return [...flags.values()];
}

flagsRouter.post("/vibe-flag", flagLimiter, (req, res) => {
  const parsed = flagInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ status: "error", message: "showId, episode, and a known reason are required" });
    return;
  }
  const { showId, episode, reason } = parsed.data;
  recordFlag(showId, episode, reason);
  console.log(`[flags] ${showId}:${episode} flagged as ${reason}`);
  res.json({ status: "ok" });
});
