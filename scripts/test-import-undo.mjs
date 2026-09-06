import assert from 'node:assert/strict';
import { planProdVolUndo } from '../api/yield.js';
import { parseDateTime } from '../src/brain/datetime.js';
import { splitDelimited } from '../src/brain/delimited.js';

// Strict date parsing: reject normalization and trailing junk.
assert.equal(parseDateTime('02/29/2024 08:23:15')?.getDate(), 29);
assert.equal(parseDateTime('02/30/2025 08:23:15'), null);
assert.equal(parseDateTime('13/01/2025 08:23:15'), null);
assert.equal(parseDateTime('04/07/2025 08:23:15junk'), null);
assert.equal(parseDateTime('04/07/2025 24:00:00'), null);

// CSV/TSV parsing: quoted delimiters, escaped quotes, and CRLF must remain intact.
assert.deepEqual(splitDelimited('Customer,Model,Note\r\nACME,MX-1,"Repair, urgent"\r\n"A""B",M2,"line 1\nline 2"'), [
  ['Customer', 'Model', 'Note'],
  ['ACME', 'MX-1', 'Repair, urgent'],
  ['A"B', 'M2', 'line 1\nline 2']
]);
assert.deepEqual(splitDelimited('Customer\tModel\tNote\nACME\tMX-1\t"A\tB"'), [
  ['Customer', 'Model', 'Note'],
  ['ACME', 'MX-1', 'A\tB']
]);

// Same record, same field, changed in two sequential batches of one import.
{
  const records = { row1: { week: 'W1', customer: 'ACME', model: 'M1', inspTOP: 200, inspBOT: 50 } };
  const events = [
    { kind: 'update', recordId: 'row1', field: 'inspTOP', before: 100, after: 150 },
    { kind: 'update', recordId: 'row1', field: 'inspTOP', before: 150, after: 200 }
  ];
  const plan = planProdVolUndo(records, events);
  assert.deepEqual(plan, {
    deletes: [],
    reverts: [
      { id: 'row1', patch: { inspTOP: 100 } }
    ],
    skipped: 0
  });
}

// A later import changed the same field between batches of the target import.
// Undo must not clobber that later value.
{
  const records = { row1: { week: 'W1', customer: 'ACME', model: 'M1', inspTOP: 200, inspBOT: 50 } };
  const events = [
    { kind: 'update', recordId: 'row1', field: 'inspTOP', before: 100, after: 150 },
    // Later import wrote 175, then target import wrote 200.
    { kind: 'update', recordId: 'row1', field: 'inspTOP', before: 175, after: 200 }
  ];
  const plan = planProdVolUndo(records, events);
  assert.deepEqual(plan, {
    deletes: [],
    reverts: [
      { id: 'row1', patch: { inspTOP: 175 } }
    ],
    skipped: 1
  });
}

// A record created by the import can be removed only if it is unchanged.
{
  const records = {
    row1: { week: 'W1', customer: 'ACME', model: 'M1', inspTOP: 100, inspBOT: 0 }
  };
  const events = [{
    kind: 'create', recordId: 'row1',
    after: { week: 'W1', customer: 'ACME', model: 'M1', inspTOP: 100, inspBOT: 0 }
  }];
  assert.deepEqual(planProdVolUndo(records, events), {
    deletes: ['row1'], reverts: [], skipped: 0
  });
}

console.log('import undo regression tests: PASS');
