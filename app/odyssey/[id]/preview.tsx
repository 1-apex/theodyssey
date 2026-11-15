// The Oracle speaks: the generated route, shown to the Captain before the lobby.

import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { DestinationMapsButton } from '@/components/DestinationMapsButton';
import { Cloud, Island } from '@/components/PixelScene';
import { Bar, Button, Notice, Shell, T, s } from '@/components/ui';
import { openInMaps } from '@/features/location/openInMaps';
import { regionOf, shortPlaceName } from '@/features/odyssey/placeNames';
import { useOdyssey } from '@/features/odyssey/useOdyssey';
import { useStageCount } from '@/features/odyssey/useStageCount';
import { useVisibleStages } from '@/features/odyssey/useVisibleStages';
import { app, c } from '@/theme/copy';

export default function Preview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const odyssey = useOdyssey(id);
  const stages = useVisibleStages(id);
  const total = useStageCount(id);
  if (odyssey === null || stages === null || total === null) return <Notice loading text={app.loading} />;

  const fog = odyssey.visibility_mode === 'fog';
  const byOrder = new Map(stages.map((stage) => [stage.order, stage]));

  return (
    <Shell>
      <Bar title={c.oracleSpeaks} onBack={() => router.replace('/')} />
      <View style={s.parchment}>
        <T style={s.mode}>{fog ? c.fogMode : c.openMode}</T>
        <T style={s.darkTitle}>{odyssey.title}</T>
        <T style={s.dark}>{app.routeLine(odyssey.start_name, fog ? app.hiddenDestination : odyssey.destination_name)}</T>
        <T style={s.quote}>{app.oracleQuote(odyssey.start_name)}</T>
      </View>
      <View style={s.space}>
        {Array.from({ length: total }, (_, i) => {
          const stage = byOrder.get(i + 1);
          const last = i === total - 1;
          return (
            <View key={i} style={s.stageRow}>
              <View style={s.sprite}>{stage === undefined ? <Cloud /> : <Island size={3} temple={last} />}</View>
              <View style={{ flex: 1 }}>
                <T style={s.stageNumber}>{app.stageLabel(i + 1, last)}</T>
                {stage === undefined ? (
                  <>
                    <T style={s.stageName}>{c.uncharted}</T>
                    <T style={s.stageDescription}>{c.fogDescription}</T>
                  </>
                ) : (
                  <>
                    <View style={s.destinationRow}>
                      <View style={{ flex: 1 }}>
                        <T style={s.stageName}>{shortPlaceName(stage.name)}</T>
                        {regionOf(stage.name) !== '' && <T style={s.stageDescription}>{regionOf(stage.name)}</T>}
                        <T style={st.flavour}>{stage.title}</T>
                      </View>
                      <DestinationMapsButton onPress={() => openInMaps(stage)} />
                    </View>
                    <T style={s.stageDescription}>{stage.lore}</T>
                    <T style={s.reward}>{app.reward(stage.points)}</T>
                  </>
                )}
              </View>
            </View>
          );
        })}
      </View>
      <View style={s.space}>
        <Button title={c.gatherButton} onPress={() => router.replace({ pathname: '/odyssey/[id]/lobby', params: { id } })} />
      </View>
    </Shell>
  );
}

const st = StyleSheet.create({ flavour: { fontStyle: 'italic', fontSize: 12, lineHeight: 18, color: '#91c7dd', marginTop: 2 } });
