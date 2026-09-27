import { Bookmark, Check, Plus } from 'lucide-react';
import { useRef } from 'react';
import { useFitText } from '../../hooks/useFitText';
import { displayTitle } from '../../lib/displayTitle';
import { LIBRARY_STATUS_LABELS } from '../../lib/status';
import { cn } from '../../lib/utils';
import type { PickerShow } from '../../lib/onboarding';

const TITLE_MAX_PX = 13;
const TITLE_MIN_PX = 10;
const TITLE_LINE_HEIGHT = 1.25;
/** Two lines at rest, so a row of tiles keeps one baseline for the meta line. */
const TITLE_SLOT_PX = 2 * TITLE_LINE_HEIGHT * TITLE_MAX_PX;

interface ShowTileProps {
  show: PickerShow;
  picked: boolean;
  onToggle: () => void;
  /** Already formatted: "18 episodes out", "Starts Fri, Oct 2". */
  meta: string;
  /** Air dates are time copy, and time copy is amber (docs §16). */
  metaTone?: 'muted' | 'time';
}

/**
 * One poster in the onboarding picker — the owner's "T3" look: an Add bar
 * along the bottom of the cover that turns into a filled "Added" bar when
 * picked, so the state reads in words as well as colour. A show that is
 * already in the library is shown (it's part of the season) but inert.
 */
export function ShowTile({ show, picked, onToggle, meta, metaTone = 'muted' }: ShowTileProps) {
  const title = displayTitle(show.anime);
  const box = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const { fontSize, overflows } = useFitText(box, inner, title, TITLE_MIN_PX, TITLE_MAX_PX, TITLE_SLOT_PX);
  const owned = show.libraryStatus !== null;

  return (
    <button
      type="button"
      onClick={owned ? undefined : onToggle}
      aria-pressed={owned ? undefined : picked}
      aria-disabled={owned || undefined}
      className={cn(
        'group flex min-w-0 flex-col gap-2 rounded-inner text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-surface-1',
        owned && 'cursor-default',
      )}
    >
      <span
        className={cn(
          'relative block aspect-[3/4] w-full overflow-hidden rounded-inner bg-surface-2 ring-1 transition-shadow',
          picked ? 'ring-accent-500' : 'ring-edge',
        )}
      >
        <img
          src={show.anime.coverImage.large}
          alt=""
          loading="lazy"
          className={cn(
            'h-full w-full object-cover transition-transform duration-500',
            owned ? 'opacity-40 grayscale' : 'group-hover:scale-105',
          )}
        />
        {owned ? (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-scrim/80 px-2 py-1 text-caption font-semibold text-fg-inverse">
            <Bookmark className="h-3 w-3 fill-current" aria-hidden="true" />
            {LIBRARY_STATUS_LABELS[show.libraryStatus!]}
          </span>
        ) : (
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-x-0 bottom-0 flex h-[34px] items-center justify-center gap-1.5 text-caption font-semibold text-fg-inverse transition-colors',
              picked ? 'bg-accent-600' : 'bg-scrim/70 group-hover:bg-scrim/85',
            )}
          >
            {picked ? (
              <>
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                Added
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                Add
              </>
            )}
          </span>
        )}
      </span>
      <span
        ref={box}
        className={cn('block font-semibold', owned ? 'text-fg-muted' : 'text-fg')}
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: TITLE_LINE_HEIGHT,
          height: overflows ? undefined : `${TITLE_SLOT_PX}px`,
          minHeight: `${TITLE_SLOT_PX}px`,
        }}
      >
        {/* block, not inline: ResizeObserver ignores inline boxes. */}
        <span ref={inner} className="block">
          {title}
        </span>
      </span>
      <span
        className={cn(
          '-mt-1 text-caption font-medium sm:text-xs',
          owned ? 'text-fg-faint' : metaTone === 'time' ? 'text-warning-300' : 'text-fg-muted',
        )}
      >
        {owned ? 'In your library' : meta}
      </span>
    </button>
  );
}
