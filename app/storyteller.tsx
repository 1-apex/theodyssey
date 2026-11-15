import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextInputContentSizeChangeEvent,
  type TextInputKeyPressEvent,
} from 'react-native';

import { useCloudCurtain } from '@/components/CloudCurtain';
import { KeyboardFrame } from '@/components/KeyboardFrame';
import { colors } from '@/components/PixelSprite';
import { Bar } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { avatarId, createDemoOdyssey, createOdyssey, joinOdyssey, toApiError } from '@/features/odyssey/api';
import { ChatBubble, ChatRow, TypingBubble } from '@/features/storyteller/ChatBubble';
import { ActionButton, SystemNote } from '@/features/storyteller/ChatBits';
import { cleanInput, isBusy, MAX_TEXT, tripToRequest } from '@/features/storyteller/conversation';
import { useChat } from '@/features/storyteller/useChat';
import { app, storyteller as t } from '@/theme/copy';
import { fonts } from '@/theme/typography';

const INPUT_MIN = 46;
const INPUT_MAX = 112;
/** Vertical padding (8 + 8) and border (3 + 3) around the text. */
const INPUT_CHROME = 16;
const INPUT_BORDER = 6;
/** Room for the Summon button, kept free on roomy screens so the chat does not jump when it appears. */
const SLOT_HEIGHT = 44;

/** On web, Enter sends and Shift+Enter starts a new line. */
function isPlainEnter(e: TextInputKeyPressEvent): boolean {
  const native: { key: string; shiftKey?: boolean } = e.nativeEvent;
  return Platform.OS === 'web' && native.key === 'Enter' && native.shiftKey !== true;
}

const errorText = (e: unknown): string => app.errors[toApiError(e).code as keyof typeof app.errors] ?? app.errors.unknown;

// A real chat: Odysseus talks with the traveler, then the Oracle charts the route.
export default function Storyteller() {
  const { username, avatar } = useAuth();
  const curtain = useCloudCurtain();
  const { height } = useWindowDimensions();
  const { state, send, tryAgain, typed } = useChat();
  const [input, setInput] = useState('');
  const [inputHeight, setInputHeight] = useState(INPUT_MIN);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<ComponentRef<typeof TextInput>>(null);

  const nickname = username ?? '';
  const request = tripToRequest(state.trip, nickname, avatarId(avatar));
  const canSend = cleanInput(input) !== null && !isBusy(state);
  const reserve = height >= 600;

  const submit = () => {
    if (!canSend) return;
    send(input);
    setInput('');
    setInputHeight(INPUT_MIN);
    setProblem(null);
  };

  const fit = (contentHeight: number) =>
    setInputHeight(Math.min(INPUT_MAX, Math.max(INPUT_MIN, Math.ceil(contentHeight) + INPUT_CHROME)));

  /** Native: the text box reports its content height. */
  const onSize = (e: TextInputContentSizeChangeEvent) => fit(e.nativeEvent.contentSize.height);

  /**
   * Web: a textarea never reports a smaller content height once it has grown, so measure it
   * ourselves: collapse it, read the scroll height, and set that. Runs from the change handler,
   * when the DOM already holds the new text.
   */
  const fitWeb = () => {
    const node: unknown = box.current;
    if (Platform.OS !== 'web' || !(node instanceof HTMLTextAreaElement)) return;
    node.style.height = '0px';
    const h = Math.min(INPUT_MAX, Math.max(INPUT_MIN, node.scrollHeight + INPUT_BORDER));
    node.style.height = `${h}px`;
    setInputHeight(h);
  };

  /** The cloud curtain covers the wait; on success we are on the preview screen when it opens. */
  const runWithCurtain = async (work: () => Promise<string>) => {
    if (working) return;
    setWorking(true);
    setProblem(null);
    await curtain.close(app.consulting);
    try {
      const id = await work();
      router.replace({ pathname: '/odyssey/[id]/preview', params: { id } });
      await curtain.open();
    } catch (e) {
      await curtain.open();
      setProblem(errorText(e));
    } finally {
      setWorking(false);
    }
  };

  const summon = () => {
    if (request === null) return;
    void runWithCurtain(async () => (await createOdyssey(request)).odyssey_id);
  };

  const sailDemo = () =>
    void runWithCurtain(async () => {
      const made = await createDemoOdyssey(request?.visibility_mode ?? 'fog', 'crew');
      await joinOdyssey(made.join_code, nickname, avatarId(avatar));
      return made.odyssey_id;
    });

  const rows = state.lines.map((line, i) => (
    <ChatRow key={line.id} from={line.role} avatar={avatar} showPortrait={state.lines[i - 1]?.role !== line.role}>
      <ChatBubble from={line.role} text={line.text} typing={line.id === state.typingId} onTyped={() => typed(line.id)} />
    </ChatRow>
  ));

  const header = (
    <View style={styles.header}>
      <Bar title={t.title} onBack={() => router.back()} />
    </View>
  );

  const footer = (
    <View style={styles.footer}>
      <View style={[styles.slot, reserve && { minHeight: SLOT_HEIGHT }]}>
        {problem !== null && <ActionButton title={app.demoRoute} onPress={sailDemo} disabled={working} secondary />}
        {state.ready && <ActionButton title={t.summon} onPress={summon} disabled={working || request === null} />}
      </View>
      <View style={styles.inputRow}>
        <TextInput
          ref={box}
          accessibilityLabel={t.answerLabel}
          value={input}
          onChangeText={(text) => {
            setInput(text);
            fitWeb();
          }}
          onContentSizeChange={Platform.OS === 'web' ? undefined : onSize}
          onKeyPress={(e) => {
            if (isPlainEnter(e)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t.placeholder}
          placeholderTextColor="#877a69"
          multiline
          maxLength={MAX_TEXT}
          style={[styles.input, { height: inputHeight }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.sendLabel}
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={submit}
          style={[styles.send, !canSend && styles.sendDisabled]}
        >
          <Text style={styles.sendText}>{t.send}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <KeyboardFrame header={header} footer={footer} stickToEnd>
      <View style={styles.messages}>
        {rows}
        {state.waiting && (
          <ChatRow from="odysseus" avatar={avatar} showPortrait={state.lines[state.lines.length - 1]?.role !== 'odysseus'}>
            <TypingBubble />
          </ChatRow>
        )}
        {state.failed && (
          <SystemNote text={t.chatError}>
            <ActionButton title={t.retry} onPress={tryAgain} />
          </SystemNote>
        )}
        {problem !== null && <SystemNote text={problem} />}
      </View>
    </KeyboardFrame>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 12 },
  messages: { gap: 12, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 },
  footer: {
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: colors['ocean-deep'],
    borderTopWidth: 3,
    borderTopColor: colors['gold-dark'],
  },
  slot: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  inputRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-end' },
  input: {
    flex: 1,
    minHeight: INPUT_MIN,
    maxHeight: INPUT_MAX,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.parchment,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 17,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  send: {
    height: INPUT_MIN,
    minWidth: 72,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    boxShadow: 'inset 3px 3px 0 #ffe39a, inset -3px -3px 0 #ab6c0c',
  },
  sendDisabled: { opacity: 0.5 },
  sendText: { fontFamily: fonts.ui, color: colors.ink, fontSize: 17, lineHeight: 22 },
});
