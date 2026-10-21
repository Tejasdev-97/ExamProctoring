// Run with:  npm test   (uses Node's built-in test runner; no extra packages)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalJson, round4 } from '../src/storage/canonicalJson.js';

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

// Reference values produced by the BACKEND algorithm:
//   json.dumps(p, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
const ANSWER = {
  question_id: 'q1',
  answer_value: { selected_option: 'B' },
  revision: 2,
  client_updated_at: '2026-01-01T00:00:00.000Z',
};
const EVENT = {
  event_id: 'e',
  metadata: { yaw: 12.3457, bbox: [1, 2.5, 3, 4], z: null },
  duration_ms: 3000,
  t: 'caf\u00e9 \u4e2d \u{1F600}',
  b: true,
};

test('canonical hash of nested answer payload equals the backend hash', () => {
  assert.equal(sha(canonicalJson(ANSWER)), '8409077903cfd92681d630c3a1738993e3ca73c408af09fde0dc7356f32c9ff0');
});

test('canonical hash with unicode, nulls, arrays equals the backend hash', () => {
  assert.equal(sha(canonicalJson(EVENT)), '246d5f27e5f68fbe0ae08d99950b45dadab981dd7dc5219665d5d59881281a7e');
});

test('regression: the previous replacer-based algorithm did NOT match (nested keys dropped)', () => {
  const old = JSON.stringify(ANSWER, Object.keys(ANSWER).sort());
  assert.notEqual(sha(old), '8409077903cfd92681d630c3a1738993e3ca73c408af09fde0dc7356f32c9ff0');
  assert.ok(old.includes('"answer_value":{}'), 'old algorithm emptied the nested object');
});

test('key order does not matter; undefined keys are ignored', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), canonicalJson({ a: { c: 3, d: 2 }, b: 1, x: undefined }));
});

test('round4 avoids exponent formatting divergence', () => {
  assert.equal(round4(1.23456789), 1.2346);
  assert.equal(String(round4(0.00000001)), '0');
});
