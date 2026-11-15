// The voyage: pixel map, the island being sailed for, and the two ways to arrive.

import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { DestinationMapsButton } from '@/components/DestinationMapsButton';
import { VoyageMap } from '@/components/PixelScene';
import { Bar, Button, Notice, Shell, T, s } from '@/components/ui';
import { currentTarget, distanceToTargetM } from '@/features/location/geofence';
import { openInMaps } from '@/features/location/openInMaps';
import { useManualArrival } from '@/features/location/useArrival';
import { useLocation } from '@/features/location/useLocation';
import type { ClearStageResult } from '@/features/odyssey/backend';
import { useTravel } from '@/features/odyssey/OdysseySession';
import { useOdyssey } from '@/features/odyssey/useOdyssey';
import { useStageCount } from '@/features/odyssey/useStageCount';
import { useVisibleStages } from '@/features/odyssey/useVisibleStages';
import { usePoints } from '@/features/points/usePoints';
import { app, c } from '@/theme/copy';

function describe(result: ClearStageResult): string {
  if (result.status === 'cleared') return app.cleared(result.stage.title, result.stage.points);
  if (result.status === 'already_cleared') return app.alreadyCleared(result.stage.title);
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

  return (
    <Shell>
      <Bar title={odyssey.title} onBack={() => router.replace('/')} />
      <View style={s.stats}>
        <T style={s.statsText}>{complete ? c.voyageComplete : app.stageOf(Math.min(cleared + 1, total), total)}</T>
        <T style={s.statsText}>{app.drachma(points.myTotal)}</T>
      </View>
      <View style={s.progress}>
        <View style={[s.progressFill, { width: `${(cleared / total) * 100}%` }]} />
      </View>
      <VoyageMap
        total={total}
        stages={stages.map((stage) => ({ order: stage.order, title: stage.title, cleared: stage.cleared_at !== null }))}
        currentOrder={odyssey.current_stage_order}
        shipAt={cleared}
        harbor={odyssey.start_name}
      />
      <T style={s.arrivalHint}>{c.arrivalHint}</T>
      {!!message && <T accessibilityLabel="voyage-message" style={[s.arrivalHint, { color: '#ffcf91' }]}>{message}</T>}

      {target !== null && (
        <View style={s.stageRow}>
          <View style={{ flex: 1 }}>
            <T style={s.stageNumber}>{app.currentStage(target.order)}</T>
            <View style={s.destinationRow}>
              <View style={{ flex: 1 }}>
                <T style={s.stageName}>{target.title}</T>
                <T style={s.stageDescription}>{target.name}</T>
              </View>
              <DestinationMapsButton onPress={() => openInMaps(target)} />
            </View>
            <T style={s.stageDescription}>{target.lore}</T>
            {distanceM !== null && <T style={s.reward}>{app.distance((distanceM / 1000).toFixed(1))}</T>}
          </View>
        </View>
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
    </Shell>
  );
}
