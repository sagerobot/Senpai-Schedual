import { useId, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * The Tooltip primitive (docs/design-language.md §9). The native title
 * attribute is banned — OS-rendered, delayed, invisible on touch. This one
 * appears on hover AND keyboard focus, and the wrapped content stays in the
 * accessibility tree via aria-describedby.
 *
 * CSS-only positioning: centered above the target. For targets near the
 * viewport edge pass `align` to keep the bubble on-screen.
 */
export function Tooltip({
  label,
  children,
  align = 'center',
  className,
}: {
  label: string;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  const id = useId();
  return (
    <span className={cn('group/tip relative inline-flex', className)} aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute bottom-full z-50 mb-2 w-max max-w-56 rounded-field border border-edge-strong',
          'bg-surface-3 px-2.5 py-1.5 text-caption text-fg-secondary shadow-e2',
          'opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100',
          align === 'center' && 'left-1/2 -translate-x-1/2',
          align === 'start' && 'left-0',
          align === 'end' && 'right-0',
        )}
      >
        {label}
      </span>
    </span>
  );
}
