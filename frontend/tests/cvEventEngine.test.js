import test from 'node:test';
import assert from 'node:assert/strict';
import { CVEventEngine } from '../src/proctoring/cvEventEngine.js';

function harness(config = {}) {
  let t = 1_000_000;
  let n = 0;
  const events = [];
  const engine = new CVEventEngine(config, (e) => events.push(e), {
    clock: () => ({ wall: t, mono: t }),
    idFactory: () => `evt-${++n}`,
  });
  const frame = (f, advanceMs = 500) => { t += advanceMs; engine.processFrame(f); };
  return { engine, events, frame, now: () => t };
}

const PHONE = { faceCount: 1, headYaw: 0, headPitch: 0, phoneDetections: [{ confidence: 0.9, bbox: [1, 2, 3, 4] }] };
const NONE  = { faceCount: 1, headYaw: 0, headPitch: 0, phoneDetections: [] };
const phases = (events, type) => events.filter((e) => e.event_type === type).map((e) => e.phase);

test('candidate is emitted on the FIRST observation (before temporal confirmation)', () => {
  const h = harness();
  h.frame(PHONE);
  assert.deepEqual(phases(h.events, 'phone_detected'), ['candidate']);
});

test('continuous phone for ~5s => ONE episode: one candidate, one start, one end; duration ~5s', () => {
  const h = harness();
  for (let i = 0; i < 11; i++) h.frame(PHONE); // 11 frames @500ms => observed span 5000ms
  for (let i = 0; i < 6; i++) h.frame(NONE);   // gone beyond release window
  const ph = h.events.filter((e) => e.event_type === 'phone_detected');
  assert.deepEqual(ph.map((e) => e.phase), ['candidate', 'start', 'end']);
  assert.equal(new Set(ph.map((e) => e.event_id)).size, 1);
  const end = ph.find((e) => e.phase === 'end');
  assert.equal(end.event_status, 'confirmed');
  assert.equal(end.duration_ms, 5000);
  // end time is the LAST observation, start time is the FIRST observation
  assert.equal(Date.parse(end.client_ended_at) - Date.parse(end.client_started_at), 5000);
});

test('phone leaves and returns later => SEPARATE episodes with their own ids/durations', () => {
  const h = harness();
  for (let i = 0; i < 5; i++) h.frame(PHONE);
  for (let i = 0; i < 10; i++) h.frame(NONE);
  for (let i = 0; i < 4; i++) h.frame(PHONE);
  for (let i = 0; i < 10; i++) h.frame(NONE);
  const ends = h.events.filter((e) => e.event_type === 'phone_detected' && e.phase === 'end');
  assert.equal(ends.length, 2);
  assert.notEqual(ends[0].event_id, ends[1].event_id);
  assert.equal(ends[0].duration_ms, 2000);
  assert.equal(ends[1].duration_ms, 1500);
});

test('a single missed frame does not fragment an episode (release hysteresis)', () => {
  const h = harness();
  for (let i = 0; i < 4; i++) h.frame(PHONE);
  h.frame(NONE);                                  // flicker
  for (let i = 0; i < 4; i++) h.frame(PHONE);
  for (let i = 0; i < 6; i++) h.frame(NONE);
  const ph = h.events.filter((e) => e.event_type === 'phone_detected');
  assert.equal(ph.filter((e) => e.phase === 'start').length, 1);
  assert.equal(ph.filter((e) => e.phase === 'end').length, 1);
});

test('candidate that vanishes before confirmation is REJECTED, never a confirmed event', () => {
  const h = harness();
  h.frame(PHONE);                 // candidate
  for (let i = 0; i < 6; i++) h.frame(NONE);
  assert.deepEqual(phases(h.events, 'phone_detected'), ['candidate', 'rejected']);
  assert.ok(!h.events.some((e) => e.phase === 'start' || e.phase === 'end'));
});

test('multiple faces: face count is real and drives its own episode', () => {
  const h = harness();
  const two = { faceCount: 2, headYaw: null, headPitch: null, phoneDetections: [] };
  for (let i = 0; i < 7; i++) h.frame(two);
  for (let i = 0; i < 4; i++) h.frame(NONE);
  assert.deepEqual(phases(h.events, 'multiple_faces'), ['candidate', 'start', 'end']);
  assert.equal(h.events.find((e) => e.event_type === 'multiple_faces' && e.phase === 'start').metadata.face_count, 2);
});

test('unavailable model (faceCount null) never produces face events', () => {
  const h = harness();
  for (let i = 0; i < 30; i++) h.frame({ faceCount: null, headYaw: null, headPitch: null, phoneDetections: [] });
  assert.equal(h.events.length, 0);
});

test('face_absent needs its grace period; sustained head turn needs duration', () => {
  const h = harness();
  const absent = { faceCount: 0, headYaw: null, headPitch: null, phoneDetections: [] };
  for (let i = 0; i < 4; i++) h.frame(absent); // 2s < 5s grace
  assert.ok(!h.events.some((e) => e.event_type === 'face_absent' && e.phase === 'start'));
  for (let i = 0; i < 8; i++) h.frame(absent);
  assert.ok(h.events.some((e) => e.event_type === 'face_absent' && e.phase === 'start'));

  const h2 = harness();
  const turned = { faceCount: 1, headYaw: 45, headPitch: 0, phoneDetections: [] };
  for (let i = 0; i < 8; i++) h2.frame(turned); // 3.5s >= 3s
  assert.ok(h2.events.some((e) => e.event_type === 'sustained_head_turn' && e.phase === 'start'));
});

test('flush closes active episodes and rejects unconfirmed candidates (submission)', () => {
  const h = harness();
  for (let i = 0; i < 5; i++) h.frame(PHONE);
  h.engine.flushActiveEvents();
  assert.ok(h.events.some((e) => e.event_type === 'phone_detected' && e.phase === 'end'));
  const h2 = harness();
  h2.frame(PHONE);
  h2.engine.flushActiveEvents();
  assert.deepEqual(phases(h2.events, 'phone_detected'), ['candidate', 'rejected']);
});
