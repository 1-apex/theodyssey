// Ithaca: the voyage is complete. Full route revealed, crew totals.

import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { PixelAvatar } from '@/components/PixelAvatar';
import { ArrivalArt, Border } from '@/components/PixelScene';
import { Button, Notice, Shell, T, s } from '@/components/ui';
import { useCrew } from '@/features/crew/useCrew';
import { avatarIndex } from '@/features/odyssey/api';
import { useOdyssey } from '@/features/odyssey/useOdyssey';
import { useStageCount } from '@/features/odyssey/useStageCount';
import { useVisibleStages } from '@/features/odyssey/useVisibleStages';
import { usePoints } from '@/features/points/usePoints';
import { app, c } from '@/theme/copy';

export default function Ithaca() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const odyssey = useOdyssey(id);
  const stages = useVisibleStages(id);
  const total = useStageCount(id);
  const crew = useCrew(id);
  const points = usePoints(id);
  if (odyssey === null || stages === null || total === null || crew === null || points === null) {
    return <Notice loading text={app.loading} />;
  }

  const cleared = stages.filter((stage) => stage.cleared_at !== null).length;

  return (
    <Shell>
      <ArrivalArt />
      <Border />
      <T style={[s.logo, { fontSize: 24, textAlign: 'center' }]}>ITHACA!</T>
      <Border />
      <T style={[s.text, { textAlign: 'center', marginVertical: 20 }]}>{app.complete(odyssey.title)}</T>
      <View style={s.parchment}>
        <T style={[s.darkTitle, { textAlign: 'center' }]}>{c.finishTitle}</T>
        <T style={s.dark}>{c.finishSub}</T>
        <T accessibilityLabel="finish-summary" style={[s.darkTitle, { textAlign: 'center', marginVertical: 28 }]}>
          {app.finishSummary(cleared, total, points.myTotal)}
        </T>
        <T style={s.quote}>{c.endQuote}</T>
      </View>

      <T style={s.crewHeading}>{app.crewTotals}</T>
      {crew.map((member) => (
        <View key={member.id} style={s.crewRow}>
          <PixelAvatar index={avatarIndex(member.avatar_id, c.avatarNames.length)} />
          <T style={[s.member, { flex: 1 }]}>{member.nickname}</T>
          <T style={s.member}>{app.drachma(points.totals[member.id] ?? 0)}</T>
        </View>
      ))}

      <T style={s.crewHeading}>{c.stages}</T>
      {stages.map((stage) => (
        <View key={stage.id} style={s.stageRow}>
          <View style={{ flex: 1 }}>
            <T style={s.stageNumber}>{app.stageLabel(stage.order, stage.order === total)}</T>
            <T style={s.stageName}>{stage.title}</T>
            <T style={s.stageDescription}>{stage.name}</T>
          </View>
          <T style={s.reward}>{app.reward(stage.points)}</T>
        </View>
      ))}

      <View style={s.space}>
        <Button title={c.home} onPress={() => router.replace('/')} />
      </View>
    </Shell>
  );
}
