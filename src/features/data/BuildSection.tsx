import { format } from 'date-fns';
import { Check, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/utils';
import { compareBuilds } from '../../lib/wakeStrip';
import { checkForUpdates, reloadNow, useWakeState } from '../../queries/serverWake';

/**
 * "About this build" — where you answer "what am I actually running?" once
 * the wake strip is long gone. Two stamps side by side (this device, the live
 * site), a verdict badge, and the manual override the strip normally makes
 * unnecessary.
 */

const BUILT_AT = typeof __APP_BUILT_AT__ === 'string' ? new Date(__APP_BUILT_AT__) : null;

function Cell({ label, sha, note, hot }: { label: string; sha: string; note: string; hot?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-field border p-3',
        hot ? 'border-accent-500/40 bg-hero-drops-accent-well' : 'border-edge bg-surface-1',
      )}
    >
      <span className={cn('text-micro font-semibold uppercase tracking-wider', hot ? 'text-accent-400' : 'text-fg-faint')}>
        {label}
      </span>
      <span className="font-mono text-base text-fg">{sha}</span>
      <span className={cn('text-caption', hot ? 'text-hero-text-mid' : 'text-fg-faint')}>{note}</span>
    </div>
  );
}

export function BuildSection() {
  const state = useWakeState();
  const verdict = compareBuilds(state.clientBuild, state.serverBuild);
  const newer = verdict === 'newer';
  const checking = state.phase === 'checking' || state.phase === 'waking';

  const liveNote =
    state.serverBuild === null
      ? state.phase === 'down'
        ? 'Not answering'
        : checking
          ? 'Asking…'
          : 'Not checked yet'
      : verdict === 'same'
        ? `Same build · checked ${format(state.checkedAt ?? Date.now(), 'HH:mm:ss')}`
        : newer
          ? 'Newer than this device'
          : `Checked ${format(state.checkedAt ?? Date.now(), 'HH:mm:ss')}`;

  return (
    <section
      className={cn(
        'rounded-inner border bg-surface-0 p-4',
        newer ? 'border-accent-500/45 shadow-glow' : 'border-edge',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-fg-secondary">About this build</h3>
        {newer ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-500/40 bg-accent-600/10 px-2.5 py-1 text-caption font-semibold text-accent-300">
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Newer build live
          </span>
        ) : verdict === 'same' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success-500/35 bg-success-500/10 px-2.5 py-1 text-caption font-semibold text-success-300">
            <Check className="h-3 w-3" aria-hidden="true" />
            Up to date
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Cell
          label="This device"
          sha={state.clientBuild}
          note={BUILT_AT ? `Built ${format(BUILT_AT, 'MMM d, yyyy · HH:mm')}` : 'Local build'}
        />
        <Cell label="Live site" sha={state.serverBuild ?? '—'} note={liveNote} hot={newer} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="max-w-[300px] text-caption text-fg-faint">
          {newer
            ? 'The strip at the top normally handles this on its own. This button is the manual override.'
            : 'Senpai checks this on its own whenever the server wakes. Use the button if you know a deploy just went out.'}
        </p>
        {newer ? (
          <Button variant="primary" onClick={reloadNow} className="shrink-0">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Update now
          </Button>
        ) : (
          <Button variant="secondary" onClick={checkForUpdates} disabled={checking} className="shrink-0">
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            Check for updates
          </Button>
        )}
      </div>
    </section>
  );
}
