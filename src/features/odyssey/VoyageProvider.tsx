import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { LocationSource } from '../location/source';
import type { OdysseyBackend } from './backend';

export interface VoyageContextValue {
  backend: OdysseyBackend;
  source: LocationSource;
  memberId: string;
}

const VoyageContext = createContext<VoyageContextValue | null>(null);

/**
 * Gives the voyage hooks their backend, location source and current member.
 * It does not create or stop any of them; whoever created them owns their lifecycle.
 */
export function VoyageProvider({ backend, source, memberId, children }: VoyageContextValue & { children: ReactNode }) {
  const value = useMemo(() => ({ backend, source, memberId }), [backend, source, memberId]);
  return <VoyageContext.Provider value={value}>{children}</VoyageContext.Provider>;
}

export function useVoyageContext(): VoyageContextValue {
  const value = useContext(VoyageContext);
  if (value === null) throw new Error('useVoyageContext must be used inside a <VoyageProvider>.');
  return value;
}
