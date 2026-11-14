import { useEffect, useState } from 'react';

import type { LatLng } from '../../lib/types';
import { useVoyageContext } from '../odyssey/VoyageProvider';
import type { LocationSource } from './source';

/** Live position from an explicit source. For code that runs before a VoyageProvider exists. */
export function useSourceLocation(source: LocationSource): LatLng | null {
  const [held, setHeld] = useState<{ source: LocationSource; pos: LatLng } | null>(null);
  useEffect(() => source.subscribe((pos) => setHeld({ source, pos })), [source]);
  // Until the new source emits, fall back to its own last position, never the previous source's.
  return held !== null && held.source === source ? held.pos : source.getLast();
}

/** Live position from the VoyageProvider's source. */
export function useLocation(): LatLng | null {
  return useSourceLocation(useVoyageContext().source);
}
