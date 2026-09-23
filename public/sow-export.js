export function openSowExport({base,token,start}) {
  const dialog=document.createElement('dialog');
  dialog.innerHTML='<form><h2>Export XLSX</h2><label>From<input name="start" type="date" required></label><label>To<input name="end" type="date" required></label><p class="error" role="alert"></p><div class="actions"><button type="button" class="secondary">Cancel</button><button type="submit">Download XLSX</button></div></form>';
  document.body.append(dialog);
  const form=dialog.querySelector('form'),error=dialog.querySelector('.error');
  form.elements.start.value=start||new Date().toISOString().slice(0,10);
  const end=new Date(form.elements.start.value+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+6);
  form.elements.end.value=end.toISOString().slice(0,10);
  form.elements.end.min=form.elements.start.value;
  form.elements.start.onchange=()=>{form.elements.end.min=form.elements.start.value;};
  dialog.querySelector('[type=button]').onclick=()=>dialog.close();
  dialog.onclose=()=>dialog.remove();
  form.onsubmit=async event=>{
    event.preventDefault();error.textContent='';
    const from=form.elements.start.value,to=form.elements.end.value;
    if(to<from){error.textContent='End date must be on or after start date';return;}
    const button=form.querySelector('[type=submit]');button.disabled=true;
    try {
      const response=await fetch(base+'/week-report.xlsx?'+new URLSearchParams({start_date:from,end_date:to}),{headers:{Authorization:'Bearer '+token}});
      if(!response.ok){const detail=await response.json().catch(()=>({}));throw new Error(detail.error||'Export failed');}
      const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');
      link.href=url;link.download=(base.includes('/farestald/')?'farestald-':'')+'done-sow-'+from+'-'+to+'.xlsx';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),60000);dialog.close();
    } catch(e){error.textContent=e.message;} finally{button.disabled=false;}
  };
  dialog.showModal();
}
