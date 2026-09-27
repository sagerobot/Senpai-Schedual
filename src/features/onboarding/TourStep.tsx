import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, Check, ChevronLeft, Layers, Play, Sparkles } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { RatedStamp } from '../../components/RatedStamp';
import { RatingBlock } from '../../components/RatingBlock';
import { Button } from '../../components/ui/Button';
import { displayTitle } from '../../lib/displayTitle';
import { DUR, EASE_STANDARD } from '../../lib/motion';
import { cn } from '../../lib/utils';
import type { AnimeMedia } from '../../types';
import { StepDots, StepFooter } from './StepChrome';

/**
 * Checked against the components they describe: the drop window is two days
 * (never "today" — design-language §16), and For You is "starts learning",
 * never a promise, because it needs scored episodes and the AI can be resting.
 */
const SLIDES = [
  {
    title: "Today's Drops",
    body: "When a show you're watching airs, its card lands at the top of your schedule for two days. Tap a score to rate it and mark it watched, or choose Watched only. Not tonight? Skip it for the week.",
  },
  {
    title: 'Up Next',
    body: "Behind on something? Once your drops are clear, Up Next picks what to watch right now, and every card says why. Saving a show to binge? Set it to Stacking and it stays quiet until the season's done.",
  },
  {
    title: 'Everything else',
    body: 'Also Airing shows the rest of what aired in the last two days. Tap any show for episodes and where to stream it. Rate a few episodes and For You starts learning your taste.',
  },
] as const;

export interface TourArt {
  /** The demo card's show and the episode it asks about. */
  demo: { anime: AnimeMedia; episode: number } | null;
  /** A few more posters for the illustrations. */
  extras: AnimeMedia[];
}

interface TourStepProps {
  index: number;
  total: number;
  titleRef: RefObject<HTMLHeadingElement | null>;
  art: TourArt;
  /** Back out of the tour into the step before it; null when the tour is the whole flow. */
  onBack: (() => void) | null;
  onSkip: () => void;
  onDone: () => void;
}

export function TourStep({ index, total, titleRef, art, onBack, onSkip, onDone }: TourStepProps) {
  const [slide, setSlide] = useState(0);
  const [practiced, setPracticed] = useState(false);
  const reduced = useReducedMotion() ?? false;
  const last = slide === SLIDES.length - 1;
  const { title, body } = SLIDES[slide];

  // The step change already focused the title; each new slide does the same.
  const firstSlide = useRef(true);
  useEffect(() => {
    if (firstSlide.current) {
      firstSlide.current = false;
      return;
    }
    titleRef.current?.focus();
  }, [slide, titleRef]);

  return (
    <>
      <motion.div
        key={slide}
        initial={reduced ? { opacity: 0 } : { opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: DUR.standard, ease: EASE_STANDARD }}
        className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden"
      >
        {/* pt-16 on phones: the art stacks on top, under the dialog's close button. */}
        <div className="flex shrink-0 items-center justify-center border-b border-edge bg-surface-2 px-5 pb-6 pt-16 md:w-[440px] md:border-b-0 md:border-r md:py-6 lg:w-[470px]">
          {slide === 0 && <DemoDropCard demo={art.demo} onPracticed={() => setPracticed(true)} />}
          {slide === 1 && <UpNextArt anime={art.extras[0] ?? art.demo?.anime ?? null} />}
          {slide === 2 && <EverythingElseArt shows={art.extras} />}
        </div>

        <div className="flex flex-1 flex-col justify-center gap-4 px-6 py-6 sm:px-12 md:py-10">
          <StepDots index={index} total={total} className="mb-2" />
          <span className="text-micro font-semibold uppercase tracking-[0.14em] text-accent-300">
            Quick tour · {slide + 1} of {SLIDES.length}
          </span>
          <Dialog.Title
            ref={titleRef}
            tabIndex={-1}
            className="text-2xl font-bold tracking-tight text-fg focus:outline-none sm:text-3xl"
          >
            {title}
          </Dialog.Title>
          <Dialog.Description className="text-base leading-relaxed text-fg-secondary">{body}</Dialog.Description>
          {slide === 0 &&
            (practiced ? (
              <p className="flex items-center gap-2.5 self-start text-sm font-semibold text-success-300">
                <Check className="h-4 w-4" aria-hidden="true" />
                That's the whole habit: watch, then rate.
              </p>
            ) : (
              <p className="flex items-center gap-2.5 self-start rounded-inner border border-accent-500/30 bg-accent-600/10 px-3.5 py-2.5 text-sm font-semibold text-accent-300">
                <ChevronLeft className="hidden h-4 w-4 md:block" aria-hidden="true" />
                Try it: tap a score on the card
              </p>
            ))}
        </div>
      </motion.div>

      <StepFooter
        left={
          <>
            <span className="flex items-center gap-1.5" aria-hidden="true">
              {SLIDES.map((_, i) => (
                <span
                  key={i}
                  className={cn('h-1.5 rounded-full transition-all', i === slide ? 'w-5 bg-accent-500' : 'w-1.5 bg-edge-strong')}
                />
              ))}
            </span>
            <span className="sr-only">
              Slide {slide + 1} of {SLIDES.length}
            </span>
          </>
        }
      >
        {!last && (
          <Button variant="ghost" onClick={onSkip} className="hidden sm:inline-flex">
            Skip tour
          </Button>
        )}
        {(slide > 0 || onBack) && (
          <Button variant="ghost" onClick={() => (slide > 0 ? setSlide(slide - 1) : onBack?.())}>
            Back
          </Button>
        )}
        <Button variant="primary" onClick={() => (last ? onDone() : setSlide(slide + 1))}>
          {last ? 'Go to my schedule' : 'Next'}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </StepFooter>
    </>
  );
}

