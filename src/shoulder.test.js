import test from 'node:test';
import assert from 'node:assert/strict';
import { shoulderObservation, shoulderImageType } from './shoulder.js';
test('shoulder observations require a side and real calendar date',()=>{
  assert.deepEqual(shoulderObservation({shoulder_side:'left',observed_date:'2026-11-02'}),{side:'left',date:'2026-11-02',comment:''});
  for(const value of [{shoulder_side:'both',observed_date:'2026-11-02'},{shoulder_side:'right',observed_date:'2026-02-30'}])assert.throws(()=>shoulderObservation(value));
});
test('shoulder uploads reject text and SVG masquerading as photos',()=>{
  assert.throws(()=>shoulderImageType(Buffer.from('<svg onload="alert(1)"></svg>')));
  assert.throws(()=>shoulderImageType(Buffer.from('not an image')));
  assert.deepEqual(shoulderImageType(Buffer.from([255,216,255,224])),['jpg','image/jpeg']);
});
