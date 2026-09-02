/**
 * The wake strip's state machine — pure, so the whole story a cold visit
 * tells can be tested without a server, a service worker, or a clock.
 *
 * The problem it models: the service worker paints the app instantly from
 * the device's own copy while the free-tier host is still asleep. That copy
 * may be a build behind. Nobody could tell when it was safe to refresh, so
 * this machine makes the answer visible and then acts on it itself.
 *
 * Phases (the strip renders one; `hidden` renders nothing):
 *   hidden   — warm server, same build: nothing to say.
 *   waking   — probe failed; the host is spinning up.
 *   checking — a manual "check for updates" is in flight.
 *   latest   — server answered with the same build; shown briefly, then hidden.
 *   updating — server runs a newer build; a guarded reload is on its way.
 *   down     — three minutes without an answer; one retry offered.
 *
 * The driver (queries/serverWake.ts) owns probes, timers, the service worker
 * and the reload; it feeds events in and renders whatever comes out.
 */

export type WakePhase = 'hidden' | 'waking' | 'checking' | 'latest' | 'updating' | 'down';

export type BuildComparison = 'same' | 'newer' | 'unknown';

export interface WakeState {
  phase: WakePhase;
  /** This client's build stamp. */
  clientBuild: string;
  /** The server's build stamp from the last successful probe, if it sent one. */
  serverBuild: string | null;
  /** When the last successful probe answered. */
  checkedAt: number | null;
  /** The automatic reload was refused by the per-minute guard — offer a button. */
  reloadRefused: boolean;
}

export type WakeEvent =
  | { type: 'probe-failed' }
  | { type: 'probe-ok'; serverBuild: string | null; now: number }
  | { type: 'gave-up' }
  | { type: 'retry' }
  | { type: 'check-requested' }
  | { type: 'settled' }
  | { type: 'reload-refused' };

/** The stamp both sides fall back to when no sha is known (see server/buildStamp.ts). */
export const DEV_BUILD = 'dev';

/** How long the green "latest build" confirmation holds before folding away. */
export const LATEST_HOLD_MS = 3_000;

export function initialWakeState(clientBuild: string): WakeState {
  return { phase: 'hidden', clientBuild, serverBuild: null, checkedAt: null, reloadRefused: false };
}

/**
 * A mismatch means "newer" only when both sides actually know their sha —
 * a dev build on either side compares as unknown, never as an update.
 */
export function compareBuilds(clientBuild: string, serverBuild: string | null): BuildComparison {
  if (serverBuild === null || serverBuild === DEV_BUILD || clientBuild === DEV_BUILD) return 'unknown';
  return serverBuild === clientBuild ? 'same' : 'newer';
}

export function reduceWake(state: WakeState, event: WakeEvent): WakeState {
  switch (event.type) {
    case 'probe-failed':
      // Only an initial or in-progress probe can open the waking phase; a
      // refused-reload `updating` or a `down` state keeps its own story.
      if (state.phase === 'hidden' || state.phase === 'checking') return { ...state, phase: 'waking' };
      return state;

    case 'gave-up':
      return state.phase === 'waking' ? { ...state, phase: 'down' } : state;

    case 'retry':
      return state.phase === 'down' ? { ...state, phase: 'waking' } : state;

    case 'check-requested':
      // Already mid-update: the answer is known, don't restart the story.
      if (state.phase === 'updating') return state;
      return { ...state, phase: 'checking', reloadRefused: false };

    case 'probe-ok': {
      const next: WakeState = { ...state, serverBuild: event.serverBuild, checkedAt: event.now };
      if (compareBuilds(state.clientBuild, event.serverBuild) === 'newer') {
        // Once updating, stay updating — a later probe repeating the same
        // answer must not reset the reload-refused affordance.
        return state.phase === 'updating' ? next : { ...next, phase: 'updating', reloadRefused: false };
      }
      // Same build (or unknowable). If the user was watching a wait, close
      // the loop with a visible confirmation; a warm start says nothing.
      const wasVisible = state.phase === 'waking' || state.phase === 'checking' || state.phase === 'down';
      return { ...next, phase: wasVisible ? 'latest' : 'hidden' };
    }

    case 'settled':
      return state.phase === 'latest' ? { ...state, phase: 'hidden' } : state;

    case 'reload-refused':
      return state.phase === 'updating' ? { ...state, reloadRefused: true } : state;
  }
}

/** Copy + tone per phase, kept beside the machine so tests can pin it. */
export interface WakeCopy {
  eyebrow: string;
  headline: string;
  detail: string;
}

export function wakeCopy(state: WakeState): WakeCopy | null {
  switch (state.phase) {
    case 'hidden':
      return null;
    case 'waking':
      return {
        eyebrow: 'Waking the server',
        headline: 'You’re looking at the copy Senpai saved on this device',
        detail:
          'The host is spinning up — usually under a minute. Once it answers, Senpai checks for a newer build and refreshes by itself if there is one.',
      };
    case 'checking':
      return {
        eyebrow: 'Checking for a newer build',
        headline: 'Comparing this copy with the live site',
        detail: 'Takes a second.',
      };
    case 'latest':
      return {
        eyebrow: 'You’re on the latest build',
        headline: 'Nothing to refresh',
        detail: 'The live site and this copy are the same build. This note tucks itself away in a moment.',
      };
    case 'updating':
      return state.reloadRefused
        ? {
            eyebrow: 'A newer build is live',
            headline: 'Reload to pick up the new version',
            detail:
              'Senpai already refreshed once this minute, so this one is yours. Your library, logs and settings stay exactly where they are.',
          }
        : {
            eyebrow: 'A newer build is live · updating',
            headline: 'Senpai is refreshing to the new version',
            detail: 'This page reloads on its own in a moment. Your library, logs and settings stay exactly where they are.',
          };
    case 'down':
      return {
        eyebrow: 'The server isn’t answering',
        headline: 'Still showing the copy saved on this device',
        detail:
          'Three minutes without a reply. Your schedule and library work as normal; sentiment and summaries wait until the host is back.',
      };
  }
}

/** The three-step rail: 0 pending · 1 active · 2 done · 3 failed. */
export type StepState = 0 | 1 | 2 | 3;

export function railSteps(state: WakeState): [StepState, StepState, StepState] {
  switch (state.phase) {
    case 'hidden':
    case 'waking':
      return [1, 0, 0];
    case 'checking':
      return [2, 1, 0];
    case 'latest':
      return [2, 2, 2];
    case 'updating':
      return [2, 2, 1];
    case 'down':
      return [3, 0, 0];
  }
}
