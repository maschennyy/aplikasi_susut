'use strict';

const ROLES = ['viewer', 'operator', 'auditor', 'admin'];
let securityState = { users: [], audit: [] };

document.addEventListener('DOMContentLoaded', async () => {
  bindSecurityEvents();
  await loadSecurity();
});

function bindSecurityEvents() {
  qid('btn-refresh-security')?.addEventListener('click', loadSecurity);
  qid('form-create-user')?.addEventListener('submit', createUser);
  qid('form-reset-password')?.addEventListener('submit', resetPassword);
}

async function loadSecurity() {
  setLive('Memuat');
  const [summary, users, audit] = await Promise.all([
    getJSON('/api/security-summary', {}),
    getJSON('/api/users', []),
    getJSON('/api/audit-log?limit=100', []),
  ]);
  securityState = { users, audit };
  renderSummary(summary);
  renderUsers(users);
  renderAudit(audit);
  fillResetUsers(users);
  setLive('Update ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
}

function renderSummary(summary) {
  setText('sec-users-total', fmtNum(summary.users_total || 0));
  setText('sec-users-active', fmtNum(summary.active_users || 0));
  setText('sec-failed-login', fmtNum(summary.failed_logins || 0));
  setText('sec-imports', fmtNum(summary.imports || 0));
}

function renderUsers(users) {
  const tbody = document.querySelector('#table-users tbody');
  if (!tbody) return;
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Belum ada user.</td></tr>';
    return;
  }
  tbody.innerHTML = users.map(user => `
    <tr data-user-id="${user.id}">
      <td>
        <strong>${escapeHTML(user.username)}</strong>
        <span class="subtext">${escapeHTML(user.nama_lengkap || '-')} ${user.email ? '&middot; ' + escapeHTML(user.email) : ''}</span>
      </td>
      <td>
        <select class="security-mini-select" data-field="role">
          ${ROLES.map(role => `<option value="${role}" ${role === user.role ? 'selected' : ''}>${title(role)}</option>`).join('')}
        </select>
      </td>
      <td>
        <label class="security-toggle">
          <input type="checkbox" data-field="aktif" ${user.aktif ? 'checked' : ''}>
          <span>${user.aktif ? 'Aktif' : 'Nonaktif'}</span>
        </label>
      </td>
      <td>${formatDate(user.last_login_at)}</td>
      <td class="tr">
        <button class="btn-outline btn-save-user" type="button" data-user-id="${user.id}">
          <i class="ti ti-device-floppy" aria-hidden="true"></i>
          Simpan
        </button>
      </td>
    </tr>`).join('');

  document.querySelectorAll('.btn-save-user').forEach(btn => {
    btn.addEventListener('click', () => updateUser(btn.dataset.userId));
  });
  document.querySelectorAll('.security-toggle input').forEach(input => {
    input.addEventListener('change', () => {
      const span = input.nextElementSibling;
      if (span) span.textContent = input.checked ? 'Aktif' : 'Nonaktif';
    });
  });
}

function renderAudit(rows) {
  const tbody = document.querySelector('#table-audit tbody');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Belum ada audit log.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${formatDate(row.created_at)}</td>
      <td>${escapeHTML(row.username || '-')}<span class="subtext">${escapeHTML(row.role || '-')}</span></td>
      <td><strong>${escapeHTML(row.action || '-')}</strong></td>
      <td><span class="badge ${row.status === 'SUCCESS' ? 'badge-ok' : 'badge-danger'}">${escapeHTML(row.status || '-')}</span></td>
      <td>${escapeHTML(row.ip_address || '-')}</td>
      <td class="audit-detail">${escapeHTML(compactDetail(row.detail_json))}</td>
    </tr>`).join('');
}

function fillResetUsers(users) {
  const select = qid('reset-user-id');
  if (!select) return;
  const current = select.value;
  select.innerHTML = users.map(user => (
    `<option value="${user.id}">${escapeHTML(user.username)} - ${title(user.role)}</option>`
  )).join('');
  if (current && users.some(user => String(user.id) === current)) select.value = current;
}

async function createUser(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    const resp = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const payload = await resp.json();
    if (!resp.ok) throw new Error(payload.error || 'Gagal menambah user.');
    form.reset();
    if (window.showToast) window.showToast('User berhasil ditambahkan', 'success');
    await loadSecurity();
  } catch (err) {
    if (window.showToast) window.showToast(err.message, 'error');
  }
}

async function updateUser(userId) {
  const row = document.querySelector(`tr[data-user-id="${userId}"]`);
  const user = securityState.users.find(item => String(item.id) === String(userId));
  if (!row || !user) return;
  const data = {
    nama_lengkap: user.nama_lengkap || user.username,
    email: user.email || '',
    role: row.querySelector('[data-field="role"]').value,
    aktif: row.querySelector('[data-field="aktif"]').checked,
  };
  try {
    const resp = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const payload = await resp.json();
    if (!resp.ok) throw new Error(payload.error || 'Gagal menyimpan user.');
    if (window.showToast) window.showToast('User berhasil diperbarui', 'success');
    await loadSecurity();
  } catch (err) {
    if (window.showToast) window.showToast(err.message, 'error');
  }
}

async function resetPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const userId = data.user_id;
  try {
    const resp = await fetch(`/api/users/${userId}/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: data.password }),
    });
    const payload = await resp.json();
    if (!resp.ok) throw new Error(payload.error || 'Gagal reset password.');
    form.reset();
    if (window.showToast) window.showToast('Password berhasil direset', 'success');
    await loadSecurity();
  } catch (err) {
    if (window.showToast) window.showToast(err.message, 'error');
  }
}

async function getJSON(url, fallback) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(resp.statusText);
    return await resp.json();
  } catch (err) {
    console.warn('Gagal memuat:', url, err);
    return fallback;
  }
}

function compactDetail(value) {
  if (!value) return '-';
  try {
    const parsed = JSON.parse(value);
    return Object.entries(parsed).slice(0, 4).map(([key, val]) => `${key}: ${shortValue(val)}`).join(', ');
  } catch (_) {
    return value;
  }
}

function shortValue(value) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 80);
  return String(value).slice(0, 80);
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function title(value) {
  return String(value || '').replace(/^\w/, char => char.toUpperCase());
}

function setLive(text) { setText('security-live', text); }
function qid(id) { return document.getElementById(id); }
function setText(id, value) { const el = qid(id); if (el) el.textContent = value; }
function fmtNum(value) { return new Intl.NumberFormat('id-ID').format(Number(value || 0)); }
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}
