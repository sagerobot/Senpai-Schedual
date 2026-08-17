import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { DUR, EASE_STANDARD, LAYOUT_SWAP, PORTAL_X } from '../lib/motion';
import { cn } from '../lib/utils';

export interface SwapSlot {
  slotId: number;
  key: string;
}

/**
 * Cell keys registered to exit through the portal — slide off screen left —
 * instead of the quick fade. The exit variant resolves against this set when
 * the exit starts, which is how a cell whose exit style is only known at
 * removal time (its props are frozen by then) still picks the right one.
 * Keys are generation-unique, so entries never need removing.
 */
const PORTAL_EXITS = new Set<string>();

/**
 * Host grids call this when a cell is about to remount one row up (the wrap
 * during compaction): the old instance slides off screen left while its
 * replacement — mounted with `portalEnter` — rides in from the right, so the
 * card reads as passing through a portal instead of flying diagonally.
 */
export function portalExitCell(cellKey: string): void {
  PORTAL_EXITS.add(cellKey);
}

/**
 * Sticky slot assignment for a card grid that swaps in place: a key keeps its
 * slot across renders, a departing key hands its slot to an arriving one (the
 * in-place swap SwipeCell animates), leftover arrivals append, and unfilled
 * vacancies compact away. Depends only on (previous slots, keys) and is
 * idempotent, so StrictMode's double render is safe.
 */
export function useSwapSlots(keys: string[]): SwapSlot[] {
  const ref = useRef<{ slots: SwapSlot[]; nextId: number }>({ slots: [], nextId: 1 });
  const current = new Set(keys);
  const prev = ref.current.slots;
  const held = new Set(prev.map((s) => s.key));
  const arriving = keys.filter((k) => !held.has(k));
  let next = 0;
  const slots: SwapSlot[] = [];
  for (const slot of prev) {
    if (current.has(slot.key)) slots.push(slot);
    else if (next < arriving.length) slots.push({ slotId: slot.slotId, key: arriving[next++] });
  }
  for (; next < arriving.length; next++) slots.push({ slotId: ref.current.nextId++, key: arriving[next] });
  ref.current.slots = slots;
  return slots;
}

/**
 * One grid slot that swaps its occupant like a single-card gallery: the old
 * card slides out to the left while the replacement rides in from the right on
 * the same curve, both clipped to the slot — freeze mid-swap and the slot
 * shows half of each. The slot itself (keyed by slotId in the host grid's
 * AnimatePresence) only exits when nothing replaces its occupant; that exit is
 * a quick fade while neighbors close the gap.
 */
export function SwipeCell({
  occupantKey,
  cellKey,
  portalEnter = false,
  style,
  ref,
  children,
}: {
  occupantKey: string;
  /** This cell's React key again — the exit variant needs it to check PORTAL_EXITS. */
  cellKey?: string;
  /** Mount as a portal arrival: slide in from off screen right instead of the fade+scale. */
  portalEnter?: boolean;
  /** Explicit grid coordinates when the host grid places cells manually. */
  style?: CSSProperties;
  /** Attached by the host grid's AnimatePresence popLayout to measure exits. */
  ref?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  // The clip is gated on an active swap because overflow-hidden would shear
  // the cards' outer glow shadows if left on permanently.
  const [swapping, setSwapping] = useState(false);
  const prevKey = useRef(occupantKey);
  if (prevKey.current !== occupantKey) {
    prevKey.current = occupantKey;
    if (!swapping) setSwapping(true);
  }
  // While exiting under the host's popLayout the cell is position:absolute;
  // explicit gridColumn/gridRow must go with presence, or the grid area
  // becomes the containing block and the injected top/left land the cell at
  // double its offset.
  const isPresent = useIsPresent();
  return (
    <motion.div
      ref={ref}
      layout
      initial={portalEnter ? { x: '130%', opacity: 0, scale: 1 } : { opacity: 0, scale: 0.95 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      variants={{
        exit: () =>
          cellKey !== undefined && PORTAL_EXITS.has(cellKey)
            ? {
                x: '-130%',
                opacity: 0,
                transition: { x: PORTAL_X, opacity: { duration: DUR.portal, ease: 'easeIn' } },
              }
            : { opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } },
      }}
      exit="exit"
      // Tween for layout moves: the default layout spring overshoots the slot
      // and visibly bounces off the neighboring card.
      transition={{
        layout: LAYOUT_SWAP,
        opacity: { duration: DUR.standard, ease: 'easeOut' },
        scale: { duration: DUR.standard, ease: 'easeOut' },
        x: PORTAL_X,
      }}
      style={isPresent ? style : { zIndex: style?.zIndex }}
      // Always relative: the swap's exit measurement runs before a same-render
      // class change could establish the positioning context it needs.
      className={cn('relative h-full', swapping && 'overflow-hidden rounded-card')}
    >
      <AnimatePresence initial={false} mode="popLayout" onExitComplete={() => setSwapping(false)}>
        <motion.div
          key={occupantKey}
          className="h-full"
          initial={{ x: '108%' }}
          animate={{ x: 0 }}
          exit={{ x: '-108%' }}
          // Symmetric ease so the half-and-half push moment is readable, not
          // a front-loaded blink.
          transition={{ duration: DUR.portal, ease: EASE_STANDARD }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
