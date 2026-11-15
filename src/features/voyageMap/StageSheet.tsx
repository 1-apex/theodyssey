// Stage details, opened by tapping a stop (or the "Next:" line): a parchment card that slides up
// over a dimmed backdrop. The real place name leads; the themed title is only a flavour line.

import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { DestinationMapsButton } from '@/components/DestinationMapsButton';
import { formatMiles } from '@/features/location/distance';
import { openInMaps } from '@/features/location/openInMaps';
import { regionOf, shortPlaceName } from '@/features/odyssey/placeNames';
import { map } from '@/theme/copy';
import { fonts } from '@/theme/typography';
import type { Stage } from '@/lib/types';
import type { StopState } from './MapStop';
import { INK } from './pixelArt';

export interface StageSheetProps {
  stage: Stage | null;
  state: StopState;
  total: number;
  /** Metres from the Crew to the stage, when a position is known. */
  distanceM: number | null;
  reducedMotion: boolean;
  onClose: () => void;
}

function Card({ stage, state, total, distanceM, reducedMotion, onClose }: StageSheetProps & { stage: Stage }) {
  const { height } = useWindowDimensions();
  const [slide] = useState(() => new Animated.Value(reducedMotion ? 0 : 1));
  useEffect(() => {
    if (reducedMotion) return;
    const anim = Animated.timing(slide, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [slide, reducedMotion]);

  const place = shortPlaceName(stage.name);
  const region = regionOf(stage.name);
  const status = state === 'cleared' ? map.status.cleared : state === 'current' ? map.status.current : map.status.ahead;
  const isFinal = stage.order === total;
  return (
    <View style={styles.root} accessibilityViewIsModal>
      <Pressable accessibilityRole="button" accessibilityLabel={map.close} style={styles.backdrop} onPress={onClose} />
      <Animated.View
        role="dialog"
        aria-label={map.sheetLabel(place)}
        style={[styles.card, { maxHeight: height * 0.8, transform: [{ translateY: Animated.multiply(slide, height * 0.6) }] }]}
      >
        <View style={styles.grip} />
        <ScrollView contentContainerStyle={styles.body} bounces={false}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="header" style={styles.place}>
                {place}
              </Text>
              {region !== '' && <Text style={styles.region}>{region}</Text>}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={map.close} onPress={onClose} style={styles.close}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.meta}>
            <Text style={styles.numeral}>{map.stageOfTotal(stage.order, total)}</Text>
            <Text style={[styles.status, state === 'current' && styles.statusCurrent, state === 'cleared' && styles.statusCleared]}>
              {status}
            </Text>
          </View>
          {isFinal && <Text style={styles.flavour}>{map.ithaca}</Text>}
          <Text style={styles.flavour}>{stage.title}</Text>
          <Text style={styles.lore}>{stage.lore}</Text>
          <View style={styles.facts}>
            <Text style={styles.numeral}>{map.reward(stage.points)}</Text>
            {distanceM !== null && state !== 'cleared' && <Text style={styles.numeral}>{map.away(formatMiles(distanceM))}</Text>}
          </View>
          <View style={styles.actions}>
            <DestinationMapsButton onPress={() => openInMaps(stage)} />
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

export function StageSheet(props: StageSheetProps) {
  const { stage, onClose } = props;
  return (
    <Modal visible={stage !== null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {stage !== null && <Card {...props} stage={stage} />}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(1, 13, 29, 0.66)' },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#ecd9aa',
    borderTopWidth: 4,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderColor: INK,
    boxShadow: 'inset 0 4px 0 #c28b2a, inset 0 8px 0 #f5ebce',
    paddingTop: 10,
  },
  grip: { alignSelf: 'center', width: 54, height: 5, backgroundColor: '#8a6a3a', opacity: 0.6, marginBottom: 4 },
  body: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  place: { fontFamily: fonts.ui, fontSize: 28, lineHeight: 34, color: INK },
  region: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: '#584332' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: INK, backgroundColor: '#d9c099' },
  closeText: { fontFamily: fonts.body, fontSize: 18, color: INK },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  numeral: { fontFamily: fonts.numeral, fontSize: 18, lineHeight: 24, color: INK },
  status: { fontFamily: fonts.numeral, fontSize: 14, lineHeight: 20, color: '#584332', borderWidth: 2, borderColor: '#8a6a3a', paddingHorizontal: 8, paddingVertical: 1 },
  statusCurrent: { color: '#fff4dc', backgroundColor: '#a83a1f', borderColor: INK },
  statusCleared: { color: '#fff4dc', backgroundColor: '#3a6b2c', borderColor: INK },
  flavour: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 14, lineHeight: 20, color: '#6a4a2a' },
  lore: { fontFamily: fonts.body, fontSize: 16, lineHeight: 25, color: INK, marginTop: 2 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 2, marginTop: 6 },
  actions: { flexDirection: 'row', marginTop: 12 },
});
