import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, CheckCircle2, Download, FileUp, Library, Trash2, X } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { queryClient } from '../../queries/client';
import { QUERY_CACHE_KEY, removeKey } from '../../stores/storage';
import { selectLibraryArray, selectLogsArray, useUserData } from '../../stores/userData';
import { buildExport, exportFileName, parseBackup, type ParsedBackup } from './backup';

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

  // Closing is a clean slate: no stale preview or banner on the next open.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setBanner(null);
      setPending(null);
      setDangerOpen(false);
      setConfirmText('');
    }
    onOpenChange(next);
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
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] p-4 md:p-6 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="relative flex max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-edge bg-surface-1 text-gray-200 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
            <div className="flex items-start justify-between gap-4 border-b border-edge p-5">
              <div>
                <Dialog.Title className="text-lg font-bold tracking-tight text-white">Data &amp; Settings</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-gray-400">
                  Your library lives in this browser only. Export it to move devices or keep a backup.
                </Dialog.Description>
              </div>
              <Dialog.Close className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-surface-3 hover:text-white">
                <X className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">Close</span>
              </Dialog.Close>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5 custom-scrollbar">
              {banner && (
                <div
                  className={
                    banner.kind === 'success'
                      ? 'flex items-start gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300'
                      : 'flex items-start gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-300'
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

              {/* Export */}
              <section className="rounded-xl border border-edge bg-surface-0 p-4">
                <h3 className="text-sm font-semibold text-gray-200">Export your data</h3>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {library.length} {library.length === 1 ? 'show' : 'shows'} · {logs.length} episode{' '}
                  {logs.length === 1 ? 'log' : 'logs'}
                </p>
                <button
                  onClick={handleExport}
                  className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent-600 text-sm font-semibold text-white transition-colors hover:bg-accent-500"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download backup
                </button>
              </section>

              {/* Import */}
              <section className="rounded-xl border border-edge bg-surface-0 p-4">
                <h3 className="text-sm font-semibold text-gray-200">Import a backup</h3>
                <p className="mt-0.5 text-[11px] text-gray-400">Merges with what you already have — nothing is replaced.</p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleFile}
                />

                {pending ? (
                  <div className="mt-3 rounded-lg border border-accent-500/30 bg-accent-600/10 p-3">
                    <p className="text-sm text-gray-200">
                      <span className="font-medium text-white">{pending.fileName}</span> contains{' '}
                      {pending.library.length} {pending.library.length === 1 ? 'show' : 'shows'} and{' '}
                      {pending.logs.length} episode {pending.logs.length === 1 ? 'log' : 'logs'} — merge into your data?
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={confirmImport}
                        className="h-11 flex-1 rounded-lg bg-accent-600 text-sm font-semibold text-white transition-colors hover:bg-accent-500"
                      >
                        Merge
                      </button>
                      <button
                        onClick={() => setPending(null)}
                        className="h-11 flex-1 rounded-lg border border-edge text-sm font-medium text-gray-300 transition-colors hover:bg-surface-3 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-edge bg-surface-2 text-sm font-semibold text-gray-200 transition-colors hover:bg-surface-3 hover:text-white"
                  >
                    <FileUp className="h-4 w-4" aria-hidden="true" />
                    Choose backup file
                  </button>
                )}
              </section>

              {/* MAL import lives in Library, where the matching progress has room */}
              <section className="flex items-center justify-between gap-3 rounded-xl border border-edge bg-surface-0 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-200">Coming from MyAnimeList?</h3>
                  <p className="mt-0.5 text-[11px] text-gray-400">Import a MyAnimeList export from the Library tab.</p>
                </div>
                <Link
                  to="/library"
                  onClick={() => handleOpenChange(false)}
                  className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-edge px-3 text-sm font-medium text-gray-300 transition-colors hover:bg-surface-3 hover:text-white"
                >
                  <Library className="h-4 w-4" aria-hidden="true" />
                  Library
                </Link>
              </section>

              {/* Danger zone */}
              <section className="rounded-xl border border-red-500/30 bg-red-950/20 p-4">
                <h3 className="text-sm font-semibold text-red-300">Clear all data</h3>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  Deletes your library, episode logs, ratings, and settings from this browser. Export first — this cannot
                  be undone.
                </p>

                {dangerOpen ? (
                  <div className="mt-3 space-y-2">
                    <label htmlFor="clear-confirm" className="block text-[11px] font-medium text-gray-300">
                      Type {CLEAR_PHRASE} to confirm
                    </label>
                    <input
                      id="clear-confirm"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      autoComplete="off"
                      className="h-11 w-full rounded-lg border border-edge bg-surface-2 px-3 text-sm text-white placeholder-gray-500 focus:border-red-500 focus:outline-none"
                      placeholder={CLEAR_PHRASE}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleClearAll}
                        disabled={confirmText !== CLEAR_PHRASE}
                        className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Delete everything
                      </button>
                      <button
                        onClick={() => {
                          setDangerOpen(false);
                          setConfirmText('');
                        }}
                        className="h-11 flex-1 rounded-lg border border-edge text-sm font-medium text-gray-300 transition-colors hover:bg-surface-3 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setDangerOpen(true)}
                    className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-red-500/40 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Clear all data
                  </button>
                )}
              </section>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
