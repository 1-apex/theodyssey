// Plain-TypeScript core of the data hooks: load once, reload on every backend change,
// and drop results that are out of date. No React imports so it can be unit tested.

import type { Stage } from '../../lib/types';
import type { OdysseyBackend } from './backend';

export type Loader<T> = (backend: OdysseyBackend, odysseyId: string) => Promise<T>;

/**
 * Loads a value now and again whenever `backend.subscribe` fires. Only the newest request may deliver:
 * a slower, older load never overwrites a newer one, and nothing is delivered after the returned stop
 * function runs. A failed load keeps the previous value.
 */
export function watchBackendValue<T>(
  backend: OdysseyBackend,
  odysseyId: string,
  load: Loader<T>,
  onValue: (value: T) => void,
): () => void {
  let stopped = false;
  let latest = 0;
  const run = (): void => {
    latest += 1;
    const mine = latest;
    load(backend, odysseyId).then(
      (value) => {
        if (!stopped && mine === latest) onValue(value);
      },
      () => {},
    );
  };
  run();
  const unsubscribe = backend.subscribe(odysseyId, run);
  return () => {
    stopped = true;
    unsubscribe();
  };
}

/** Visible stages sorted by order. Always read through `getVisibleStages` so fog is respected. */
export async function loadVisibleStages(backend: OdysseyBackend, odysseyId: string): Promise<Stage[]> {
  const stages = await backend.getVisibleStages(odysseyId);
  return [...stages].sort((a, b) => a.order - b.order);
}
