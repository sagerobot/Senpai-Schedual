import { ChevronDown, ChevronUp } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useId, useState } from 'react';
import { cn } from '../lib/utils';

const LOW_SCORES = [4, 3, 2, 1, 0];

/** Snappy pop for each button; low mass so the stagger reads as one gesture. */
const spring = { type: 'spring', stiffness: 600, damping: 32, mass: 0.7 } as const;

export interface LowScoreButtonsProps {
  /** The episode the scores apply to; only used for the accessible names. */
  episode: number;
  onSelect: (score: number) => void;
  triggerClassName?: string;
  /** Styles each small score button when expanded. */
  buttonClassName?: string;
}

/**
 * The "0-4" escape hatch that sits beside a quick 5-10 rating row.
 *
 * Both rich card designs put six large buttons where they matter and tuck the
 * bottom half of the scale behind this. Tapping "0-4" unfolds it IN PLACE into
 * five small buttons that cascade out with a staggered spring (no floating
 * menu — nothing to clip, nothing to dismiss); picking a score logs it and the
 * row ripples back down to the pill. Parents should allow flex-wrap so the
 * expanded row can break to its own line in narrow cards.
 */
export function LowScoreButtons({ episode, onSelect, triggerClassName, buttonClassName }: LowScoreButtonsProps) {
  const [open, setOpen] = useState(false);
  const groupId = useId();

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {!open ? (
        <motion.button
          key="trigger"
          type="button"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1, transition: { ...spring, delay: 0.06 } }}
          exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.1 } }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          aria-expanded={false}
          aria-controls={groupId}
          aria-label={`Show scores 0 to 4 for episode ${episode}`}
          className={cn('relative flex items-center justify-center gap-1 transition-colors', triggerClassName)}
        >
          0-4 <ChevronDown className="w-3 h-3" aria-hidden="true" />
        </motion.button>
      ) : (
        <motion.div
          key="group"
          id={groupId}
          role="group"
          aria-label={`Scores 0 to 4 for episode ${episode}`}
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
        >
          {LOW_SCORES.map((score, i) => (
            <motion.button
              key={score}
              type="button"
              initial={{ opacity: 0, scale: 0.3, x: -10 }}
              animate={{ opacity: 1, scale: 1, x: 0, transition: { ...spring, delay: i * 0.04 } }}
              exit={{
                opacity: 0,
                scale: 0.3,
                transition: { duration: 0.12, delay: (LOW_SCORES.length - i) * 0.025 },
              }}
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.85 }}
              onClick={() => {
                onSelect(score);
                setOpen(false);
              }}
              aria-label={`Rate episode ${episode} a ${score} and mark watched`}
              className={cn(
                "relative flex items-center justify-center after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']",
                buttonClassName,
              )}
            >
              {score}
            </motion.button>
          ))}
          <motion.button
            key="collapse"
            type="button"
            initial={{ opacity: 0, scale: 0.3, x: -10 }}
            animate={{ opacity: 1, scale: 1, x: 0, transition: { ...spring, delay: LOW_SCORES.length * 0.04 } }}
            exit={{ opacity: 0, scale: 0.3, transition: { duration: 0.1 } }}
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.85 }}
            onClick={() => setOpen(false)}
            aria-expanded={true}
            aria-controls={groupId}
            aria-label="Hide the 0 to 4 scores"
            className={cn(
              "relative flex items-center justify-center after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']",
              buttonClassName,
            )}
          >
            <ChevronUp className="w-3 h-3" aria-hidden="true" />
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
