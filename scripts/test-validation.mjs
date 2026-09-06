import assert from 'node:assert/strict';
import { parseDateTime } from '../src/brain/datetime.js';
import { isValidDateTime } from '../api/_shared.js';

const valid = ['02/29/2024 08:23:15', '4/7/2025 8:23:15'];
for (const value of valid) {
  assert.ok(parseDateTime(value));
  assert.equal(isValidDateTime(value), true);
}
for (const value of ['02/30/2025 08:23:15', '13/01/2025 08:23:15', '04/07/2025 24:00:00', '04/07/2025 08:23:15junk']) {
  assert.equal(parseDateTime(value), null);
  assert.equal(isValidDateTime(value), false);
}

console.log('date validation tests: PASS');
