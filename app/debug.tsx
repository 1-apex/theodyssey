// Dev C's test screen: runs the whole voyage loop against the mock backend in
// simulate mode. Not part of the real UI; delete once the voyage screen exists.

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { currentTarget, distanceToTargetM } from '@/features/location/geofence';
import { createGpsSource, type GpsStartResult, type GpsSource } from '@/features/location/gpsSource';
import { createSimulateSource, type LocationSource, type SimulateSource } from '@/features/location/source';
import { useLocation } from '@/features/location/useLocation';
import { startArrivalWatcher } from '@/features/location/watcher';
import type { ClearStageResult, OdysseyBackend } from '@/features/odyssey/backend';
import { createMockBackend } from '@/features/odyssey/mockBackend';
import { useVoyage } from '@/features/odyssey/useVoyage';
import { totalsByMember } from '@/features/points/totals';
import { offsetLatLng } from '@/lib/geo';
import { mockMembers, mockOdyssey, mockStages, mockStart } from '@/lib/mock';
import type { LatLng, PointsMode, Stage, VisibilityMode } from '@/lib/types';
import { colors } from '@/theme/colors';
import { copy } from '@/theme/copy';

const t = copy.debug;
const ME = mockMembers[0].id;

function describe(result: ClearStageResult, pointsMode: PointsMode): string {
  if (result.status === 'cleared') {
    return pointsMode === 'arriver'
      ? t.clearedArriver(result.stage.name, result.stage.points, mockMembers[0].nickname)
      : t.cleared(result.stage.name, result.stage.points);
  }
  if (result.status === 'already_cleared') return t.alreadyCleared(result.stage.name);
  return t.rejected(result.reason);
}