/**
 * The owner's "S3": a real drop card's rating row on a sample card, so the
 * one gesture the app runs on is learned by doing it. The stamp is the real
 * RatedStamp; nothing is logged — the card says so.
 */
function DemoDropCard({ demo, onPracticed }: { demo: TourArt['demo']; onPracticed: () => void }) {
  const [stamping, setStamping] = useState(false);
  const [rated, setRated] = useState<number | null | undefined>(undefined);
  const episode = demo?.episode ?? 1;
  const image = demo ? (demo.anime.bannerImage ?? demo.anime.coverImage.extraLarge ?? demo.anime.coverImage.large) : null;
  const title = demo ? displayTitle(demo.anime) : 'A show you’re watching';
  const settled = rated !== undefined && !stamping;

  return (
    <div className="relative w-full max-w-[340px] overflow-hidden rounded-card border border-hero-drops-edge bg-hero-drops-bg shadow-e3">
      <div className="relative h-28 overflow-hidden">
        {image ? (
          <img src={image} alt="" className="h-full w-full object-cover object-[center_25%]" />
        ) : (
          <div className="h-full w-full bg-hero-drops-accent-well" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-hero-drops-bg to-transparent" />
        <span className="absolute left-2.5 top-2.5 rounded-full bg-accent-600 px-2 py-0.5 text-micro font-bold uppercase tracking-[0.08em] text-fg-inverse">
          Sample card
        </span>
      </div>
      <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
        <p className="font-display text-base font-bold leading-tight text-hero-text-hi">{title}</p>
        <div className="flex justify-end">
          <span className="rounded-full border border-hero-drops-edge bg-hero-drops-well px-2.5 py-1 text-caption font-semibold text-hero-text-mid">
            Ep {episode}
            {demo?.anime.episodes ? ` of ${demo.anime.episodes}` : ''}
          </span>
        </div>
        <RatingBlock
          episode={episode}
          onRate={(score) => {
            setRated(score);
            setStamping(true);
          }}
          hint="Nothing is saved — this one's just practice"
        />
      </div>

      {stamping && rated !== undefined && (
        <RatedStamp
          score={rated}
          episode={episode}
          caption="Practice run — nothing saved"
          onDone={() => {
            setStamping(false);
            onPracticed();
          }}
        />
      )}
      {settled && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-hero-drops-bg/95 p-6 text-center">
          <span className="flex h-16 w-16 rotate-[-6deg] items-center justify-center rounded-[20px] bg-accent-600 font-display text-3xl font-bold text-fg-inverse shadow-glow-lg">
            {rated === null ? <Check className="h-8 w-8" strokeWidth={3} aria-hidden="true" /> : rated}
          </span>
          <p className="font-display text-lg font-bold text-hero-text-hi">That's all it takes.</p>
          <p className="text-caption text-hero-text-mid">On a real card, that would log Episode {episode}.</p>
          <Button variant="ghost" size="md" onClick={() => setRated(undefined)} className="text-accent-300">
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

/** A deck card that explains itself, and the Stacking status beside it. */
function UpNextArt({ anime }: { anime: AnimeMedia | null }) {
  return (
    <div className="flex w-full max-w-[320px] flex-col gap-3" aria-hidden="true">
      <div className="overflow-hidden rounded-card border border-hero-drops-edge bg-hero-drops-bg shadow-e3">
        <div className="relative h-24">
          {anime ? (
            <img
              src={anime.bannerImage ?? anime.coverImage.large}
              alt=""
              className="h-full w-full object-cover object-[center_25%]"
            />
          ) : (
            <div className="h-full w-full bg-hero-drops-accent-well" />
          )}
          <div className="absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-hero-drops-bg to-transparent" />
        </div>
        <div className="flex flex-col gap-2.5 px-4 pb-4 pt-1">
          <p className="font-display text-sm font-bold leading-tight text-hero-text-hi">
            {anime ? displayTitle(anime) : 'A show you’re behind on'}
          </p>
          <span className="self-start rounded-full border border-accent-500/30 bg-hero-drops-accent-well px-2.5 py-1 text-caption font-semibold text-accent-300">
            3 episodes waiting
          </span>
          <span className="flex h-9 items-center justify-center gap-2 rounded-control bg-accent-600 text-label font-semibold text-fg-inverse">
            <Play className="h-3.5 w-3.5 fill-current" />
            Watch Episode 4
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2.5 rounded-inner border border-edge bg-surface-1 px-3.5 py-2.5">
        <Layers className="h-4 w-4 shrink-0 text-accent-400" />
        <span className="text-label text-fg-secondary">
          <span className="font-semibold text-fg">Stacking</span> · back when the season ends
        </span>
      </div>
    </div>
  );
}

/** Also Airing's row and For You, as a glance. */
function EverythingElseArt({ shows }: { shows: AnimeMedia[] }) {
  const posters = shows.slice(0, 3);
  return (
    <div className="flex w-full max-w-[340px] flex-col gap-4" aria-hidden="true">
      <div className="grid grid-cols-3 gap-2.5">
        {[0, 1, 2].map((i) =>
          posters[i] ? (
            <img
              key={i}
              src={posters[i].coverImage.large}
              alt=""
              className={cn('aspect-[3/4] w-full rounded-inner object-cover shadow-e2', i === 2 && 'opacity-60 grayscale')}
            />
          ) : (
            <div key={i} className="aspect-[3/4] w-full rounded-inner bg-surface-3" />
          ),
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="flex items-center gap-1.5 rounded-full border border-edge bg-surface-1 px-3 py-1.5 text-caption font-semibold text-fg-secondary">
          <Play className="h-3 w-3 text-accent-400" />
          Also Airing
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-edge bg-surface-1 px-3 py-1.5 text-caption font-semibold text-fg-secondary">
          <Sparkles className="h-3 w-3 text-accent-400" />
          For You
        </span>
      </div>
    </div>
  );
}
