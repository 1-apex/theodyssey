import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { PixelAvatar } from '../../components/PixelAvatar';
import { colors } from '../../components/PixelSprite';
import { storyteller as copy } from '../../theme/copy';
import { fonts } from '../../theme/typography';
import { TypingDots } from './TypingDots';
import { useTypewriter } from './useTypewriter';

const AVATAR_TILE = 40;

/** A small framed portrait beside a message group. */
function Portrait({ children }: { children: ReactNode }) {
  return <View style={styles.tile}>{children}</View>;
}

export const OdysseusPortrait = () => (
  <Portrait>
    <Image source={require('../../../assets/characters/odysseus-avatar.png')} style={styles.portraitImage} accessible={false} />
  </Portrait>
);

export const PlayerPortrait = ({ avatar }: { avatar: number }) => (
  <Portrait>
    <PixelAvatar index={avatar} size={4} />
  </Portrait>
);

interface RowProps {
  from: 'odysseus' | 'traveler';
  /** Show the portrait (first message of a group); otherwise keep the space. */
  showPortrait: boolean;
  avatar: number;
  children: ReactNode;
}

/** One row of the chat: Odysseus on the left with his portrait, the traveler on the right with theirs. */
export function ChatRow({ from, showPortrait, avatar, children }: RowProps) {
  const mine = from === 'traveler';
  const portrait = showPortrait ? mine ? <PlayerPortrait avatar={avatar} /> : <OdysseusPortrait /> : <View style={styles.tile0} />;
  return (
    <View style={[styles.row, mine && styles.rowMine]}>
      {!mine && portrait}
      {children}
      {mine && portrait}
    </View>
  );
}

interface BubbleProps {
  from: 'odysseus' | 'traveler';
  text: string;
  /** Odysseus is writing this line now: reveal it letter by letter. */
  typing?: boolean;
  onTyped?: () => void;
}

/** A message bubble. Squared, pixel-bordered. Tap while it is being written to read the rest at once. */
export function ChatBubble({ from, text, typing = false, onTyped }: BubbleProps) {
  const mine = from === 'traveler';
  const { shown, skip } = useTypewriter(text, typing, onTyped ?? noop);
  const who = mine ? copy.nameYou : copy.nameOdysseus;
  return (
    <Pressable
      accessible
      accessibilityLabel={copy.said(who, text)}
      accessibilityLiveRegion={mine ? 'none' : 'polite'}
      disabled={!typing}
      onPress={skip}
      style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleHis]}
    >
      {/* The unwritten rest is laid out but transparent, so the bubble does not grow or re-wrap while he writes. */}
      <Text style={[styles.text, mine && styles.textMine]}>
        {text.slice(0, shown)}
        <Text style={styles.hidden}>{text.slice(shown)}</Text>
      </Text>
    </Pressable>
  );
}

/** Odysseus's bubble while he is thinking: three bouncing dots. */
export function TypingBubble() {
  return (
    <View style={[styles.bubble, styles.bubbleHis, styles.dotsBubble]}>
      <TypingDots label={copy.typing} />
    </View>
  );
}

const noop = () => {};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, width: '100%' },
  rowMine: { justifyContent: 'flex-end' },
  tile: {
    width: AVATAR_TILE,
    height: AVATAR_TILE,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.sand,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tile0: { width: AVATAR_TILE, height: AVATAR_TILE },
  portraitImage: { width: AVATAR_TILE - 4, height: AVATAR_TILE - 4 },
  bubble: {
    maxWidth: '78%',
    flexShrink: 1,
    borderWidth: 3,
    borderColor: colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 8,
    boxShadow: '3px 3px 0 #010b18',
  },
  bubbleHis: { backgroundColor: colors.parchment },
  bubbleMine: { backgroundColor: colors.gold },
  dotsBubble: { paddingVertical: 12, minHeight: 46, justifyContent: 'center' },
  text: { fontFamily: fonts.body, fontSize: 17, lineHeight: 24, color: colors.ink },
  textMine: { color: colors.ink },
  hidden: { color: 'transparent' },
});
