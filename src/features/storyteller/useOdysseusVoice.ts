import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { speakAsOdysseus } from '../odyssey/api';
import { playSpeech, stopSpeech } from './voice';
import { parseVoicePref, speakableText, VOICE_PREF_KEY, voicePrefValue } from './voiceText';

/**
 * Odysseus's voice for the chat: a speaker switch that is remembered across restarts, and
 * `speak(text)` for each new reply. The audio is fetched while the text is already being typed;
 * if it arrives in time it plays once. A newer reply replaces it, muting or leaving the screen
 * stops it, and every failure is silent. While muted no request is made.
 */
export function useOdysseusVoice() {
  const [enabled, setEnabled] = useState(true);
  // What the async code reads: the switch now, and which speech is the newest.
  const on = useRef(true);
  const latest = useRef(0);

  /** Drops any reply still being fetched and stops what is playing. */
  const silence = useCallback(() => {
    latest.current++;
    stopSpeech();
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(VOICE_PREF_KEY).then(
      (raw) => {
        on.current = parseVoicePref(raw);
        setEnabled(on.current);
      },
      () => {},
    );
    return silence;
  }, [silence]);

  const speak = useCallback((reply: string) => {
    stopSpeech(); // a new reply cuts off the last one at once
    const text = speakableText(reply);
    if (!on.current || text === null) return;
    const mine = ++latest.current;
    void speakAsOdysseus(text).then((result) => {
      if (result.kind === 'audio' && mine === latest.current && on.current) void playSpeech(result.audio, result.mime);
    });
  }, []);

  const toggle = useCallback(() => {
    on.current = !on.current;
    setEnabled(on.current);
    if (!on.current) silence();
    AsyncStorage.setItem(VOICE_PREF_KEY, voicePrefValue(on.current)).catch(() => {});
  }, [silence]);

  return { enabled, toggle, speak };
}
