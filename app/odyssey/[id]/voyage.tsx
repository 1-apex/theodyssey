// The voyage: the treasure map, the next stage, and the ways to arrive.

import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TreasureMap } from '@/components/TreasureMap';
import { Bar, Button, Notice, Shell, T, s } from '@/components/ui';
import { formatMiles } from '@/features/location/distance';
import { currentTarget, distanceToTargetM } from '@/features/location/geofence';
import { useManualArrival } from '@/features/location/useArrival';
import { useLocation } from '@/features/location/useLocation';
import type { ClearStageResult } from '@/features/odyssey/backend';
import { useTravel } from '@/features/odyssey/OdysseySession';
import { useOdyssey } from '@/features/odyssey/useOdyssey';
import { useStageCount } from '@/features/odyssey/useStageCount';
import { useVisibleStages } from '@/features/odyssey/useVisibleStages';
import { usePoints } from '@/features/points/usePoints';
import { useReducedMotion } from '@/features/storyteller/useReducedMotion';
import { StageSheet } from '@/features/voyageMap/StageSheet';
import { VoyageProgress } from '@/features/voyageMap/VoyageProgress';
import { haversineM } from '@/lib/geo';
import { shortPlaceName } from '@/features/odyssey/placeNames';
import { app, c, map } from '@/theme/copy';
import { fonts } from '@/theme/typography';

function describe(result: ClearStageResult): string {
  if (result.status === 'cleared') return app.cleared(shortPlaceName(result.stage.name), result.stage.points);
  if (result.status === 'already_cleared') return app.alreadyCleared(shortPlaceName(result.stage.name));
  return app.rejected[result.reason];
}

export default function Voyage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const odyssey = useOdyssey(id);
  const stages = useVisibleStages(id);
  const total = useStageCount(id);
  const points = usePoints(id);
  const position = useLocation();
  const travel = useTravel();
  const arrive = useManualArrival(id);
  const [busy, setBusy] = useState<'sailing' | 'arriving' | null>(null);
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const reducedMotion = useReducedMotion();

  if (odyssey === null || stages === null || total === null || points === null) return <Notice loading text={app.loading} />;
  if (odyssey.status === 'lobby') return <Redirect href={{ pathname: '/odyssey/[id]/lobby', params: { id } }} />;

  const complete = odyssey.status === 'complete';
  const target = complete ? null : currentTarget(stages);
  const cleared = stages.filter((stage) => stage.cleared_at !== null).length;
  const distanceM = position !== null && target !== null ? distanceToTargetM(position, stages) : null;

  const sail = async () => {
    if (target === null) return;
    setNotice('');
    setBusy('sailing');
    // The arrival watcher clears the stage when the simulated position enters its radius.
    await travel.simulate.sailTo(target);
    setBusy(null);
  };

  const arriveManually = async () => {
    if (target === null) return;
    setNotice('');
    setBusy('arriving');
    try {
      travel.report(await arrive(target.id));
    } catch {
      setNotice(app.errors.network);
    } finally {
      setBusy(null);
    }
  };

  const toggleGps = async () => {
    setNotice('');
    if (travel.mode === 'gps') {
      travel.stopGps();
      return;
    }
    const result = await travel.startGps();
    if (result === 'denied') setNotice(app.gpsDenied);
    else if (result === 'error') setNotice(app.gpsError);
  };

  // A clear message is only about the stage most recently cleared; once the crew has moved on it goes.
  const latestCleared = stages.reduce((max, stage) => (stage.cleared_at !== null ? Math.max(max, stage.order) : max), 0);
  const last = travel.lastResult;
  const lastIsStale = last !== null && last.status !== 'rejected' && last.stage.order < latestCleared;
  const message = notice || (last !== null && !lastIsStale ? describe(last) : '');

  const fog = odyssey.visibility_mode === 'fog';
  const routeEnd = fog && !complete ? map.hiddenInFog : odyssey.destination_name;
  const sheetStage = selected === null ? null : (stages.find((stage) => stage.order === selected) ?? null);
  const sheetState = sheetStage === null ? 'ahead' : sheetStage.cleared_at !== null ? 'cleared' : sheetStage.id === target?.id ? 'current' : 'ahead';
  const sheetDistanceM = position !== null && sheetStage !== null ? Math.max(0, haversineM(position, sheetStage) - sheetStage.radius_m) : null;

  return (
    <Shell>
      <Bar title={odyssey.title} onBack={() => router.replace('/')} />
      <T style={st.route}>{map.route(odyssey.start_name, routeEnd)}</T>
      <View style={s.stats}>
        <T style={st.statsText}>{complete ? c.voyageComplete : app.stageOf(Math.min(cleared + 1, total), total)}</T>
        <T style={st.statsText}>{app.drachma(points.myTotal)}</T>
      </View>
      <VoyageProgress cleared={cleared} total={total} reducedMotion={reducedMotion} />
      <TreasureMap
        total={total}
        stages={stages}
        harbour={odyssey.start_name}
        targetOrder={target?.order ?? null}
        travelling={busy === 'sailing'}
        onSelectStop={setSelected}
      />
      {!!message && <T accessibilityLabel="voyage-message" style={[s.arrivalHint, { color: '#ffcf91' }]}>{message}</T>}

      {target !== null && (
        <Pressable accessibilityRole="button" accessibilityHint={map.nextHint} onPress={() => setSelected(target.order)} style={st.next}>
          <T style={st.nextText}>{map.next(shortPlaceName(target.name), distanceM !== null ? formatMiles(distanceM) : null)}</T>
        </Pressable>
      )}

      <View style={s.space}>
        {complete ? (
          <Button title={c.enterIthaca} onPress={() => router.replace({ pathname: '/odyssey/[id]/ithaca', params: { id } })} />
        ) : (
          <>
            {travel.mode === 'simulate' ? (
              <Button title={busy === 'sailing' ? app.sailing : c.simulate} onPress={() => void sail()} disabled={busy !== null} />
            ) : (
              <T style={s.arrivalHint}>{app.gpsHint}</T>
            )}
            <Button
              title={busy === 'arriving' ? app.arriving : c.manual}
              onPress={() => void arriveManually()}
              disabled={busy !== null}
              secondary
            />
            <Pressable accessibilityRole="button" onPress={() => void toggleGps()} style={s.demo}>
              <T style={s.demoText}>
                {travel.mode === 'gps' ? `${app.travelGps} · ${app.switchToSimulated}` : `${app.travelSimulated} · ${app.switchToGps}`}
              </T>
            </Pressable>
          </>
        )}
      </View>
      <StageSheet
        stage={sheetStage}
        state={sheetState}
        total={total}
        distanceM={sheetDistanceM}
        reducedMotion={reducedMotion}
        onClose={() => setSelected(null)}
      />
    </Shell>
  );
}

const st = StyleSheet.create({
  route: { fontSize: 14, lineHeight: 20, color: '#c1e6ed', marginTop: -6, marginBottom: 12 },
  statsText: { fontFamily: fonts.numeral, fontSize: 17, lineHeight: 22, letterSpacing: 0.5, color: '#dfc48b' },
  next: { borderWidth: 2, borderColor: '#b17000', backgroundColor: '#021630', paddingVertical: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', marginBottom: 4 },
  nextText: { fontFamily: fonts.numeral, fontSize: 18, lineHeight: 24, color: '#f0bb3b' },
});
