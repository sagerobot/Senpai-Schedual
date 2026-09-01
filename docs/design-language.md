# The Senpai design language

This is the contract for how the app looks, moves, and speaks — and the reference for the
six-theme system. It was locked in after the August 2026 design audit found four divergent
palette families and ~560 hardcoded color decisions. The companion artifacts:

- **The audit** (evidence, ranked surface gallery): the "Senpai Design Audit" artifact
- **The Theme Lab** (interactive mockups, all six themes, the custom builder): the "Senpai Theme Lab" artifact

Rules here are normative. When code and this document disagree, one of them is a bug —
usually the code, unless a PR updates this file in the same change.

## 1. Principles

- **One language, six coats of paint.** Themes redefine tokens; they never fork components.
  A component that needs a per-theme branch is consuming the wrong tokens.
- **Raise, don't flatten.** Today's Drops banner cards and the Catch-Up ring/pip cards are
  protected hero surfaces: unification means bringing other surfaces *up* to their level of
  care, never simplifying them down (see `card-visuals` policy and §12).
- **States are part of the language.** A surface without designed loading/empty/error states
  is unfinished no matter how it looks when full (§8).
- **Honesty over polish.** Degraded AI states render the envelope truthfully (`no_key`,
  `resting`, `error`) — never a placeholder dressed as data.

## 2. The token contract

Tokens live in `src/index.css` `@theme`. Themes are `html[data-theme="…"]` blocks after the
Tailwind import that redefine the same custom properties; no attribute = Midnight. **Raw
color values are legal only inside `index.css` theme blocks.** Components consume tokens —
via the generated utilities or `var()` — and nothing else.

Ramp positions are **roles, not lightness**: `accent-300` = text on tinted ground,
`400` = ring/icon, `500` = border/base, `600` = solid fill (with `fg-inverse` text),
`700` = fill-hover. Light themes invert the lightness under the same names, which is why
component classes never change per theme.

| Group | Tokens (`--color-` prefix in `@theme`) | Notes |
| --- | --- | --- |
| Surfaces | `surface-0..3` | 0 = page (painted on `html`), 1 = card, 2 = raised/skeleton, 3 = hover/input |
| Text | `fg`, `fg-secondary`, `fg-muted`, `fg-faint`, `fg-inverse` | replaces `text-white` ×147 and the entire `text-gray-*` ramp |
| Edges | `edge`, `edge-strong`, `edge-faint` | absorbs `border-gray-700/800` |
| Accent | `accent-300..700` | Midnight aliases Tailwind purple; other themes pin values |
| Focus | `ring` | = accent-400 tier; see §10 |
| Status | `success- / danger- / warning- / info-` × `300/400/500/600` | danger = destructive UI; `finished` badge maps to info |
| Sentiment | `sent-{positive,mixed,negative,quiet,new}` + `…-fg` | hue stable across themes; only `-fg` lightness flips (§3) |
| Overlays | `overlay`, `scrim`, `veil` | overlay = modal backdrop (kills the 4 copy-pasted `bg-black/80`); scrim = text-over-art gradient base, **theme-invariant near-black**; veil = wash over blurred backdrop art (alpha rises on light themes) |
| Hero | `hero-drops-*`, `hero-catchup-*`, `hero-text-{hi,mid,low}`, `hero-new` | §12 |

Non-color namespaces: `--radius-{xs,field,control,inner,card,pill}` (§5),
`--shadow-{e1,e2,e3,glow-sm,glow,glow-lg,glow-success,glow-warning}` (§6), `--font-display` (§4),
`--text-{micro,caption,label}` type steps (§4). Motion constants live in `src/lib/motion.ts` (§7).

The Theme Lab is the authoritative table of per-theme values — its CSS *is* the spec, and
its live AA table validates every skin. Summary of each theme's identity:

