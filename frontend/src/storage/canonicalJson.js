/**
 * ExamProctor.ai — Canonical JSON (must match the backend exactly).
 *
 * Backend (app/api/v1/sync.py::_canonical_payload_hash) computes:
 *   json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
 *
 * The previous client implementation used
 *   JSON.stringify(payload, Object.keys(payload).sort())
 * whose array "replacer" is applied at EVERY nesting level, so nested keys
 * (e.g. answer_value.selected_option, metadata.*) were silently dropped and the
 * hash never matched the server for any payload that contained a nested object.
 *
 * This module is pure (no browser APIs) so it can be unit-tested with Node.
 */

/** Recursively serialise with sorted keys, compact separators, ASCII-only. */
export function canonicalJson(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalJson(v)).join(',') + ']';
  }
  switch (typeof value) {
    case 'string':
      return escapeNonAscii(JSON.stringify(value));
    case 'number':
      return Number.isFinite(value) ? JSON.stringify(value) : 'null';
    case 'boolean':
      return value ? 'true' : 'false';
    case 'object': {
      const keys = Object.keys(value)
        .filter((k) => value[k] !== undefined)
        .sort(compareCodePoints);
      return (
        '{' +
        keys.map((k) => escapeNonAscii(JSON.stringify(k)) + ':' + canonicalJson(value[k])).join(',') +
        '}'
      );
    }
    default:
      return 'null';
  }
}

// Python sorts str keys by Unicode code point; JS default sort is by UTF-16 unit.
function compareCodePoints(a, b) {
  const ia = Array.from(a);
  const ib = Array.from(b);
  const n = Math.min(ia.length, ib.length);
  for (let i = 0; i < n; i++) {
    const ca = ia[i].codePointAt(0);
    const cb = ib[i].codePointAt(0);
    if (ca !== cb) return ca - cb;
  }
  return ia.length - ib.length;
}

// Python ensure_ascii escapes everything above 0x7F as \uXXXX (lowercase hex,
// surrogate pairs for astral code points). DEL (0x7F) is left as-is.
function escapeNonAscii(s) {
  return s.replace(/[\u0080-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

/** Round to 4 dp so JS and Python never disagree on exponent formatting. */
export function round4(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return n;
  return Math.round(n * 1e4) / 1e4;
}
