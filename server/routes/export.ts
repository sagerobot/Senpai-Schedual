import { Router } from "express";
import { exportableEntries } from "../cache";
import { cacheExportLimiter } from "../middleware";

/**
 * GET /api/cache-export — the in-memory AI cache, for harvesting.
 *
 * The server's cache dies with the process, so everything a visitor's live
 * request paid for is lost on the next deploy. The scheduled routine that owns
 * the `data` branch fetches this endpoint and folds what it finds into the
 * committed files (docs/season-refresh.md), which is how an off-season summary
 * or an old show's vibe check gets paid for exactly once, ever.
 *
 * No auth. Everything here is machine-generated commentary on public catalogue
 * data — AI summaries of public synopses, and sentiment readings of public
 * reddit threads. Nothing is user-specific, and `exportableEntries` is where
 * that is enforced rather than assumed: recommendation reasons, the one
 * namespace keyed off a private library, never leave this process.
 *
 * The dedicated limiter is about cost, not secrecy: this response can be a few
 * megabytes, and it exists to be read a few times a day.
 */

export const exportRouter = Router();

exportRouter.get("/cache-export", cacheExportLimiter, (_req, res) => {
  const entries = exportableEntries();
  res.json({ exportedAt: new Date().toISOString(), entries });
});
