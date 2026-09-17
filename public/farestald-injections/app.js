const $=selector=>document.querySelector(selector);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const date=new Date();return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10);};
let token=localStorage.getItem('farestald-injections-token')||'';
let user=null,medicines=[],todayItems=[],installPrompt=null;
async function api(path,options={}) {
  const response=await fetch('/api'+path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}});
  if(response.status===401&&token){signOut();throw new Error('Please sign in again.');}
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||'Request failed');}
  return response.status===204?null:response.json();
}
function screen(name){for(const id of ['home','add','today'])$(`#${id}-screen`).hidden=id!==name;$('#back').hidden=name==='home';$('#title').textContent=name==='home'?'Farestald':name==='add'?'Add injection':'Injections for today';}
function enter(){ $('#login-view').hidden=true;$('#app-view').hidden=false;$('#current-user').textContent=user.username;screen('home'); }
function signOut(){token='';user=null;medicines=[];todayItems=[];localStorage.removeItem('farestald-injections-token');$('#app-view').hidden=true;$('#login-view').hidden=false;$('#complete-dialog').close();$('#add-form').reset();$('#today-list').innerHTML='';}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),3000);}
async function loadUsers(){
  try{const users=await api('/auth/users');$('#login-user').innerHTML='<option value="">Choose user</option>'+users.map(x=>`<option value="${escape(x.username)}">${escape(x.username)}</option>`).join('');}
  catch(error){$('#login-error').textContent=error.message;}
}
$('#login-form').onsubmit=async event=>{
  event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;$('#login-error').textContent='';
  try{const result=await api('/auth/login',{method:'POST',body:JSON.stringify({username:$('#login-user').value,password:$('#login-password').value})});token=result.token;user=result.user;localStorage.setItem('farestald-injections-token',token);$('#login-password').value='';enter();}
  catch(error){$('#login-error').textContent=error.message;}finally{button.disabled=false;}
};
$('#logout').onclick=signOut;$('#back').onclick=()=>screen('home');
$('#show-add').onclick=async()=>{
  screen('add');const form=$('#add-form');form.reset();form.elements.injection_date.value=today();$('#add-error').textContent='';$('#dose-preview').textContent='';$('#save-plan').disabled=true;medicines=[];
  form.elements.pen_id.innerHTML='<option value="">Loading pens...</option>';form.elements.medicine_sow_id.innerHTML='<option value="">Loading medicines...</option>';
  form.elements.weight_kg.innerHTML='<option value="">Select weight</option>'+Array.from({length:18},(_,i)=>75+i*25).map(weight=>`<option value="${weight}">${weight} kg</option>`).join('');
  try{
    const [pens,items]=await Promise.all([api('/farestald/pens'),api('/farestald/medicine-sow')]);medicines=items;
    form.elements.pen_id.innerHTML='<option value="">Select pen</option>'+pens.map(p=>`<option value="${p.id}">${escape(p.room_name)} / ${escape(p.name)}</option>`).join('');
    form.elements.medicine_sow_id.innerHTML='<option value="">Select medicine</option>'+items.map(m=>`<option value="${m.id}">${escape(m.name)}</option>`).join('');
    if(!pens.length||!items.length)throw new Error('Add Farestald pens and medicines on the website first.');
    $('#save-plan').disabled=false;
  }catch(error){$('#add-error').textContent=error.message;}
};
function preview(){const form=$('#add-form'),medicine=medicines.find(m=>String(m.id)===form.elements.medicine_sow_id.value),weight=Number(form.elements.weight_kg.value);$('#dose-preview').textContent=medicine?`Diagnosis: ${medicine.diagnosis}. ${weight&&Number(medicine.dose_kg)>0?`Dose: ${(weight*Number(medicine.dose_ml)/Number(medicine.dose_kg)).toFixed(3)} ml. `:''}Course: ${Math.max(1,Number(medicine.course_days))} day(s), one injection per day.`:'';}
$('#add-form').elements.medicine_sow_id.onchange=preview;$('#add-form').elements.weight_kg.onchange=preview;
$('#add-form').onsubmit=async event=>{
  event.preventDefault();$('#save-plan').disabled=true;$('#add-error').textContent='';
  try{const result=await api('/farestald/mobile/plans',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))});toast(`${result.plans.length} injection(s) added to the plan`);screen('home');}
  catch(error){$('#add-error').textContent=error.message;}finally{$('#save-plan').disabled=false;}
};
async function loadToday(){
  const date=today();$('#today-date').textContent=date;$('#today-error').textContent='';$('#today-list').innerHTML='<p class="empty">Loading injections...</p>';$('#refresh').disabled=true;todayItems=[];
  try{
    todayItems=await api('/farestald/mobile/today?date='+date);
    $('#today-list').innerHTML=todayItems.length?todayItems.map(item=>`<article class="injection-card"><header><h2>Pen ${escape(item.pen_name)}</h2><strong>Sow ${escape(item.sow_number)}</strong></header><div class="medicine">${escape(item.medicine_name)} &middot; ${escape(item.dose_ml)} ml</div><div class="meta"><span>${escape(item.room_name)}</span><span>${escape(item.weight_kg??'')} kg</span></div><p>${escape(item.diagnosis)}</p>${item.comment?`<p>${escape(item.comment)}</p>`:''}<button class="complete-button" data-id="${item.id}">Register injection</button></article>`).join(''):'<p class="empty">No planned injections for today.</p>';
    document.querySelectorAll('[data-id]').forEach(button=>button.onclick=()=>openComplete(todayItems.find(x=>String(x.id)===button.dataset.id)));
  }catch(error){$('#today-list').innerHTML='';$('#today-error').textContent=error.message;}
  finally{$('#refresh').disabled=false;}
}
$('#show-today').onclick=()=>{screen('today');loadToday();};$('#refresh').onclick=loadToday;
function openComplete(item){
  const form=$('#complete-form');form.reset();form.elements.id.value=item.id;form.elements.injection_date.value=today();form.elements.dose_ml.value=item.dose_ml;form.elements.comment.value=item.comment||'';
  $('#complete-details').innerHTML=`<dt>Sow</dt><dd>${escape(item.sow_number)}</dd><dt>Pen</dt><dd>${escape(item.pen_name)}</dd><dt>Medicine</dt><dd>${escape(item.medicine_name)}</dd><dt>Diagnosis</dt><dd>${escape(item.diagnosis)}</dd>`;
  $('#complete-error').textContent='';$('#complete-dialog').showModal();
}
$('#complete-close').onclick=()=>$('#complete-dialog').close();
$('#complete-form').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type="submit"]');button.disabled=true;$('#complete-error').textContent='';
  try{const {id,...data}=Object.fromEntries(new FormData(form));await api(`/farestald/mobile/plans/${id}/complete`,{method:'POST',body:JSON.stringify(data)});$('#complete-dialog').close();toast('Injection registered');await loadToday();}
  catch(error){$('#complete-error').textContent=error.message;}finally{button.disabled=false;}
};

const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const installRequested=new URLSearchParams(location.search).get('install')==='1';
function installationHelp(){return /iPad|iPhone|iPod/.test(navigator.userAgent)?'In Safari, tap Share, then Add to Home Screen.':'Open the browser menu and select Install app or Add to Home screen.';}
function showInstall(){if(installRequested&&!standalone&&!$('#install-dialog').open){$('#install-message').textContent=installPrompt?'Install Farestald Injections on this device.':installationHelp();$('#install-dialog').showModal();}}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;showInstall();});
$('#install').onclick=async()=>{if(!installPrompt){$('#install-message').textContent=installationHelp();return;}await installPrompt.prompt();installPrompt=null;$('#install-dialog').close();};
window.addEventListener('appinstalled',()=>$('#install-dialog').close());
if('serviceWorker' in navigator)navigator.serviceWorker.register('/farestald-injections/sw.js',{scope:'/farestald-injections/',updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
loadUsers();
if(token){try{user=await api('/auth/me');enter();}catch(error){signOut();$('#login-error').textContent=error.message;}}
showInstall();
