import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, PixelSprite } from '../../components/PixelSprite';
import { sz } from '../../theme/scale';
import { fonts } from '../../theme/typography';

/**
 * A compact pixel button for the actions around the chat. It is as wide as its label plus padding
 * and a fixed height, whatever it sits in: it never grows to fill a row or a column.
 */
export function ActionButton({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.secondary, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.buttonText, secondary && styles.secondaryText]}>
        {title}
      </Text>
    </Pressable>
  );
}

/** A line that is not Odysseus or the traveler: an error, with an action beneath. */
export function SystemNote({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <View style={styles.note} accessibilityRole="alert">
      <Text style={styles.noteText}>{text}</Text>
      {children}
    </View>
  );
}

/**
 * A scroll laid at the end of the conversation: not a bubble from either speaker. A caption and
 * the action beneath it, centred, parchment with a gold border.
 */
export function ScrollCard({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardCaption}>{caption}</Text>
      <View style={styles.cardActions}>{children}</View>
    </View>
  );
}

/** The speaker switch in the header: a pixel speaker, with a cross when Odysseus is muted. */
export function SpeakerToggle({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => [styles.speaker, pressed && styles.pressed]}
    >
      <PixelSprite rows={on ? SPEAKER_ON : SPEAKER_OFF} size={3} />
    </Pressable>
  );
}

// 'g' gold, 'b' terracotta (see the sprite palette).
const SPEAKER_ON = [
  '....g.......',
  '...gg...g...',
  '..ggg....g..',
  'gggggg.g..g.',
  'gggggg..g.g.',
  'gggggg..g.g.',
  'gggggg.g..g.',
  '..ggg....g..',
  '...gg...g...',
  '....g.......',
];
const SPEAKER_OFF = [
  '....g.......',
  '...gg.......',
  '..ggg.b...b.',
  'gggggg.b.b..',
  'gggggg..b...',
  'gggggg..b...',
  'gggggg.b.b..',
  '..ggg.b...b.',
  '...gg.......',
  '....g.......',
];

const styles = StyleSheet.create({
  button: {
    alignSelf: 'center',
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: '100%',
    height: sz(44),
    borderWidth: sz(3),
    borderColor: colors.ink,
    backgroundColor: colors.gold,
    paddingHorizontal: sz(10),
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'inset 3px 3px 0 #ffe39a, inset -3px -3px 0 #ab6c0c',
  },
  secondary: { backgroundColor: colors.ocean, boxShadow: 'inset 3px 3px 0 #087dac' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.8, transform: [{ translateY: 2 }] },
  buttonText: { fontFamily: fonts.ui, fontSize: sz(16), lineHeight: sz(22), color: colors.ink, textAlign: 'center' },
  secondaryText: { color: '#f5edce' },
  note: {
    alignSelf: 'center',
    maxWidth: '92%',
    gap: sz(10),
    alignItems: 'center',
    borderWidth: sz(2),
    borderStyle: 'dashed',
    borderColor: colors.sand,
    paddingHorizontal: sz(14),
    paddingVertical: sz(10),
  },
  noteText: { fontFamily: fonts.body, fontSize: sz(15), lineHeight: sz(22), color: colors.sand, textAlign: 'center' },
  card: {
    alignSelf: 'center',
    maxWidth: '96%',
    alignItems: 'center',
    gap: sz(10),
    backgroundColor: colors.parchment,
    borderWidth: sz(3),
    borderColor: colors['gold-dark'],
    paddingHorizontal: sz(12),
    paddingVertical: sz(14),
    boxShadow: '3px 3px 0 #010b18',
  },
  cardCaption: { fontFamily: fonts.ui, fontSize: sz(17), lineHeight: sz(24), color: colors.ink, textAlign: 'center' },
  cardActions: { alignItems: 'center', gap: sz(10), maxWidth: '100%' },
  speaker: {
    width: sz(44),
    height: sz(44),
    borderWidth: sz(3),
    borderColor: colors['gold-dark'],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#021d34',
  },
});