| Theme | `data-theme` | Base | Accent | Display face | Radii | Elevation |
| --- | --- | --- | --- | --- | --- | --- |
| Midnight | *(none)* | `#0b0b0e` dark | purple (current) | Space Grotesk | card 16 | glow |
| Daylight | `daylight` | `#f6f6f8` light | purple, AA-mapped | Space Grotesk | card 16 | soft shadow |
| Void | `void` | `#000000` OLED | purple (current) | Space Grotesk | card 16 | edges + glow |
| Sakura | `sakura` | `#2b1e28` dusk plum — the in-between mode | rose `#f472b6`, fill `#db2777` | Zen Maru Gothic | softened, card 20 | petal glow |
| Synthwave | `synthwave` | `#0d0221` indigo | magenta `#ff2ec4`, fill `#c9109a`, **cyan ring** `#52ecf7` | Orbitron | sharpened, card 12 | neon glow |
| Custom | `custom` | user | derived (§13) | per base | per base | per base |

## 3. Color usage

- **Status ≠ sentiment.** `danger` is for destructive UI (Remove, type-DELETE). Community
  sentiment uses the `sent-*` family. They may share hues; they never share tokens.
- Sentiment hues are **stable across all themes** (positive stays emerald in Sakura); only
  the `-fg` text tier flips lightness for contrast. Labels always spell the word — sentiment
  is never color-only.
- Tint/border variants come from alpha on the base token
  (`color-mix(… var(--color-sent-positive) 10%, transparent)` / Tailwind `/10`), not new hexes.
- The **electric indigo exception**: `--color-hero-new` (`#543bfa` family) is the one
  sanctioned indigo, used only for the NEW/platform chips on hero surfaces. Everywhere else
  the "no indigo" rule from the original accent comment stands.
- Contrast floors: AA 4.5:1 for body/label text, 3:1 for large display text and the hero
  catch-up ink, per theme. `fg-faint` is for non-essential text only and carries no floor.

## 4. Typography

Faces: **Inter** (`--font-sans`) for everything, **Space Grotesk** (`--font-display`) for
display roles — swapped per theme (Zen Maru Gothic in Sakura, Orbitron in Synthwave; body
stays Inter in every theme). Load fonts with `preconnect` + `<link>`, never a render-blocking
`@import`; theme display faces lazy-load on activation with metric-compatible fallbacks.

The display face is applied by element rule (`h1..h6`) and the `font-display` utility.
**The `.tracking-tight` side-effect is retired** — a spacing utility must never switch
typeface (the audit found 17 sites relying on it and h1s silently rendering in Inter without it).

The scale (rem-based; Tailwind defaults plus three named additions that replace the 138
arbitrary pixel values):

| Step | Size / weight | Face | Use |
| --- | --- | --- | --- |
| hero | 30 / 700 | display | view h1 |
| heading | 24 / 700 | display | section h2 |
| title | 20 / 500 | display | card titles |
| body | 16 / 400 | sans | copy |
| label (`text-label`) | 13 / 600 | sans | control labels, chips |
| caption (`text-caption`) | 11 / 400 | sans | metadata lines |
| micro (`text-micro`) | 10 / 600 caps | sans | eyebrows, dense card data |

Weights: 400 body · 500 UI · 600 subheads · 700 display. Exactly one `h1` per view, and it
appears before any `h2` (the schedule currently violates this; fix lands with unification).
Numbers that align in columns get `tabular-nums`.

## 5. Space & shape

- Touch floor **44px** (`h-11`) for every interactive control; 36/28px only for secondary
  in-card actions with adequate spacing.
- Radius tokens: `xs 6 · field 8 · control 10 · inner 12 · card 16 · pill` (Midnight values;
  Sakura softens +4 on the low end / card 20, Synthwave sharpens −2..4 / card 12). The
  `rounded-[10px]` ×14 and `rounded-[16px]` one-offs map to `control` and `card`.
- Ordinary card recipe: `bg-surface-1 border border-edge rounded-card shadow-e1
  hover:border-edge-strong`; inner wells `surface-2`; inputs `surface-3`.
