import { Compass } from 'lucide-react';
import { Link } from 'react-router';

export function NotFound() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center space-y-4 text-center">
      <Compass className="h-12 w-12 text-gray-700" />
      <h1 className="text-2xl font-bold text-white">Page not found</h1>
      <p className="max-w-sm text-sm text-gray-500">That link doesn&apos;t point anywhere in Senpai.</p>
      <Link
        to="/schedule"
        className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500"
      >
        Back to Schedule
      </Link>
    </div>
  );
}
