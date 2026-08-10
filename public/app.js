const $ = (selector) => document.querySelector(selector);
let token = localStorage.getItem('token');
let me = null;
let doneSowItems = [];
let doneSowSort = { key: 'injection_date', direction: 'asc' };

async function api(path, options = {}) {
  const response = await fetch('/api' + path, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  if (response.status === 401) logout();
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Request failed');
  return response.status === 204 ? null : response.json();
}

async function showAdmin() {
  try {
    me = await api('/auth/me');
    $('#login').hidden = true; $('#admin').hidden = false;
    $('#current-user').textContent = `${me.username} · ${me.role}`;
    $('#add-user').hidden = me.role !== 'admin';
    $('#add-department').hidden = me.role !== 'admin';
    $('#add-room').hidden = me.role !== 'admin';
    $('#add-pen').hidden = me.role !== 'admin';
    $('#add-medicine-sow').hidden = me.role !== 'admin';
    $('#add-medicine-sow-storage').hidden = me.role !== 'admin';
    $('#add-sow-injection').hidden = me.role !== 'admin';
    $('#add-done-sow').hidden = me.role !== 'admin';
    $('#add-vet-question').hidden = me.role !== 'admin';
    $('#file-storage-upload').hidden = me.role !== 'admin';
    $('#add-daily-remark').hidden = me.role !== 'admin';
    $('#add-repair-location').hidden = me.role !== 'admin';
    $('#add-altersyn').hidden = me.role !== 'admin';
    $('#add-done-altersyn').hidden = me.role !== 'admin';
    $('#add-todo').hidden = me.role !== 'admin';
    await Promise.all([loadUsers(), loadDepartments(), loadRooms(), loadPens(), loadMedicineSow(), loadMedicineSowStorage(), loadSowInjections(), loadDoneSow(), loadVetQuestions(), loadFiles(), loadDailyRemarks(), loadRepairLocations(), loadAltresyn(), loadDoneAltresyn(), loadTodos()]);
    const requestedPage = ['#departments','#rooms','#pens','#medicine-sow','#medicine-sow-storage','#sow-injections','#done-sow','#vet-questions','#file-storage','#daily-remarks','#repair-locations','#altersyn','#done-altersyn','#todos'].includes(location.hash) ? location.hash.slice(1) : 'users';
    switchPage(requestedPage);
  } catch { logout(); }
}

async function loadUsers() {
  const users = await api('/users');
  $('#users-count').textContent = users.length;
  $('#users').innerHTML = users.map(user => `<tr><td>${user.id}</td><td>${escapeHtml(user.username)}</td><td><span class="role">${user.role}</span></td><td>${new Date(user.created_at).toLocaleString('en-GB')}</td><td><div class="row-actions">${me.role === 'admin' ? `<button class="secondary edit" data-id="${user.id}">Edit</button><button class="danger delete" data-id="${user.id}" ${String(user.id) === String(me.id) ? 'disabled' : ''}>Delete</button>` : ''}</div></td></tr>`).join('');
  document.querySelectorAll('.edit').forEach(button => button.onclick = () => editUser(users.find(user => String(user.id) === button.dataset.id)));
  document.querySelectorAll('.delete').forEach(button => button.onclick = () => deleteUser(button.dataset.id));
}

async function loadDepartments() {
  const items = await api('/departments/');
  $('#departments-count').textContent = items.length;
  $('#departments').innerHTML = items.length ? items.map(item => `<tr><td>${item.id}</td><td>${escapeHtml(item.name)}</td><td>${new Date(item.created_at).toLocaleString('en-GB')}</td><td>${new Date(item.updated_at).toLocaleString('en-GB')}</td><td><div class="row-actions">${me.role === 'admin' ? `<button class="secondary department-edit" data-id="${item.id}">Edit</button><button class="danger department-delete" data-id="${item.id}">Delete</button>` : ''}</div></td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">No departments yet. Add one to test the table.</td></tr>';
  document.querySelectorAll('.department-edit').forEach(button => button.onclick = () => openDepartmentDialog(items.find(item => String(item.id) === button.dataset.id)));
  document.querySelectorAll('.department-delete').forEach(button => button.onclick = () => deleteDepartment(button.dataset.id));
}

async function loadRooms() {
  const items = await api('/rooms/');
  $('#rooms-count').textContent = items.length;
  $('#rooms').innerHTML = items.length ? items.map(item => `<tr><td>${item.id}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.department_name)}</td><td>${new Date(item.created_at).toLocaleString('en-GB')}</td><td>${new Date(item.updated_at).toLocaleString('en-GB')}</td><td><div class="row-actions">${me.role === 'admin' ? `<button class="secondary room-edit" data-id="${item.id}">Edit</button><button class="danger room-delete" data-id="${item.id}">Delete</button>` : ''}</div></td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">No rooms yet. Create a department first, then add a room.</td></tr>';
  document.querySelectorAll('.room-edit').forEach(button => button.onclick = () => openRoomDialog(items.find(item => String(item.id) === button.dataset.id)));
  document.querySelectorAll('.room-delete').forEach(button => button.onclick = () => deleteRoom(button.dataset.id));
}

async function loadPens() {
  const items = await api('/pens/');
  $('#pens-count').textContent = items.length;
  $('#pens').innerHTML = items.length ? items.map(item => `<tr><td>${item.id}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.room_name)}</td><td>${escapeHtml(item.department_name)}</td><td>${new Date(item.created_at).toLocaleString('en-GB')}</td><td>${new Date(item.updated_at).toLocaleString('en-GB')}</td><td><div class="row-actions">${me.role === 'admin' ? `<button class="secondary pen-edit" data-id="${item.id}">Edit</button><button class="danger pen-delete" data-id="${item.id}">Delete</button>` : ''}</div></td></tr>`).join('') : '<tr><td colspan="7" class="empty-state">No pens yet. Create a room first, then add a pen.</td></tr>';
  document.querySelectorAll('.pen-edit').forEach(button => button.onclick = () => openPenDialog(items.find(item => String(item.id) === button.dataset.id)));
  document.querySelectorAll('.pen-delete').forEach(button => button.onclick = () => deletePen(button.dataset.id));
}

