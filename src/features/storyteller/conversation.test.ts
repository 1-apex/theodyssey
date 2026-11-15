import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { OdysseusChatResponse, TripDraft } from '../../lib/types';
import { storyteller } from '../../theme/copy';
import {
  type ChatState,
  cleanInput,
  finishTyping,
  isBusy,
  mergeTrip,
  receiveFailure,
  receiveReply,
  retry,
  scriptedReply,
  sendMessage,
  serverMessages,
  startChat,
  tripToRequest,
  type Line,
} from './conversation';
import { EMPTY_TRIP } from './script';

const reply = (text: string, trip: Partial<TripDraft> = {}, ready = false): OdysseusChatResponse => ({
  reply: text,
  trip: { ...EMPTY_TRIP, ...trip },
  ready,
  on_topic: true,
});

/** A chat past the greeting, so the traveler may send. */
const ready0 = (): ChatState => finishTyping(startChat(storyteller.greeting), 0);

test('starts with the greeting, being typed, and cannot send until it is done', () => {
  const s = startChat(storyteller.greeting);
  assert.equal(s.lines.length, 1);
  assert.equal(s.lines[0].role, 'odysseus');
  assert.equal(isBusy(s), true);
  assert.equal(sendMessage(s, 'Goa'), s);
  assert.equal(isBusy(finishTyping(s, 0)), false);
});

test('send adds the traveler line at once, trims, and waits', () => {
  const s = sendMessage(ready0(), '  Big Bend  ');
  assert.deepEqual(s.lines.map((l) => [l.role, l.text]), [['odysseus', storyteller.greeting], ['traveler', 'Big Bend']]);
  assert.equal(s.waiting, true);
  assert.equal(s.requestId, 1);
});

test('send ignores empty text and a second send while waiting', () => {
  const idle = ready0();
  assert.equal(sendMessage(idle, '   '), idle);
  const waiting = sendMessage(idle, 'Goa');
  assert.equal(sendMessage(waiting, 'again'), waiting);
});

test('cleanInput caps at 500 characters', () => {
  assert.equal(cleanInput('x'.repeat(900))?.length, 500);
  assert.equal(cleanInput(' \n '), null);
});

test('a reply is appended, typed, and stores trip and ready; the next reply can hide ready', () => {
  let s = sendMessage(ready0(), 'Goa from Pune');
  s = receiveReply(s, reply('Splendid.', { destination: 'Goa', start: 'Pune', travel_mode: 'road' }, true));
  assert.equal(s.waiting, false);
  assert.equal(s.ready, true);
  assert.equal(s.trip.destination, 'Goa');
  assert.equal(s.typingId, s.lines[s.lines.length - 1].id);
  assert.equal(isBusy(s), true);
  s = finishTyping(s, s.typingId ?? -1);
  assert.equal(isBusy(s), false);
  s = receiveReply(sendMessage(s, 'actually, somewhere else'), reply('Where?', { start: 'Pune' }, false));
  assert.equal(s.ready, false);
});

test('a stray reply when nothing is awaited is ignored', () => {
  const s = ready0();
  assert.equal(receiveReply(s, reply('hi')), s);
  assert.equal(receiveFailure(s), s);
});

test('first failure offers retry; retry resends and a success clears the failure count', () => {
  let s = receiveFailure(sendMessage(ready0(), 'Goa'));
  assert.equal(s.failed, true);
  assert.equal(s.waiting, false);
  assert.equal(s.scripted, false);
  s = retry(s);
  assert.equal(s.waiting, true);
  assert.equal(s.failed, false);
  assert.equal(s.requestId, 2);
  assert.equal(s.lines.length, 2); // nothing added
  s = receiveReply(s, reply('ok'));
  assert.equal(s.failures, 0);
});

test('retry does nothing unless a failure is pending', () => {
  const s = ready0();
  assert.equal(retry(s), s);
});

test('two failures in a row switch to the script, which asks for the next unknown', () => {
  let s = receiveFailure(sendMessage(ready0(), 'Big Bend'));
  s = receiveFailure(retry(s));
  assert.equal(s.scripted, true);
  assert.equal(s.failed, false);
  assert.equal(s.trip.destination, null); // the unanswered message is not taken as an answer
  const last = s.lines[s.lines.length - 1];
  assert.equal(last.role, 'odysseus');
  assert.ok(last.text.startsWith(storyteller.scriptedNotice));
  assert.ok(last.text.endsWith(storyteller.greeting)); // the first missing field: the destination
  assert.equal(s.asking, 'destination');
});

