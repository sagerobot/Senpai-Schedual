import * as Dialog from '@radix-ui/react-dialog';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { DialogShell } from '../../components/ui/DialogShell';
import { DUR, EASE_STANDARD } from '../../lib/motion';
import {
  buildOnboardingPlan,
  onboardingSteps,
  pickerSections,
  type OnboardingStep,
  type PickerShow,
} from '../../lib/onboarding';
import { useCurrentSchedule } from '../../queries/hooks';
import { useUserData } from '../../stores/userData';
import { applyOnboardingPlan, revertOnboardingPlan, type AppliedPlan } from './applyPlan';
import { CatchUpStep } from './CatchUpStep';
import { closeOnboarding, useOnboarding } from './onboardingStore';
import { PickStep } from './PickStep';
import { TourStep, type TourArt } from './TourStep';
import { WelcomeStep } from './WelcomeStep';

/**
 * New-user onboarding: welcome → pick this season's shows → say where you're
 * up to on anything already airing → a three-slide tour. Mounted (lazily) by
 * RootLayout while `useOnboarding().open`; the entry point decides which steps
 * run (`onboardingSteps`).
 *
 * Nothing is written until the picks are confirmed, and then in one store
 * write; the Undo toast waits for the dialog to close, because a Radix modal
 * blocks pointer events on everything outside it — the toaster included.
 */
export default function OnboardingDialog() {
  const start = useOnboarding((s) => s.start);
  const setUiPrefs = useUserData((s) => s.setUiPrefs);
  const navigate = useNavigate();
  const location = useLocation();
  const reduced = useReducedMotion() ?? false;

  const [step, setStep] = useState<OnboardingStep>(start);
  const [picks, setPicks] = useState<Map<number, PickerShow>>(() => new Map());
  const [through, setThrough] = useState<Record<number, number>>({});
  const applied = useRef<AppliedPlan | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const pickList = useMemo(() => [...picks.values()], [picks]);
  const started = useMemo(() => pickList.filter((p) => p.aired > 0), [pickList]);
  const steps = onboardingSteps(start, started.length > 0);
  const index = Math.max(0, steps.indexOf(step));

  // The welcome collage and the tour art both come from the season on screen.
  const schedule = useCurrentSchedule();
  const scheduleList = schedule.data ?? schedule.partialData;
  const [nowSec] = useState(() => Math.floor(Date.now() / 1000));
  const topAiring = useMemo(
    () =>
      scheduleList
        ? pickerSections({ schedule: scheduleList, library: {}, nowSec })
            .find((s) => s.id === 'airing')!
            .shows.slice(0, 12)
        : [],
    [scheduleList, nowSec],
  );

  const tourArt: TourArt = useMemo(() => {
    const lead = started[0] ?? pickList[0] ?? topAiring[0];
    const demo = lead ? { anime: lead.anime, episode: Math.max(1, lead.aired) } : null;
    const extras = [...pickList, ...topAiring].map((p) => p.anime).filter((a) => a.id !== demo?.anime.id);
    return { demo, extras: [...new Map(extras.map((a) => [a.id, a])).values()].slice(0, 3) };
  }, [started, pickList, topAiring]);

  // Each step change moves focus to the new title; the first one is handled
  // by onOpenAutoFocus below.
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    titleRef.current?.focus();
  }, [step]);

  const toggle = (show: PickerShow) =>
    setPicks((prev) => {
      const next = new Map(prev);
      if (next.has(show.anime.id)) next.delete(show.anime.id);
      else next.set(show.anime.id, show);
      return next;
    });

  const apply = () => {
    if (applied.current) return;
    const { library, logs } = useUserData.getState();
    const plan = buildOnboardingPlan({
      picks: pickList.map((p) => ({ showId: p.anime.id, through: through[p.anime.id] ?? p.aired })),
      animeById: new Map(pickList.map((p) => [p.anime.id, p.anime])),
      library,
      logs,
      nowSec: Math.floor(Date.now() / 1000),
    });
    applied.current = applyOnboardingPlan(plan);
  };

  const unapply = () => {
    if (!applied.current) return;
    revertOnboardingPlan(applied.current);
    applied.current = null;
  };

  const finish = (then?: '/schedule' | '/library') => {
    setUiPrefs({ onboarded: true });
    closeOnboarding();
    const done = applied.current;
    if (done && done.showIds.length > 0) {
      const n = done.showIds.length;
      toast.success(`Added ${n} ${n === 1 ? 'show' : 'shows'} to Watching`, {
        action: { label: 'Undo', onClick: () => revertOnboardingPlan(done) },
      });
    }
    if (then && location.pathname !== then) navigate(then);
  };

  const forward = () => {
    const next = steps[index + 1];
    // The picks are confirmed the moment the flow moves past the last step
    // that edits them.
    if (step === 'pick' || step === 'catchUp') {
      if (next !== 'catchUp') apply();
    }
    if (next) setStep(next);
    else finish();
  };

  const back = () => {
    const prev = steps[index - 1];
    if (!prev) return;
    if (prev === 'pick' || prev === 'catchUp') unapply();
    setStep(prev);
  };

  const backOrNull = index > 0 ? back : null;
  const nextLabel = steps[index + 1] ? 'Next' : 'Done';

  return (
    <Dialog.Root open onOpenChange={(open) => !open && finish()}>
      <DialogShell
        maxWidth="max-w-5xl"
        panelClassName="h-[85vh]"
        contentProps={{
          onOpenAutoFocus: (e) => {
            e.preventDefault();
            titleRef.current?.focus();
          },
          // A stray click beside the dialog must not throw away picks.
          onInteractOutside: (e) => {
            if (picks.size > 0 && !applied.current) e.preventDefault();
          },
        }}
      >
        <motion.div
          key={step}
          initial={reduced ? { opacity: 0 } : { opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: DUR.standard, ease: EASE_STANDARD }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {step === 'welcome' && (
            <WelcomeStep
              titleRef={titleRef}
              covers={topAiring.map((p) => p.anime.coverImage.large)}
              onPick={forward}
              onImport={() => finish('/library')}
              onSkip={() => finish()}
            />
          )}
          {step === 'pick' && (
            <PickStep
              index={index}
              total={steps.length}
              titleRef={titleRef}
              picks={picks}
              onToggle={toggle}
              onBack={backOrNull}
              onNext={forward}
              nextLabel={nextLabel}
            />
          )}
          {step === 'catchUp' && (
            <CatchUpStep
              index={index}
              total={steps.length}
              titleRef={titleRef}
              shows={started}
              waiting={pickList.filter((p) => p.aired === 0)}
              through={through}
              onThrough={(showId, episode) => setThrough((t) => ({ ...t, [showId]: episode }))}
              onBack={back}
              onNext={forward}
              nextLabel={nextLabel}
            />
          )}
          {step === 'tour' && (
            <TourStep
              index={index}
              total={steps.length}
              titleRef={titleRef}
              art={tourArt}
              onBack={backOrNull}
              onSkip={() => finish()}
              onDone={() => finish('/schedule')}
            />
          )}
        </motion.div>
      </DialogShell>
    </Dialog.Root>
  );
}
