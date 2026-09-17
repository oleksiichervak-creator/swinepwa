import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFarrowingSows,farrowingDiagnosis,farrowingDose } from '../public/farrowings-data.js';
test('Excel columns and rows preserve sow numbers including leading zeros',()=>{
  assert.deepEqual(parseFarrowingSows('00123\r\n456\t789\n'),['00123','456','789']);
  assert.equal(parseFarrowingSows(Array.from({length:40},(_,i)=>String(i+1)).join('\t')).length,40);
  for(const text of ['', '123\n123','Sow\n123','123.5',Array.from({length:41},(_,i)=>String(i+1)).join('\n')])assert.throws(()=>parseFarrowingSows(text));
});
test('Farrowing doses use configured medicine ratios and a fixed 250 kg weight',()=>{
  assert.equal(farrowingDose({dose_ml:2,dose_kg:100}),5);
  assert.equal(farrowingDose({dose_ml:1,dose_kg:100}),2.5);
  assert.equal(farrowingDiagnosis(' Pain(M) '),'pain(m)');
  assert.equal(farrowingDiagnosis('Milk deficiency (OX)'),'milkdeficiency(ox)');
  for(const medicine of [{dose_ml:0,dose_kg:100},{dose_ml:1,dose_kg:0},{dose_ml:-1,dose_kg:1},{}])assert.throws(()=>farrowingDose(medicine));
});
