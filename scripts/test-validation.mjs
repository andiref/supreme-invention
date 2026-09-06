import assert from 'node:assert/strict';
import { parseDateTime } from '../src/brain/datetime.js';
import { isValidDateTime, isValidIsoWeek } from '../api/_shared.js';

const valid = ['02/29/2024 08:23:15', '4/7/2025 8:23:15'];
for (const value of valid) {
  assert.ok(parseDateTime(value));
  assert.equal(isValidDateTime(value), true);
}
for (const value of ['02/30/2025 08:23:15', '13/01/2025 08:23:15', '04/07/2025 24:00:00', '04/07/2025 08:23:15junk']) {
  assert.equal(parseDateTime(value), null);
  assert.equal(isValidDateTime(value), false);
}

// ISO week labels ("YYYY-Www") — used for CAPA history keys and
// production-volume import rows. Garbage text or an out-of-range week
// number must never silently pass through as if it were a real week.
for (const value of ['2026-W01', '2026-W33', '2026-W53']) {
  assert.equal(isValidIsoWeek(value), true);
}
for (const value of ['hello', '2026-W99', '2026-W00', 'abc123', '2026-33', '', null, undefined]) {
  assert.equal(isValidIsoWeek(value), false);
}

console.log('date validation tests: PASS');
