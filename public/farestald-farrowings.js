import { parseFarrowingSows,farrowingDose } from './farrowings-data.js';

export function setupFarrowings({api,getUser,reload}) {
  const $=selector=>document.querySelector(selector);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  $('#farestald-done-sow-injections-add').insertAdjacentHTML('beforebegin','<button id="farrowings-open" type="button" class="secondary" hidden>reg farowings med</button>');
  document.body.insertAdjacentHTML('beforeend',`<dialog id="farrowings-dialog"><form id="farrowings-form">
    <h2>Register farrowing medication</h2>
    <label>Sow numbers from Excel (1–40)<textarea name="sow_numbers" rows="7" required placeholder="Paste a column or row of sow numbers" maxlength="5000"></textarea></label>
    <p id="farrowings-count" aria-live="polite"></p>
    <label>Common pen for all sows<select name="pen_id" required></select></label>
    <label>Date<input type="date" name="injection_date" required></label>
    <label>Milk deficiency (OX)<select name="milk_medicine_id" required></select></label>
    <label>Pain (M)<select name="pain_medicine_id" required></select></label>
    <p>Weight: <strong>250 kg</strong> for each sow. One dose of each medicine. No treatment course will be created.</p>
    <div id="farrowings-doses" aria-live="polite"></div>
    <p id="farrowings-error" class="error" role="alert"></p>
    <div class="actions"><button id="farrowings-cancel" type="button" class="secondary">Cancel</button><button type="submit" disabled>Register injections</button></div>
  </form></dialog>`);
  const form=$('#farrowings-form'),dialog=$('#farrowings-dialog'),submit=form.querySelector('[type="submit"]');
  let options=null,batchId=null,saving=false,retryPayload=null;
  function update() {
    if(saving)return;
    let valid=Boolean(options);
    try {const numbers=parseFarrowingSows(form.elements.sow_numbers.value);$('#farrowings-count').textContent=`${numbers.length} sow(s), ${numbers.length*2} injections. Numbers: ${numbers.join(', ')}`;}
    catch(error){valid=false;$('#farrowings-count').textContent=error.message;}
    const doses=[];
    for(const key of ['milk','pain']) {
      const medicine=options?.[key].find(m=>String(m.id)===form.elements[key+'_medicine_id'].value);
      try {const dose=farrowingDose(medicine);doses.push(`<p><strong>${escape(medicine.name)}</strong>: ${dose} ml per sow</p>`);}
      catch(error){valid=false;doses.push(`<p>${key==='milk'?'Milk deficiency (OX)':'Pain (M)'}: ${medicine?escape(error.message):'select a medicine'}</p>`);}
    }
    $('#farrowings-doses').innerHTML=doses.join('');
    submit.disabled=!valid||!form.elements.pen_id.value||!form.elements.injection_date.value;
  }
  $('#farrowings-open').onclick=async()=>{
    if(getUser()?.role!=='admin')return;
    form.reset();options=null;retryPayload=null;batchId=crypto.randomUUID();$('#farrowings-error').textContent='';$('#farrowings-doses').textContent='';submit.disabled=true;
    for(const control of form.querySelectorAll('input,select,textarea'))control.disabled=false;
    const now=new Date();form.elements.injection_date.value=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
    for(const key of ['pen_id','milk_medicine_id','pain_medicine_id'])form.elements[key].innerHTML='<option value="">Loading...</option>';
    dialog.showModal();update();
    try{
      options=await api('/farestald/farrowings/options');
      form.elements.pen_id.innerHTML='<option value="">Select common pen</option>'+options.pens.map(p=>`<option value="${p.id}">${escape(p.room_name)} / ${escape(p.name)}</option>`).join('');
      for(const key of ['milk','pain']) {
        const select=form.elements[key+'_medicine_id'];
        select.innerHTML='<option value="">Select medicine</option>'+options[key].map(m=>`<option value="${m.id}">${escape(m.name)}</option>`).join('');
        if(options[key].length===1)select.value=options[key][0].id;
      }
      if(!options.pens.length||!options.milk.length||!options.pain.length)$('#farrowings-error').textContent='Add a Farestald pen and medicines for both diagnoses on the website first.';
      update();
    }catch(error){$('#farrowings-error').textContent=error.message;}
  };
  form.addEventListener('input',()=>{if(!retryPayload)update();});
  form.addEventListener('change',()=>{if(!retryPayload)update();});
  $('#farrowings-cancel').onclick=()=>{if(!saving)dialog.close();};
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  form.onsubmit=async event=>{
    event.preventDefault();if(saving)return;
    try{parseFarrowingSows(form.elements.sow_numbers.value);}catch(error){$('#farrowings-error').textContent=error.message;return;}
    const payload=retryPayload||{...Object.fromEntries(new FormData(form)),batch_id:batchId};
    saving=true;submit.disabled=true;$('#farrowings-error').textContent='';
    // Preserve the same request on retry if a response is lost after the transaction commits.
    for(const control of form.querySelectorAll('input,select,textarea'))control.disabled=true;
    $('#farrowings-cancel').disabled=true;
    try{
      const result=await api('/farestald/farrowings/register',{method:'POST',body:JSON.stringify(payload)});
      retryPayload=null;dialog.close();await reload();
      $('#farestald-done-sow-injections-error').textContent='';
      alert(`Registered ${result.injection_count} injections for ${result.sow_count} sow(s).`);
    }catch(error){
      retryPayload=payload;
      $('#farrowings-error').textContent=error.message+' — retry to send the same batch, or cancel and reopen to change it.';
    }finally{
      saving=false;$('#farrowings-cancel').disabled=false;
      if(!retryPayload)for(const control of form.querySelectorAll('input,select,textarea'))control.disabled=false;
      submit.disabled=false;
    }
  };
  return {updateAccess:()=>{$('#farrowings-open').hidden=getUser()?.role!=='admin';}};
}
