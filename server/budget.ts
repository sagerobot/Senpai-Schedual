/**
 * In-memory daily AI-call budget. Two buckets:
 *  - "grounded": Google-Search-grounded Gemini calls (community vibe) — expensive.
 *  - "text": plain text Gemini calls (summaries + recommendation reasons) — cheap.
 *
 * Counters reset at UTC midnight. Reset-on-restart is acceptable: this is a
 * spend *bound*, not an accounting system; per-IP rate limits hold underneath.
 * Budgets are checked AFTER cache lookup — cache hits are always free.
 */

export type BudgetBucket = "grounded" | "text";

const DEFAULT_LIMITS: Record<BudgetBucket, number> = {
  grounded: 100,
  text: 500,
};

const ENV_VARS: Record<BudgetBucket, string> = {
  grounded: "AI_GROUNDED_DAILY_BUDGET",
  text: "AI_TEXT_DAILY_BUDGET",
};

let dayKey = currentUtcDay();
const used: Record<BudgetBucket, number> = { grounded: 0, text: 0 };

function currentUtcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function rollover(): void {
  const today = currentUtcDay();
  if (today !== dayKey) {
    dayKey = today;
    used.grounded = 0;
    used.text = 0;
  }
}

function limitFor(bucket: BudgetBucket): number {
  const raw = Number(process.env[ENV_VARS[bucket]]);
  return Number.isInteger(raw) && raw >= 0 ? raw : DEFAULT_LIMITS[bucket];
}

/** Consume one call from the bucket. Returns false when the daily budget is exhausted. */
export function tryConsume(bucket: BudgetBucket): boolean {
  rollover();
  if (used[bucket] >= limitFor(bucket)) return false;
  used[bucket] += 1;
  return true;
}

export function isExhausted(bucket: BudgetBucket): boolean {
  rollover();
  return used[bucket] >= limitFor(bucket);
}

export function anyExhausted(): boolean {
  return isExhausted("grounded") || isExhausted("text");
}

/** Seconds until the counters reset (next UTC midnight). Always >= 1. */
export function secondsToUtcMidnight(): number {
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((next.getTime() - Date.now()) / 1000));
}
