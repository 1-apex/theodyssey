import { useEffect, useState } from 'react';

import type { OdysseyBackend } from './backend';
import { type Loader, watchBackendValue } from './watchBackendValue';

interface Held<T> {
  backend: OdysseyBackend;
  odysseyId: string;
  value: T;
}

/**
 * Internal helper for the data hooks. Null until the first load, reloads on backend changes.
 * `load` must be a stable (module-level) function. A value loaded for a different backend or
 * Odyssey id is never returned.
 */
export function useBackendValue<T>(backend: OdysseyBackend, odysseyId: string, load: Loader<T>): T | null {
  const [held, setHeld] = useState<Held<T> | null>(null);
  useEffect(
    () => watchBackendValue(backend, odysseyId, load, (value) => setHeld({ backend, odysseyId, value })),
    [backend, odysseyId, load],
  );
  return held !== null && held.backend === backend && held.odysseyId === odysseyId ? held.value : null;
}
