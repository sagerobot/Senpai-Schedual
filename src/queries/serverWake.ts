import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { z } from 'zod';
import { claimAutoReload } from '../lib/reloadGuard';
import {
  DEV_BUILD,
  LATEST_HOLD_MS,
  initialWakeState,
  reduceWake,
  type WakeEvent,
  type WakeState,
} from '../lib/wakeStrip';
import { queryClient } from './client';
import { queryKeys } from './keys';

/**
 * The wake driver: probes the sleeping server, owns the service worker
 * registration, and turns "the server is back" into "you are on the latest
 * build" — by reloading once, itself, when the builds differ.
 *
 * Why this exists: the service worker paints the shell instantly from the
 * device's copy, but the free-tier host spins down when idle, so on a cold
 * visit `/api/*` is asleep for ~30-60s. The worker's own update check happens
 * once, at page load — exactly when the server cannot answer — so a deploy
 * was invisible until the next visit. This driver re-runs that check the
 * moment the server wakes, compares build stamps explicitly, and reloads
 * under the per-minute guard so it can never loop.
 *
 * Side effects of a probe succeeding: the vibes query is invalidated (it most
 * likely timed out against the cold server and cached an empty index).
 *
 * The state machine itself is pure and lives in lib/wakeStrip.ts; this module
 * is the only place that touches fetch, timers, the worker, or `location`.
 */

const HEALTH_ENDPOINT = '/api/health';
/** Short: a warm server answers in milliseconds; a cold one not for ~30-60s. */
const PROBE_TIMEOUT_MS = 4_000;
const POLL_INTERVAL_MS = 5_000;
/** Render cold starts finish well inside this; past it, the server is down. */
const GIVE_UP_AFTER_MS = 3 * 60_000;
/**
 * How long to wait for the new worker to activate after asking it to update
 * before reloading anyway. A plain reload still fetches fresh HTML (the
 * server sends documents no-cache), so this only costs one extra round.
 */
const UPDATE_FALLBACK_MS = 12_000;

const HealthSchema = z.object({ ok: z.boolean(), build: z.string().min(1).optional() });

const CLIENT_BUILD = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : DEV_BUILD;

let state: WakeState = initialWakeState(CLIENT_BUILD);
const listeners = new Set<() => void>();

let started = false;
let registration: ServiceWorkerRegistration | null = null;
/** Bumped on every retry so a stale polling loop stops itself. */
let pollGeneration = 0;
let polling = false;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let updateTimer: ReturnType<typeof setTimeout> | null = null;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function probe(): Promise<{ ok: true; build: string | null } | { ok: false }> {
  try {
    const response = await fetch(HEALTH_ENDPOINT, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false };
    const parsed = HealthSchema.safeParse(await response.json());
    if (!parsed.success || !parsed.data.ok) return { ok: false };
    return { ok: true, build: parsed.data.build ?? null };
  } catch {
    return { ok: false };
  }
}

function dispatch(event: WakeEvent): void {
  const prev = state;
  state = reduceWake(prev, event);
  if (state === prev) return;
  for (const listener of listeners) listener();

  if (state.phase !== prev.phase) {
    if (state.phase === 'updating') beginUpdate();
    if (state.phase === 'latest') {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => dispatch({ type: 'settled' }), LATEST_HOLD_MS);
    }
  }

  // A probe that succeeds after any wait is the moment the vibes fetch that
  // timed out during the cold start can be retried.
  const waited = prev.phase === 'waking' || prev.phase === 'down' || prev.phase === 'checking';
  if (event.type === 'probe-ok' && waited) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.vibes() });
  }
}

/** Reload under the guard; when refused, hand the user the button instead. */
function performReload(): void {
  if (updateTimer) {
    clearTimeout(updateTimer);
    updateTimer = null;
  }
  if (claimAutoReload('wake')) {
    window.location.reload();
  } else {
    dispatch({ type: 'reload-refused' });
  }
}

async function beginUpdate(): Promise<void> {
  if (updateTimer) return;
  updateTimer = setTimeout(performReload, UPDATE_FALLBACK_MS);
  try {
    // The registration from registerSW is usually here; when the initial
    // registration raced the sleeping server, ask the browser directly.
    const reg = registration ?? (await navigator.serviceWorker?.getRegistration()) ?? null;
    await reg?.update();
  } catch {
    // The fallback timer covers a worker that will not update.
  }
}

async function pollUntilUp(): Promise<void> {
  if (polling) return;
  polling = true;
  const generation = ++pollGeneration;
  const startedAt = Date.now();
  try {
    while (generation === pollGeneration && Date.now() - startedAt < GIVE_UP_AFTER_MS) {
      await sleep(POLL_INTERVAL_MS);
      if (generation !== pollGeneration) return;
      const result = await probe();
      if (generation !== pollGeneration) return;
      if (result.ok) {
        dispatch({ type: 'probe-ok', serverBuild: result.build, now: Date.now() });
        return;
      }
    }
    if (generation === pollGeneration) dispatch({ type: 'gave-up' });
  } finally {
    if (generation === pollGeneration) polling = false;
  }
}

async function probeOnce(): Promise<void> {
  const result = await probe();
  if (result.ok) {
    dispatch({ type: 'probe-ok', serverBuild: result.build, now: Date.now() });
  } else {
    dispatch({ type: 'probe-failed' });
    void pollUntilUp();
  }
}

/** Idempotent: registers the worker and runs the first probe. */
export function startWake(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      registration = reg ?? null;
    },
    // autoUpdate mode would reload here on its own; routing it through the
    // guard is what keeps a half-deployed server from reloading forever.
    onNeedReload: performReload,
  });

  void probeOnce();
}

/** "Try again" from the down state. */
export function retryWake(): void {
  pollGeneration++;
  polling = false;
  dispatch({ type: 'retry' });
  void probeOnce();
}

/** Settings' manual check: probe now, confirm visibly or update. */
export function checkForUpdates(): void {
  dispatch({ type: 'check-requested' });
  void probeOnce();
}

/** The user's own reload: never guarded. */
export function reloadNow(): void {
  window.location.reload();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;

export function useWakeState(): WakeState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
