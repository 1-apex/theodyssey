import assert from 'node:assert/strict';
import { test } from 'node:test';

import { audioDataUrl, MAX_SPOKEN_CHARS, parseVoicePref, speakableText, voicePrefValue } from './voiceText';

test('speakableText tidies spaces and returns null for nothing', () => {
  assert.equal(speakableText('  Hail,\n  traveler.  '), 'Hail, traveler.');
  assert.equal(speakableText(' \n '), null);
});

test('speakableText cuts a long reply at a sentence end within 500 characters', () => {
  const sentence = 'The sea is wide and the road is long. ';
  const out = speakableText(sentence.repeat(30));
  assert.ok(out !== null && out.length <= MAX_SPOKEN_CHARS);
  assert.ok(out?.endsWith('long.'));
});

test('speakableText falls back to a word, then to a hard cut', () => {
  const words = speakableText('wind '.repeat(300));
  assert.ok(words !== null && words.length <= MAX_SPOKEN_CHARS && words.endsWith('wind'));
  assert.equal(speakableText('a'.repeat(900))?.length, MAX_SPOKEN_CHARS);
});

test('the speaker is on by default and off only when saved as off', () => {
  assert.equal(parseVoicePref(null), true);
  assert.equal(parseVoicePref('garbage'), true);
  assert.equal(parseVoicePref(voicePrefValue(false)), false);
  assert.equal(parseVoicePref(voicePrefValue(true)), true);
});

test('audioDataUrl builds a data URL', () => {
  assert.equal(audioDataUrl('AAA=', 'audio/mpeg'), 'data:audio/mpeg;base64,AAA=');
});
