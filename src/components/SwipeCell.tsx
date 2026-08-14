import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { cn } from '../lib/utils';

export interface SwapSlot {
  slotId: number;
  key: string;
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
  style,
  ref,
  children,
}: {
  occupantKey: string;
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
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } }}
      // Tween for layout moves: the default layout spring overshoots the slot
      // and visibly bounces off the neighboring card.
      transition={{
        layout: { duration: 0.32, ease: [0.32, 0.72, 0.28, 1] },
        opacity: { duration: 0.3, ease: 'easeOut' },
        scale: { duration: 0.3, ease: 'easeOut' },
      }}
      style={isPresent ? style : { zIndex: style?.zIndex }}
      // Always relative: the swap's exit measurement runs before a same-render
      // class change could establish the positioning context it needs.
      className={cn('relative h-full', swapping && 'overflow-hidden rounded-2xl')}
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
          transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
