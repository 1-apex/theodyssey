/**
 * KeyboardFrame: full-screen layout for chat-style screens.
 *
 *   <KeyboardFrame header={...} footer={<TextBoxRow/>} stickToEnd>{messages}</KeyboardFrame>
 *
 * - header?:    fixed at the top, below the top safe area.
 * - children:   fill a scroll area that takes all remaining space.
 * - footer?:    pinned directly above the keyboard when it is open, above the bottom safe area when closed.
 * - stickToEnd?: scroll to the bottom whenever the content grows, the area is resized or the keyboard opens.
 *
 * Ocean background like Shell; content is capped at CONTENT_MAX_WIDTH (448 on phones, wider on tablets) and centred.
 * Mechanism: KeyboardAvoidingView behavior="padding" on iOS and Android (Android is edge-to-edge in
 * Expo, so the window does not resize; docs.expo.dev/guides/keyboard-handling). No-op on web.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CONTENT_MAX_WIDTH } from '../theme/scale';
import { SeaLines } from './PixelScene';
import { colors } from './PixelSprite';

export function KeyboardFrame({
  header,
  footer,
  children,
  stickToEnd = false,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  stickToEnd?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const toEnd = (animated: boolean) => scroll.current?.scrollToEnd({ animated });

  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const a = Keyboard.addListener(show, () => {
      setOpen(true);
      // Wait for the padding animation so the end really is the end.
      if (stickToEnd) timer = setTimeout(() => toEnd(true), 120);
    });
    const b = Keyboard.addListener(hide, () => setOpen(false));
    return () => {
      a.remove();
      b.remove();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [stickToEnd]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'web' ? undefined : 'padding'} style={styles.root}>
      <LinearGradient colors={[colors['ocean-deep'], colors.ocean]} style={StyleSheet.absoluteFill} />
      <SeaLines />
      <View style={[styles.column, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
        {header}
        <ScrollView
          ref={scroll}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          onContentSizeChange={stickToEnd ? () => toEnd(true) : undefined}
          onLayout={stickToEnd ? () => toEnd(false) : undefined}
        >
          {children}
        </ScrollView>
        {footer !== undefined && <View style={{ paddingBottom: open ? 0 : insets.bottom }}>{footer}</View>}
        {footer === undefined && !open && <View style={{ height: insets.bottom }} />}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors['ocean-deep'] },
  column: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  scroll: { flex: 1 },
  content: { flexGrow: 1 },
});
