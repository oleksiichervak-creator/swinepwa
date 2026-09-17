import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFarestald } from './farestald.js';

const injection = { sow_number:'00123',pen_id:'1',injection_date:'2028-02-29',medicine_sow_id:'2',dose_ml:'2.5',weight_kg:'',comment:'' };
test('Farestald validates injection dates and preserves sow identifiers', () => {
  const result=validateFarestald('planned-sow-injections',injection);
  assert.equal(result.sow_number,'00123');
  assert.equal(result.dose_ml,2.5);
  assert.equal(result.weight_kg,null);
  for(const change of [{injection_date:'2026-02-29'},{pen_id:0},{dose_ml:''},{dose_ml:-1},{weight_kg:1.5}]) {
    assert.throws(()=>validateFarestald('planned-sow-injections',{...injection,...change}),{status:400});
  }
});
test('Completed Farestald injections require a user', () => {
  assert.throws(()=>validateFarestald('done-sow-injections',injection),{status:400});
  assert.equal(validateFarestald('done-sow-injections',{...injection,given_by_user_id:'3'}).given_by_user_id,3);
});
test('Farestald stock requires whole bottle counts and nonnegative volumes', () => {
  const stock={medicine_sow_id:1,bottle_volume_ml:100,bottle_count:2,total_volume_ml:200};
  assert.deepEqual(validateFarestald('medicine-sow-storage',stock),stock);
  for(const change of [{bottle_count:1.5},{total_volume_ml:null},{bottle_volume_ml:-1}]) {
    assert.throws(()=>validateFarestald('medicine-sow-storage',{...stock,...change}),{status:400});
  }
});