async function loadMedicineSow() {
  const items = await api('/medicine-sow/');
  $('#medicine-sow-count').textContent = items.length;
  $('#medicine-sow').innerHTML = items.length ? items.map(item => `<tr><td>${item.id}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.diagnosis)}</td><td>${item.dose_ml}</td><td>${item.dose_kg}</td><td>${item.course_days} days</td><td>${item.interval_hours} h</td><td>${item.withdrawal_days} days</td><td><div class="row-actions">${me.role === 'admin' ? `<button class="secondary medicine-sow-edit" data-id="${item.id}">Edit</button><button class="danger medicine-sow-delete" data-id="${item.id}">Delete</button>` : ''}</div></td></tr>`).join('') : '<tr><td colspan="9" class="empty-state">No sow medicines yet.</td></tr>';
  document.querySelectorAll('.medicine-sow-edit').forEach(button => button.onclick = () => openMedicineSowDialog(items.find(item => String(item.id) === button.dataset.id)));
  document.querySelectorAll('.medicine-sow-delete').forEach(button => button.onclick = () => deleteMedicineSow(button.dataset.id));
}

async function loadMedicineSowStorage() {
  const items = await api('/medicine-sow-storage/'); $('#medicine-sow-storage-count').textContent = items.length;
  $('#medicine-sow-storage').innerHTML = items.length ? items.map(item => `<tr><td>${item.id}</td><td>${escapeHtml(item.medicine_name)}</td><td>${item.bottle_volume_ml}</td><td>${item.bottle_count}</td><td>${item.total_volume_ml}</td><td>${new Date(item.updated_at).toLocaleString('en-GB')}</td><td><div class="row-actions">${me.role === 'admin' ? `<button class="secondary medicine-storage-edit" data-id="${item.id}">Edit</button><button class="danger medicine-storage-delete" data-id="${item.id}">Delete</button>` : ''}</div></td></tr>`).join('') : '<tr><td colspan="7" class="empty-state">No sow medicine stock yet.</td></tr>';
  document.querySelectorAll('.medicine-storage-edit').forEach(button => button.onclick = () => openMedicineSowStorageDialog(items.find(item => String(item.id) === button.dataset.id)));
  document.querySelectorAll('.medicine-storage-delete').forEach(button => button.onclick = () => deleteMedicineSowStorage(button.dataset.id));
}

async function loadSowInjections() {
  const items = await api('/planed-sow-injections/');
  $('#sow-injections-count').textContent = items.length;
  $('#sow-injections').innerHTML = items.length ? items.map(item => `<tr><td>${item.id}</td><td>${escapeHtml(item.sow_number)}</td><td>${escapeHtml(item.pen_name)}</td><td>${escapeHtml(item.injection_date)}</td><td>${escapeHtml(item.medicine_name)}</td><td>${item.dose_ml}</td><td>${item.weight_kg ? `${item.weight_kg} kg` : '—'}</td><td>${escapeHtml(item.comment || '—')}</td><td><div class="row-actions">${me.role === 'admin' ? `<button class="sow-injection-done" data-id="${item.id}">Mark as done</button><button class="secondary sow-injection-edit" data-id="${item.id}">Edit</button><button class="danger sow-injection-delete" data-id="${item.id}">Delete</button>` : ''}</div></td></tr>`).join('') : '<tr><td colspan="9" class="empty-state">No planned sow injections yet.</td></tr>';
  document.querySelectorAll('.sow-injection-done').forEach(button => button.onclick = () => markSowInjectionDone(button.dataset.id));
  document.querySelectorAll('.sow-injection-edit').forEach(button => button.onclick = () => openSowInjectionDialog(items.find(item => String(item.id) === button.dataset.id)));
  document.querySelectorAll('.sow-injection-delete').forEach(button => button.onclick = () => deleteSowInjection(button.dataset.id));
}
async function loadDoneSow() {
  doneSowItems = await api('/done-sow-injections/');
  $('#done-sow-count').textContent = doneSowItems.length;
  renderDoneSow();
}

function renderDoneSow() {
  const query = $('#done-sow-search').value.trim().toLocaleLowerCase();
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const items = doneSowItems
    .filter(item => String(item.sow_number).toLocaleLowerCase().includes(query))
    .sort((a, b) => {
      const result = doneSowSort.key === 'injection_date'
        ? String(a.injection_date).localeCompare(String(b.injection_date))
        : collator.compare(String(a.sow_number), String(b.sow_number));
      return (doneSowSort.direction === 'asc' ? result : -result) || Number(a.id) - Number(b.id);
    });

  $('#done-sow-results').textContent = query ? `${items.length} of ${doneSowItems.length}` : `${items.length} records`;
  $('#done-sow').innerHTML = items.length
    ? items.map(x => `<tr><td>${x.id}</td><td>${escapeHtml(x.sow_number)}</td><td>${escapeHtml(x.pen_name)}</td><td>${formatDisplayDate(x.injection_date)}</td><td>${escapeHtml(x.medicine_name)}</td><td>${x.dose_ml} ml</td><td>${x.weight_kg ? `${x.weight_kg} kg` : '—'}</td><td>${escapeHtml(x.given_by_username)}</td><td>${escapeHtml(x.comment || '—')}</td><td><div class="row-actions">${me.role === 'admin' ? `<button class="secondary done-edit" data-id="${x.id}">Edit</button><button class="danger done-delete" data-id="${x.id}">Delete</button>` : ''}</div></td></tr>`).join('')
    : `<tr><td colspan="10" class="empty-state">${query ? 'No sow numbers match your search.' : 'No completed sow injections yet.'}</td></tr>`;
  document.querySelectorAll('.done-edit').forEach(button => button.onclick = () => openDoneSow(doneSowItems.find(item => String(item.id) === button.dataset.id)));
  document.querySelectorAll('.done-delete').forEach(button => button.onclick = () => deleteDoneSow(button.dataset.id));
}
async function markSowInjectionDone(id) {
  if (!confirm('Mark this planned injection as done?')) return;
  try {
    await api(`/injection-pwa/plans/${id}/complete`, { method: 'POST', body: '{}' });
    await Promise.all([loadSowInjections(), loadDoneSow()]);
  } catch (error) { alert(error.message); }
}

function formatDisplayDate(value) {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : escapeHtml(value);
}

