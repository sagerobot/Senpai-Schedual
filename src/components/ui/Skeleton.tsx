import { cn } from '../../lib/utils';

/**
 * The Skeleton primitive (docs/design-language.md §8): loading states are
 * shaped like the content they become — never a bare spinner. Size it with
 * width/height classes at the call site.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-field bg-surface-2', className)} />;
}
