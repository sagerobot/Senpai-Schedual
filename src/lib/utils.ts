import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's stock font sizes, so without this it
 * files the app's own `text-micro` / `text-caption` / `text-label` (index.css
 * @theme) under *text color* — and a later `text-fg-muted` silently deletes
 * the size. Every cn('text-caption …', color) call in the app depends on this.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["micro", "caption", "label"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimeUntil(seconds: number): string {
  if (seconds < 0) return "Airing now!";
  
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

/**
 * The last hour, to the second — `47:12`, `0:30`. Sibling of formatTimeUntil
 * rather than a rewrite of it: that one bottoms out at "0h 47m", which is the
 * right shape for a card three days out and the wrong one for a countdown you
 * are watching land.
 */
export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * The same span said out loud, for screen readers. Minute resolution on
 * purpose: the visible clock ticks every second, and a label that changed
 * with it would be unusable.
 */
export function describeCountdown(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes === 0) return 'in less than a minute';
  return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
}
