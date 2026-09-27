import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, Check, Import, Sparkles } from 'lucide-react';
import type { Ref } from 'react';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn } from '../../lib/utils';

interface WelcomeStepProps {
  titleRef: Ref<HTMLHeadingElement>;
  /** Cover art for the collage, most talked-about first; empty while loading. */
  covers: string[];
  onPick: () => void;
  onImport: () => void;
  onSkip: () => void;
}

/** Collage columns, staggered so the wall reads as a wall and not a grid. */
const COLUMNS = [
  { offset: 'mt-0', take: [0, 3, 6, 9] },
  { offset: 'mt-[72px]', take: [1, 4, 7] },
  { offset: 'mt-6', take: [2, 5, 8, 10] },
];

/**
 * The first screen — the owner's "W2" look: the pitch on the left, this
 * season's own posters on the right, three ways out. Everything here is a
 * choice; nothing is written until the picker.
 */
export function WelcomeStep({ titleRef, covers, onPick, onImport, onSkip }: WelcomeStepProps) {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative z-10 flex w-full flex-col gap-6 overflow-y-auto px-6 pb-6 pt-8 sm:px-12 sm:pt-14 md:w-[540px] md:shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-field bg-accent-600">
            <Sparkles className="h-5 w-5 text-fg-inverse" aria-hidden="true" />
          </span>
          <span className="font-display text-xl font-bold tracking-tight text-fg">Senpai</span>
        </div>

        <div className="flex flex-col gap-3.5 md:mt-6">
          <span className="text-micro font-semibold uppercase tracking-[0.14em] text-accent-300">Welcome</span>
          <Dialog.Title
            ref={titleRef}
            tabIndex={-1}
            className="text-3xl font-bold leading-tight tracking-tight text-fg focus:outline-none sm:text-4xl"
          >
            Let's set up your season.
          </Dialog.Title>
          <Dialog.Description className="text-base leading-relaxed text-fg-secondary">
            Pick the shows you're watching. New episodes land on your schedule as they air, and Senpai keeps track
            of what you're behind on.
          </Dialog.Description>
        </div>

        <ul className="flex flex-col gap-2.5 text-sm text-fg-secondary">
          <li className="flex items-center gap-2.5">
            <Check className="h-4 w-4 shrink-0 text-success-400" aria-hidden="true" />
            Takes about a minute, mid-season or not
          </li>
          <li className="flex items-center gap-2.5">
            <Check className="h-4 w-4 shrink-0 text-success-400" aria-hidden="true" />
            Everything stays on this device, no account
          </li>
        </ul>

        <div className="mt-auto flex flex-col gap-2 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={onPick} className="px-6 shadow-glow">
              Pick my shows
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="secondary" onClick={onImport}>
              <Import className="h-4 w-4" aria-hidden="true" />
              Import from MAL
            </Button>
          </div>
          <Button variant="ghost" onClick={onSkip} className="self-start px-0 hover:bg-transparent">
            Skip for now
          </Button>
        </div>
      </div>

      <div className="relative hidden min-w-0 flex-1 overflow-hidden md:block" aria-hidden="true">
        <div className="absolute -top-10 left-2 flex gap-3.5">
          {COLUMNS.map((column, c) => (
            <div key={c} className={cn('flex w-[148px] flex-col gap-3.5', column.offset)}>
              {column.take.map((i) =>
                covers[i] ? (
                  <img
                    key={i}
                    src={covers[i]}
                    alt=""
                    className="aspect-[148/208] w-full rounded-inner object-cover shadow-e2"
                  />
                ) : (
                  <Skeleton key={i} className="aspect-[148/208] w-full rounded-inner" />
                ),
              )}
            </div>
          ))}
        </div>
        {/* The wall fades into the panel on the text side and at the edges, so
            the close button never sits on raw artwork. */}
        <div className="absolute inset-y-0 left-0 w-28 bg-linear-to-r from-surface-1 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-20 bg-linear-to-b from-surface-1 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-linear-to-t from-surface-1 to-transparent" />
      </div>
    </div>
  );
}
