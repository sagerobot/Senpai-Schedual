import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

/**
 * The styled Select (docs/design-language.md §9). A native <select> under the
 * hood — keyboard and mobile semantics for free, popup colors handled by the
 * per-theme color-scheme — dressed in the token vocabulary with our chevron.
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <span className={cn('relative inline-block', className)}>
        <select
          ref={ref}
          className={cn(
            'h-11 w-full cursor-pointer appearance-none rounded-field border border-edge-strong bg-surface-3',
            'pl-3 pr-8 text-label font-medium text-fg-secondary transition-colors',
            'hover:border-accent-500 focus:outline-none focus:border-accent-500 focus-visible:ring-2 focus-visible:ring-ring/40',
          )}
          {...props}
        >
          {children}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-1.5 w-1.5 -translate-y-[70%] rotate-45 border-b-2 border-r-2 border-fg-muted"
        />
      </span>
    );
  },
);
