import { Compass } from 'lucide-react';
import { Link } from 'react-router';

export function NotFound() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center space-y-4 text-center">
      <Compass className="h-12 w-12 text-fg-faint" />
      <h1 className="text-2xl font-bold text-fg">Page not found</h1>
      <p className="max-w-sm text-sm text-fg-faint">That link doesn&apos;t point anywhere in Senpai.</p>
      <Link
        to="/schedule"
        className="rounded-field bg-accent-600 px-4 py-2 text-sm font-medium text-fg-inverse transition-colors hover:bg-accent-500"
      >
        Back to Schedule
      </Link>
    </div>
  );
}
