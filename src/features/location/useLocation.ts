import { useEffect, useState } from 'react';

import type { LatLng } from '../../lib/types';
import type { LocationSource } from './source';

/** Live position from a source (simulate mode today, real GPS later). */
export function useLocation(source: LocationSource): LatLng | null {
  const [pos, setPos] = useState<LatLng | null>(() => source.getLast());
  useEffect(() => source.subscribe(setPos), [source]);
  return pos;
}
