/**
 * Theme runtime (docs/design-language.md §13). Skins are html[data-theme]
 * blocks in index.css; this module stamps the attribute, composes the Custom
 * theme's variables, and keeps color-scheme, <meta theme-color>, and the
 * per-theme display fonts in sync. First paint is handled by the inline
 * script in index.html — KEEP THE CUSTOM COMPOSITION IN SYNC with it.
 */

export type ThemeName = 'midnight' | 'daylight' | 'void' | 'sakura' | 'synthwave' | 'custom';

export interface CustomTheme {
  base: 'dark' | 'light' | 'black';
  /** 0–360. Hue and chroma are the user's; lightness ladders are system-owned. */
  accentHue: number;
  accentVivid: boolean;
  /** Absent = follow accentHue. */
  surfaceHue?: number;
  surfaceTint: 0 | 1 | 2;
  /**
   * Resolved fill lightness for accent-600, stored at pick time so the
   * pre-paint script never does color math. See computeFillL().
   */
  fillL?: number;
}

export interface ThemePrefs {
  theme?: ThemeName;
  customTheme?: CustomTheme;
}

export interface ThemeMeta {
  id: ThemeName;
  label: string;
  /** Representative surface-0, used for the picker swatch + meta theme-color. */
  swatch: string;
  base: 'dark' | 'light';
  /** Google Fonts family fragment for a per-theme display face, if any. */
  fontQuery?: string;
}

export const THEMES: ThemeMeta[] = [
  { id: 'midnight', label: 'Midnight', swatch: '#0b0b0e', base: 'dark' },
  { id: 'daylight', label: 'Daylight', swatch: '#f6f6f8', base: 'light' },
  { id: 'void', label: 'Void', swatch: '#000000', base: 'dark' },
  { id: 'sakura', label: 'Sakura', swatch: '#2b1e28', base: 'dark', fontQuery: 'Zen+Maru+Gothic:wght@500;700' },
  { id: 'synthwave', label: 'Synthwave', swatch: '#0d0221', base: 'dark', fontQuery: 'Orbitron:wght@500;700' },
  { id: 'custom', label: 'Custom', swatch: '#0b0b0e', base: 'dark' },
];

const DEFAULT_CUSTOM: CustomTheme = { base: 'dark', accentHue: 285, accentVivid: true, surfaceTint: 1 };

/** Every property applyTheme may set inline, so a theme change clears cleanly. */
const CUSTOM_PROPS = [
  '--color-accent-300', '--color-accent-400', '--color-accent-500', '--color-accent-600', '--color-accent-700',
  '--color-ring',
  '--shadow-glow-sm', '--shadow-glow', '--shadow-glow-lg',
  '--color-hero-drops-accent-well', '--color-hero-catchup-ink', '--color-hero-grad-from', '--color-hero-grad-to',
  '--color-surface-0', '--color-surface-1', '--color-surface-2', '--color-surface-3',
  '--color-edge', '--color-edge-strong', '--color-edge-faint',
];

const ok = (l: number, c: number, h: number) => `oklch(${l} ${c} ${h})`;

