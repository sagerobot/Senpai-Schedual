import { Bookmark, CalendarDays, LayoutGrid, Library, Sparkles, type LucideIcon } from 'lucide-react';
import type { PageTipId } from '../../lib/onboarding';

export interface PageTipCopy {
  icon: LucideIcon;
  title: string;
  body: string;
}

/**
 * The per-page half of the tutorial. Each line names what is actually on that
 * page (checked against the views); the drop window is "two days", never
 * "today" (design-language §16).
 */
export const PAGE_TIPS: Record<PageTipId, PageTipCopy> = {
  schedule: {
    icon: CalendarDays,
    title: 'How your schedule works',
    body: 'Your drops sit up top for two days after each episode airs. Tap a score to log one. Flip to Mine to see just your shows.',
  },
  season: {
    icon: LayoutGrid,
    title: 'Browsing the season',
    body: 'Every show this season. The bookmark adds a show to Watching; the poster opens its details.',
  },
  watching: {
    icon: Bookmark,
    title: 'How Watching works',
    body: "Up Next ranks what to watch now and says why. The Catch-up Queue below holds every episode you're behind on.",
  },
  library: {
    icon: Library,
    title: 'Your library',
    body: "Everything you track, by status. Stacking holds shows you're saving to binge; they come back when the season ends. Coming from MyAnimeList? Import it here.",
  },
  forYou: {
    icon: Sparkles,
    title: 'Where picks come from',
    body: "Picks come from the episodes and shows you rate. Dismiss one and it won't come back.",
  },
};
