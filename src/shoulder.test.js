import test from 'node:test';
import assert from 'node:assert/strict';
import { shoulderObservation, shoulderImageType } from './shoulder.js';
import { shouldersDue, SHOULDER_CONDITIONS } from '../public/shoulder-conditions.js';
test('daily checks track both shoulders, exempt healed shoulders and closed sows',()=>{
  const pig={active:true,latest_assessments:[]};
  assert.deepEqual(shouldersDue(pig,'2026-11-02'),['left','right']);
  pig.latest_assessments=[{shoulder_side:'left',condition_code:'grade_1',observed_date:'2026-11-02'},{shoulder_side:'right',condition_code:'healed',observed_date:'2026-11-01'}];
  assert.deepEqual(shouldersDue(pig,'2026-11-02'),[]);
  assert.deepEqual(shouldersDue(pig,'2026-11-03'),['left']);
  assert.deepEqual(shouldersDue({...pig,active:false},'2026-11-03'),[]);
  assert.equal(SHOULDER_CONDITIONS.length,6);
  assert.ok(SHOULDER_CONDITIONS.find(x=>x.code==='grade_4').warning.startsWith('CRITICAL'));
});
test('shoulder observations require a side and real calendar date',()=>{
  assert.deepEqual(shoulderObservation({shoulder_side:'left',observed_date:'2026-11-02'}),{side:'left',date:'2026-11-02',comment:''});
  for(const value of [{shoulder_side:'both',observed_date:'2026-11-02'},{shoulder_side:'right',observed_date:'2026-02-30'}])assert.throws(()=>shoulderObservation(value));
});
test('shoulder uploads reject text and SVG masquerading as photos',()=>{
  assert.throws(()=>shoulderImageType(Buffer.from('<svg onload="alert(1)"></svg>')));
  assert.throws(()=>shoulderImageType(Buffer.from('not an image')));
  assert.deepEqual(shoulderImageType(Buffer.from([255,216,255,224])),['jpg','image/jpeg']);
});
