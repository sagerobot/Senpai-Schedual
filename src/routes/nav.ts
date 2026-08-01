import { Bookmark, Calendar, LayoutGrid, Library, Search, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/**
 * The single nav list, consumed by both the desktop sidebar and the mobile
 * bottom bar. Labels are deliberately short — six long labels wrap and overflow
 * the mobile bar.
 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/schedule', label: 'Schedule', icon: Calendar },
  { to: '/season', label: 'Season', icon: LayoutGrid },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/watching', label: 'Watching', icon: Bookmark },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/for-you', label: 'For You', icon: Sparkles },
];
