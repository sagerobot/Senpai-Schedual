import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

/**
 * The one Button (docs/design-language.md §9). Variants map to the token
 * vocabulary; every size clears the 44px floor except the explicitly small
 * in-card tiers. Focus is always visible (§10).
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'lg' | 'md' | 'sm';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent-600 text-fg-inverse hover:bg-accent-500 font-semibold',
  secondary: 'border border-edge-strong bg-surface-3 text-fg-secondary hover:border-accent-500 hover:text-fg font-medium',
  ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg-secondary font-medium',
  danger:
    'border border-danger-500/40 bg-danger-600/10 text-danger-300 hover:bg-danger-600/20 font-semibold',
};

const SIZES: Record<Size, string> = {
  lg: 'h-11 px-4 text-sm rounded-control',
  md: 'h-9 px-3.5 text-label rounded-control',
  sm: 'h-7 px-2.5 text-caption rounded-field',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'lg', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
