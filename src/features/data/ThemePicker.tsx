import { Check } from 'lucide-react';
import { computeFillL, THEMES, type CustomTheme, type ThemeName } from '../../lib/theme';
import { useUserData } from '../../stores/userData';

/**
 * The theme section of Data & Settings (docs/design-language.md §13). Custom
 * is structured customization: hue and chroma are the user's, lightness is
 * system-owned — computeFillL() resolves the fill step at pick time so no
 * choice here can break AA contrast.
 */

const DEFAULT_CUSTOM: CustomTheme = { base: 'dark', accentHue: 285, accentVivid: true, surfaceTint: 1 };

const HUE_TRACK =
  'linear-gradient(90deg, hsl(0 70% 55%), hsl(60 70% 55%), hsl(120 60% 45%), hsl(180 70% 45%), hsl(240 70% 60%), hsl(300 70% 55%), hsl(360 70% 55%))';

const BASES: Array<{ id: CustomTheme['base']; label: string }> = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'black', label: 'True black' },
];

const TINTS: Array<{ id: CustomTheme['surfaceTint']; label: string }> = [
  { id: 0, label: 'None' },
  { id: 1, label: 'Subtle' },
  { id: 2, label: 'Tinted' },
];

export function ThemePicker() {
  const theme = useUserData((s) => s.uiPrefs.theme) ?? 'midnight';
  const customTheme = useUserData((s) => s.uiPrefs.customTheme);
  const setUiPrefs = useUserData((s) => s.setUiPrefs);
  const custom = customTheme ?? DEFAULT_CUSTOM;

  const pick = (id: ThemeName) => {
    if (id === 'custom') {
      setUiPrefs({
        theme: 'custom',
        customTheme: { ...custom, fillL: computeFillL(custom.accentHue, custom.accentVivid, custom.base) },
      });
    } else {
      // Midnight is the absence of a theme; customTheme is kept for later.
      setUiPrefs({ theme: id === 'midnight' ? undefined : id });
    }
  };

  const updateCustom = (patch: Partial<CustomTheme>) => {
    const next = { ...custom, ...patch };
    next.fillL = computeFillL(next.accentHue, next.accentVivid, next.base);
    setUiPrefs({ theme: 'custom', customTheme: next });
  };

  return (
    <section className="rounded-xl border border-edge bg-surface-0 p-4">
      <h3 className="text-sm font-semibold text-fg-secondary">Theme</h3>
      <p className="mt-0.5 text-caption text-fg-muted">Six looks, one language. Custom derives a full palette from your hue.</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {THEMES.map((t) => {
          const active = theme === t.id;
          return (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              aria-pressed={active}
              className={`flex h-11 items-center gap-2 rounded-control border px-3 text-label font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? 'border-accent-500 bg-accent-600/15 text-fg'
                  : 'border-edge bg-surface-2 text-fg-secondary hover:border-edge-strong hover:text-fg'
              }`}
            >
              <span
                aria-hidden="true"
                className="h-4 w-4 shrink-0 rounded-full border border-edge-strong"
                style={
                  t.id === 'custom'
                    ? { background: 'conic-gradient(hsl(0 70% 55%), hsl(120 60% 45%), hsl(240 70% 60%), hsl(0 70% 55%))' }
                    : { background: t.swatch }
                }
              />
              <span className="min-w-0 truncate">{t.label}</span>
              {active && <Check className="ml-auto h-4 w-4 shrink-0 text-accent-400" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {theme === 'custom' && (
        <div className="mt-3 space-y-3 rounded-inner border border-edge bg-surface-1 p-3">
          <div>
            <span className="text-micro font-semibold uppercase tracking-wider text-fg-faint">Base</span>
            <div className="mt-1.5 flex rounded-control border border-edge bg-surface-2 p-0.5">
              {BASES.map((b) => (
                <button
                  key={b.id}
                  onClick={() => updateCustom({ base: b.id })}
                  aria-pressed={custom.base === b.id}
                  className={`h-10 flex-1 rounded-[calc(var(--radius-control)-2px)] text-label font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    custom.base === b.id ? 'bg-surface-0 text-fg shadow-e1' : 'text-fg-muted hover:text-fg-secondary'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="theme-hue" className="text-micro font-semibold uppercase tracking-wider text-fg-faint">
              Accent hue
            </label>
            <div className="mt-1.5 flex items-center gap-3">
              <input
                id="theme-hue"
                type="range"
                min={0}
                max={360}
                value={custom.accentHue}
                onChange={(e) => updateCustom({ accentHue: Number(e.target.value) })}
                className="h-11 flex-1 appearance-none rounded-full accent-accent-500"
                style={{ background: HUE_TRACK, height: '10px' }}
              />
              <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-field border border-edge-strong bg-accent-500" />
            </div>
            <label className="mt-2 flex h-11 items-center gap-2 text-label text-fg-secondary">
              <input
                type="checkbox"
                checked={custom.accentVivid}
                onChange={(e) => updateCustom({ accentVivid: e.target.checked })}
                className="h-4 w-4 accent-accent-500"
              />
              Vivid accent
            </label>
          </div>

          <div>
            <span className="text-micro font-semibold uppercase tracking-wider text-fg-faint">Surface tint</span>
            <div className="mt-1.5 flex rounded-control border border-edge bg-surface-2 p-0.5">
              {TINTS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => updateCustom({ surfaceTint: t.id })}
                  aria-pressed={custom.surfaceTint === t.id}
                  className={`h-10 flex-1 rounded-[calc(var(--radius-control)-2px)] text-label font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    custom.surfaceTint === t.id ? 'bg-surface-0 text-fg shadow-e1' : 'text-fg-muted hover:text-fg-secondary'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {custom.surfaceTint > 0 && (
              <div className="mt-2">
                <label htmlFor="theme-tint-hue" className="text-micro font-semibold uppercase tracking-wider text-fg-faint">
                  Tint hue
                </label>
                <input
                  id="theme-tint-hue"
                  type="range"
                  min={0}
                  max={360}
                  value={custom.surfaceHue ?? custom.accentHue}
                  onChange={(e) => updateCustom({ surfaceHue: Number(e.target.value) })}
                  className="mt-1.5 w-full appearance-none rounded-full accent-accent-500"
                  style={{ background: HUE_TRACK, height: '10px' }}
                />
              </div>
            )}
          </div>

          <p className="text-caption text-fg-muted">
            Lightness stays system-owned at every step — no hue you pick can break contrast.
          </p>
        </div>
      )}
    </section>
  );
}