function Button({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.button, disabled && styles.buttonDisabled]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

/** Plant buttons stay disabled until the fix is at least this accurate. */
const MAX_PLANT_ACCURACY_M = 20;

type RunKind = VisibilityMode | 'gps';
type Direction = 'north' | 'east' | 'south' | 'west';

const DIRECTIONS: { id: Direction; label: string; unit: [number, number] }[] = [
  { id: 'north', label: t.plantNorth, unit: [1, 0] },
  { id: 'east', label: t.plantEast, unit: [0, 1] },
  { id: 'south', label: t.plantSouth, unit: [-1, 0] },
  { id: 'west', label: t.plantWest, unit: [0, -1] },
];

/** Three test stages (here, 80 m away, 160 m away) heading in one direction. Ithaca is the last. */
function plantStages(from: LatLng, [n, e]: [number, number]): Stage[] {
  return [0, 1, 2].map((i) => {
    const at = offsetLatLng(from, n * 80 * i, e * 80 * i);
    return {
      ...mockStages[i],
      ...t.testIsles[i],
      points: i === 2 ? 300 : 100,
      lat: at.lat,
      lng: at.lng,
      radius_m: 30,
    };
  });
}

interface GpsInfo {
  source: GpsSource;
}

/** The voyage UI for one backend/source pair. Starts the arrival watcher and stops it on unmount. */
function VoyageView({
  backend,
  source,
  kind,
  pointsMode,
  gps,
  sim,
}: {
  backend: OdysseyBackend;
  source: LocationSource;
  kind: RunKind;
  pointsMode: PointsMode;
  /** Present in Real GPS mode. */
  gps?: GpsInfo;
  /** Present in simulate mode: the only way to render Sail and Jump. */
  sim?: SimulateSource;
}) {
  const [event, setEvent] = useState<string>(gps === undefined ? t.idle : t.planted);

  useEffect(() => {
    return startArrivalWatcher({
      source,
      backend,
      odysseyId: mockOdyssey.id,
      memberId: ME,
      onResult: (r) => setEvent(describe(r, pointsMode)),
    });
  }, [backend, source, pointsMode]);

  const voyage = useVoyage(backend, mockOdyssey.id);
  const pos = useLocation(source);

  if (voyage === null) return <Text style={styles.text}>{t.loading}</Text>;

  const target = currentTarget(voyage.stages);
  const complete = voyage.odyssey.status === 'complete';
  const distance = pos === null ? null : distanceToTargetM(pos, voyage.stages);
  const totals = totalsByMember(voyage.ledger);
  const fogged = voyage.odyssey.visibility_mode === 'fog';
  const accuracy = gps?.source.getAccuracyM() ?? null;

  return (
    <>
      <Text style={styles.heading}>
        {voyage.odyssey.title} ({kind === 'gps' ? t.modeGps : fogged ? t.modeFog : t.modeOpen})
      </Text>

      <View style={styles.card}>
        {voyage.stages.map((s) => (
          <View key={s.id} style={styles.row}>
            <Text style={[styles.text, s.cleared_at !== null && styles.cleared, s.id === target?.id && styles.target]}>
              {s.cleared_at !== null ? '✓' : s.id === target?.id ? '➤' : '·'} {s.order}. {s.title}
            </Text>
            <Text style={styles.sub}>
              {s.name} · {s.points}
            </Text>
          </View>
        ))}
        {fogged && !complete && <Text style={styles.sub}>{t.hidden}</Text>}
      </View>

      {gps !== undefined && pos !== null && (
        <Text style={styles.sub}>
          {t.livePosition(
            pos.lat.toFixed(5),
            pos.lng.toFixed(5),
            accuracy === null ? t.accuracyUnknown : t.accuracyMetres(accuracy),
          )}
        </Text>
      )}
      <Text style={styles.status}>
        {complete
          ? t.statusComplete
          : target !== null && distance !== null
            ? gps !== undefined
              ? t.distanceM(distance, target.name)
              : t.distance((distance / 1000).toFixed(1), target.name)
            : ''}
      </Text>
      <Text style={styles.event}>{event}</Text>

      {sim !== undefined && (
        <>
          <Button
            label={t.sail}
            disabled={target === null}
            onPress={() => {
              if (target === null) return;
              setEvent(t.sailing(target.name));
              void sim.sailTo(target);
            }}
          />
          <Button label={t.jump} disabled={target === null} onPress={() => target !== null && sim.jumpTo(target)} />
        </>
      )}
      <Button
        label={t.arrived}
        disabled={target === null}
        onPress={() => {
          if (target === null) return;
          void backend
            .clearStage({ odysseyId: mockOdyssey.id, stageId: target.id, memberId: ME, position: pos, manual: true })
            .then((r) => setEvent(describe(r, pointsMode)));
        }}
      />

      <View style={styles.card}>
        <Text style={styles.text}>{t.crew}</Text>
        {voyage.members.map((m) => (
          <Text key={m.id} style={styles.sub}>
            {m.nickname}: {totals[m.id] ?? 0}
          </Text>
        ))}
      </View>
    </>
  );
}

function SimulateVoyage({ mode, pointsMode }: { mode: VisibilityMode; pointsMode: PointsMode }) {
  const [backend] = useState(() =>
    createMockBackend({ odyssey: { ...mockOdyssey, visibility_mode: mode, points_mode: pointsMode } }),
  );
  const [source] = useState(() => createSimulateSource({ start: mockStart, stepMs: 250, steps: 12 }));
  useEffect(() => () => source.stop(), [source]);
  return <VoyageView backend={backend} source={source} sim={source} kind={mode} pointsMode={pointsMode} />;
}

function GpsVoyage({ pointsMode }: { pointsMode: PointsMode }) {
  const [source] = useState(() => createGpsSource());
  const [permission, setPermission] = useState<GpsStartResult | null>(null);
  const [planted, setPlanted] = useState<{ n: number; backend: OdysseyBackend } | null>(null);
  const fix = useLocation(source);

  useEffect(() => {
    let active = true;
    void source.start().then((p) => active && setPermission(p));
    return () => {
      active = false;
      source.stop();
    };
  }, [source]);

  // Without permission (or if GPS failed to start) there is never a fix; plant from the mock start so
  // "We have arrived" still has stages.
  const failed = permission === 'denied' || permission === 'error';
  const origin = fix ?? (failed ? mockStart : null);
  // useLocation re-renders on every new fix and the source sets accuracy before emitting, so this is never stale.
  const accuracy = source.getAccuracyM();
  const gateClosed = fix !== null && (accuracy === null || accuracy > MAX_PLANT_ACCURACY_M);

  const plant = (unit: [number, number]): void => {
    if (origin === null) return;
    const odyssey = { ...mockOdyssey, visibility_mode: 'fog' as const, points_mode: pointsMode, status: 'voyage' as const, current_stage_order: 1 };
    const backend = createMockBackend({ odyssey, stages: plantStages(origin, unit) });
    setPlanted({ n: (planted?.n ?? 0) + 1, backend });
  };

  return (
    <>
      {permission === 'denied' && fix === null && <Text style={styles.event}>{t.gpsDenied}</Text>}
      {permission === 'error' && fix === null && <Text style={styles.event}>{t.gpsError}</Text>}
      {origin === null && <Text style={styles.text}>{t.gpsWaiting}</Text>}
      {origin !== null && (
        <View style={styles.card}>
          <Text style={styles.text}>{t.plantHeading}</Text>
          {gateClosed && (
            <Text style={styles.sub}>
              {t.gpsAccuracyWait(accuracy === null ? t.accuracyUnknown : t.accuracyMetres(accuracy), MAX_PLANT_ACCURACY_M)}
            </Text>
          )}
          {DIRECTIONS.map((d) => (
            <Button key={d.id} label={d.label} disabled={gateClosed} onPress={() => plant(d.unit)} />
          ))}
          {gateClosed && <Button label={t.plantAnyway} onPress={() => plant(DIRECTIONS[0].unit)} />}
        </View>
      )}
      {planted !== null && (
        <VoyageView key={planted.n} backend={planted.backend} source={source} kind="gps" pointsMode={pointsMode} gps={{ source }} />
      )}
    </>
  );
}

export default function Debug() {
  const [run, setRun] = useState<{ n: number; kind: RunKind; pointsMode: PointsMode }>({
    n: 0,
    kind: 'fog',
    pointsMode: 'crew',
  });
  const restart = (kind: RunKind) => setRun({ ...run, n: run.n + 1, kind });
  const flipRule = () =>
    setRun({ ...run, n: run.n + 1, pointsMode: run.pointsMode === 'crew' ? 'arriver' : 'crew' });
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {run.kind === 'gps' ? (
          <GpsVoyage key={run.n} pointsMode={run.pointsMode} />
        ) : (
          <SimulateVoyage key={run.n} mode={run.kind} pointsMode={run.pointsMode} />
        )}
        <Button label={t.restartFog} onPress={() => restart('fog')} />
        <Button label={t.restartOpen} onPress={() => restart('open')} />
        <Button label={t.restartGps} onPress={() => restart('gps')} />
        <Button label={run.pointsMode === 'crew' ? t.pointsCrew : t.pointsArriver} onPress={flipRule} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.sea },
  content: { padding: 16, gap: 12 },
  heading: { color: colors.gold, fontSize: 20, fontWeight: '800' },
  card: { borderWidth: 2, borderColor: colors.fog, padding: 12, gap: 8 },
  row: { gap: 2 },
  text: { color: colors.foam, fontSize: 16 },
  sub: { color: colors.fog, fontSize: 13 },
  cleared: { color: colors.fog },
  target: { color: colors.gold, fontWeight: '700' },
  status: { color: colors.foam, fontSize: 16 },
  event: { color: colors.gold, fontSize: 14, minHeight: 20 },
  button: { backgroundColor: colors.gold, padding: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.sea, fontSize: 16, fontWeight: '800' },
});