- `backdrop-blur` split is meaningful and stays: `md` for chips over artwork, `sm` for
  overlays and sticky toolbars.

## 6. Elevation & glow

Whole shadow strings are theme variables — that is the full-skin mechanism for shadow style:

- `e1` chips/cards · `e2` raised/popover · `e3` modal/hero.
- `glow-sm / glow / glow-lg` use **one** glow color (accent-500 tier) — retiring the three
  different purples the audit found doing the same job — plus `glow-success` for
  graduation/binge moments and `glow-warning` for the pre-air runway (§16). The two
  semantic glows exist because those surfaces are *not* accent-toned; nothing else may
  add a third without the same justification.
- Dark themes: glows are glows. **Daylight redefines the same tokens as conventional drop
  shadows.** Void leans on edges (drop shadows are invisible on black). Sakura glows soft
  rose ("petal glow"). Synthwave cranks the radii and alpha.

## 7. Motion

Canonical source: `src/lib/motion.ts` — no magic numbers at call sites, no re-declared
constants (the audit found SwipeCell's spec duplicated byte-for-byte and two springs doing
one job).

| Name | Value | Use |
| --- | --- | --- |
| `EASE_STANDARD` / `--ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | portal traversal, general movement |
| `EASE_SWAP` / `--ease-swap` | `cubic-bezier(0.32, 0.72, 0.28, 1)` | list reflow / layout |
| `DUR.fast` | 150ms | hover color/opacity |
| `DUR.standard` | 300ms | reveals, expand/collapse |
| `DUR.swap` | 320ms | layout reflow |
| `DUR.portal` | 450ms | portal swap |
| `DUR.slow` | 500ms | large panels |
| `DUR.ring` | 1000ms `ease-out` | progress rings |
| `SPRING_POP` | `{ stiffness: 500, damping: 38, mass: 0.8 }` | the one spring |

Motion is **theme-invariant**: skins change paint, never physics. Every animated surface
respects `prefers-reduced-motion` (transforms/layout collapse to instant; quick opacity
fades may remain).

## 8. State patterns — the five-state canon

Every data view ships: **loading** (skeleton shaped like the content — `bg-surface-2` +
pulse — never a bare spinner), **empty** (says what belongs here + first step CTA),
**error** (never dressed as emptiness; retry action), and where AI is involved, the
envelope states (`resting` with its moon, `no_key`, stale-cached-after-failure banner)
rendered honestly. `/for-you` and `ErrorState` are the canon.

**Rule the audit made necessary:** every view consuming schedule data branches on
`scheduleError` — a failed fetch must never render as "Nothing here yet"
(/watching and /library currently violate this).

## 9. Component recipes

Primitives to build (the implementation phase's §3); until they exist this section is the
spec they're built to. Each: tokens only, all five states where applicable, focus per §10,
44px floor.

- **Button** — variants primary (`accent-600` fill, `fg-inverse` text), secondary
  (`surface-3` + `edge-strong`), ghost, danger (`danger` family tint). Sizes h-11/h-9/h-7.
  Replaces 97 hand-rolled `<button>`s.
- **Dialog shell** — one overlay (`bg-overlay backdrop-blur-sm`), one panel recipe
  (`surface-1`, `edge`, `radius-card`, `shadow-e3`), one close button, one enter/exit spec
  (tw-animate, `DUR.standard`). Replaces the four drifted copies (EpisodeView's missing
  enter animation included).
- **Input / Select** — `surface-3`, `edge-strong`, focus per §10. The styled Select retires
  the seven native ones; `color-scheme` per theme fixes any that remain.
- **Chip / Badge** — `StatusBadge` (via `lib/status.ts`, unchanged vocabulary) and the
  tokenized sentiment chip are the only two badge vocabularies. CheckInFeed's hand-rolled
  status chip migrates to StatusBadge.
- **Tabs (segmented)** — the LibraryView/WatchingView pattern, tokenized.
- **Tooltip** — new primitive; the native `title` attribute is **banned** (invisible on
  touch, unstyleable).
- **Skeleton** — one component; retires the repeated inline pulse divs.
- **Toast** — sonner, themed per skin (`theme` follows base; Synthwave overrides its
  success/error variables). Every destructive or logging action keeps its Undo.

## 10. Focus & interaction

Canonized from `AnimeCard.tsx:93` — the one correct treatment the audit found:

- Image cards/tiles: `focus:outline-none focus-visible:ring-2 focus-visible:ring-inset
  focus-visible:ring-ring` (+ `z` bump if clipped).
- Buttons/chips/inputs: `focus-visible:ring-2 ring-ring` with a surface-colored offset ring
  where the control sits on `surface-0`.
- **Removing an outline without a replacement is a defect** (ShowDetailModal's close button).
- Hover: color/border shifts at `DUR.fast`; `transition-colors`, not `transition-all`.

## 11. Accessibility floors

44px targets · one `h1` per view, first · AA contrast per theme (§3; the Theme Lab table
checks live) · `color-scheme` declared per theme · `prefers-reduced-motion` respected ·
sentiment and status never color-only · every interactive element keyboard-reachable with
visible focus.

## 12. Hero surfaces

The three protected surfaces — Today's Drops banner cards (+ Up Next deck), the Catch-Up
ring/pip cards, and the series page's shell + journey rail — keep their density and art
direction in every theme.

- Heroes consume **only** their namespaces: `hero-drops-*`, `hero-catchup-*`,
  `hero-series-*`, `hero-text-{hi,mid,low}`, `hero-new`, plus shared accent/status/sentiment
  where semantics align. They never import app surface/text tokens, and never invent colors.
- **`hero-series-*` is the one namespace that admits per-show tint.** Its tokens are
  neutral bases; `seriesSkin()` (src/features/series/seriesSkin.ts) mixes the franchise's
  `coverImage.color` into the grounds via `color-mix` at fixed ratios and exposes the result
  as `--series-*` variables. The ink tier is never tinted — a saturated cover color mixed
  into it can fall out of AA. The mix ratios live in `seriesSkin` and nowhere else; the
  hero frame is the shell + rail only, and everything below drops to the ordinary recipe
  ("raise, don't flatten").
- **Every theme art-directs the heroes — light themes included.** In Daylight the heroes
  are genuinely light re-skins (paper-tinted cards, dark hero text, shadows instead of
  glow, art fading into the light card) — decided against the dark-island alternative with
  real pixels in the Theme Lab, which keeps a comparison toggle for revisiting. Sakura,
  the deliberate in-between mode, deepens them into dusk-garden jewel boxes on its plum
  ground.
- Cover art always sits on the theme-invariant `scrim`, so text *directly over artwork* is
  white in every theme; text on the hero card ground uses `hero-text-*`, which flips with
  the theme.
- `hero-new` is the sanctioned electric indigo (§3), resolving the old
  `#2917d2/#543bfa/#8b7ff9` contradiction into one token.
