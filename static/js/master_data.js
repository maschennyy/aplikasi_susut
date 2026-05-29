'use strict';

let masterState = {
  summary: {},
  areas: [],
  gis: [],
  trafos: [],
  penyulangs: [],
};

document.addEventListener('DOMContentLoaded', async () => {
  bindMasterEvents();
  await loadMasterData();
});

function bindMasterEvents() {
  document.querySelectorAll('[data-master-tab]').forEach(btn => {
    btn.addEventListener('click', () => setMasterTab(btn.dataset.masterTab));
  });
  document.querySelectorAll('[data-reset-form]').forEach(btn => {
    btn.addEventListener('click', () => resetMasterForm(btn.dataset.resetForm));
  });

  qid('btn-refresh-master')?.addEventListener('click', loadMasterData);
  qid('form-area')?.addEventListener('submit', event => saveMaster(event, 'area'));
  qid('form-gi')?.addEventListener('submit', event => saveMaster(event, 'gi'));
  qid('form-trafo')?.addEventListener('submit', event => saveMaster(event, 'trafo'));
  qid('form-penyulang')?.addEventListener('submit', event => saveMaster(event, 'penyulang'));
  qid('master-feeder-gi')?.addEventListener('change', () => fillFeederTrafoOptions());

  document.addEventListener('click', event => {
    const btn = event.target.closest('[data-master-edit]');
    if (!btn) return;
    editMaster(btn.dataset.masterEdit, btn.dataset.id);
  });
}

async function loadMasterData() {
  setLive('Memuat');
  const [summary, areas, gis, trafos, penyulangs] = await Promise.all([
    getJSON('/api/master-data/summary', {}),
    getJSON('/api/area-unit?all=1', []),
    getJSON('/api/gardu-induk?all=1', []),
    getJSON('/api/trafo?all=1', []),
    getJSON('/api/penyulang?all=1', []),
  ]);
  masterState = { summary, areas, gis, trafos, penyulangs };
  renderMasterPage();
  setLive('Update ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
}

function renderMasterPage() {
  renderMasterMetrics();
  fillMasterOptions();
  renderAreaTable();
  renderGiTable();
  renderTrafoTable();
  renderPenyulangTable();
}

function renderMasterMetrics() {
  setText('master-count-gi', fmtNum(masterState.summary.gi || 0));
  setText('master-count-trafo', fmtNum(masterState.summary.trafo || 0));
  setText('master-count-penyulang', fmtNum(masterState.summary.penyulang || 0));
  setText('master-count-issues', fmtNum((masterState.summary.missing_area || 0) + (masterState.summary.trafo_without_feeder || 0)));
}

function fillMasterOptions() {
  const giOptions = masterState.gis
    .filter(item => item.aktif)
    .map(item => `<option value="${item.id}">${escapeHTML(item.kode_gi)} - ${escapeHTML(item.nama_gi)}</option>`)
    .join('');

  document.querySelectorAll('select[name="gi_id"]').forEach(select => {
    const current = select.value;
    select.innerHTML = giOptions || '<option value="">Belum ada GI</option>';
    if (current) select.value = current;
  });

  const areaNames = uniqueValues([
    ...masterState.areas.map(item => item.nama_unit),
    ...masterState.gis.map(item => item.area),
    ...masterState.penyulangs.map(item => item.area_up3),
  ]);
  qid('master-area-options').innerHTML = areaNames.map(name => `<option value="${escapeHTML(name)}"></option>`).join('');

  const unitNames = uniqueValues([
    ...masterState.areas.map(item => item.nama_unit),
    ...masterState.gis.map(item => item.unit),
    ...masterState.areas.map(item => item.parent_unit),
  ]);
  qid('master-unit-options').innerHTML = unitNames.map(name => `<option value="${escapeHTML(name)}"></option>`).join('');

  fillFeederTrafoOptions();
}

function fillFeederTrafoOptions(selectedId = '') {
  const giId = qid('master-feeder-gi')?.value;
  const select = qid('master-feeder-trafo');
  if (!select) return;
  const rows = masterState.trafos.filter(item => item.aktif && (!giId || String(item.gi_id) === String(giId)));
  select.innerHTML = rows.map(item => `<option value="${item.id}">${escapeHTML(item.kode_trafo)} - ${escapeHTML(item.nama_trafo)}</option>`).join('') || '<option value="">Belum ada trafo</option>';
  if (selectedId) select.value = selectedId;
}

function renderAreaTable() {
  const tbody = document.querySelector('#table-area tbody');
  if (!tbody) return;
  if (!masterState.areas.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Belum ada area/unit.</td></tr>';
    return;
  }
  tbody.innerHTML = masterState.areas.map(item => `
    <tr>
      <td><strong>${escapeHTML(item.kode_unit)}</strong><span class="subtext">${escapeHTML(item.nama_unit)}</span></td>
      <td>${escapeHTML(item.jenis || '-')}</td>
      <td>${escapeHTML(item.parent_unit || '-')}</td>
      <td>${statusBadge(item.aktif ? 'AKTIF' : 'NONAKTIF')}</td>
      <td class="tr">${editButton('area', item.id)}</td>
    </tr>`).join('');
}

function renderGiTable() {
  const tbody = document.querySelector('#table-gi tbody');
  if (!tbody) return;
  if (!masterState.gis.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Belum ada gardu induk.</td></tr>';
    return;
  }
  tbody.innerHTML = masterState.gis.map(item => `
    <tr>
      <td><strong>${escapeHTML(item.kode_gi)}</strong><span class="subtext">${escapeHTML(item.nama_gi)}</span></td>
      <td>${escapeHTML(item.area || '-')}</td>
      <td>${escapeHTML(item.unit || '-')}</td>
      <td>${statusBadge(item.aktif ? 'AKTIF' : 'NONAKTIF')}</td>
      <td class="tr">${editButton('gi', item.id)}</td>
    </tr>`).join('');
}

function renderTrafoTable() {
  const tbody = document.querySelector('#table-trafo tbody');
  if (!tbody) return;
  if (!masterState.trafos.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Belum ada trafo.</td></tr>';
    return;
  }
  tbody.innerHTML = masterState.trafos.map(item => `
    <tr>
      <td><strong>${escapeHTML(item.kode_trafo)}</strong><span class="subtext">${escapeHTML(item.nama_trafo)}</span></td>
      <td>${escapeHTML(item.gi_kode || '-')}</td>
      <td class="tr mono">${fmtNum(item.kapasitas_mva || 0)}</td>
      <td>${statusBadge(item.aktif ? 'AKTIF' : 'NONAKTIF')}</td>
      <td class="tr">${editButton('trafo', item.id)}</td>
    </tr>`).join('');
}

function renderPenyulangTable() {
  const tbody = document.querySelector('#table-penyulang tbody');
  if (!tbody) return;
  if (!masterState.penyulangs.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Belum ada penyulang.</td></tr>';
    return;
  }
  tbody.innerHTML = masterState.penyulangs.map(item => `
    <tr>
      <td><strong>${escapeHTML(item.kode_penyulang)}</strong><span class="subtext">${escapeHTML(item.nama_penyulang)}</span></td>
      <td>${escapeHTML(item.gi_kode || '-')}</td>
      <td>${escapeHTML(item.kode_trafo || '-')}</td>
      <td>${escapeHTML(item.area_up3 || '-')}</td>
      <td>${statusBadge(item.status || (item.aktif ? 'AKTIF' : 'NONAKTIF'))}</td>
      <td class="tr">${editButton('penyulang', item.id)}</td>
    </tr>`).join('');
}

async function saveMaster(event, type) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formPayload(form);
  const id = data.id;
  delete data.id;

  const endpoint = id ? `${endpointFor(type)}/${id}` : endpointFor(type);
  try {
    const resp = await fetch(endpoint, {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const payload = await resp.json();
    if (!resp.ok) throw new Error(payload.error || 'Gagal menyimpan master data.');
    if (window.showToast) window.showToast('Master data tersimpan', 'success');
    resetMasterForm(form.id);
    await loadMasterData();
  } catch (err) {
    if (window.showToast) window.showToast(err.message, 'error');
  }
}

function editMaster(type, id) {
  const row = collectionFor(type).find(item => String(item.id) === String(id));
  if (!row) return;
  setMasterTab(type === 'area' ? 'area' : type);
  const form = qid(`form-${type}`);
  if (!form) return;
  resetMasterForm(form.id);

  if (type === 'area') setForm(form, row, ['id', 'kode_unit', 'nama_unit', 'jenis', 'parent_unit', 'aktif']);
  if (type === 'gi') setForm(form, row, ['id', 'kode_gi', 'nama_gi', 'area', 'unit', 'alamat', 'aktif']);
  if (type === 'trafo') setForm(form, row, ['id', 'gi_id', 'kode_trafo', 'nama_trafo', 'kapasitas_mva', 'tegangan_kv', 'aktif']);
  if (type === 'penyulang') {
    setForm(form, row, ['id', 'gi_id', 'kode_penyulang', 'nama_penyulang', 'jenis', 'area_up3', 'ex_cabang', 'status', 'aktif']);
    fillFeederTrafoOptions(row.trafo_id);
  }
}

function resetMasterForm(formId) {
  const form = qid(formId);
  if (!form) return;
  form.reset();
  form.querySelector('[name="id"]').value = '';
  form.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = true; });
  if (formId === 'form-penyulang') fillFeederTrafoOptions();
}

