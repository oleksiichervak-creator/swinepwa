import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSeekplace } from './seekplace.js';

const valid = { box_number: '1.2', registration_date: '2026-09-14', pig_number: '00123', group_number: '07' };
test('registration preserves identifiers and defaults to observation', () => {
  assert.deepEqual(validateSeekplace({ ...valid, box_number: ' 1.2 ' }), { ...valid, status: 'observation' });
  assert.equal(validateSeekplace({ ...valid, status: 'recovered' }).status, 'recovered');
});
test('rejects missing identifiers, excessive lengths and unsupported statuses', () => {
  for (const change of [{ box_number: ' ' }, { pig_number: '' }, { group_number: '' }, { pig_number: '1'.repeat(101) }, { status: 'other' }, { status: null }]) {
    assert.throws(() => validateSeekplace({ ...valid, ...change }), { status: 400 });
  }
});
test('validates calendar dates without timezone conversion or normalization', () => {
  for (const registration_date of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-09-14T12:00:00Z', '', null, '0000-01-01']) {
    assert.throws(() => validateSeekplace({ ...valid, registration_date }), { status: 400 });
  }
  assert.equal(validateSeekplace({ ...valid, registration_date: '2028-02-29' }).registration_date, '2028-02-29');
});