- **Deck cards are siblings**: the graduation (binge-ready) card matches the airing drop
  card's dimensions — same width, equal stretched height in the deck row, CTA pinned to the
  shared bottom edge. Its middle tier is the stack-summary well (episode count, total
  runtime) where the airing card carries the rate well, and the pile edges sit below the
  card on the deck's shared baseline.

## 13. Theming architecture

- Skins = `html[data-theme]` custom-property blocks (§2). `html { background:
  var(--color-surface-0) }` — this also fixes the cold-boot white flash that predates theming.
- Preference: `uiPrefs.theme` in `senpai.userdata.v3` — optional field, additive, no
  migration (persist merge is shallow; default at read = Midnight). `clearAll()` resets it.
- A tiny inline `<head>` script reads the zustand envelope
  (`{state:{uiPrefs:{theme}},version:3}`) and stamps `data-theme` before first paint; a
  store-subscribed effect keeps it, `<meta name="theme-color">` (= surface-0), and the
  sonner theme in sync after hydration. The PWA manifest colors stay build-baked (accepted:
  installed-app splash is Midnight).
- **Custom theme**: structured, not free-form. Stored as
  `uiPrefs.customTheme { base: 'dark'|'light'|'black', accentHue: 0-360,
  accentVivid: boolean, surfaceHue?: number, surfaceTint: 0|1|2 }`. Ramps derive in `oklch`
  with **system-owned lightness** (hue/chroma are the user's; lightness ladders are ours),
  and the fill step's lightness adapts downward until `fg-inverse` clears AA — constant
  oklch lightness is not constant WCAG luminance, so green-range hues step darker
  automatically. Text/status/sentiment/overlay values are fixed per base. The pre-paint
  script composes `oklch()` strings from the stored numbers — string concatenation, no
  color math, no flash. No font/radius pickers in v1: Custom is Midnight-shaped (Daylight-
  shaped on the light base). The Theme Lab's Custom panel is the Settings UI spec.

## 14. Adding a new surface — checklist

1. Tokens only — run the grep: no raw hexes, no `gray-*`, no `purple-*`, no `bg-black`/`text-white`.
2. Ordinary card recipe (§5), or a hero namespace if — and only if — it's a sanctioned hero.
3. All five states (§8); AI surfaces render the envelope.
4. Focus treatment (§10) on everything interactive; 44px floor; one `h1`, first.
5. Motion from `motion.ts` (§7); respects reduced motion.
6. Check all six themes in the switcher, both hero modes on light themes.
7. No new localStorage keys (the storage policy in CLAUDE.md stands).

## 15. Anti-pattern museum

Found live in the codebase by the audit; each is now a review flag:

- Three purples doing one glow job → one `glow` token.
- `.tracking-tight` silently switching typeface → display face by element/utility only.
- `#1c1c1f` — the token palette misremembered (3/255 off `surface-1`) → tokens or nothing.
- Native `title` tooltips → Tooltip primitive.
- A second badge vocabulary hand-rolled beside `StatusBadge` → one vocabulary.
- Four copy-pasted `bg-black/80` overlays → `overlay` token, one Dialog shell.
- `focus:outline-none` with no replacement → §10.
- A bare centered spinner as a loading state → skeletons shaped like content.
- Failure rendered as emptiness → branch on the error, always.

## 16. Amber is the time colour

Anticipation — a countdown, an airing you cannot act on yet — is the `warning-*` ramp, not
accent. This predates the token contract: `AnimeCard`'s countdowns and the Up Next deck's
`urgency` reason chip were already amber, and "On the Runway" (`AiringRunway`) inherits that
rather than inventing a fourth tone.

Amber here means *imminent*, never *wrong*. Status still spells itself out — `Ready`,
`one behind`, `Ep. 9 next` — so nothing rests on the hue (§3, §11).

Amber runs in both directions on the clock. Anticipation is one end; **expiry** is the
other. A Today's Drops card carries a freshness rail (`src/lib/freshness.ts`) that drains
across the 48-hour drop window: accent while the episode is under a day old, amber once it
is `Yesterday`, amber and pulsing for the last eight hours as `Leaves in Nh`. Same ramp,
same meaning — this surface is on a clock — so a card about to age out and a show about to
land read as the same kind of fact.

A corollary the audit would have caught: **no surface may hardcode "today"**. The drop
window is two days wide, so "aired today" was wrong about as often as it was right. A card
states its own age and lets the absolute timestamp say the rest.

The runway strip is **not** a hero surface. §12 lists three protected heroes and this is not
one: it borrows the `hero-drops-*` ground so it reads as the same family as the grid beneath
it, and takes nothing else. It is also the one surface that is allowed to look unlike the
rest of the app, because it exists for at most an hour a night and then unmounts itself.
