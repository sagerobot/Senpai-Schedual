import { Loader2 } from 'lucide-react';

/**
 * Rendered while the router resolves the first route's lazy module. Without it
 * a cold load paints an empty white page for as long as the chunk takes.
 */
export function HydrateFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-purple-500">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}