$('#done-sow-search').addEventListener('input', renderDoneSow);
document.querySelectorAll('[data-done-sort]').forEach(button => button.addEventListener('click', () => {
  const key = button.dataset.doneSort;
  doneSowSort = { key, direction: doneSowSort.key === key && doneSowSort.direction === 'asc' ? 'desc' : 'asc' };
  document.querySelectorAll('[data-done-sort]').forEach(sortButton => {
    const active = sortButton.dataset.doneSort === key;
    sortButton.classList.toggle('active', active);
    sortButton.closest('th').setAttribute('aria-sort', active ? (doneSowSort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    sortButton.querySelector('span').textContent = active ? (doneSowSort.direction === 'asc' ? '↑' : '↓') : '↕';
  });
  renderDoneSow();
}));
async function loadVetQuestions(){const items=await api('/vet-questions/');$('#vet-questions-count').textContent=items.length;$('#vet-questions').innerHTML=items.length?items.map(x=>`<tr><td>${x.id}</td><td>${escapeHtml(x.question_date)}</td><td>${escapeHtml(x.question)}</td><td>${x.photo?`<a href="${x.photo}" target="_blank"><img src="${x.photo}" alt="Attached" style="width:64px;height:48px;object-fit:cover;border-radius:6px"></a>`:'—'}</td><td>${new Date(x.updated_at).toLocaleString('en-GB')}</td><td><div class="row-actions">${me.role==='admin'?`<button class="secondary vet-edit" data-id="${x.id}">Edit</button><button class="danger vet-delete" data-id="${x.id}">Delete</button>`:''}</div></td></tr>`).join(''):'<tr><td colspan="6" class="empty-state">No vet questions yet.</td></tr>';document.querySelectorAll('.vet-edit').forEach(b=>b.onclick=()=>openVetQuestion(items.find(x=>String(x.id)===b.dataset.id)));document.querySelectorAll('.vet-delete').forEach(b=>b.onclick=()=>deleteVetQuestion(b.dataset.id));}

async function loadFiles(){const items=await api('/file-storage/');$('#file-storage-count').textContent=items.length;$('#file-storage').innerHTML=items.length?items.map(x=>`<tr><td>${escapeHtml(x.original_name)}</td><td>${escapeHtml(x.mime_type)}</td><td>${formatBytes(x.size_bytes)}</td><td>${escapeHtml(x.uploaded_by_username)}</td><td>${new Date(x.created_at).toLocaleString('en-GB')}</td><td><div class="row-actions"><button class="secondary file-download" data-name="${x.stored_name}" data-original="${escapeHtml(x.original_name)}">Download</button>${me.role==='admin'?`<button class="danger file-delete" data-name="${x.stored_name}">Delete</button>`:''}</div></td></tr>`).join(''):'<tr><td colspan="6" class="empty-state">No files uploaded yet.</td></tr>';document.querySelectorAll('.file-download').forEach(b=>b.onclick=()=>downloadStoredFile(b.dataset.name,b.dataset.original));document.querySelectorAll('.file-delete').forEach(b=>b.onclick=()=>deleteStoredFile(b.dataset.name));}
async function loadDailyRemarks(){const items=await api('/daily-remarks/');$('#daily-remarks-count').textContent=items.length;$('#daily-remarks').innerHTML=items.length?items.map(x=>`<tr><td>${x.id}</td><td>${escapeHtml(x.remark_date)}</td><td>${escapeHtml(x.remark)}</td><td>${x.photo?`<a href="${x.photo}" target="_blank"><img src="${x.photo}" alt="Attached" style="width:64px;height:48px;object-fit:cover;border-radius:6px"></a>`:'—'}</td><td>${new Date(x.updated_at).toLocaleString('en-GB')}</td><td><div class="row-actions">${me.role==='admin'?`<button class="secondary remark-edit" data-id="${x.id}">Edit</button><button class="danger remark-delete" data-id="${x.id}">Delete</button>`:''}</div></td></tr>`).join(''):'<tr><td colspan="6" class="empty-state">No daily remarks yet.</td></tr>';document.querySelectorAll('.remark-edit').forEach(b=>b.onclick=()=>openDailyRemark(items.find(x=>String(x.id)===b.dataset.id)));document.querySelectorAll('.remark-delete').forEach(b=>b.onclick=()=>deleteDailyRemark(b.dataset.id));}
async function loadRepairLocations(){const items=await api('/repair-locations/');$('#repair-locations-count').textContent=items.length;$('#repair-locations').innerHTML=items.length?items.map(x=>`<tr><td>${x.id}</td><td>${escapeHtml(x.repair_date)}</td><td>${escapeHtml(x.location)}</td><td>${escapeHtml(x.comment||'—')}</td><td>${x.photo?`<a href="${x.photo}" target="_blank"><img src="${x.photo}" alt="Attached" style="width:64px;height:48px;object-fit:cover;border-radius:6px"></a>`:'—'}</td><td>${new Date(x.updated_at).toLocaleString('en-GB')}</td><td><div class="row-actions">${me.role==='admin'?`<button class="secondary repair-edit" data-id="${x.id}">Edit</button><button class="danger repair-delete" data-id="${x.id}">Delete</button>`:''}</div></td></tr>`).join(''):'<tr><td colspan="7" class="empty-state">No repair locations yet.</td></tr>';document.querySelectorAll('.repair-edit').forEach(b=>b.onclick=()=>openRepairLocation(items.find(x=>String(x.id)===b.dataset.id)));document.querySelectorAll('.repair-delete').forEach(b=>b.onclick=()=>deleteRepairLocation(b.dataset.id));}
async function loadAltresyn(){const items=await api('/altersyn/');$('#altersyn-count').textContent=items.length;$('#altersyn').innerHTML=items.length?items.map(x=>`<tr><td>${x.id}</td><td>${escapeHtml(x.group)}</td><td>${escapeHtml(x.ventil)}</td><td>${x.amount}</td><td>${formatDisplayDate(x.juice_start_date)}</td><td>${formatDisplayDate(x.juice_stop_date)}</td><td>${formatDisplayDate(x.altersyn_start_date)}</td><td>${formatDisplayDate(x.altersyn_stop_date)}</td><td><div class="row-actions">${me.role==='admin'?`<button class="secondary altersyn-edit" data-id="${x.id}">Edit</button><button class="danger altersyn-delete" data-id="${x.id}">Delete</button>`:''}</div></td></tr>`).join(''):'<tr><td colspan="9" class="empty-state">No Altresyn records yet.</td></tr>';document.querySelectorAll('.altersyn-edit').forEach(button=>button.onclick=()=>openAltresyn(items.find(item=>String(item.id)===button.dataset.id)));document.querySelectorAll('.altersyn-delete').forEach(button=>button.onclick=()=>deleteAltresyn(button.dataset.id));}
async function loadDoneAltresyn(){const items=await api('/done-altersyn/');$('#done-altersyn-count').textContent=items.length;$('#done-altersyn').innerHTML=items.length?items.map(item=>`<tr><td>${item.id}</td><td>${escapeHtml(item.group)}</td><td>${item.amount}</td><td>${item.extra_doses}</td><td><strong>${item.total_altersyn_ml} ml</strong></td><td>${formatDisplayDate(item.done_date)}</td><td>${escapeHtml(item.given_by_username)}</td><td><div class="row-actions">${me.role==='admin'?`<button class="secondary done-altersyn-edit" data-id="${item.id}">Edit</button><button class="danger done-altersyn-delete" data-id="${item.id}">Delete</button>`:''}</div></td></tr>`).join(''):'<tr><td colspan="8" class="empty-state">No completed Altresyn records yet.</td></tr>';document.querySelectorAll('.done-altersyn-edit').forEach(button=>button.onclick=()=>openDoneAltresyn(items.find(item=>String(item.id)===button.dataset.id)));document.querySelectorAll('.done-altersyn-delete').forEach(button=>button.onclick=()=>deleteDoneAltresyn(button.dataset.id));}
async function loadTodos(){const items=await api('/todos/');$('#todos-count').textContent=items.filter(x=>!x.is_completed).length;const today=new Date().toISOString().slice(0,10);$('#todos').innerHTML=items.length?items.map(x=>{const overdue=!x.is_completed&&x.due_date<today;return `<tr style="${x.is_completed?'opacity:.6':''}"><td><span class="role" style="${overdue?'background:#fff0ee;color:#b42318':''}">${x.is_completed?'Done':overdue?'Overdue':'Open'}</span></td><td style="${x.is_completed?'text-decoration:line-through':''}">${escapeHtml(x.task)}</td><td>${escapeHtml(x.due_date)}</td><td>${x.completed_at?new Date(x.completed_at).toLocaleString('en-GB'):'—'}</td><td><div class="row-actions">${me.role==='admin'?`<button class="secondary todo-toggle" data-id="${x.id}">${x.is_completed?'Reopen':'Complete'}</button><button class="secondary todo-edit" data-id="${x.id}">Edit</button><button class="danger todo-delete" data-id="${x.id}">Delete</button>`:''}</div></td></tr>`}).join(''):'<tr><td colspan="5" class="empty-state">No tasks yet.</td></tr>';document.querySelectorAll('.todo-toggle').forEach(b=>b.onclick=()=>toggleTodo(items.find(x=>String(x.id)===b.dataset.id)));document.querySelectorAll('.todo-edit').forEach(b=>b.onclick=()=>openTodo(items.find(x=>String(x.id)===b.dataset.id)));document.querySelectorAll('.todo-delete').forEach(b=>b.onclick=()=>deleteTodo(b.dataset.id));}
function switchPage(page) {
  document.querySelectorAll('.nav-button').forEach(item => {
    const active = item.dataset.page === page;
    item.classList.toggle('active', active); item.setAttribute('aria-selected', String(active));
  });
  $('#users-page').hidden=page!=='users';$('#departments-page').hidden=page!=='departments';$('#rooms-page').hidden=page!=='rooms';$('#pens-page').hidden=page!=='pens';$('#medicine-sow-page').hidden=page!=='medicine-sow';$('#medicine-sow-storage-page').hidden=page!=='medicine-sow-storage';$('#sow-injections-page').hidden=page!=='sow-injections';$('#done-sow-page').hidden=page!=='done-sow';$('#vet-questions-page').hidden=page!=='vet-questions';$('#file-storage-page').hidden=page!=='file-storage';$('#daily-remarks-page').hidden=page!=='daily-remarks';$('#repair-locations-page').hidden=page!=='repair-locations';$('#altersyn-page').hidden=page!=='altersyn';$('#done-altersyn-page').hidden=page!=='done-altersyn';$('#todos-page').hidden=page!=='todos';
  history.replaceState(null, '', `#${page}`);
}

document.querySelectorAll('.nav-button').forEach(button => button.onclick = () => {
  switchPage(button.dataset.page);
});

$('#login-form').onsubmit = async (event) => {
  event.preventDefault(); $('#login-error').textContent = '';
  try {
    const data = Object.fromEntries(new FormData(event.target));
    const result = await api('/auth/login', { method: 'POST', body: JSON.stringify(data) });
    token = result.token; localStorage.setItem('token', token); await showAdmin();
  } catch (error) { $('#login-error').textContent = error.message; }
};

function openDialog(user = {}) {
  const form = $('#user-form'); form.reset();
  form.id.value = user.id || ''; form.username.value = user.username || ''; form.role.value = user.role || 'user';
  form.password.required = !user.id; $('#dialog-title').textContent = user.id ? 'Edit user' : 'New user';
  $('#form-error').textContent = ''; $('#user-dialog').showModal();
}
function editUser(user) { openDialog(user); }
async function deleteUser(id) { if (confirm('Delete this user?')) { try { await api(`/users/${id}`, { method: 'DELETE' }); await loadUsers(); } catch (error) { alert(error.message); } } }
$('#add-user').onclick = () => openDialog(); $('#cancel').onclick = () => $('#user-dialog').close();
$('#user-form').onsubmit = async (event) => {
  event.preventDefault(); $('#form-error').textContent = '';
  const data = Object.fromEntries(new FormData(event.target)); const id = data.id; delete data.id;
  if (!data.password) delete data.password;
  try { await api(id ? `/users/${id}` : '/users', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) }); $('#user-dialog').close(); await loadUsers(); }
  catch (error) { $('#form-error').textContent = error.message; }
};
function openDepartmentDialog(item = {}) {
  const form = $('#department-form'); form.reset(); form.id.value = item.id || ''; form.name.value = item.name || '';
  $('#department-dialog-title').textContent = item.id ? 'Edit department' : 'New department';
  $('#department-error').textContent = ''; $('#department-dialog').showModal();
}
async function deleteDepartment(id) {
  if (confirm('Delete this department?')) {
    try { await api(`/departments/${id}`, { method: 'DELETE' }); await loadDepartments(); }
    catch (error) { alert(error.message); }
  }
}
$('#add-department').onclick = () => openDepartmentDialog();
$('#department-cancel').onclick = () => $('#department-dialog').close();
$('#department-form').onsubmit = async (event) => {
  event.preventDefault(); $('#department-error').textContent = '';
  const data = Object.fromEntries(new FormData(event.target)); const id = data.id; delete data.id;
  try { await api(id ? `/departments/${id}` : '/departments/', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) }); $('#department-dialog').close(); await loadDepartments(); }
  catch (error) { $('#department-error').textContent = error.message; }
};

