import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../components/PixelSprite';
import { fonts } from '../../theme/typography';

/** A compact pixel button for the actions around the chat. */
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
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text>
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

const styles = StyleSheet.create({
  button: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 44,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.gold,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'inset 3px 3px 0 #ffe39a, inset -3px -3px 0 #ab6c0c',
  },
  secondary: { backgroundColor: colors.ocean, boxShadow: 'inset 3px 3px 0 #087dac' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.8, transform: [{ translateY: 2 }] },
  buttonText: { fontFamily: fonts.ui, fontSize: 16, lineHeight: 22, color: colors.ink, textAlign: 'center' },
  secondaryText: { color: '#f5edce' },
  note: {
    alignSelf: 'center',
    maxWidth: '92%',
    gap: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.sand,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  noteText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.sand, textAlign: 'center' },
});
