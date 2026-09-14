import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSeekplaceCard } from './seekplace-card.js';

test('card includes ten consecutive inspection dates across a year boundary and escapes content', () => {
  const page = renderSeekplaceCard({ pig_number: '<123>', group_number: '007', box_number: '1', registration_date: '2026-12-28', status: 'observation' }, [{ injection_date: '2026-12-28', treatment_status: 'Given', medicine_name: '<Drug>', dose_ml: 5, comment: '<script>alert(1)</script>' }], { date_from: '2026-11-28', date_to: '2026-12-28' });
  assert.equal((page.match(/class="handwriting"/g) || []).length, 10);
  assert.ok(page.includes('2027-01-06'));
  assert.ok(!page.includes('2027-01-07'));
  assert.ok(page.includes('&lt;123&gt;'));
  assert.ok(page.includes('&lt;Drug&gt;'));
  assert.ok(!page.includes('<script>'));
  assert.ok(page.includes('007'));
  assert.ok(page.includes('<th>Diagnosis</th>'));
});

test('card displays and escapes the diagnosis for each medicine', () => {
  const page = renderSeekplaceCard({ registration_date: '2026-09-14' }, [
    { medicine_name: 'A', treatment_status: 'Planned', diagnosis: 'Diagnosis A' },
    { medicine_name: 'B', treatment_status: 'Given', diagnosis: '<Diagnosis B>' },
  ], {});
  assert.ok(page.includes('<td>Diagnosis A</td>'));
  assert.ok(page.includes('<td>&lt;Diagnosis B&gt;</td>'));
  assert.ok(!page.includes('<Diagnosis B>'));
});
test('card handles an empty medicine history', () => {
  const page = renderSeekplaceCard({ registration_date: '2028-02-25' }, [], {});
  assert.ok(page.includes('No planned or given medicine'));
  assert.ok(page.includes('2028-02-29'));
  assert.ok(page.includes('2028-03-05'));
});