/** Normalize any CSS color to sRGB via a canvas pixel (also gamut-maps oklch). */
function toRGB(color: string): [number, number, number] {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return [0, 0, 0];
  ctx.fillStyle = '#000';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Fill lightness is system-owned: step down until white text clears AA.
 * Constant oklch L is not constant WCAG luminance — green-range hues run
 * brighter, so their fills land darker automatically. Called by the settings
 * picker; the result is stored as customTheme.fillL.
 */
export function computeFillL(accentHue: number, vivid: boolean, base: CustomTheme['base']): number {
  const c = vivid ? 0.2 : 0.14;
  let l = base === 'light' ? 0.52 : 0.55;
  while (l > 0.34 && contrast(toRGB(ok(l, c, accentHue)), [255, 255, 255]) < 4.6) l -= 0.03;
  return Number(l.toFixed(2));
}

function metaColorFor(prefs: ThemePrefs): string {
  const theme = prefs.theme ?? 'midnight';
  if (theme !== 'custom') return THEMES.find((t) => t.id === theme)?.swatch ?? '#0b0b0e';
  const c = prefs.customTheme ?? DEFAULT_CUSTOM;
  if (c.surfaceTint > 0) {
    const hue = c.surfaceHue ?? c.accentHue;
    const l = c.base === 'black' ? 0 : c.base === 'dark' ? 0.16 : 0.97;
    const sc = (c.base === 'light' ? 0.008 : 0.015) * c.surfaceTint;
    const [r, g, b] = toRGB(ok(l, sc, hue));
    return `rgb(${r} ${g} ${b})`;
  }
  return c.base === 'light' ? '#f6f6f8' : c.base === 'black' ? '#000000' : '#0b0b0e';
}

/** Lazy-load a theme's display face once; fallback stacks cover the gap. */
function ensureThemeFont(theme: ThemeName): void {
  const meta = THEMES.find((t) => t.id === theme);
  if (!meta?.fontQuery) return;
  const id = `theme-font-${theme}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${meta.fontQuery}&display=swap`;
  document.head.appendChild(link);
}

/** KEEP IN SYNC with the inline pre-paint script in index.html. */
function composeCustomVars(el: HTMLElement, c: CustomTheme): void {
  const dark = c.base !== 'light';
  const H = c.accentHue;
  const C = c.accentVivid ? 0.2 : 0.14;
  const fill = c.fillL ?? (dark ? 0.55 : 0.52);
  const L = dark ? [0.8, 0.72, 0.63, fill, fill - 0.08] : [0.45, 0.52, 0.63, fill, fill - 0.07];
  (['300', '400', '500', '600', '700'] as const).forEach((step, i) => {
    el.style.setProperty(`--color-accent-${step}`, ok(L[i], C, H));
  });
  el.style.setProperty('--color-ring', ok(dark ? 0.72 : 0.52, C, H));
  if (dark) {
    el.style.setProperty('--shadow-glow-sm', `0 0 10px ${ok(0.63, C, H)}`);
    el.style.setProperty('--shadow-glow', `0 0 15px ${ok(0.63, C, H)}`);
    el.style.setProperty('--shadow-glow-lg', `0 0 20px ${ok(0.63, C, H)}`);
    el.style.setProperty('--color-hero-drops-accent-well', ok(0.2, 0.06, H));
    el.style.setProperty('--color-hero-catchup-ink', ok(0.78, 0.12, H));
    el.style.setProperty('--color-hero-grad-from', ok(0.6, C, H));
    el.style.setProperty('--color-hero-grad-to', ok(0.42, C, H));
  } else {
    el.style.setProperty('--shadow-glow-sm', `0 2px 10px ${ok(0.52, C, H)}`);
    el.style.setProperty('--shadow-glow', `0 2px 12px ${ok(0.52, C, H)}`);
    el.style.setProperty('--shadow-glow-lg', `0 4px 16px ${ok(0.52, C, H)}`);
  }
  if (c.surfaceTint > 0) {
    const TH = c.surfaceHue ?? H;
    const sc = (dark ? 0.015 : 0.008) * c.surfaceTint;
    const SL = c.base === 'black' ? [0, 0.13, 0.17, 0.21] : dark ? [0.16, 0.2, 0.23, 0.26] : [0.97, 1, 0.99, 0.94];
    SL.forEach((l, i) => {
      el.style.setProperty(`--color-surface-${i}`, l === 0 ? '#000000' : ok(l, sc, TH));
    });
    const EL = c.base === 'black' ? [0.19, 0.36, 0.14] : dark ? [0.26, 0.36, 0.2] : [0.9, 0.8, 0.94];
    el.style.setProperty('--color-edge', ok(EL[0], sc, TH));
    el.style.setProperty('--color-edge-strong', ok(EL[1], sc, TH));
    el.style.setProperty('--color-edge-faint', ok(EL[2], sc, TH));
  }
}

/** The sonner theme follows the skin's base. */
export function sonnerTheme(prefs: ThemePrefs): 'light' | 'dark' {
  const theme = prefs.theme ?? 'midnight';
  if (theme === 'custom') return (prefs.customTheme ?? DEFAULT_CUSTOM).base === 'light' ? 'light' : 'dark';
  return THEMES.find((t) => t.id === theme)?.base === 'light' ? 'light' : 'dark';
}

/**
 * Stamp the document for the given prefs. Idempotent; safe to call on every
 * uiPrefs change. Custom rides its base theme's CSS block (daylight for
 * light, void for black, Midnight defaults for dark) with composed inline
 * variables layered on top.
 */
export function applyTheme(prefs: ThemePrefs): void {
  const el = document.documentElement;
  const theme = prefs.theme ?? 'midnight';

  for (const prop of CUSTOM_PROPS) el.style.removeProperty(prop);

  if (theme === 'custom') {
    const c = prefs.customTheme ?? DEFAULT_CUSTOM;
    const baseAttr = c.base === 'light' ? 'daylight' : c.base === 'black' ? 'void' : null;
    if (baseAttr) el.setAttribute('data-theme', baseAttr);
    else el.removeAttribute('data-theme');
    composeCustomVars(el, c);
    el.style.colorScheme = c.base === 'light' ? 'light' : 'dark';
  } else if (theme === 'midnight') {
    el.removeAttribute('data-theme');
    el.style.removeProperty('color-scheme');
  } else {
    el.setAttribute('data-theme', theme);
    el.style.removeProperty('color-scheme');
    ensureThemeFont(theme);
  }

  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', metaColorFor(prefs));
}
