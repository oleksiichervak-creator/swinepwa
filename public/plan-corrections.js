export function setupPlanCorrections({api,base}) {
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  document.querySelector('#home-screen .choice-grid').insertAdjacentHTML('beforeend','<button id="edit-plans" class="choice-card accent" type="button"><span class="choice-icon">✎</span><span><strong>Edit planned injections</strong><small>Correct sow number or pen for all plans</small></span></button>');
  const dialog=document.createElement('dialog');
  dialog.innerHTML='<form><h2>Edit planned injections</h2><label>Current sow number<input name="search" required maxlength="100" inputmode="numeric"></label><button type="submit">Find plans</button></form><div class="correction-result"></div><p class="error" role="alert"></p><button type="button" class="text-button correction-close">Close</button>';
  dialog.style.padding='18px';document.body.append(dialog);
  const search=dialog.querySelector('form'),result=dialog.querySelector('.correction-result'),error=dialog.querySelector('.error');
  const choices=document.createElement('div');
  choices.style.cssText='display:grid;gap:8px;max-height:240px;overflow:auto;margin-bottom:14px';
  search.after(choices);
  let sows=[];
  const renderChoices=()=>{
    const query=search.elements.search.value.trim().toLowerCase();
    const filtered=sows.filter(x=>x.sow_number.toLowerCase().includes(query));
    choices.innerHTML=filtered.length?filtered.map(x=>`<button type="button" class="secondary" style="padding:12px;text-align:left;border:1px solid #c8d8ce;border-radius:12px;background:#eef5f0" data-sow="${escape(x.sow_number)}"><strong style="font-size:22px">${escape(x.sow_number)}</strong><br>Pen: ${escape(x.pens.join(', '))} · ${x.plan_count} planned injections</button>`).join(''):'<p>No matching sows with planned injections.</p>';
    choices.querySelectorAll('[data-sow]').forEach(button=>button.onclick=()=>{search.elements.search.value=button.dataset.sow;search.requestSubmit();});
  };
  let sequence=0;
  dialog.querySelector('.correction-close').onclick=()=>dialog.close();
  dialog.onclose=()=>{sequence++;};
  document.querySelector('#logout-button').addEventListener('click',()=>dialog.close());
  document.querySelector('#edit-plans').onclick=async()=>{
    const request=++sequence;search.reset();sows=[];result.innerHTML='';error.textContent='';choices.hidden=false;choices.textContent='Loading sows...';dialog.showModal();
    try{sows=await api(base+'/sows');if(request===sequence)renderChoices();}
    catch(e){if(request===sequence){choices.textContent='';error.textContent=e.message;}}
  };
  search.elements.search.oninput=()=>{sequence++;result.innerHTML='';choices.hidden=false;renderChoices();};
  search.onsubmit=async event=>{
    event.preventDefault();const request=++sequence,sow=search.elements.search.value.trim();result.innerHTML='';error.textContent='';choices.hidden=true;
    try{
      const data=await api(base+'?'+new URLSearchParams({sow_number:sow}));if(request!==sequence)return;
      if(!data.items.length){result.textContent='No planned injections for this sow.';return;}
      result.innerHTML=`<p><strong>${data.items.length} planned injections</strong></p><div style="max-height:180px;overflow:auto">${data.items.map(x=>`<p>${escape(x.injection_date)} · ${escape(x.medicine_name)} · Pen ${escape(x.pen_name)}</p>`).join('')}</div><form><label>Correct sow number<input name="sow" required maxlength="100" inputmode="numeric" value="${escape(sow)}"></label><label>Correct pen<select name="pen"><option value="">Keep existing pens</option>${data.pens.map(p=>`<option value="${p.id}">${escape(p.room_name)} / ${escape(p.name)}</option>`).join('')}</select></label><p>Apply to all ${data.items.length} planned injections listed above.</p><button type="submit">Save all plans</button></form>`;
      result.querySelector('form').onsubmit=async event=>{
        event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;search.querySelector('button').disabled=true;error.textContent='';
        try{
          const saved=await api(base,{method:'PATCH',body:JSON.stringify({sow_number:sow,new_sow_number:form.elements.sow.value,pen_id:form.elements.pen.value?Number(form.elements.pen.value):null,expected:data.items.map(x=>({id:x.id,updated_at:x.updated_at}))})});
          if(request===sequence)result.textContent=`Updated ${saved.updated} planned injections.`;
        }catch(e){if(request===sequence)error.textContent=e.message;button.disabled=false;}finally{search.querySelector('button').disabled=false;}
      };
    }catch(e){if(request===sequence)error.textContent=e.message;}
  };
}