test('a first message with a destination and start is not misfiled by the switch', () => {
  let s = receiveFailure(sendMessage(ready0(), 'Big Bend from Arlington'));
  s = receiveFailure(retry(s));
  assert.deepEqual(s.trip, EMPTY_TRIP);
  // The next answer fills the field he just asked about.
  s = scriptedReply(sendMessage(finishTyping(s, s.typingId ?? -1), 'Big Bend'));
  assert.equal(s.trip.destination, 'Big Bend');
  assert.equal(s.trip.start, null);
});

test('ready from the server survives the switch and no new questions are asked', () => {
  let s = sendMessage(ready0(), 'Goa from Pune');
  s = receiveReply(s, reply('Shall we sail?', { destination: 'Goa', start: 'Pune', travel_mode: 'road' }, true));
  s = finishTyping(s, s.typingId ?? -1);
  s = receiveFailure(retry(receiveFailure(sendMessage(s, 'yes'))));
  assert.equal(s.scripted, true);
  assert.equal(s.ready, true);
  assert.equal(s.asking, null);
  assert.deepEqual(s.trip, { ...EMPTY_TRIP, destination: 'Goa', start: 'Pune', travel_mode: 'road' });
  assert.equal(s.lines[s.lines.length - 1].text, storyteller.scriptedNotice + storyteller.scriptedDone);
  s = scriptedReply(sendMessage(finishTyping(s, s.typingId ?? -1), '3 of us'));
  assert.equal(s.ready, true);
  assert.equal(s.trip.crew_size, null);
  assert.equal(s.lines[s.lines.length - 1].text, storyteller.scriptedDone);
});

test('a success between failures resets the count', () => {
  let s = receiveFailure(sendMessage(ready0(), 'Goa'));
  s = receiveReply(retry(s), reply('ok'));
  s = finishTyping(s, s.typingId ?? -1);
  s = receiveFailure(sendMessage(s, 'Pune'));
  assert.equal(s.scripted, false);
  assert.equal(s.failed, true);
});

test('the script runs destination, start, crew, duration, wishes, then becomes ready', () => {
  let s = receiveFailure(retry(receiveFailure(sendMessage(ready0(), 'Big Bend'))));
  s = scriptedReply(sendMessage(finishTyping(s, s.typingId ?? -1), 'Big Bend'));
  const answers = ['Arlington, TX', '4 of us', '2 days', 'tacos and views'];
  const asked: string[] = [];
  for (const a of answers) {
    assert.equal(s.ready, false);
    s = finishTyping(s, s.typingId ?? -1);
    s = scriptedReply(sendMessage(s, a));
    asked.push(s.lines[s.lines.length - 1].text);
  }
  assert.deepEqual(asked.slice(0, 3), [storyteller.prompts[1], storyteller.prompts[2], storyteller.prompts[3]]);
  assert.equal(asked[3], storyteller.closing);
  assert.equal(s.ready, true);
  assert.deepEqual(s.trip, {
    destination: 'Big Bend',
    start: 'Arlington, TX',
    crew_size: 4,
    duration: '2 days',
    travel_style: 'tacos and views',
    visibility_mode: null,
    travel_mode: 'road', // the script never asks; it fills in the default when it finishes
  });
  // Chatting on after that just points at the button.
  s = scriptedReply(sendMessage(finishTyping(s, s.typingId ?? -1), 'thanks'));
  assert.equal(s.lines[s.lines.length - 1].text, storyteller.scriptedDone);
  assert.equal(s.ready, true);
});

test('the script skips what the server already learned', () => {
  let s = sendMessage(ready0(), 'Goa from Pune, 3 of us');
  s = receiveReply(s, reply('And how long?', { destination: 'Goa', start: 'Pune', crew_size: 3 }));
  s = finishTyping(s, s.typingId ?? -1);
  s = receiveFailure(retry(receiveFailure(sendMessage(s, '5 days'))));
  assert.equal(s.trip.duration, null); // the failed message is not an answer
  assert.ok(s.lines[s.lines.length - 1].text.endsWith(storyteller.prompts[2])); // the duration
});

test('an unreadable head count is not asked again', () => {
  let s = receiveFailure(retry(receiveFailure(sendMessage(ready0(), 'Goa'))));
  s = scriptedReply(sendMessage(finishTyping(s, s.typingId ?? -1), 'Goa'));
  s = scriptedReply(sendMessage(finishTyping(s, s.typingId ?? -1), 'Pune'));
  s = scriptedReply(sendMessage(finishTyping(s, s.typingId ?? -1), 'a few'));
  assert.equal(s.trip.crew_size, null);
  assert.equal(s.lines[s.lines.length - 1].text, storyteller.prompts[2]);
});

