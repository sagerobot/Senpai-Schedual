import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode, Ref } from 'react';
import { cn } from '../../lib/utils';

/** Where the viewer is in the flow: done steps dim, the current one stretches. */
export function StepDots({ index, total, className }: { index: number; total: number; className?: string }) {
  if (total < 2) return null;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 rounded-full transition-all',
              i === index ? 'w-5 bg-accent-500' : i < index ? 'w-1.5 bg-accent-700' : 'w-1.5 bg-edge-strong',
            )}
          />
        ))}
      </div>
      <span className="text-micro font-semibold uppercase tracking-[0.12em] text-fg-faint">
        Step {index + 1} of {total}
      </span>
    </div>
  );
}

/**
 * The top of a step: progress, the dialog's one title (an h2 — the view
 * beneath keeps its h1), and the description Radix wires to aria-describedby.
 * The title takes focus on every step change so a screen reader hears where
 * it landed.
 */
export function StepHeader({
  index,
  total,
  title,
  description,
  titleRef,
  aside,
}: {
  index: number;
  total: number;
  title: string;
  description: ReactNode;
  titleRef: Ref<HTMLHeadingElement>;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-edge-faint px-5 pb-4 pt-5 sm:px-8 sm:pb-5 sm:pt-7">
      <StepDots index={index} total={total} className="pr-12" />
      <div className="flex flex-col gap-3 pr-0 sm:flex-row sm:items-end sm:justify-between sm:gap-6 sm:pr-10">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Dialog.Title
            ref={titleRef}
            tabIndex={-1}
            className="text-xl font-bold tracking-tight text-fg focus:outline-none sm:text-2xl"
          >
            {title}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-fg-muted">{description}</Dialog.Description>
        </div>
        {aside}
      </div>
    </div>
  );
}

/** Sticky footer: context on the left, the step's actions on the right. */
export function StepFooter({ left, children }: { left?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-edge px-5 py-3 sm:px-8 sm:py-4">
      <div className="min-w-0">{left}</div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
