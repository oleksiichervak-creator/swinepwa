const $ = selector => document.querySelector(selector);
const localDate = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

let token = localStorage.getItem('sow-injections-token') || '';
let currentUser = null;
let todayItems = [];
let references = null;
let installPrompt = null;

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
  setTodayDateLabel();
  showScreen('home');
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
  $('#screen-title').textContent = '';
  $('#logout-button').hidden = name !== 'home';
}

function setTodayDateLabel() {
  $('#today-date-label').textContent = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date());
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
    await preparePlanForm();
  } catch (error) {
    $('#plan-error').textContent = error.message;
  }
});

async function preparePlanForm() {
  const { pens, medicines } = await loadReferences();
  const form = $('#plan-form');
  form.reset();
  form.pen_id.value = '';
  form.injection_date.value = localDate();
  form.medicine_sow_id.innerHTML = '<option value="">Select medicine</option>' +
    medicines.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
  form.weight_kg.value = '';
  $('#weight-grid').innerHTML = Array.from({ length: 14 }, (_, index) => 75 + index * 25)
    .map(weight => `<button class="weight-button" type="button" data-weight="${weight}">${weight}<small>kg</small></button>`).join('');
  document.querySelectorAll('[data-weight]').forEach(button => button.addEventListener('click', () => selectWeight(button)));
  $('#pen-options').innerHTML = pens.map(p =>
    `<option value="${escapeHtml(p.name)}">${escapeHtml(p.department_name)} / ${escapeHtml(p.room_name)}</option>`).join('');
  $('#pen-input').value = '';
  $('#pen-result').textContent = '';
  $('#sow-check-status').textContent = '';
  $('#sow-history').hidden = true;
  $('#sow-history').innerHTML = '';
  for (const step of document.querySelectorAll('.step')) step.hidden = step.dataset.step !== '1';
}

