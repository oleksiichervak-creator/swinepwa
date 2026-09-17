export const DEPARTMENT_ACCESS = ['lobe_dragte','farestald'];
export function validateDepartmentAccess(value) {
  if (!Array.isArray(value) || !value.length || value.some(x=>!DEPARTMENT_ACCESS.includes(x))) {
    throw Object.assign(new Error('Select Lobe/Dragte, Farestald, or both departments'),{status:400});
  }
  return [...new Set(value)];
}
export function canAccessDepartment(user,department) {
  return user.role==='admin' || (user.department_access || []).includes(department);
}
export function routeDepartment(url) {
  const path=new URL(url,'http://local').pathname.replace(/^\/api(?=\/)/i,'');
  const first=decodeURIComponent(path.split('/')[1]||'').toLowerCase();
  if(first==='farestald')return 'farestald';
  if(['medicine-sow','medicine-sow-storage','planed-sow-injections','done-sow-injections','altersyn','done-altersyn','vaccines','vaccination-schedules','planned-vaccines','done-vaccines','seekplace','sickplace','injection-pwa'].includes(first))return 'lobe_dragte';
  return null;
}
