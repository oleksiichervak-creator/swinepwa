import { SHOULDER_CONDITIONS, shouldersDue } from './shoulder-conditions.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,10);};
export function setupShoulder(root,getToken,options={}) {
  if(!document.querySelector('link[data-shoulder]')){const css=document.createElement('link');css.rel='stylesheet';css.href='/shoulder.css';css.dataset.shoulder='';document.head.append(css);}
  const base='/api/farestald/shoulder';let pigs=[],pens=[],selected=null,side='left',urls=[],generation=0,mode='info';
  const revoke=()=>{urls.forEach(URL.revokeObjectURL);urls=[];};
  async function request(path,options={}){
    const response=await fetch(base+path,{...options,headers:{Authorization:'Bearer '+getToken(),...(options.body instanceof FormData?{}:{'Content-Type':'application/json'})}});
    if(response.status===401){options.onUnauthorized?.();throw new Error('Please sign in again.');}
    if(!response.ok){const e=await response.json().catch(()=>({}));throw new Error(e.error||'Request failed');}return response.json();
  }
  root.classList.add('shoulder');
  root.innerHTML='<div class="shoulder-toolbar"><h2>Shoulder</h2><button data-add>Add sow</button><button data-refresh class="secondary">Refresh</button></div><p class="error" data-error role="alert"></p><div data-list><label>Find sow<input type="search" data-search inputmode="numeric"></label><label>Observation<select data-filter><option value="active">Active</option><option value="closed">Closed</option><option value="all">All</option></select></label><div class="shoulder-list" data-cards></div></div><div data-detail hidden></div>';
  const $=s=>root.querySelector(s),error=$('[data-error]');
  const penOptions=id=>'<option value="">Select pen</option>'+pens.map(p=>`<option value="${p.id}" ${String(id)===String(p.id)?'selected':''}>${esc(p.room_name)} / ${esc(p.name)}</option>`).join('');
  function list(){
    const q=$('[data-search]').value.trim().toLowerCase(),filter=$('[data-filter]').value;
    const rows=pigs.filter(p=>(mode!=='today'||shouldersDue(p,today()).length>0)&&p.sow_number.toLowerCase().includes(q)&&(filter==='all'||p.active===(filter==='active'))).sort((a,b)=>a.sow_number.localeCompare(b.sow_number,undefined,{numeric:true}));
    $('[data-cards]').innerHTML=rows.length?rows.map(p=>`<button class="shoulder-pig" data-pig="${p.id}"><strong>Sow ${esc(p.sow_number)}</strong><span>${esc(p.room_name)} / Pen ${esc(p.pen_name)}</span><small>${p.active?'Active':'Closed'} &middot; ${p.last_photo_date ? 'Last photo: '+esc(p.last_photo_date) : 'No photos yet'}${p.active&&p.last_photo_date!==today()?' - No photo today':''}</small>${mode==='today'?`<span>To check: ${shouldersDue(p,today()).join(', ')}</span>`:''}</button>`).join(''):(mode==='today'?'<p>All active shoulders have been checked today.</p>':'<p>No sows found.</p>');
    root.querySelectorAll('[data-pig]').forEach(b=>b.onclick=()=>{const pig=pigs.find(p=>String(p.id)===b.dataset.pig);if(mode==='location')editPig(pig,true);else{if(mode==='today')side=shouldersDue(pig,today())[0]||'left';openPig(b.dataset.pig);}});
  }
  function back(){generation++;revoke();selected=null;$('[data-detail]').hidden=true;$('[data-list]').hidden=false;}
  async function load(){error.textContent='';try{[pigs,pens]=await Promise.all([request('/pigs'),request('/pens')]);list();return true;}catch(e){error.textContent=e.message;return false;}}
  async function openPig(id){
    const version=++generation;error.textContent='';revoke();
    try{const data=await request('/pigs/'+id);if(version!==generation)return;selected=data;$('[data-list]').hidden=true;$('[data-detail]').hidden=false;renderDetail();}catch(e){error.textContent=e.message;}
  }
  function modal(title,fields,onSave){
    const dialog=document.createElement('dialog');dialog.className='shoulder-dialog';dialog.innerHTML=`<form><h2>${title}</h2>${fields}<p class="error" role="alert"></p><div class="shoulder-toolbar"><button type="button" class="secondary">Cancel</button><button type="submit">Save</button></div></form>`;document.body.append(dialog);
    const form=dialog.querySelector('form');dialog.querySelector('[type=button]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
    form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;form.querySelector('.error').textContent='';try{await onSave(form);dialog.close();}catch(e){form.querySelector('.error').textContent=e.message;}finally{button.disabled=false;}};
    dialog.showModal();return form;
  }
  function editPig(pig,locationOnly=false){
    modal(locationOnly?'Change location':pig?'Sow details':'Add sow',`<label ${locationOnly?'hidden':''}>Sow number<input name="sow_number" required maxlength="100" inputmode="numeric" value="${esc(pig?.sow_number)}"></label><label>Current pen<select name="pen_id" required>${penOptions(pig?.pen_id)}</select></label>${pig?`<label ${locationOnly?'hidden':''}>Observation<select name="active"><option value="true" ${pig.active?'selected':''}>Active</option><option value="false" ${!pig.active?'selected':''}>Closed</option></select></label>`:''}`,async form=>{
      const data=Object.fromEntries(new FormData(form));if(pig)data.active=data.active==='true';
      const saved=await request('/pigs'+(pig?'/'+pig.id:''),{method:pig?'PATCH':'POST',body:JSON.stringify(data)});await load();await openPig(saved.id);
    });
  }
  const observationFields=()=>`<label>Side<select name="shoulder_side"><option value="left" ${side==='left'?'selected':''}>Left</option><option value="right" ${side==='right'?'selected':''}>Right</option></select></label><label>Observation date<input type="date" name="observed_date" required value="${today()}"></label>`;
  function renderDetail(){
    revoke();const {pig,photos,assessments}=selected,visible=photos.filter(x=>x.shoulder_side===side),history=assessments.filter(x=>x.shoulder_side===side);
    const detail=$('[data-detail]');
    detail.innerHTML=`<button class="secondary" data-back>Back to sows</button><div class="shoulder-toolbar"><h2>Sow ${esc(pig.sow_number)}</h2><button data-edit>Edit sow / pen</button></div><p>Current pen: <strong>${esc(pig.room_name)} / ${esc(pig.pen_name)}</strong> · ${pig.active?'Active':'Closed'}</p><div class="shoulder-tabs"><button data-side="left" aria-pressed="${side==='left'}">Left shoulder</button><button data-side="right" aria-pressed="${side==='right'}">Right shoulder</button></div><p>${visible.some(x=>x.observed_date===today())?'Photo added today':'No photo today for this shoulder'}</p>${pig.active?'<div class="shoulder-toolbar"><button data-photo>Add photo</button><button data-assess>Add assessment</button></div>':''}<h3>Photos</h3><div class="shoulder-photos">${visible.map(x=>`<article><img data-photo-id="${x.id}" alt="${esc(x.shoulder_side)} shoulder, ${esc(x.observed_date)}" loading="lazy"><strong>${esc(x.observed_date)}</strong><p>Pen at capture: ${esc(x.pen_label)}</p><p>${esc(x.comment)}</p><small>${esc(x.created_by)}</small></article>`).join('')||'<p>No photos for this shoulder.</p>'}</div><h3>Assessment and treatment history</h3>${history.map(x=>`<article class="shoulder-assessment"><strong>${esc(x.observed_date)}</strong><p><b>Condition:</b> ${esc(x.condition)}</p><p><b>Selected treatment:</b> ${esc(x.treatment)}</p><p>${esc(x.comment)}</p>${x.photo_id?`<small>Photo #${x.photo_id} · </small>`:''}<small>${esc(x.created_by)}</small></article>`).join('')||'<p>No assessments yet.</p>'}`;
    detail.querySelector('[data-back]').onclick=()=>{back();load();};detail.querySelector('[data-edit]').onclick=()=>editPig(pig);
    detail.querySelectorAll('[data-side]').forEach(b=>b.onclick=()=>{generation++;side=b.dataset.side;renderDetail();});
    if(pig.active){detail.querySelector('[data-photo]').onclick=()=>addPhoto(pig);detail.querySelector('[data-assess]').onclick=()=>addAssessment(pig,photos);}
    const version=generation;
    detail.querySelectorAll('[data-photo-id]').forEach(async img=>{
      try{const response=await fetch(base+'/photos/'+img.dataset.photoId+'/file',{headers:{Authorization:'Bearer '+getToken()}});if(!response.ok)throw new Error();const blob=await response.blob();if(version!==generation||!img.isConnected)return;const url=URL.createObjectURL(blob);urls.push(url);img.src=url;img.onclick=()=>showPhoto(url,img.alt);}catch{if(img.isConnected)img.alt='Photo could not be loaded. Refresh to retry.';}
    });
  }
  function showPhoto(url,alt){const dialog=document.createElement('dialog');dialog.className='shoulder-dialog';dialog.innerHTML=`<button type="button">Close</button><img style="width:100%;height:auto" alt="${esc(alt)}">`;dialog.querySelector('img').src=url;dialog.querySelector('button').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();}
  async function compress(file){
    if(!file)throw new Error('Take or select a photo');
    if(file.size>30*1024*1024)throw new Error('Original photo must be at most 30 MB');
    let bitmap;try{bitmap=await createImageBitmap(file);}catch{throw new Error('This photo format cannot be read. Use JPEG, PNG or WebP.');}
    try{const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not prepare photo')),'image/jpeg',0.85));}finally{bitmap.close();}
  }
  function addPhoto(pig){
    const form=modal('Add shoulder photo',observationFields()+`<p>Current pen: ${esc(pig.room_name)} / ${esc(pig.pen_name)}. Change it in the sow card before taking the photo if needed.</p><label>Photo<input type="file" name="photo" accept="image/*" capture="environment" required></label><img data-preview hidden style="width:100%;max-height:240px;object-fit:contain"><label>Comment<textarea name="comment" maxlength="2000"></textarea></label>`,async form=>{
      const body=new FormData(form),blob=await compress(form.elements.photo.files[0]);body.set('photo',blob,'shoulder.jpg');await request('/pigs/'+pig.id+'/photos',{method:'POST',body});side=form.elements.shoulder_side.value;await openPig(pig.id);
    });
    let preview;form.elements.photo.onchange=()=>{if(preview)URL.revokeObjectURL(preview);const file=form.elements.photo.files[0],img=form.querySelector('[data-preview]');img.hidden=!file;if(file){preview=URL.createObjectURL(file);img.src=preview;}};
    form.closest('dialog').addEventListener('close',()=>{if(preview)URL.revokeObjectURL(preview);});
  }
  function addAssessment(pig,photos){
    const form=modal('Add assessment',observationFields()+`<label>Shoulder Condition<select name="condition_code" required><option value="">Select condition</option>${SHOULDER_CONDITIONS.map(x=>`<option value="${x.code}">${x.icon} ${esc(x.label)}</option>`).join('')}</select></label><div data-condition-guide aria-live="polite"></div>`+'<label>Selected treatment<textarea name="treatment" maxlength="1000" required placeholder="Enter the selected treatment or observation only"></textarea></label><label>Related photo (optional)<select name="photo_id"></select></label><label>Comment<textarea name="comment" maxlength="2000"></textarea></label><p>This records the selected treatment; it does not create injections.</p>',async form=>{await request('/pigs/'+pig.id+'/assessments',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});side=form.elements.shoulder_side.value;await openPig(pig.id);});
    const guide=form.querySelector('[data-condition-guide]');
    form.elements.condition_code.onchange=()=>{
      const c=SHOULDER_CONDITIONS.find(x=>x.code===form.elements.condition_code.value);
      guide.innerHTML=c?`<div class="shoulder-condition ${c.color}"><strong>${c.icon} ${esc(c.label)}</strong><p>${esc(c.description)}</p><p><b>Action:</b> ${esc(c.action)}</p>${c.warning?'<p class="condition-urgent">'+esc(c.warning)+'</p>':''}</div>`:'';
    };
    const options=()=>{form.elements.photo_id.innerHTML='<option value="">No linked photo</option>'+photos.filter(x=>x.shoulder_side===form.elements.shoulder_side.value).map(x=>`<option value="${x.id}">${esc(x.observed_date)} · Photo #${x.id}</option>`).join('');};form.elements.shoulder_side.onchange=options;options();
  }
  $('[data-add]').onclick=()=>editPig();$('[data-refresh]').onclick=()=>selected?openPig(selected.pig.id):load();$('[data-search]').oninput=list;$('[data-filter]').onchange=list;
  if(options.standalone){$('[data-add]').hidden=true;root.querySelector('.shoulder-toolbar h2').hidden=true;}
  return {show:async next=>{mode=next;back();$('[data-filter]').value=next==='info'?'all':'active';$('[data-search]').value='';$('[data-filter]').closest('label').hidden=next==='today';const ready=await load();if(ready&&next==='add')editPig();},load:async()=>{back();await load();},reset:()=>{back();pigs=[];pens=[];$('[data-cards]').innerHTML='';$('[data-detail]').innerHTML='';document.querySelectorAll('.shoulder-dialog').forEach(d=>d.close());}};
}