function revealStep(number) {
  const step = document.querySelector(`.step[data-step="${number}"]`);
  step.hidden = false;
  requestAnimationFrame(() => step.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
}

function hideStepsFrom(number) {
  for (const step of document.querySelectorAll('.step')) {
    if (Number(step.dataset.step) >= number) step.hidden = true;
  }
}

let sowCheckTimer;
let sowCheckSequence = 0;
$('#plan-form').sow_number.addEventListener('input', () => {
  clearTimeout(sowCheckTimer);
  hideStepsFrom(2);
  $('#sow-history').hidden = true;
  $('#sow-check-status').textContent = '';
  const sowNumber = $('#plan-form').sow_number.value.trim();
  if (!sowNumber) return;
  $('#sow-check-status').textContent = 'Checking history…';
  sowCheckTimer = setTimeout(() => checkSowHistory(sowNumber), 450);
});

async function checkSowHistory(sowNumber) {
  const history = $('#sow-history');
  const sequence = ++sowCheckSequence;
  $('#plan-error').textContent = '';
  try {
    const items = await api(`/api/injection-pwa/history?sow_number=${encodeURIComponent(sowNumber)}`);
    if (sequence !== sowCheckSequence || $('#plan-form').sow_number.value.trim() !== sowNumber) return;
    $('#sow-check-status').textContent = 'History checked';
    history.hidden = false;
    history.innerHTML = items.length
      ? `<strong>${items.length} existing record${items.length === 1 ? '' : 's'}</strong>` + items.map(item => `
          <div class="history-row">
            <span class="status ${item.status}">${item.status}</span>
            <span>${escapeHtml(item.injection_date)}</span>
            <span>${escapeHtml(item.medicine_name)} · ${item.dose_ml} ml</span>
          </div>`).join('')
      : '<strong>No planned or completed injections found.</strong>';
    revealStep(2);
  } catch (error) {
    $('#sow-check-status').textContent = '';
    $('#plan-error').textContent = error.message;
  }
}

let penCheckTimer;
$('#pen-input').addEventListener('input', () => {
  const input = $('#pen-input');
  const normalized = input.value.replace(',', '.').replace(/[^0-9.]/g, '');
  const [whole, ...decimals] = normalized.split('.');
  input.value = decimals.length ? `${whole}.${decimals.join('')}` : whole;
  clearTimeout(penCheckTimer);
  $('#plan-form').pen_id.value = '';
  $('#pen-result').textContent = 'Checking pen…';
  $('#pen-result').classList.remove('invalid');
  hideStepsFrom(3);
  penCheckTimer = setTimeout(validatePenInput, 250);
});

async function validatePenInput() {
  const value = $('#pen-input').value.trim().replace(',', '.').toLocaleLowerCase();
  if (!value) {
    $('#pen-result').textContent = '';
    return;
  }
  const { pens } = await loadReferences();
  const matches = pens.filter(p => p.name.trim().toLocaleLowerCase() === value);
  $('#plan-form').pen_id.value = '';
  if (!matches.length) {
    $('#pen-result').textContent = 'Pen not found. Check the number and try again.';
    $('#pen-result').classList.add('invalid');
    return;
  }
  if (matches.length > 1) {
    $('#pen-result').textContent = 'More than one pen has this number. Ask an administrator to make pen numbers unique.';
    $('#pen-result').classList.add('invalid');
    return;
  }
  const pen = matches[0];
  $('#plan-form').pen_id.value = pen.id;
  $('#pen-result').textContent = `Found: ${pen.department_name} / ${pen.room_name} / ${pen.name}`;
  $('#pen-result').classList.remove('invalid');
  revealStep(3);
}

$('#plan-form').medicine_sow_id.addEventListener('change', event => {
  document.querySelector('.step[data-step="5"]').hidden = true;
  if (event.target.value) revealStep(4);
});

function selectWeight(button) {
  document.querySelectorAll('[data-weight]').forEach(item => item.classList.toggle('selected', item === button));
  $('#plan-form').weight_kg.value = button.dataset.weight;
  updateDosePreview();
  revealStep(5);
}

$('#plan-form').include_melovem.addEventListener('change', updateDosePreview);

function updateDosePreview() {
  const form = $('#plan-form');
  const medicine = references.medicines.find(item => String(item.id) === form.medicine_sow_id.value);
  const melovem = references.medicines.find(item => item.name.toLocaleLowerCase() === 'melovem');
  const weight = Number(form.weight_kg.value);
  if (!medicine || !weight) return;
  const dose = calculateDose(medicine, weight);
  const offerMelovem = medicine.name.toLocaleLowerCase() !== 'melovem';
  $('#melovem-option').hidden = !offerMelovem;
  const includeMelovem = offerMelovem && form.include_melovem.checked && melovem;
  $('#dose-preview').innerHTML = `
    <div><span>${escapeHtml(medicine.name)} · ${courseLabel(medicine)}</span><strong>${formatDose(dose)} ml/day</strong></div>
    ${includeMelovem ? `<div><span>Melovem · ${courseLabel(melovem)}</span><strong>${formatDose(calculateDose(melovem, weight))} ml/day</strong></div>` : ''}`;
}

$('#pin-keypad').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const input = $('#login-password');
  if (button.dataset.pin !== undefined && input.value.length < 32) input.value += button.dataset.pin;
  if (button.hasAttribute('data-pin-backspace')) input.value = input.value.slice(0, -1);
  if (button.hasAttribute('data-pin-clear')) input.value = '';
  $('#login-error').textContent = '';
});

$('#login-user').addEventListener('change', () => { $('#login-password').value = ''; });

function courseLabel(medicine) {
  const days = Math.max(1, Number(medicine.course_days) || 0);
  return `${days} day${days === 1 ? '' : 's'}`;
}

function calculateDose(medicine, weight) {
  const doseKg = Number(medicine.dose_kg);
  return doseKg > 0 ? weight * Number(medicine.dose_ml) / doseKg : 0;
}