async function openRoomDialog(item = {}) {
  const departments = await api('/departments/');
  if (!departments.length) return alert('Create a department before adding a room.');
  const form = $('#room-form'); form.reset(); form.id.value = item.id || ''; form.name.value = item.name || '';
  form.department_id.innerHTML = departments.map(department => `<option value="${department.id}">${escapeHtml(department.name)}</option>`).join('');
  form.department_id.value = item.department_id || departments[0].id;
  $('#room-dialog-title').textContent = item.id ? 'Edit room' : 'New room';
  $('#room-error').textContent = ''; $('#room-dialog').showModal();
}
async function deleteRoom(id) {
  if (confirm('Delete this room?')) {
    try { await api(`/rooms/${id}`, { method: 'DELETE' }); await loadRooms(); }
    catch (error) { alert(error.message); }
  }
}
$('#add-room').onclick = () => openRoomDialog();
$('#room-cancel').onclick = () => $('#room-dialog').close();
$('#room-form').onsubmit = async (event) => {
  event.preventDefault(); $('#room-error').textContent = '';
  const data = Object.fromEntries(new FormData(event.target)); const id = data.id; delete data.id; data.department_id = Number(data.department_id);
  try { await api(id ? `/rooms/${id}` : '/rooms/', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) }); $('#room-dialog').close(); await loadRooms(); }
  catch (error) { $('#room-error').textContent = error.message; }
};

