// Everything a screen under /odyssey/[id] needs, set up once: the signed-in
// member, the real backend, a location source (simulated or GPS) and the
// arrival watcher. Screens read it through the voyage hooks and useTravel().

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { offsetLatLng } from '../../lib/geo';
import { createGpsSource, type GpsSource, type GpsStartResult } from '../location/gpsSource';
import { createSimulateSource, type SimulateSource } from '../location/source';
import { useArrivalWatcher } from '../location/useArrival';
import { findMyMemberId } from './api';
import type { ClearStageResult } from './backend';
import { supabaseBackend } from './supabaseBackend';
import { useOdyssey } from './useOdyssey';
import { VoyageProvider } from './VoyageProvider';

export interface Travel {
  mode: 'simulate' | 'gps';
  /** Always available, so the demo can sail even while GPS is selected. */
  simulate: SimulateSource;
  /** Asks for permission and switches to real GPS if granted. */
  startGps: () => Promise<GpsStartResult>;
  stopGps: () => void;
  /** Most recent result from the arrival watcher or the manual button. */
  lastResult: ClearStageResult | null;
  report: (result: ClearStageResult) => void;
}

const TravelContext = createContext<Travel | null>(null);

export function useTravel(): Travel {
  const value = useContext(TravelContext);
  if (value === null) throw new Error('useTravel must be used inside an <OdysseySession>.');
  return value;
}

type Loaded =
  | { kind: 'ready'; odysseyId: string; memberId: string; simulate: SimulateSource }
  | { kind: 'not-member'; odysseyId: string }
  | { kind: 'error'; odysseyId: string };

/** Runs the watcher only while the voyage is under way, so the lobby never tries to clear stages. */
function ArrivalWatcher({ odysseyId, onResult }: { odysseyId: string; onResult: (r: ClearStageResult) => void }) {
  const odyssey = useOdyssey(odysseyId);
  return odyssey?.status === 'voyage' ? <ActiveWatcher odysseyId={odysseyId} onResult={onResult} /> : null;
}

function ActiveWatcher({ odysseyId, onResult }: { odysseyId: string; onResult: (r: ClearStageResult) => void }) {
  useArrivalWatcher(odysseyId, onResult);
  return null;
}

export interface OdysseySessionProps {
  odysseyId: string;
  children: ReactNode;
  /** Shown while loading, when the user is not in this crew, and when loading failed. */
  renderState: (state: 'loading' | 'not-member' | 'error', retry: () => void) => ReactNode;
}

export function OdysseySession({ odysseyId, children, renderState }: OdysseySessionProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [gps, setGps] = useState<GpsSource | null>(null);
  const [lastResult, setLastResult] = useState<ClearStageResult | null>(null);
  // A later "already cleared" for the same stage (the other path raced us) must not replace "cleared".
  const setResult = useCallback((next: ClearStageResult) => {
    setLastResult((prev) =>
      prev !== null && prev.status === 'cleared' && next.status === 'already_cleared' && prev.stage.id === next.stage.id ? prev : next,
    );
  }, []);

  useEffect(() => {
    let live = true;
    let simulate: SimulateSource | null = null;
    (async () => {
      const memberId = await findMyMemberId(odysseyId);
      if (memberId === null) {
        if (live) setLoaded({ kind: 'not-member', odysseyId });
        return;
      }
      // Simulated travel starts a few km short of the first island still to clear.
      const stages = await supabaseBackend.getVisibleStages(odysseyId);
      const first = stages.find((s) => s.cleared_at === null) ?? stages[0];
      simulate = createSimulateSource({
        start: first ? offsetLatLng(first, -3000, 0) : { lat: 0, lng: 0 },
        stepMs: 120,
        steps: 15,
      });
      if (live) setLoaded({ kind: 'ready', odysseyId, memberId, simulate });
      else simulate.stop();
    })().catch(() => {
      if (live) setLoaded({ kind: 'error', odysseyId });
    });
    return () => {
      live = false;
      simulate?.stop();
    };
  }, [odysseyId, attempt]);

  // Stop the GPS watch when it is replaced or the session unmounts.
  useEffect(() => () => gps?.stop(), [gps]);

  const startGps = useCallback(async (): Promise<GpsStartResult> => {
    const source = createGpsSource();
    const result = await source.start();
    if (result === 'granted') setGps(source);
    else source.stop();
    return result;
  }, []);
  const stopGps = useCallback(() => setGps(null), []);
  const retry = useCallback(() => {
    setLoaded(null);
    setAttempt((n) => n + 1);
  }, []);

  const ready = loaded !== null && loaded.kind === 'ready' && loaded.odysseyId === odysseyId ? loaded : null;
  const simulate = ready?.simulate ?? null;

  const travel = useMemo<Travel | null>(
    () =>
      simulate === null
        ? null
        : { mode: gps === null ? 'simulate' : 'gps', simulate, startGps, stopGps, lastResult, report: setResult },
    [simulate, gps, startGps, stopGps, lastResult, setResult],
  );

  if (ready === null || travel === null) {
    const state = loaded === null || loaded.odysseyId !== odysseyId ? 'loading' : loaded.kind === 'ready' ? 'loading' : loaded.kind;
    return <>{renderState(state, retry)}</>;
  }

  return (
    <VoyageProvider backend={supabaseBackend} source={gps ?? ready.simulate} memberId={ready.memberId}>
      <TravelContext.Provider value={travel}>
        <ArrivalWatcher odysseyId={odysseyId} onResult={setResult} />
        {children}
      </TravelContext.Provider>
    </VoyageProvider>
  );
}
