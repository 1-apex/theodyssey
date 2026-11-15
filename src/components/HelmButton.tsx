// The ship's wheel: opens the profile screen. Drawn like the other sprites,
// rows of palette characters (g gold rim, s sand spokes, b terracotta hub and handle tips).

import { Pressable } from 'react-native';

import { profile } from '@/theme/copy';
import { sz } from '@/theme/scale';
import { colors, PixelSprite } from './PixelSprite';

const HELM = [
  '........b........',
  '........s........',
  '..b....ggg....b..',
  '...s.ggggggg.s...',
  '....gg..s..gg....',
  '...ggs..s..sgg...',
  '...g..s.s.s..g...',
  '..gg...bbb...gg..',
  'bsggsssbbbsssggsb',
  '..gg...bbb...gg..',
  '...g..s.s.s..g...',
  '...ggs..s..sgg...',
  '....gg..s..gg....',
  '...s.ggggggg.s...',
  '..b....ggg....b..',
  '........s........',
  '........b........',
];

export function HelmButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={profile.helmLabel}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: sz(48),
          height: sz(48),
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: sz(3),
          borderColor: colors['gold-dark'],
          backgroundColor: '#021d34',
        },
        pressed && { opacity: 0.8, transform: [{ translateY: sz(2) }] },
      ]}
    >
      <PixelSprite rows={HELM} size={2} />
    </Pressable>
  );
}