async function openPenDialog(item = {}) {
  const rooms = await api('/rooms/');
  if (!rooms.length) return alert('Create a room before adding a pen.');
  const form = $('#pen-form'); form.reset(); form.id.value = item.id || ''; form.name.value = item.name || '';
  form.room_id.innerHTML = rooms.map(room => `<option value="${room.id}">${escapeHtml(room.department_name)} / ${escapeHtml(room.name)}</option>`).join('');
  form.room_id.value = item.room_id || rooms[0].id;
  $('#pen-dialog-title').textContent = item.id ? 'Edit pen' : 'New pen';
  $('#pen-error').textContent = ''; $('#pen-dialog').showModal();
}
async function deletePen(id) {
  if (confirm('Delete this pen?')) {
    try { await api(`/pens/${id}`, { method: 'DELETE' }); await loadPens(); }
    catch (error) { alert(error.message); }
  }
}
$('#add-pen').onclick = () => openPenDialog();
$('#pen-cancel').onclick = () => $('#pen-dialog').close();
$('#pen-form').onsubmit = async (event) => {
  event.preventDefault(); $('#pen-error').textContent = '';
  const data = Object.fromEntries(new FormData(event.target)); const id = data.id; delete data.id; data.room_id = Number(data.room_id);
  try { await api(id ? `/pens/${id}` : '/pens/', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) }); $('#pen-dialog').close(); await loadPens(); }
  catch (error) { $('#pen-error').textContent = error.message; }
};

async function openSowInjectionDialog(item = {}) {
  const [pens, medicines] = await Promise.all([api('/pens/'), api('/medicine-sow/')]);
  if (!pens.length) return alert('Create a pen before adding an injection.');
  if (!medicines.length) return alert('Create a sow medicine before adding an injection.');
  const form = $('#sow-injection-form'); form.reset(); form.id.value = item.id || '';
  form.sow_number.value = item.sow_number || ''; form.injection_date.value = item.injection_date || new Date().toISOString().slice(0, 10);
  form.medicine_sow_id.innerHTML = medicines.map(medicine => `<option value="${medicine.id}">${escapeHtml(medicine.name)}</option>`).join('');
  form.medicine_sow_id.value = item.medicine_sow_id || medicines[0].id; form.dose_ml.value = item.dose_ml ?? ''; form.comment.value = item.comment || '';
  form.pen_id.innerHTML = pens.map(pen => `<option value="${pen.id}">${escapeHtml(pen.department_name)} / ${escapeHtml(pen.room_name)} / ${escapeHtml(pen.name)}</option>`).join('');
  form.pen_id.value = item.pen_id || pens[0].id;
  $('#sow-injection-dialog-title').textContent = item.id ? 'Edit planned sow injection' : 'New planned sow injection';
  $('#sow-injection-error').textContent = ''; $('#sow-injection-dialog').showModal();
}
async function deleteSowInjection(id) {
  if (confirm('Delete this planned sow injection?')) {
    try { await api(`/planed-sow-injections/${id}`, { method: 'DELETE' }); await loadSowInjections(); }
    catch (error) { alert(error.message); }
  }
}
$('#add-sow-injection').onclick = () => openSowInjectionDialog();
$('#sow-injection-cancel').onclick = () => $('#sow-injection-dialog').close();
$('#sow-injection-form').onsubmit = async (event) => {
  event.preventDefault(); $('#sow-injection-error').textContent = '';
  const data = Object.fromEntries(new FormData(event.target)); const id = data.id; delete data.id;
  data.pen_id = Number(data.pen_id); data.medicine_sow_id = Number(data.medicine_sow_id); data.dose_ml = Number(data.dose_ml); if (!data.comment) data.comment = null;
  try { await api(id ? `/planed-sow-injections/${id}` : '/planed-sow-injections/', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) }); $('#sow-injection-dialog').close(); await loadSowInjections(); }
  catch (error) { $('#sow-injection-error').textContent = error.message; }
};

function openMedicineSowDialog(item = {}) {
  const form = $('#medicine-sow-form'); form.reset();
  for (const field of ['id','name','diagnosis','dose_ml','dose_kg','course_days','interval_hours','symptoms','withdrawal_days']) form[field].value = item[field] ?? '';
  $('#medicine-sow-dialog-title').textContent = item.id ? 'Edit sow medicine' : 'New sow medicine';
  $('#medicine-sow-error').textContent = ''; $('#medicine-sow-dialog').showModal();
}
async function deleteMedicineSow(id) {
  if (confirm('Delete this sow medicine?')) { try { await api(`/medicine-sow/${id}`, { method: 'DELETE' }); await loadMedicineSow(); } catch (error) { alert(error.message); } }
}
$('#add-medicine-sow').onclick = () => openMedicineSowDialog(); $('#medicine-sow-cancel').onclick = () => $('#medicine-sow-dialog').close();
$('#medicine-sow-form').onsubmit = async (event) => {
  event.preventDefault(); $('#medicine-sow-error').textContent = ''; const data = Object.fromEntries(new FormData(event.target)); const id = data.id; delete data.id;
  for (const field of ['dose_ml','dose_kg','course_days','interval_hours','withdrawal_days']) data[field] = Number(data[field]);
  try { await api(id ? `/medicine-sow/${id}` : '/medicine-sow/', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) }); $('#medicine-sow-dialog').close(); await loadMedicineSow(); }
  catch (error) { $('#medicine-sow-error').textContent = error.message; }
};