test('serverMessages sends at most 40, ends with the traveler, and never empty text', () => {
  const lines: Line[] = [];
  for (let i = 0; i < 61; i++) lines.push({ id: i, role: i % 2 === 0 ? 'odysseus' : 'traveler', text: `m${i}` });
  lines.push({ id: 61, role: 'odysseus', text: 'trailing' });
  lines.push({ id: 62, role: 'traveler', text: '   ' });
  const out = serverMessages(lines);
  assert.equal(out.length, 40);
  assert.equal(out[out.length - 1].role, 'traveler');
  assert.equal(out[out.length - 1].text, 'm59');
  assert.ok(out.every((m) => m.text.length >= 1 && m.text.length <= 500));
  assert.equal(serverMessages([{ id: 0, role: 'odysseus', text: 'hello' }]).length, 0);
  assert.equal(serverMessages([{ id: 0, role: 'traveler', text: 'x'.repeat(700) }])[0].text.length, 500);
});

test('tripToRequest applies the defaults and needs start and destination', () => {
  assert.equal(tripToRequest(EMPTY_TRIP, 'amy', 'avatar_1'), null);
  assert.equal(tripToRequest({ ...EMPTY_TRIP, destination: 'Goa' }, 'amy', 'avatar_1'), null);
  assert.deepEqual(tripToRequest({ ...EMPTY_TRIP, destination: 'Goa', start: 'Pune' }, 'amy', 'avatar_2'), {
    start: 'Pune',
    destination: 'Goa',
    crew_size: 2,
    duration: '',
    travel_style: '',
    travel_mode: 'road',
    visibility_mode: 'fog',
    points_mode: 'crew',
    nickname: 'amy',
    avatar_id: 'avatar_2',
  });
  const full: TripDraft = { start: 'A', destination: 'B', crew_size: 5, duration: '3 days', travel_style: 'food', visibility_mode: 'open', travel_mode: 'road' };
  const r = tripToRequest(full, 'amy', 'avatar_0');
  assert.equal(r?.crew_size, 5);
  assert.equal(r?.visibility_mode, 'open');
  assert.equal(tripToRequest({ ...full, travel_mode: 'flight' }, 'amy', 'avatar_0')?.travel_mode, 'flight');
});

const KNOWN: Partial<TripDraft> = { destination: 'Goa', start: 'Pune', travel_mode: 'flight', crew_size: 3 };

test('a degraded reply (all-null trip) keeps the draft and the ready state', () => {
  let s = receiveReply(sendMessage(ready0(), 'Goa from Pune, flying, 3 of us'), reply('Shall we sail?', KNOWN, true));
  s = finishTyping(s, s.typingId ?? -1);
  s = receiveReply(sendMessage(s, '???'), reply('Say that once more, traveler.', {}, false));
  assert.deepEqual(s.trip, { ...EMPTY_TRIP, ...KNOWN });
  assert.equal(s.ready, true);
  assert.equal(s.lines[s.lines.length - 1].text, 'Say that once more, traveler.');
  assert.equal(tripToRequest(s.trip, 'amy', 'avatar_0')?.travel_mode, 'flight');
});

test('a degraded reply before anything is known leaves an empty, not ready draft', () => {
  const s = receiveReply(sendMessage(ready0(), '???'), reply('Say that once more.', {}, false));
  assert.deepEqual(s.trip, EMPTY_TRIP);
  assert.equal(s.ready, false);
});

test('a reply with some fields is taken as the server sent it', () => {
  let s = receiveReply(sendMessage(ready0(), 'Goa from Pune'), reply('ok', KNOWN, false));
  s = finishTyping(s, s.typingId ?? -1);
  s = receiveReply(sendMessage(s, 'actually Delhi'), reply('Delhi it is.', { destination: 'Delhi', start: 'Pune' }, false));
  assert.deepEqual(s.trip, { ...EMPTY_TRIP, destination: 'Delhi', start: 'Pune' });
});

test('ready from the server needs a start and a destination, and a real reply can end ready', () => {
  const s = receiveReply(sendMessage(ready0(), 'x'), reply('go', { travel_mode: 'road', crew_size: 2 }, true));
  assert.equal(s.ready, false);
  const t = receiveReply(sendMessage(ready0(), 'x'), reply('go', KNOWN, true));
  assert.equal(t.ready, true);
});

test('mergeTrip keeps the previous draft only for an all-null trip', () => {
  const prev: TripDraft = { ...EMPTY_TRIP, ...KNOWN };
  assert.equal(mergeTrip(prev, EMPTY_TRIP), prev);
  const next: TripDraft = { ...EMPTY_TRIP, crew_size: 5 };
  assert.equal(mergeTrip(prev, next), next);
});
