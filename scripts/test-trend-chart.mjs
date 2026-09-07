import assert from 'node:assert/strict';
import { computeZoomedDomain, estimateAxisWidth, computeLinearTicks } from '../src/components/charts/trendChartUtils.js';

// Regression: a stray NaN, a non-numeric value, a missing values array, or
// an undefined target used to be able to produce a NaN domain, which
// Recharts' own bundled internals then crashed on with an opaque "Cannot
// read properties of undefined (reading 'value')" deep inside its own code
// — nowhere near this file, and not reproducible by reading the stack trace
// alone. None of these malformed shapes should ever produce a non-finite
// domain endpoint.
const malformedCases = [
  { series: [{ values: [99.1, NaN, 98.7, undefined] }], target: 99.5 },
  { series: [{ values: ['abc', 99.1, null] }], target: 99.5 },
  { series: [{ values: [] }], target: NaN },
  { series: [], target: 99.5 },
  { series: [{ values: null }], target: undefined },
  { series: undefined, target: 99.5 },
];

for (const { series, target } of malformedCases) {
  const domain = computeZoomedDomain(series, target);
  for (const endpoint of domain) {
    if (typeof endpoint === 'number') assert.ok(Number.isFinite(endpoint), `non-finite domain endpoint for ${JSON.stringify({ series, target })}`);
  }
  // Whatever domain comes out, feeding it to computeLinearTicks must never
  // throw or produce NaN ticks either.
  const ticks = typeof domain[0] === 'number' && typeof domain[1] === 'number' ? computeLinearTicks(domain[0], domain[1]) : undefined;
  if (ticks) assert.ok(ticks.every((t) => Number.isFinite(t)));

  assert.doesNotThrow(() => estimateAxisWidth(series, '%'));
}

// Sanity check: a normal, well-formed series still zooms in correctly.
const [min, max] = computeZoomedDomain([{ values: [99.2, 99.8, 99.5] }], 99.5);
assert.ok(min < 99.2 && max > 99.8);

console.log('trend chart domain/tick regression tests: PASS');