async function openMedicineSowStorageDialog(item = {}) {
  const medicines = await api('/medicine-sow/'); if (!medicines.length) return alert('Create a sow medicine before adding stock.');
  const form = $('#medicine-sow-storage-form'); form.reset(); form.id.value = item.id || '';
  form.medicine_sow_id.innerHTML = medicines.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join(''); form.medicine_sow_id.value = item.medicine_sow_id || medicines[0].id;
  for (const field of ['bottle_volume_ml','bottle_count','total_volume_ml']) form[field].value = item[field] ?? '';
  $('#medicine-sow-storage-dialog-title').textContent = item.id ? 'Edit sow medicine stock' : 'New sow medicine stock'; $('#medicine-sow-storage-error').textContent = ''; $('#medicine-sow-storage-dialog').showModal();
}
async function deleteMedicineSowStorage(id) { if (confirm('Delete this stock record?')) { try { await api(`/medicine-sow-storage/${id}`, { method: 'DELETE' }); await loadMedicineSowStorage(); } catch (error) { alert(error.message); } } }
$('#add-medicine-sow-storage').onclick = () => openMedicineSowStorageDialog(); $('#medicine-sow-storage-cancel').onclick = () => $('#medicine-sow-storage-dialog').close();
$('#medicine-sow-storage-form').onsubmit = async (event) => {
  event.preventDefault(); $('#medicine-sow-storage-error').textContent = ''; const data = Object.fromEntries(new FormData(event.target)); const id = data.id; delete data.id;
  data.medicine_sow_id = Number(data.medicine_sow_id); data.bottle_volume_ml = Number(data.bottle_volume_ml); data.bottle_count = Number(data.bottle_count); data.total_volume_ml = Number(data.total_volume_ml);
  try { await api(id ? `/medicine-sow-storage/${id}` : '/medicine-sow-storage/', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) }); $('#medicine-sow-storage-dialog').close(); await loadMedicineSowStorage(); }
  catch (error) { $('#medicine-sow-storage-error').textContent = error.message; }
};
async function openDoneSow(item={}){const[pens,medicines,users]=await Promise.all([api('/pens/'),api('/medicine-sow/'),api('/users')]);if(!pens.length||!medicines.length)return alert('Create a pen and sow medicine first.');const f=$('#done-sow-form');f.reset();f.id.value=item.id||'';f.sow_number.value=item.sow_number||'';f.injection_date.value=item.injection_date||new Date().toISOString().slice(0,10);f.dose_ml.value=item.dose_ml??'';f.weight_kg.value=item.weight_kg??'';f.comment.value=item.comment||'';f.pen_id.innerHTML=pens.map(x=>`<option value="${x.id}">${escapeHtml(x.department_name)} / ${escapeHtml(x.room_name)} / ${escapeHtml(x.name)}</option>`).join('');f.medicine_sow_id.innerHTML=medicines.map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join('');f.given_by_user_id.innerHTML=users.map(x=>`<option value="${x.id}">${escapeHtml(x.username)}</option>`).join('');f.pen_id.value=item.pen_id||pens[0].id;f.medicine_sow_id.value=item.medicine_sow_id||medicines[0].id;f.given_by_user_id.value=item.given_by_user_id||me.id;$('#done-sow-dialog-title').textContent=item.id?'Edit done sow injection':'New done sow injection';$('#done-sow-error').textContent='';$('#done-sow-dialog').showModal();}
async function deleteDoneSow(id){if(confirm('Delete this completed injection?')){try{await api(`/done-sow-injections/${id}`,{method:'DELETE'});await loadDoneSow();}catch(e){alert(e.message);}}}
$('#add-done-sow').onclick=()=>openDoneSow();$('#done-sow-cancel').onclick=()=>$('#done-sow-dialog').close();$('#done-sow-form').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target)),id=d.id;delete d.id;for(const f of ['pen_id','medicine_sow_id','given_by_user_id','dose_ml'])d[f]=Number(d[f]);d.weight_kg=d.weight_kg===''?null:Number(d.weight_kg);if(!d.comment)d.comment=null;try{await api(id?`/done-sow-injections/${id}`:'/done-sow-injections/',{method:id?'PATCH':'POST',body:JSON.stringify(d)});$('#done-sow-dialog').close();await loadDoneSow();}catch(err){$('#done-sow-error').textContent=err.message;}};
async function reportFile(kind){const date=$('#done-report-date').value||new Date().toISOString().slice(0,10);const response=await fetch(`/api/done-sow-injections/week-report${kind}?start_date=${date}`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok){const error=await response.json().catch(()=>({}));return alert(error.error||`Report generation failed (${response.status})`);}const blob=await response.blob(),url=URL.createObjectURL(blob);if(kind==='-print')window.open(url,'_blank');else{const a=document.createElement('a');a.href=url;a.download=`done-sow-${date}.xlsx`;a.click();}setTimeout(()=>URL.revokeObjectURL(url),60000);}
$('#done-report-date').value=new Date().toISOString().slice(0,10);$('#done-report-print').onclick=()=>reportFile('-print');$('#done-report-xlsx').onclick=()=>reportFile('.xlsx');
function openVetQuestion(item={}){const f=$('#vet-question-form');f.reset();f.id.value=item.id||'';f.question_date.value=item.question_date||new Date().toISOString().slice(0,10);f.question.value=item.question||'';f.photo.value=item.photo||'';$('#vet-photo-preview').innerHTML=item.photo?`<img src="${item.photo}" alt="Current photo" style="max-width:180px;max-height:120px;border-radius:8px">`:'';$('#vet-question-dialog-title').textContent=item.id?'Edit vet question':'New vet question';$('#vet-question-error').textContent='';$('#vet-question-dialog').showModal();}
async function deleteVetQuestion(id){if(confirm('Delete this vet question?')){try{await api(`/vet-questions/${id}`,{method:'DELETE'});await loadVetQuestions();}catch(e){alert(e.message);}}}
$('#add-vet-question').onclick=()=>openVetQuestion();$('#vet-question-cancel').onclick=()=>$('#vet-question-dialog').close();$('#vet-question-form').onsubmit=async e=>{e.preventDefault();const f=e.target;$('#vet-question-error').textContent='';try{let photo=f.photo.value;if(f.file.files[0]){const fd=new FormData();fd.append('file',f.file.files[0]);const response=await fetch('/api/vet-questions/upload',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:fd});const result=await response.json();if(!response.ok)throw new Error(result.error||'Upload failed');photo=result.photo;}const id=f.id.value;await api(id?`/vet-questions/${id}`:'/vet-questions/',{method:id?'PATCH':'POST',body:JSON.stringify({question_date:f.question_date.value,question:f.question.value,photo:photo||null})});$('#vet-question-dialog').close();await loadVetQuestions();}catch(err){$('#vet-question-error').textContent=err.message;}};
function formatBytes(value){if(value<1024)return `${value} B`;if(value<1048576)return `${(value/1024).toFixed(1)} KB`;return `${(value/1048576).toFixed(1)} MB`;}
async function downloadStoredFile(name,original){const response=await fetch(`/api/file-storage/download/${encodeURIComponent(name)}`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)return alert('Download failed');const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download=original;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function deleteStoredFile(name){if(confirm('Delete this file?')){try{await api(`/file-storage/${encodeURIComponent(name)}`,{method:'DELETE'});await loadFiles();}catch(e){alert(e.message);}}}
$('#file-storage-upload').onclick=()=>$('#file-storage-input').click();$('#file-storage-input').onchange=async e=>{const file=e.target.files[0];if(!file)return;$('#file-storage-error').textContent='';const data=new FormData();data.append('file',file);try{const response=await fetch('/api/file-storage/upload',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:data});const result=await response.json();if(!response.ok)throw new Error(result.error||'Upload failed');await loadFiles();}catch(err){$('#file-storage-error').textContent=err.message;}finally{e.target.value='';}};
function openDailyRemark(item={}){const f=$('#daily-remark-form');f.reset();f.id.value=item.id||'';f.remark_date.value=item.remark_date||new Date().toISOString().slice(0,10);f.remark.value=item.remark||'';f.photo.value=item.photo||'';$('#daily-photo-preview').innerHTML=item.photo?`<img src="${item.photo}" alt="Current photo" style="max-width:180px;max-height:120px;border-radius:8px">`:'';$('#daily-remark-dialog-title').textContent=item.id?'Edit daily remark':'New daily remark';$('#daily-remark-error').textContent='';$('#daily-remark-dialog').showModal();}
async function deleteDailyRemark(id){if(confirm('Delete this daily remark?')){try{await api(`/daily-remarks/${id}`,{method:'DELETE'});await loadDailyRemarks();}catch(e){alert(e.message);}}}
$('#add-daily-remark').onclick=()=>openDailyRemark();$('#daily-remark-cancel').onclick=()=>$('#daily-remark-dialog').close();$('#daily-remark-form').onsubmit=async e=>{e.preventDefault();const f=e.target;$('#daily-remark-error').textContent='';try{let photo=f.photo.value;if(f.file.files[0]){const fd=new FormData();fd.append('file',f.file.files[0]);const response=await fetch('/api/daily-remarks/upload',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:fd});const result=await response.json();if(!response.ok)throw new Error(result.error||'Upload failed');photo=result.photo;}const id=f.id.value;await api(id?`/daily-remarks/${id}`:'/daily-remarks/',{method:id?'PATCH':'POST',body:JSON.stringify({remark_date:f.remark_date.value,remark:f.remark.value,photo:photo||null})});$('#daily-remark-dialog').close();await loadDailyRemarks();}catch(err){$('#daily-remark-error').textContent=err.message;}};
function openRepairLocation(item={}){const f=$('#repair-location-form');f.reset();f.id.value=item.id||'';f.repair_date.value=item.repair_date||new Date().toISOString().slice(0,10);f.location.value=item.location||'';f.comment.value=item.comment||'';f.photo.value=item.photo||'';$('#repair-photo-preview').innerHTML=item.photo?`<img src="${item.photo}" alt="Current photo" style="max-width:180px;max-height:120px;border-radius:8px">`:'';$('#repair-location-dialog-title').textContent=item.id?'Edit repair location':'New repair location';$('#repair-location-error').textContent='';$('#repair-location-dialog').showModal();}
async function deleteRepairLocation(id){if(confirm('Delete this repair location?')){try{await api(`/repair-locations/${id}`,{method:'DELETE'});await loadRepairLocations();}catch(e){alert(e.message);}}}
$('#add-repair-location').onclick=()=>openRepairLocation();$('#repair-location-cancel').onclick=()=>$('#repair-location-dialog').close();$('#repair-location-form').onsubmit=async e=>{e.preventDefault();const f=e.target;$('#repair-location-error').textContent='';try{let photo=f.photo.value;if(f.file.files[0]){const fd=new FormData();fd.append('file',f.file.files[0]);const response=await fetch('/api/repair-locations/upload',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:fd});const result=await response.json();if(!response.ok)throw new Error(result.error||'Upload failed');photo=result.photo;}const id=f.id.value;await api(id?`/repair-locations/${id}`:'/repair-locations/',{method:id?'PATCH':'POST',body:JSON.stringify({repair_date:f.repair_date.value,location:f.location.value,comment:f.comment.value||null,photo:photo||null})});$('#repair-location-dialog').close();await loadRepairLocations();}catch(err){$('#repair-location-error').textContent=err.message;}};
let altersynScheduleYear=new Date().getFullYear();
function calculateAltresynDates(year,week){const jan4=new Date(Date.UTC(year,0,4)),jan4Day=jan4.getUTCDay()||7,monday=new Date(jan4);monday.setUTCDate(jan4.getUTCDate()-(jan4Day-1)+(week-1)*7);const weekThursday=new Date(monday);weekThursday.setUTCDate(monday.getUTCDate()+3);if(weekThursday.getUTCFullYear()!==year)return null;const dateAtOffset=offset=>{const date=new Date(monday);date.setUTCDate(monday.getUTCDate()+offset);return date.toISOString().slice(0,10);};return{altersyn_stop_date:dateAtOffset(-4),altersyn_start_date:dateAtOffset(-21),juice_stop_date:dateAtOffset(-22),juice_start_date:dateAtOffset(-25)};}
function updateAltresynDates(){const form=$('#altersyn-form'),week=Number(form.group.value),dates=calculateAltresynDates(altersynScheduleYear,week);$('#altersyn-year-note').textContent=`Calendar year: ${altersynScheduleYear}`;$('#altersyn-error').textContent=dates?'':'This week does not exist in the selected calendar year.';for(const field of ['juice_start_date','juice_stop_date','altersyn_start_date','altersyn_stop_date'])form[field].value=dates?.[field]||'';}
function openAltresyn(item={}){const form=$('#altersyn-form');form.reset();form.id.value=item.id||'';altersynScheduleYear=Number(String(item.altersyn_stop_date||'').slice(0,4))||new Date().getFullYear();for(const field of ['group','ventil','amount'])form[field].value=item[field]??'';$('#altersyn-dialog-title').textContent=item.id?'Edit Altresyn record':'New Altresyn record';$('#altersyn-error').textContent='';updateAltresynDates();$('#altersyn-dialog').showModal();}
async function deleteAltresyn(id){if(confirm('Delete this Altresyn record?')){try{await api(`/altersyn/${id}`,{method:'DELETE'});await loadAltresyn();}catch(error){alert(error.message);}}}
$('#print-altersyn').onclick=async()=>{const form=$('#altersyn-print-form'),select=form.elements.id;$('#altersyn-print-error').textContent='';try{const items=await api('/altersyn/');select.innerHTML=items.sort((a,b)=>Number(a.group)-Number(b.group)).map(item=>`<option value="${item.id}">Group ${escapeHtml(item.group)} · ${escapeHtml(item.ventil)}</option>`).join('');if(!items.length)return alert('Create an Altresyn record before printing.');$('#altersyn-print-dialog').showModal();}catch(error){alert(error.message);}};
$('#altersyn-print-cancel').onclick=()=>$('#altersyn-print-dialog').close();
$('#altersyn-print-form').onsubmit=async event=>{event.preventDefault();const id=event.currentTarget.elements.id.value,popup=window.open('','_blank');if(!popup){$('#altersyn-print-error').textContent='Allow pop-ups to open the print page.';return;}popup.document.write('<p style="font:20px Arial;padding:30px">Preparing print page…</p>');try{const response=await fetch(`/api/altersyn/print/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw new Error('Unable to prepare print page');const url=URL.createObjectURL(await response.blob());popup.location.href=url;$('#altersyn-print-dialog').close();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(error){popup.close();$('#altersyn-print-error').textContent=error.message;}};
$('#altersyn-form').group.addEventListener('input',updateAltresynDates);$('#add-altersyn').onclick=()=>openAltresyn();$('#altersyn-cancel').onclick=()=>$('#altersyn-dialog').close();$('#altersyn-form').onsubmit=async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.target)),id=data.id;delete data.id;data.amount=Number(data.amount);data.schedule_year=altersynScheduleYear;$('#altersyn-error').textContent='';try{await api(id?`/altersyn/${id}`:'/altersyn/',{method:id?'PATCH':'POST',body:JSON.stringify(data)});$('#altersyn-dialog').close();await loadAltresyn();}catch(error){$('#altersyn-error').textContent=error.message;}};
function updateDoneAltresynTotal(){const fields=$('#done-altersyn-form').elements,amount=Number(fields.amount.value)||0,extra=Number(fields.extra_doses.value)||0;$('#done-altersyn-total').textContent=`Total Altresyn: ${(amount+extra)*5} ml`;}
async function openDoneAltresyn(item={}){const[groups,users]=await Promise.all([api('/altersyn/'),api('/users')]);if(!groups.length)return alert('Create an Altresyn group before adding a completed record.');const form=$('#done-altersyn-form');form.reset();form.id.value=item.id||'';form.group.innerHTML=[...new Map(groups.map(group=>[String(group.group),group])).values()].sort((a,b)=>Number(a.group)-Number(b.group)).map(group=>`<option value="${escapeHtml(group.group)}">Group ${escapeHtml(group.group)}</option>`).join('');form.given_by_user_id.innerHTML=users.map(user=>`<option value="${user.id}">${escapeHtml(user.username)}</option>`).join('');form.group.value=item.group||form.group.options[0].value;form.amount.value=item.amount??'';form.extra_doses.value=item.extra_doses??0;form.done_date.value=item.done_date||new Date().toISOString().slice(0,10);form.given_by_user_id.value=item.given_by_user_id||me.id;$('#done-altersyn-dialog-title').textContent=item.id?'Edit Done Altresyn record':'New Done Altresyn record';$('#done-altersyn-error').textContent='';updateDoneAltresynTotal();$('#done-altersyn-dialog').showModal();}
async function deleteDoneAltresyn(id){if(confirm('Delete this completed Altresyn record?')){try{await api(`/done-altersyn/${id}`,{method:'DELETE'});await loadDoneAltresyn();}catch(error){alert(error.message);}}}
$('#done-altersyn-form').amount.addEventListener('input',updateDoneAltresynTotal);$('#done-altersyn-form').extra_doses.addEventListener('input',updateDoneAltresynTotal);$('#add-done-altersyn').onclick=()=>openDoneAltresyn();$('#done-altersyn-cancel').onclick=()=>$('#done-altersyn-dialog').close();$('#done-altersyn-form').onsubmit=async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget)),id=data.id;delete data.id;for(const field of ['amount','extra_doses','given_by_user_id'])data[field]=Number(data[field]);$('#done-altersyn-error').textContent='';try{await api(id?`/done-altersyn/${id}`:'/done-altersyn/',{method:id?'PATCH':'POST',body:JSON.stringify(data)});$('#done-altersyn-dialog').close();await loadDoneAltresyn();}catch(error){$('#done-altersyn-error').textContent=error.message;}};
function openTodo(item={}){const f=$('#todo-form');f.reset();f.id.value=item.id||'';f.task.value=item.task||'';f.due_date.value=item.due_date||new Date().toISOString().slice(0,10);f.is_completed.checked=Boolean(item.is_completed);$('#todo-dialog-title').textContent=item.id?'Edit task':'New task';$('#todo-error').textContent='';$('#todo-dialog').showModal();}
async function toggleTodo(item){try{await api(`/todos/${item.id}`,{method:'PATCH',body:JSON.stringify({is_completed:!item.is_completed})});await loadTodos();}catch(e){alert(e.message);}}
async function deleteTodo(id){if(confirm('Delete this task?')){try{await api(`/todos/${id}`,{method:'DELETE'});await loadTodos();}catch(e){alert(e.message);}}}
$('#add-todo').onclick=()=>openTodo();$('#todo-cancel').onclick=()=>$('#todo-dialog').close();$('#todo-form').onsubmit=async e=>{e.preventDefault();const f=e.target,id=f.id.value,data={task:f.task.value,due_date:f.due_date.value,is_completed:f.is_completed.checked};try{await api(id?`/todos/${id}`:'/todos/',{method:id?'PATCH':'POST',body:JSON.stringify(data)});$('#todo-dialog').close();await loadTodos();}catch(err){$('#todo-error').textContent=err.message;}};
function logout() { token = null; me = null; localStorage.removeItem('token'); $('#admin').hidden = true; $('#login').hidden = false; }
function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }
$('#logout').onclick = logout;
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
if (token) showAdmin();
