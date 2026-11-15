import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import { getMyVoyages } from './api';
import { totals, type Voyage } from './voyages';

export function useMyVoyages() {
  const [voyages, setVoyages] = useState<Voyage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const loaded = useRef(false);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    // Keep showing the list while refreshing after the first load.
    if (!loaded.current) setLoading(true);
    setError(null);
    try {
      const list = await getMyVoyages();
      if (mine !== seq.current) return;
      setVoyages(list);
      loaded.current = true;
    } catch (e) {
      if (mine !== seq.current) return;
      setError(e instanceof Error ? e.message : 'unknown');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
      return () => {
        seq.current++;
      };
    }, [reload]),
  );

  const summary = useMemo(() => totals(voyages), [voyages]);
  return { voyages, totalPoints: summary.points, summary, loading, error, reload };
}
