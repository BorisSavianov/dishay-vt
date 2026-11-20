'use client';

import { backdropPoster, type NavId } from '@/lib/look';
import { useTheme } from './useTheme';

// The story's sky behind every platform page: a dusk (or daylight) gradient and, on most pages, one blurred chapter
// still. Fixed and decorative; it never takes clicks.
export function Backdrop({ active }: { active: NavId }) {
  const theme = useTheme();
  const poster = backdropPoster(active, theme);
  return (
    <div className="backdrop" aria-hidden="true">
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={poster} src={poster} alt="" decoding="async" fetchPriority="low" />
      )}
    </div>
  );
}
