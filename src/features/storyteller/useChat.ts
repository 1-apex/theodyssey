import { useCallback, useEffect, useReducer } from 'react';

import type { OdysseusChatResponse } from '../../lib/types';
import { storyteller as copy } from '../../theme/copy';
import { chatWithOdysseus } from '../odyssey/api';
import {
  type ChatState,
  finishTyping,
  receiveFailure,
  receiveReply,
  retry,
  scriptedReply,
  sendMessage,
  serverMessages,
  startChat,
} from './conversation';

type Action =
  | { type: 'send'; text: string }
  | { type: 'retry' }
  | { type: 'reply'; response: OdysseusChatResponse }
  | { type: 'fail' }
  | { type: 'script' }
  | { type: 'typed'; id: number };

function reduce(s: ChatState, a: Action): ChatState {
  switch (a.type) {
    case 'send':
      return sendMessage(s, a.text);
    case 'retry':
      return retry(s);
    case 'reply':
      return receiveReply(s, a.response);
    case 'fail':
      return receiveFailure(s);
    case 'script':
      return scriptedReply(s);
    case 'typed':
      return finishTyping(s, a.id);
  }
}

/** How long the dots show before a scripted reply, so it feels like he is thinking. */
const SCRIPT_DELAY_MS = 700;

/** The conversation with Odysseus: state from conversation.ts plus the request that each send or retry starts. */
export function useChat() {
  const [state, dispatch] = useReducer(reduce, undefined, () => startChat(copy.greeting));

  // One request per requestId. The cleanup drops a late answer, e.g. after leaving the screen.
  useEffect(() => {
    if (state.requestId === 0) return;
    if (state.scripted) {
      const timer = setTimeout(() => dispatch({ type: 'script' }), SCRIPT_DELAY_MS);
      return () => clearTimeout(timer);
    }
    let live = true;
    chatWithOdysseus(serverMessages(state.lines)).then(
      (response) => live && dispatch({ type: 'reply', response }),
      () => live && dispatch({ type: 'fail' }),
    );
    return () => {
      live = false;
    };
    // Only a new request should start a call; the lines it reads are those of this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.requestId]);

  const send = useCallback((text: string) => dispatch({ type: 'send', text }), []);
  const tryAgain = useCallback(() => dispatch({ type: 'retry' }), []);
  const typed = useCallback((id: number) => dispatch({ type: 'typed', id }), []);
  return { state, send, tryAgain, typed };
}
