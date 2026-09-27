import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useId } from 'react';
import { PAGE_TIPS } from '../features/onboarding/tips';
import { DUR, EASE_STANDARD } from '../lib/motion';
import type { PageTipId } from '../lib/onboarding';
import { useUserData } from '../stores/userData';
import { Button } from './ui/Button';

/**
 * A one-time tip at the top of a page — the owner's "P2" card. It exists only
 * for someone who came through onboarding (`uiPrefs.onboarded`), so existing
 * users never meet it unless they replay the tour from Settings, and it stays
 * gone once "Got it" is pressed. A plain card, not a hero surface (§12).
 */
export function PageTip({ id }: { id: PageTipId }) {
  const visible = useUserData((s) => (s.uiPrefs.onboarded ?? false) && !(s.uiPrefs.seenTips ?? []).includes(id));
  const reduced = useReducedMotion() ?? false;
  const titleId = useId();
  const { icon: Icon, title, body } = PAGE_TIPS[id];

  const dismiss = () => {
    const { uiPrefs, setUiPrefs } = useUserData.getState();
    const seen = uiPrefs.seenTips ?? [];
    if (!seen.includes(id)) setUiPrefs({ seenTips: [...seen, id] });
  };

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.section
          key={id}
          aria-labelledby={titleId}
          initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: DUR.standard, ease: EASE_STANDARD }}
          className="overflow-hidden"
        >
          <div className="flex flex-col gap-4 rounded-card border border-edge bg-surface-1 p-4 shadow-e1 sm:flex-row sm:items-center sm:p-5">
            <div className="flex min-w-0 flex-1 items-start gap-4 sm:items-center">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-inner border border-accent-500/30 bg-accent-600/15">
                <Icon className="h-5 w-5 text-accent-400" aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-micro font-semibold uppercase tracking-[0.12em] text-accent-300">New here</span>
                <p id={titleId} className="font-semibold text-fg">
                  {title}
                </p>
                <p className="text-sm leading-relaxed text-fg-secondary">{body}</p>
              </div>
            </div>
            <Button variant="secondary" onClick={dismiss} className="shrink-0 self-end sm:self-center">
              Got it
            </Button>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
