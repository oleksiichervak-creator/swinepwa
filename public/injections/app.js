const $ = selector => document.querySelector(selector);
const localDate = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

let token = localStorage.getItem('sow-injections-token') || '';
let currentUser = null;
let todayItems = [];
let references = null;

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (response.status === 401 && token) {
    signOut();
    throw new Error('Your session has expired. Please sign in again.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

async function loadUsers() {
  const select = $('#login-user');
  try {
    const users = await api('/api/auth/users');
    select.innerHTML = users.length
      ? users.map(user => `<option value="${escapeHtml(user.username)}">${escapeHtml(user.username)}</option>`).join('')
      : '<option value="">No users available</option>';
  } catch (error) {
    select.innerHTML = '<option value="">Unable to load users</option>';
    $('#login-error').textContent = error.message;
  }
}

$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  $('#login-error').textContent = '';
  try {
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: $('#login-user').value, password: $('#login-password').value }),
    });
    token = result.token;
    currentUser = result.user;
    localStorage.setItem('sow-injections-token', token);
    $('#login-password').value = '';
    await enterApp();
  } catch (error) {
    $('#login-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

async function restoreSession() {
  if (!token) return loadUsers();
  try {
    currentUser = await api('/api/auth/me');
    await enterApp();
  } catch {
    await loadUsers();
  }
}

async function enterApp() {
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  $('#current-user').textContent = currentUser.username;
  $('#today-date').value = localDate();
  showScreen('home');
  await refreshTodayCount();
}

function signOut() {
  token = '';
  currentUser = null;
  references = null;
  localStorage.removeItem('sow-injections-token');
  $('#app-view').hidden = true;
  $('#login-view').hidden = false;
  loadUsers();
}

function showScreen(name) {
  for (const screen of ['home', 'plan', 'today']) $(`#${screen}-screen`).hidden = screen !== name;
  $('#back-button').hidden = name === 'home';
  $('#screen-title').textContent = { home: 'Today', plan: 'Add to plan', today: 'Injections for today' }[name];
}

async function loadReferences() {
  if (references) return references;
  const [pens, medicines] = await Promise.all([api('/pens/'), api('/medicine-sow/')]);
  references = { pens, medicines };
  return references;
}

$('#show-plan').addEventListener('click', async () => {
  showScreen('plan');
  $('#plan-error').textContent = '';
  try {
    const { pens, medicines } = await loadReferences();
    const form = $('#plan-form');
    form.pen_id.innerHTML = pens.map(p => `<option value="${p.id}">${escapeHtml(p.department_name)} / ${escapeHtml(p.room_name)} / ${escapeHtml(p.name)}</option>`).join('');
    form.medicine_sow_id.innerHTML = medicines.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    form.injection_date.value = localDate();
  } catch (error) {
    $('#plan-error').textContent = error.message;
  }
});

$('#plan-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  $('#plan-error').textContent = '';
  const data = Object.fromEntries(new FormData(event.currentTarget));
  data.pen_id = Number(data.pen_id);
  data.medicine_sow_id = Number(data.medicine_sow_id);
  data.dose_ml = Number(data.dose_ml);
  data.comment = data.comment.trim() || null;
  try {
    await api('/api/injection-pwa/plans', { method: 'POST', body: JSON.stringify(data) });
    event.currentTarget.reset();
    showScreen('home');
    await refreshTodayCount();
    toast('Injection added to plan');
  } catch (error) {
    $('#plan-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

async function loadToday() {
  const list = $('#today-list');
  list.innerHTML = '<div class="empty">Loading…</div>';
  try {
    todayItems = await api(`/api/injection-pwa/today?date=${encodeURIComponent($('#today-date').value)}`);
    $('#today-count').textContent = todayItems.length;
    list.innerHTML = todayItems.length ? todayItems.map(item => `
      <article class="injection-card">
        <header><h2>Sow ${escapeHtml(item.sow_number)}</h2><strong>${escapeHtml(item.pen_name)}</strong></header>
        <div class="medicine">${escapeHtml(item.medicine_name)}</div>
        <div class="meta"><span>Dose: <strong>${item.dose_ml} ml</strong></span><span>${escapeHtml(item.comment || 'No comment')}</span></div>
        <button class="complete-button" data-complete="${item.id}" type="button">Register as done</button>
      </article>`).join('') : '<div class="empty">No planned injections for this date.</div>';
    list.querySelectorAll('[data-complete]').forEach(button => {
      button.addEventListener('click', () => openComplete(todayItems.find(item => String(item.id) === button.dataset.complete)));
    });
  } catch (error) {
    list.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

async function refreshTodayCount() {
  try {
    const items = await api(`/api/injection-pwa/today?date=${localDate()}`);
    $('#today-count').textContent = items.length;
  } catch {
    $('#today-count').textContent = '!';
  }
}

function openComplete(item) {
  const form = $('#complete-form');
  form.reset();
  form.id.value = item.id;
  form.injection_date.value = $('#today-date').value;
  form.dose_ml.value = item.dose_ml;
  form.comment.value = item.comment || '';
  $('#complete-title').textContent = `Sow ${item.sow_number}`;
  $('#complete-details').innerHTML = `<dt>Pen</dt><dd>${escapeHtml(item.pen_name)}</dd><dt>Medicine</dt><dd>${escapeHtml(item.medicine_name)}</dd>`;
  $('#complete-error').textContent = '';
  $('#complete-dialog').showModal();
}

$('#complete-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  $('#complete-error').textContent = '';
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const id = data.id;
  delete data.id;
  data.dose_ml = Number(data.dose_ml);
  data.comment = data.comment.trim() || null;
  try {
    await api(`/api/injection-pwa/plans/${id}/complete`, { method: 'POST', body: JSON.stringify(data) });
    $('#complete-dialog').close();
    await loadToday();
    toast('Injection registered');
  } catch (error) {
    $('#complete-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('#show-today').addEventListener('click', () => { showScreen('today'); loadToday(); });
$('#refresh-today').addEventListener('click', loadToday);
$('#today-date').addEventListener('change', loadToday);
$('#back-button').addEventListener('click', () => showScreen('home'));
$('#logout-button').addEventListener('click', signOut);
$('#complete-close').addEventListener('click', () => $('#complete-dialog').close());

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 2200);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/injections/sw.js', { scope: '/injections/' });
restoreSession();
