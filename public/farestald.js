const field = (key,label,type='text',extra={}) => ({key,label,type,...extra});
const injection = [field('sow_number','Sow number','text',{max:100}),field('pen_id','Pen','select'),field('injection_date','Date','date'),field('medicine_sow_id','Medicine','select'),field('dose_ml','Dose (ml)','number'),field('weight_kg','Weight (kg)','number',{optional:true,min:1,step:1}),field('comment','Comment','textarea',{optional:true})];
const sections = [
  {key:'medicine-sow',title:'Medicine Sow',group:'Medicine',fields:[field('name','Name','text',{max:200}),field('diagnosis','Diagnosis','text',{max:300}),field('dose_ml','Dose (ml)','number'),field('dose_kg','Dose (kg)','number'),field('course_days','Course (days)','number',{step:1}),field('interval_hours','Interval (hours)','number',{step:1}),field('symptoms','Symptoms','textarea'),field('withdrawal_days','Withdrawal (days)','number',{step:1})]},
  {key:'medicine-sow-storage',title:'Medicine Sow Storage',group:'Medicine',fields:[field('medicine_sow_id','Medicine','select'),field('bottle_volume_ml','Bottle volume (ml)','number'),field('bottle_count','Bottles','number',{step:1}),field('total_volume_ml','Total volume (ml)','number')]},
  {key:'planned-sow-injections',title:'Planned sow injections',group:'Sow injections',fields:injection},
  {key:'done-sow-injections',title:'Done sow injections',group:'Sow injections',fields:[...injection,field('given_by_user_id','Given by','select')]},
];
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function setupFarestald({api,getUser}) {
  const $ = selector => document.querySelector(selector);
  const nav = $('#farestald-navigation');
  nav.innerHTML = ['Medicine','Sow injections'].map(group=>`<details class="nav-group"><summary>${group}</summary><div class="nav-group-items" role="group" aria-label="Farestald ${group}">${sections.filter(s=>s.group===group).map(s=>`<button class="nav-button" role="tab" aria-selected="false" aria-controls="farestald-${s.key}-page" data-page="farestald-${s.key}">${s.title}<span class="count" id="farestald-${s.key}-count">0</span></button>`).join('')}</div></details>`).join('');
  const caches = new Map();
  for (const section of sections) {
    const prefix = `farestald-${section.key}`;
    $('#admin').insertAdjacentHTML('beforeend',`<section id="${prefix}-page" role="tabpanel" hidden><div class="toolbar"><p>Farestald · ${section.title}</p><button id="${prefix}-add">+ Add record</button></div><label>Search<input type="search" id="${prefix}-search" placeholder="Search records"></label><p class="error" id="${prefix}-error" role="alert"></p><div class="table-wrap"><table><thead><tr><th>ID</th>${section.fields.map(f=>`<th>${f.label}</th>`).join('')}<th></th></tr></thead><tbody id="${prefix}-rows"></tbody></table></div></section>`);
    $(`#${prefix}-add`).onclick = () => open(section);
    $(`#${prefix}-search`).oninput = () => render(section);
  }
  document.body.insertAdjacentHTML('beforeend','<dialog id="farestald-dialog"><form id="farestald-form"><h2 id="farestald-title"></h2><div id="farestald-fields"></div><p id="farestald-form-error" class="error" role="alert"></p><div class="actions"><button type="button" class="secondary" id="farestald-cancel">Cancel</button><button type="submit">Save</button></div></form></dialog>');
  let editing;
  $('#farestald-cancel').onclick = () => $('#farestald-dialog').close();
  const display = (item,f) => item[({medicine_sow_id:'medicine_name',pen_id:'pen_name',given_by_user_id:'given_by_username'})[f.key] || f.key] ?? '';
  function render(section) {
    const prefix = `farestald-${section.key}`;
    const all = caches.get(section.key) || [];
    const query = $(`#${prefix}-search`).value.trim().toLowerCase();
    const items = all.filter(item => section.fields.some(f=>String(display(item,f)).toLowerCase().includes(query)));
    $(`#${prefix}-count`).textContent = all.length;
    $(`#${prefix}-add`).hidden = getUser()?.role !== 'admin';
    $(`#${prefix}-rows`).innerHTML = items.length ? items.map(item=>`<tr><td>${item.id}</td>${section.fields.map(f=>`<td>${escape(display(item,f))}</td>`).join('')}<td>${getUser()?.role==='admin'?`<div class="row-actions"><button class="secondary" data-edit="${item.id}">Edit</button><button class="danger" data-delete="${item.id}">Delete</button></div>`:''}</td></tr>`).join('') : `<tr><td class="empty-state" colspan="${section.fields.length+2}">${query?'No matching records.':'No Farestald records yet.'}</td></tr>`;
    $(`#${prefix}-rows`).querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>open(section,all.find(x=>String(x.id)===b.dataset.edit)));
    $(`#${prefix}-rows`).querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{
      if (!confirm('Delete this Farestald record?')) return;
      try { await api(`/farestald/${section.key}/${b.dataset.delete}`,{method:'DELETE'}); await load(section); }
      catch(e) { $(`#${prefix}-error`).textContent=e.message; }
    });
  }
  async function load(section) {
    const error = $(`#farestald-${section.key}-error`);
    error.textContent = '';
    try { caches.set(section.key,await api(`/farestald/${section.key}`)); render(section); }
    catch(e) { caches.set(section.key,[]); render(section); error.textContent=e.message; }
  }
  async function open(section,item={}) {
    const error = $(`#farestald-${section.key}-error`);
    error.textContent = '';
    try {
      const options = {};
      await Promise.all(section.fields.filter(f=>f.type==='select').map(async f=>{
        const path = {medicine_sow_id:'/farestald/medicine-sow',pen_id:'/farestald/pens',given_by_user_id:'/users'}[f.key];
        options[f.key] = await api(path);
      }));
      editing = {section,id:item.id};
      $('#farestald-title').textContent = `Farestald · ${item.id?'Edit':'New'} ${section.title}`;
      $('#farestald-form-error').textContent = '';
      $('#farestald-fields').innerHTML = section.fields.map(f=>{
        const attrs = `name="${f.key}" ${f.optional?'':'required'}`;
        let input;
        if (f.type==='select') input=`<select ${attrs}><option value="">Select ${f.label.toLowerCase()}</option>${options[f.key].map(o=>`<option value="${o.id}">${escape(o.username || (o.room_name ? `${o.room_name} / ${o.name}` : o.name))}</option>`).join('')}</select>`;
        else if(f.type==='textarea') input=`<textarea ${attrs} rows="3"></textarea>`;
        else input=`<input ${attrs} type="${f.type}" ${f.max?`maxlength="${f.max}"`:''} ${f.type==='number'?`min="${f.min??0}" step="${f.step??0.001}"`:''}>`;
        const hint=f.type==='select'&&!options[f.key].length?`<small>No ${f.key==='pen_id'?'pens in Farm → Farestald':f.key==='medicine_sow_id'?'Farestald medicines':'users'} available. Add them first.</small>`:'';
        return `<label>${f.label}${input}${hint}</label>`;
      }).join('');
      const now=new Date();const today=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
      for(const f of section.fields) $('#farestald-form').elements.namedItem(f.key).value=item[f.key]??(f.type==='date'?today:f.key==='given_by_user_id'?getUser().id:'');
      $('#farestald-dialog').showModal();
    } catch(e) { error.textContent=e.message; }
  }
  $('#farestald-form').onsubmit = async event => {
    event.preventDefault();
    const button=event.currentTarget.querySelector('[type="submit"]');button.disabled=true;
    const {section,id}=editing;
    $('#farestald-form-error').textContent='';
    try {
      await api(`/farestald/${section.key}${id?'/'+id:''}`,{method:id?'PATCH':'POST',body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))});
      $('#farestald-dialog').close();
      await Promise.all(sections.map(load));
    } catch(e) { $('#farestald-form-error').textContent=e.message; }
    finally { button.disabled=false; }
  };
  return {
    pages: sections.map(s=>'farestald-'+s.key),
    load: () => Promise.all(sections.map(load)),
  };
}