function setForm(form, data, fields) {
  fields.forEach(field => {
    const input = form.elements[field];
    if (!input) return;
    if (input.type === 'checkbox') input.checked = Boolean(data[field]);
    else input.value = data[field] ?? '';
  });
}

function formPayload(form) {
  const data = {};
  Array.from(form.elements).forEach(input => {
    if (!input.name) return;
    data[input.name] = input.type === 'checkbox' ? input.checked : input.value;
  });
  return data;
}

function setMasterTab(tab) {
  document.querySelectorAll('[data-master-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.masterTab === tab);
  });
  document.querySelectorAll('[data-master-pane]').forEach(pane => {
    pane.classList.toggle('active', pane.dataset.masterPane === tab);
  });
}

function endpointFor(type) {
  return {
    area: '/api/area-unit',
    gi: '/api/gardu-induk',
    trafo: '/api/trafo',
    penyulang: '/api/penyulang',
  }[type];
}

function collectionFor(type) {
  return {
    area: masterState.areas,
    gi: masterState.gis,
    trafo: masterState.trafos,
    penyulang: masterState.penyulangs,
  }[type] || [];
}

function editButton(type, id) {
  return `<button class="btn-outline master-edit-btn" type="button" data-master-edit="${type}" data-id="${id}"><i class="ti ti-pencil" aria-hidden="true"></i>Edit</button>`;
}

function statusBadge(status) {
  const upper = String(status || '-').toUpperCase();
  const cls = upper === 'AKTIF' ? 'badge-ok' : upper === 'CADANGAN' ? 'badge-warn' : 'badge-danger';
  return `<span class="badge ${cls}">${escapeHTML(upper)}</span>`;
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

function uniqueValues(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function setLive(text) { setText('master-live', text); }
function qid(id) { return document.getElementById(id); }
function setText(id, value) { const el = qid(id); if (el) el.textContent = value; }
function fmtNum(value) { return new Intl.NumberFormat('id-ID').format(Math.round(Number(value || 0))); }
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}
