import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, CheckCircle2, Download, FileUp, Library, Link2, Trash2 } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { DialogShell } from '../../components/ui/DialogShell';
import { queryClient } from '../../queries/client';
import { isInjectableTemplate } from '../../queries/offsets';
import { QUERY_CACHE_KEY, removeKey } from '../../stores/storage';
import { selectLibraryArray, selectLogsArray, useUserData } from '../../stores/userData';
import { buildExport, exportFileName, parseBackup, type ParsedBackup } from './backup';
import { ThemePicker } from './ThemePicker';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Banner = { kind: 'success' | 'error'; message: string } | null;
type Pending = ParsedBackup & { fileName: string };

const CLEAR_PHRASE = 'DELETE';

function download(contents: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Data & Settings. Radix Dialog gives the focus trap, Esc, and focus restore
 * that the hand-rolled version never had.
 */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const library = useUserData(selectLibraryArray);
  const logs = useUserData(selectLogsArray);
  const customSource = useUserData((s) => s.uiPrefs.customSource);
  const setUiPrefs = useUserData((s) => s.setUiPrefs);
  const [sourceName, setSourceName] = useState('');
  const [sourceTemplate, setSourceTemplate] = useState('');

  // Closing is a clean slate: no stale preview or banner on the next open.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      // Seed the form from what is saved, so editing starts from the truth.
      setSourceName(customSource?.name ?? '');
      setSourceTemplate(customSource?.urlTemplate ?? '');
    } else {
      setBanner(null);
      setPending(null);
      setDangerOpen(false);
      setConfirmText('');
    }
    onOpenChange(next);
  };

  const templateInvalid = sourceTemplate.trim() !== '' && !isInjectableTemplate(sourceTemplate);
  const canSaveSource = sourceName.trim() !== '' && isInjectableTemplate(sourceTemplate);

  const handleSaveSource = () => {
    if (!canSaveSource) return;
    setUiPrefs({ customSource: { name: sourceName.trim(), urlTemplate: sourceTemplate.trim() } });
    toast.success('Custom watch source saved');
  };

  const handleRemoveSource = () => {
    setUiPrefs({ customSource: undefined });
    setSourceName('');
    setSourceTemplate('');
    toast.success('Custom watch source removed');
  };

  const handleExport = () => {
    download(JSON.stringify(buildExport(library, logs), null, 2), exportFileName());
    toast.success('Backup downloaded');
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be picked again after a failure
    if (!file) return;

    setBanner(null);
    setPending(null);
    try {
      const parsed = parseBackup(JSON.parse(await file.text()));
      setPending({ ...parsed, fileName: file.name });
    } catch (err) {
      const message =
        err instanceof SyntaxError
          ? "That file isn't valid JSON."
          : err instanceof Error
            ? err.message
            : 'Could not read that file.';
      setBanner({ kind: 'error', message });
      toast.error('Import failed');
    }
  };

  // Nothing is written until this point — the preview above it is the consent step.
  const confirmImport = () => {
    if (!pending) return;
    const { setLibraryBulk, setLogsBulk } = useUserData.getState();
    setLibraryBulk(pending.library);
    setLogsBulk(pending.logs);
    setBanner({
      kind: 'success',
      message: `Merged ${pending.library.length} ${pending.library.length === 1 ? 'show' : 'shows'} and ${pending.logs.length} episode ${pending.logs.length === 1 ? 'log' : 'logs'} into your data.`,
    });
    toast.success('Backup imported');
    setPending(null);
  };

  const handleClearAll = () => {
    if (confirmText !== CLEAR_PHRASE) return;
    useUserData.getState().clearAll();
    // The persisted query cache is separate storage; leaving it behind would
    // repopulate views with the shows that were just deleted.
    removeKey(QUERY_CACHE_KEY);
    queryClient.clear();
    setDangerOpen(false);
    setConfirmText('');
    setBanner({ kind: 'success', message: 'All local data cleared.' });
    toast.success('All data cleared');
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <DialogShell maxWidth="max-w-md">
        <div className="border-b border-edge p-5 pr-12">
          <Dialog.Title className="text-lg font-bold tracking-tight text-fg">Data &amp; Settings</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-fg-muted">
            Your library lives in this browser only. Export it to move devices or keep a backup.
          </Dialog.Description>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5 custom-scrollbar">
              {banner && (
                <div
                  className={
                    banner.kind === 'success'
                      ? 'flex items-start gap-2 rounded-field bg-success-500/10 p-3 text-sm text-success-300'
                      : 'flex items-start gap-2 rounded-field bg-danger-500/10 p-3 text-sm text-danger-300'
                  }
                >
                  {banner.kind === 'success' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                  <span>{banner.message}</span>
                </div>
              )}

              <ThemePicker />

              {/* Export */}
              <section className="rounded-inner border border-edge bg-surface-0 p-4">
                <h3 className="text-sm font-semibold text-fg-secondary">Export your data</h3>
                <p className="mt-0.5 text-caption text-fg-muted">
                  {library.length} {library.length === 1 ? 'show' : 'shows'} · {logs.length} episode{' '}
                  {logs.length === 1 ? 'log' : 'logs'}
                </p>
                <Button variant="primary" onClick={handleExport} className="mt-3 w-full">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download backup
                </Button>
              </section>

              {/* Import */}
              <section className="rounded-inner border border-edge bg-surface-0 p-4">
                <h3 className="text-sm font-semibold text-fg-secondary">Import a backup</h3>
                <p className="mt-0.5 text-caption text-fg-muted">Merges with what you already have — nothing is replaced.</p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleFile}
                />

                {pending ? (
                  <div className="mt-3 rounded-field border border-accent-500/30 bg-accent-600/10 p-3">
                    <p className="text-sm text-fg-secondary">
                      <span className="font-medium text-fg">{pending.fileName}</span> contains{' '}
                      {pending.library.length} {pending.library.length === 1 ? 'show' : 'shows'} and{' '}
                      {pending.logs.length} episode {pending.logs.length === 1 ? 'log' : 'logs'} — merge into your data?
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button variant="primary" onClick={confirmImport} className="flex-1">
                        Merge
                      </Button>
                      <Button onClick={() => setPending(null)} className="flex-1">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button onClick={() => fileInputRef.current?.click()} className="mt-3 w-full">
                    <FileUp className="h-4 w-4" aria-hidden="true" />
                    Choose backup file
                  </Button>
                )}
              </section>

              {/* MAL import lives in Library, where the matching progress has room */}
              <section className="flex items-center justify-between gap-3 rounded-inner border border-edge bg-surface-0 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-fg-secondary">Coming from MyAnimeList?</h3>
                  <p className="mt-0.5 text-caption text-fg-muted">Import a MyAnimeList export from the Library tab.</p>
                </div>
                <Link
                  to="/library"
                  onClick={() => handleOpenChange(false)}
                  className="flex h-11 shrink-0 items-center gap-2 rounded-field border border-edge px-3 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface-3 hover:text-fg"
                >
                  <Library className="h-4 w-4" aria-hidden="true" />
                  Library
                </Link>
              </section>

              {/* Custom watch source */}
              <section className="rounded-inner border border-edge bg-surface-0 p-4">
                <h3 className="text-sm font-semibold text-fg-secondary">Custom watch source</h3>
                <p className="mt-0.5 text-caption text-fg-muted">
                  Add a watch source we don&apos;t list — your own media server, a regional service.{' '}
                  <code className="rounded bg-surface-2 px-1">{'{title}'}</code> in the URL becomes the show&apos;s
                  title. Stored in this browser only.
                </p>

                <div className="mt-3 space-y-2">
                  <input
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                    autoComplete="off"
                    aria-label="Source name"
                    placeholder="Source name"
                    className="h-11 w-full rounded-field border border-edge bg-surface-2 px-3 text-sm text-fg placeholder-fg-faint focus:border-accent-500 focus:outline-none"
                  />
                  <input
                    value={sourceTemplate}
                    onChange={(e) => setSourceTemplate(e.target.value)}
                    autoComplete="off"
                    aria-label="URL template"
                    placeholder="https://example.com/search?q={title}"
                    className="h-11 w-full rounded-field border border-edge bg-surface-2 px-3 text-sm text-fg placeholder-fg-faint focus:border-accent-500 focus:outline-none"
                  />
                  {templateInvalid && (
                    <p className="text-caption text-danger-300">The URL must start with http:// or https://</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      onClick={handleSaveSource}
                      disabled={!canSaveSource}
                      className="flex-1"
                    >
                      <Link2 className="h-4 w-4" aria-hidden="true" />
                      {customSource ? 'Update source' : 'Add source'}
                    </Button>
                    {customSource && (
                      <Button onClick={handleRemoveSource} className="flex-1">
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </section>

              {/* Danger zone */}
              <section className="rounded-inner border border-danger-500/30 bg-danger-600/10 p-4">
                <h3 className="text-sm font-semibold text-danger-300">Clear all data</h3>
                <p className="mt-0.5 text-caption text-fg-muted">
                  Deletes your library, episode logs, ratings, and settings from this browser. Export first — this cannot
                  be undone.
                </p>

                {dangerOpen ? (
                  <div className="mt-3 space-y-2">
                    <label htmlFor="clear-confirm" className="block text-caption font-medium text-fg-secondary">
                      Type {CLEAR_PHRASE} to confirm
                    </label>
                    <input
                      id="clear-confirm"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      autoComplete="off"
                      className="h-11 w-full rounded-field border border-edge bg-surface-2 px-3 text-sm text-fg placeholder-fg-faint focus:border-danger-500 focus:outline-none"
                      placeholder={CLEAR_PHRASE}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleClearAll}
                        disabled={confirmText !== CLEAR_PHRASE}
                        className="flex h-11 flex-1 items-center justify-center gap-2 rounded-field bg-danger-600 text-sm font-semibold text-fg-inverse transition-colors hover:bg-danger-500 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Delete everything
                      </button>
                      <Button
                        onClick={() => {
                          setDangerOpen(false);
                          setConfirmText('');
                        }}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="danger" onClick={() => setDangerOpen(true)} className="mt-3 w-full">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Clear all data
                  </Button>
                )}
              </section>
        </div>
      </DialogShell>
    </Dialog.Root>
  );
}
