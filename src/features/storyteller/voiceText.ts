// The pure parts of Odysseus's voice: what is sent to be spoken, and the saved speaker choice.
// No React and no native modules, so it can be unit tested.

/** odysseus-voice takes 1 to 500 characters. */
export const MAX_SPOKEN_CHARS = 500;

/** AsyncStorage key of the speaker toggle. */
export const VOICE_PREF_KEY = 'odyssey.odysseusVoice';

/** What to read aloud: spaces tidied and cut to the limit at the last sentence end (or word) so he does not stop mid-word. Null when nothing is left. */
export function speakableText(reply: string): string | null {
  const t = reply.replace(/\s+/g, ' ').trim();
  if (t === '') return null;
  if (t.length <= MAX_SPOKEN_CHARS) return t;
  const cut = t.slice(0, MAX_SPOKEN_CHARS);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentence > MAX_SPOKEN_CHARS / 3) return cut.slice(0, sentence + 1);
  const space = cut.lastIndexOf(' ');
  return (space > MAX_SPOKEN_CHARS / 2 ? cut.slice(0, space) : cut).trim();
}

/** The saved choice: on unless it was explicitly turned off. */
export const parseVoicePref = (raw: string | null): boolean => raw !== 'off';

export const voicePrefValue = (on: boolean): string => (on ? 'on' : 'off');

/** A data: URL for the web player. */
export const audioDataUrl = (base64: string, mime: string): string => `data:${mime};base64,${base64}`;
