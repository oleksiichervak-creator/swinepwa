import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessDepartment, routeDepartment, validateDepartmentAccess } from './department-access.js';

test('department grants are explicit and administrators have both',()=>{
  assert.equal(canAccessDepartment({role:'user',department_access:['farestald']},'lobe_dragte'),false);
  assert.equal(canAccessDepartment({role:'user',department_access:['farestald']},'farestald'),true);
  assert.equal(canAccessDepartment({role:'user'},'farestald'),false);
  assert.equal(canAccessDepartment({role:'admin',department_access:[]},'lobe_dragte'),true);
  assert.deepEqual(validateDepartmentAccess(['farestald','farestald']),['farestald']);
  for(const input of [[],null,'farestald',['unknown'],['lobe_dragte','admin']])assert.throws(()=>validateDepartmentAccess(input),{status:400});
});
test('department protection covers aliases, nested mobile routes and case-insensitive paths',()=>{
  for(const route of ['medicine-sow','medicine-sow-storage','planed-sow-injections','done-sow-injections','altersyn','done-altersyn','vaccines','vaccination-schedules','planned-vaccines','done-vaccines','seekplace','sickplace','injection-pwa']){
    assert.equal(routeDepartment('/api/'+route+'/1'),'lobe_dragte');
    assert.equal(routeDepartment('/'+route+'/'),'lobe_dragte');
  }
  assert.equal(routeDepartment('/API/FARESTALD/mobile/plans/1/complete'),'farestald');
  assert.equal(routeDepartment('/api/%66arestald/medicine-sow'),'farestald');
  assert.equal(routeDepartment('/done-sow-injections/week-report-print?token=abc'),'lobe_dragte');
  for(const route of ['/api/auth/me','/api/users','/api/pens','/departments','/api/todos'])assert.equal(routeDepartment(route),null);
});