function formatDose(value) {
  return Number(value.toFixed(3)).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

$('#plan-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  $('#plan-error').textContent = '';
  const data = Object.fromEntries(new FormData(event.currentTarget));
  data.pen_id = Number(data.pen_id);
  data.medicine_sow_id = Number(data.medicine_sow_id);
  data.weight_kg = Number(data.weight_kg);
  data.include_melovem = data.include_melovem === 'on';
  data.comment = data.comment.trim() || null;
  try {
    const result = await api('/api/injection-pwa/plans', { method: 'POST', body: JSON.stringify(data) });
    showScreen('home');
    toast(`${result.plans.length} injection${result.plans.length === 1 ? '' : 's'} added to plan`);
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
    todayItems = await api(`/api/injection-pwa/today?date=${localDate()}`);
    todayItems.sort(comparePens);
    renderMedicineSummary();
    list.innerHTML = todayItems.length ? todayItems.map(item => `
      <article class="injection-card">
        <header><h2>Sow ${escapeHtml(item.sow_number)}</h2><strong>${escapeHtml(item.pen_name)}</strong></header>
        <div class="medicine">${escapeHtml(item.medicine_name)}</div>
        <div class="meta"><span>Dose: <strong>${item.dose_ml} ml</strong></span><span>${escapeHtml(item.comment || 'No comment')}</span></div>
        <div class="card-actions">
          <button class="skip-button" data-skip="${item.id}" type="button">Skip</button>
          <button class="complete-button" data-complete="${item.id}" type="button">Register as done</button>
        </div>
      </article>`).join('') : '<div class="empty">No planned injections for this date.</div>';
    list.querySelectorAll('[data-complete]').forEach(button => {
      button.addEventListener('click', () => openComplete(todayItems.find(item => String(item.id) === button.dataset.complete)));
    });
    list.querySelectorAll('[data-skip]').forEach(button => {
      button.addEventListener('click', () => skipInjection(button.dataset.skip, button));
    });
  } catch (error) {
    $('#medicine-summary').innerHTML = '';
    list.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function comparePens(left, right) {
  const a = String(left.pen_name).trim();
  const b = String(right.pen_name).trim();
  const aDotted = a.includes('.');
  const bDotted = b.includes('.');
  if (aDotted !== bDotted) return aDotted ? 1 : -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function renderMedicineSummary() {
  const medicines = new Map();
  for (const item of todayItems) {
    const current = medicines.get(item.medicine_name) || { count: 0, dose: 0 };
    current.count += 1;
    current.dose += Number(item.dose_ml);
    medicines.set(item.medicine_name, current);
  }
  $('#medicine-summary').innerHTML = medicines.size ? `
    <h2>Medicine totals</h2>
    <div class="summary-table">
      ${[...medicines].sort(([a], [b]) => a.localeCompare(b)).map(([name, total]) => `
        <div><strong>${escapeHtml(name)}</strong><span>${total.count} injection${total.count === 1 ? '' : 's'}</span><b>${formatDose(total.dose)} ml</b></div>
      `).join('')}
    </div>` : '';
}

async function skipInjection(id, button) {
  if (!confirm('Skip this planned injection? It will not be added to done injections.')) return;
  button.disabled = true;
  try {
    await api(`/api/injection-pwa/plans/${id}/skip`, { method: 'DELETE' });
    await loadToday();
    toast('Planned injection skipped');
  } catch (error) {
    button.disabled = false;
    toast(error.message);
  }
}

function openComplete(item) {
  const form = $('#complete-form');
  form.reset();
  form.id.value = item.id;
  form.injection_date.value = localDate();
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
$('#back-button').addEventListener('click', () => showScreen('home'));
$('#logout-button').addEventListener('click', signOut);
$('#complete-close').addEventListener('click', () => $('#complete-dialog').close());

const installRequested = new URLSearchParams(location.search).get('install') === '1';
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function showInstallDialog() {
  if (!installRequested || standalone || $('#install-dialog').open) return;
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIos) $('#install-message').textContent = 'In Safari, tap Share, then select Add to Home Screen.';
  else if (!installPrompt) $('#install-message').textContent = 'Tap Install app. If no prompt appears, use the browser menu and select Install app.';
  $('#install-dialog').showModal();
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  showInstallDialog();
});

$('#install-app').addEventListener('click', async () => {
  if (!installPrompt) {
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    $('#install-message').textContent = isIos
      ? 'In Safari, tap Share, then select Add to Home Screen.'
      : 'Open the browser menu and select Install app or Add to Home screen.';
    return;
  }
  await installPrompt.prompt();
  installPrompt = null;
  $('#install-dialog').close();
});

$('#install-dismiss').addEventListener('click', () => $('#install-dialog').close());
window.addEventListener('appinstalled', () => { if ($('#install-dialog').open) $('#install-dialog').close(); });
setTimeout(showInstallDialog, 500);

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
