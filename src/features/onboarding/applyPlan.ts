import type { OnboardingPlan } from '../../lib/onboarding';
import { logKey, useUserData } from '../../stores/userData';
import type { EpisodeLog } from '../../types';

/** Exactly what one apply added, so Undo can take back that and nothing else. */
export interface AppliedPlan {
  showIds: number[];
  logs: EpisodeLog[];
}

/**
 * Write the plan in one setState — one persist write, and no render ever sees
 * a show without its backfilled logs (which would briefly read as "18 behind"
 * and could admit a drop card).
 */
export function applyOnboardingPlan(plan: OnboardingPlan): AppliedPlan | null {
  if (plan.entries.length === 0 && plan.logs.length === 0) return null;
  useUserData.setState((s) => {
    const library = { ...s.library };
    for (const entry of plan.entries) library[entry.showId] = entry;
    const logs = { ...s.logs };
    for (const log of plan.logs) logs[logKey(log.showId, log.episodeNumber)] = log;
    return { library, logs };
  });
  return { showIds: plan.entries.map((e) => e.showId), logs: plan.logs };
}

/**
 * Take an applied plan back out. A log is only removed while it is still the
 * untouched backfill — one the user has since rated belongs to them now.
 */
export function revertOnboardingPlan(applied: AppliedPlan): void {
  useUserData.setState((s) => {
    const library = { ...s.library };
    for (const id of applied.showIds) delete library[id];
    const logs = { ...s.logs };
    for (const log of applied.logs) {
      const key = logKey(log.showId, log.episodeNumber);
      const current = logs[key];
      if (current && current.watchedAt === log.watchedAt && current.score === null) delete logs[key];
    }
    return { library, logs };
  });
}
