// Plays Odysseus's speech. The only file that touches the audio module, so the rest of the
// chat knows nothing about platforms.
//
// expo-audio (docs.expo.dev/versions/v58.0.0/sdk/audio/), in Expo Go on iOS and Android and on web.
// The function gives base64 MP3, and a player wants a URI:
//  - iOS and Android: write the bytes to a file in the cache directory (expo-file-system's File)
//    and play its file URI.
//  - web: decode into a Blob and play its blob: URL (a data: URL of 100 KB or more is slow to parse).
// One speech at a time: starting another stops the first. Playing sets the audio session to
// "plays in silent mode" and active; stopping or finishing releases the player, deletes the
// file and deactivates the session so other apps' audio can carry on.

import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

interface Playing {
  player: AudioPlayer;
  /** Removes whatever backs the URI: the cache file, or the blob URL. */
  dispose: () => void;
}

let current: Playing | null = null;
/** Bumped by every play and stop, so a speech that finished preparing after being replaced is dropped. */
let generation = 0;

/** A playable URI for the audio, and how to clean it up. */
function toUri(base64: string, mime: string): { uri: string; dispose: () => void } {
  if (Platform.OS === 'web') {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    return { uri: url, dispose: () => URL.revokeObjectURL(url) };
  }
  const file = new File(Paths.cache, 'odysseus-voice.mp3');
  file.create({ overwrite: true });
  file.writeSync(base64, { encoding: 'base64' });
  return {
    uri: file.uri,
    dispose: () => {
      try {
        file.delete();
      } catch {
        // already gone
      }
    },
  };
}

/** Stops the speech now, if any, and frees the player, the file and the audio session. Safe to call any time. */
export function stopSpeech(): void {
  generation++;
  const playing = current;
  current = null;
  if (playing === null) return;
  try {
    playing.player.pause();
    playing.player.remove();
  } catch {
    // the player is already released
  }
  playing.dispose();
  void setIsAudioActiveAsync(false).catch(() => {});
}

/** Plays the speech once, replacing any still playing. Never throws: a failure is silence. */
export async function playSpeech(base64: string, mime: string): Promise<void> {
  stopSpeech();
  const mine = generation;
  try {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers', shouldPlayInBackground: false, allowsRecording: false });
    await setIsAudioActiveAsync(true);
    if (mine !== generation) return;
    const { uri, dispose } = toUri(base64, mime);
    const player = createAudioPlayer({ uri });
    current = { player, dispose };
    const done = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish && current?.player === player) stopSpeech();
    });
    const cleanup = current.dispose;
    current.dispose = () => {
      done.remove();
      cleanup();
    };
    player.play();
  } catch {
    stopSpeech();
  }
}
