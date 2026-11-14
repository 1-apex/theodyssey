import { useEffect, useState } from 'react';

import type { LatLng } from '../../lib/types';
import { useVoyageContext } from '../odyssey/VoyageProvider';
import type { LocationSource } from './source';

/** Live position from an explicit source. For code that runs before a VoyageProvider exists. */
export function useSourceLocation(source: LocationSource): LatLng | null {
  const [pos, setPos] = useState<LatLng | null>(() => source.getLast());
  useEffect(() => source.subscribe(setPos), [source]);
  return pos;
}

/** Live position from the VoyageProvider's source. */
export function useLocation(): LatLng | null {
  return useSourceLocation(useVoyageContext().source);
}
