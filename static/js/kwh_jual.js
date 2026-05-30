'use strict';

const KJ_GROUPS = ['S', 'R', 'B', 'I', 'P', 'TCL'];
const KJ_TENSIONS = ['TR', 'TM', 'TT'];
const KJ_GROUP_COLORS = {
  S: '#7c3aed',
  R: '#2563eb',
  B: '#0891b2',
  I: '#d97706',
  P: '#16a34a',
  TCL: '#6b7280',
};
const kwhJualState = {
  data: null,
  giRows: [],
  charts: {},
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!qid('kwhjual-gi')) return;
  initKwhJualMonth();
  bindKwhJualEvents();
  await loadKwhJualGI();
  await loadData();
});

function initKwhJualMonth() {
  const value = currentMonthValue();
  setVal('kwhjual-bulan', value);
  setVal('kwhjual-form-bulan', value);
}

function bindKwhJualEvents() {
  qid('btn-refresh-kwhjual')?.addEventListener('click', loadData);
  qid('kwhjual-gi')?.addEventListener('change', loadData);
  qid('kwhjual-bulan')?.addEventListener('change', loadData);
  qid('btn-kwhjual-input')?.addEventListener('click', openKwhJualModal);
  qid('btn-kwhjual-close')?.addEventListener('click', closeKwhJualModal);
  qid('kwhjual-modal')?.addEventListener('click', event => {
    if (event.target.id === 'kwhjual-modal') closeKwhJualModal();
  });
  qid('btn-kwhjual-autosum')?.addEventListener('click', updateFormTotals);
  qid('btn-kwhjual-save')?.addEventListener('click', submitForm);
  qid('btn-kwhjual-export')?.addEventListener('click', exportKwhJual);
}

async function loadKwhJualGI() {
  kwhJualState.giRows = await getJSON('/api/gardu-induk', []);
  const main = qid('kwhjual-gi');
  const form = qid('kwhjual-form-gi');
  if (main) {
    main.innerHTML = '<option value="">Semua GI</option>' + kwhJualState.giRows.map(row => (
      `<option value="${row.id}">${escapeHTML(row.kode_gi || '-')} - ${escapeHTML(row.nama_gi || '-')}</option>`
    )).join('');
  }
  if (form) {
    form.innerHTML = kwhJualState.giRows.map(row => (
      `<option value="${row.id}">${escapeHTML(row.kode_gi || '-')} - ${escapeHTML(row.nama_gi || '-')}</option>`
    )).join('');
  }
}

async function loadData() {
  const giId = qid('kwhjual-gi')?.value || '';
  const bulan = qid('kwhjual-bulan')?.value || currentMonthValue();
  const params = new URLSearchParams({ bulan });
  if (giId) params.set('gi_id', giId);
  setText('kwhjual-live', 'Memuat');
  const data = await getJSON(`/api/kwh-jual?${params.toString()}`, null);
  if (!data) {
    setText('kwhjual-live', 'Gagal memuat');
    return;
  }
  kwhJualState.data = data;
  renderSummaryCards(data);
  renderCharts(data);
  renderAccordions(data);
  setText('kwhjual-live', `Update ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`);
}

function renderSummaryCards(data) {
  const total = Number(data.total || 0);
  const perTegangan = data.per_tegangan || {};
  setText('kwhjual-total', fmtNum(total));
  KJ_TENSIONS.forEach(key => {
    const value = Number(perTegangan[key] || 0);
    setText(`kwhjual-${key.toLowerCase()}`, fmtNum(value));
    setText(`kwhjual-${key.toLowerCase()}-pct`, `${pct(value, total)}% dari total`);
  });
  const trend = data.trend || [];
  sparkline('kwhjual-spk-total', trend.map(row => row.total || 0), cssColor('--green', '#16a34a'));
  sparkline('kwhjual-spk-tr', trend.map(row => row.TR || 0), cssColor('--blue', '#2563eb'));
  sparkline('kwhjual-spk-tm', trend.map(row => row.TM || 0), cssColor('--amber', '#d97706'));
  sparkline('kwhjual-spk-tt', trend.map(row => row.TT || 0), cssColor('--red', '#dc2626'));
}

function renderCharts(data) {
  destroyChart('chart-kwhjual-donut');
  destroyChart('chart-kwhjual-bar');
  const groupLabels = data.catalog?.groups || {};
  const groupValues = KJ_GROUPS.map(key => Number(data.per_golongan?.[key] || 0));
  const donut = qid('chart-kwhjual-donut');
  if (donut && typeof Chart !== 'undefined') {
    kwhJualState.charts['chart-kwhjual-donut'] = new Chart(donut, {
      type: 'doughnut',
      data: {
        labels: KJ_GROUPS.map(key => groupLabels[key] || key),
        datasets: [{
          data: groupValues,
          backgroundColor: KJ_GROUPS.map(key => KJ_GROUP_COLORS[key]),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: { legend: { display: false } },
      },
    });
  }
  renderLegend(data);

  const grouped = groupedByTension(data.detail || []);
  const bar = qid('chart-kwhjual-bar');
  if (bar && typeof Chart !== 'undefined') {
    kwhJualState.charts['chart-kwhjual-bar'] = new Chart(bar, {
      type: 'bar',
      data: {
        labels: KJ_GROUPS.map(key => groupLabels[key] || key),
        datasets: [
          { label: 'TR', data: KJ_GROUPS.map(key => grouped[key].TR), backgroundColor: cssColor('--blue', '#2563eb'), borderRadius: 4 },
          { label: 'TM', data: KJ_GROUPS.map(key => grouped[key].TM), backgroundColor: cssColor('--amber', '#d97706'), borderRadius: 4 },
          { label: 'TT', data: KJ_GROUPS.map(key => grouped[key].TT), backgroundColor: cssColor('--red', '#dc2626'), borderRadius: 4 },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true } },
        scales: {
          x: { stacked: true, grid: { color: gridColor() }, ticks: { color: '#9ca3af', callback: compactNum } },
          y: { stacked: true, grid: { display: false }, ticks: { color: '#9ca3af' } },
        },
      },
    });
  }
}

function renderLegend(data) {
  const legend = qid('kwhjual-legend');
  if (!legend) return;
  const labels = data.catalog?.groups || {};
  legend.innerHTML = KJ_GROUPS.map(key => `
    <div class="kwhjual-legend-item">
      <span style="background:${KJ_GROUP_COLORS[key]}"></span>
      <strong>${escapeHTML(labels[key] || key)}</strong>
      <b>${fmtNum(data.per_golongan?.[key] || 0)}</b>
    </div>
  `).join('');
}

function renderAccordions(data) {
  const wrap = qid('kwhjual-accordion');
  if (!wrap) return;
  const labels = data.catalog?.groups || {};
  const rowsByGroup = groupRows(data.detail || []);
  wrap.innerHTML = KJ_GROUPS.map((group, index) => {
    const rows = rowsByGroup[group] || [];
    const total = rows.reduce((sum, row) => sum + Number(row.kwh || 0), 0);
    return `
      <article class="kwhjual-acc ${index === 0 ? 'open' : ''}" data-group="${group}">
        <button class="kwhjual-acc-head" type="button">
          <span>
            <strong>${escapeHTML(labels[group] || group)}</strong>
            <em>${fmtNum(total)} kWh</em>
          </span>
          <i class="ti ti-chevron-down" aria-hidden="true"></i>
        </button>
        <div class="kwhjual-acc-body">
          <div class="table-scroll">
            <table class="data-table compact-table">
              <thead>
                <tr>
                  <th>Sub-golongan</th>
                  <th>Tegangan</th>
                  <th class="tr">kWh</th>
                  <th class="tr">% Golongan</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(row => detailRow(row, total)).join('')}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2"><strong>JUMLAH ${escapeHTML(group)}</strong></td>
                  <td class="tr mono"><strong>${fmtNum(total)}</strong></td>
                  <td class="tr mono"><strong>100.00%</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </article>`;
  }).join('');

  wrap.querySelectorAll('.kwhjual-acc-head').forEach(button => {
    button.addEventListener('click', () => button.closest('.kwhjual-acc')?.classList.toggle('open'));
  });
}

function detailRow(row, groupTotal) {
  const kwh = Number(row.kwh || 0);
  return `
    <tr class="kwhjual-row-${row.tegangan.toLowerCase()} ${kwh === 0 ? 'muted-row' : ''}">
      <td>${escapeHTML(row.sub_golongan)}</td>
      <td><span class="badge badge-${row.tegangan.toLowerCase()}">${escapeHTML(row.tegangan)}</span></td>
      <td class="tr mono">${fmtNum(kwh)}</td>
      <td class="tr mono">${pct(kwh, groupTotal)}%</td>
    </tr>`;
}

function renderForm(data) {
  const tbody = document.querySelector('#kwhjual-form-table tbody');
  if (!tbody || !data) return;
  const rowsByGroup = groupRows(data.detail || []);
  const labels = data.catalog?.groups || {};
  tbody.innerHTML = KJ_GROUPS.map(group => {
    const rows = rowsByGroup[group] || [];
    return `
      <tr class="kwhjual-form-group"><td colspan="3">${escapeHTML(labels[group] || group)}</td></tr>
      ${rows.map(row => `
        <tr>
          <td>${escapeHTML(row.sub_golongan)}</td>
          <td><span class="badge badge-${row.tegangan.toLowerCase()}">${escapeHTML(row.tegangan)}</span></td>
          <td class="tr">
            <input class="kwhjual-input" type="number" min="0" step="0.001" value="${Number(row.kwh || 0)}"
              data-sub="${escapeHTML(row.sub_golongan)}">
          </td>
        </tr>
      `).join('')}
      <tr class="kwhjual-form-total" data-total-group="${group}">
        <td colspan="2"><strong>JUMLAH ${escapeHTML(group)}</strong></td>
        <td class="tr mono">0</td>
      </tr>`;
  }).join('');
  tbody.querySelectorAll('.kwhjual-input').forEach(input => input.addEventListener('input', updateFormTotals));
  updateFormTotals();
}

function openKwhJualModal() {
  const data = kwhJualState.data;
  if (!data) return;
  const mainGi = qid('kwhjual-gi')?.value;
  const firstGi = kwhJualState.giRows[0]?.id ? String(kwhJualState.giRows[0].id) : '';
  setVal('kwhjual-form-gi', mainGi || firstGi);
  setVal('kwhjual-form-bulan', qid('kwhjual-bulan')?.value || currentMonthValue());
  renderForm(data);
  qid('kwhjual-modal')?.removeAttribute('hidden');
}

function closeKwhJualModal() {
  qid('kwhjual-modal')?.setAttribute('hidden', '');
}

function updateFormTotals() {
  const totals = {};
  let grand = 0;
  document.querySelectorAll('.kwhjual-input').forEach(input => {
    const sub = input.dataset.sub;
    const row = (kwhJualState.data?.detail || []).find(item => item.sub_golongan === sub);
    const group = row?.group || '';
    const value = Number(input.value || 0);
    if (!totals[group]) totals[group] = 0;
    totals[group] += value;
    grand += value;
  });
  Object.entries(totals).forEach(([group, value]) => {
    const cell = document.querySelector(`[data-total-group="${group}"] td:last-child`);
    if (cell) cell.textContent = fmtNum(value);
  });
  setText('kwhjual-form-total', `Total: ${fmtNum(grand)}`);
}

async function submitForm() {
  const giId = qid('kwhjual-form-gi')?.value;
  const bulan = qid('kwhjual-form-bulan')?.value;
  if (!giId || !bulan) {
    showToastSafe('GI dan bulan wajib dipilih.', 'warning');
    return;
  }
  const entries = [];
  for (const input of document.querySelectorAll('.kwhjual-input')) {
    const value = Number(input.value || 0);
    if (value < 0) {
      showToastSafe('Nilai kWh tidak boleh negatif.', 'error');
      input.focus();
      return;
    }
    entries.push({ sub_golongan: input.dataset.sub, kwh: value });
  }
  try {
    const resp = await fetch('/api/kwh-jual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gi_id: giId, bulan, entries }),
    });
    const payload = await resp.json();
    if (!resp.ok) throw new Error(payload.error || 'Gagal menyimpan data.');
    setVal('kwhjual-gi', giId);
    setVal('kwhjual-bulan', bulan);
    kwhJualState.data = payload;
    renderSummaryCards(payload);
    renderCharts(payload);
    renderAccordions(payload);
    closeKwhJualModal();
    showToastSafe('Data berhasil disimpan', 'success');
  } catch (err) {
    showToastSafe(err.message, 'error');
  }
}

function exportKwhJual() {
  const data = kwhJualState.data;
  if (!data) return;
  const rows = [['Golongan', 'Sub-golongan', 'Tegangan', 'kWh']];
  (data.detail || []).forEach(row => rows.push([
    row.group,
    row.sub_golongan,
    row.tegangan,
    Number(row.kwh || 0),
  ]));
  rows.push([]);
  rows.push(['Total', '', '', Number(data.total || 0)]);
  const csv = rows.map(row => row.map(csvCell).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const filename = `kwh_jual_${data.periode || currentMonthValue()}.csv`;
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

function sparkline(id, values, color) {
  destroyChart(id);
  const canvas = qid(id);
  if (!canvas || typeof Chart === 'undefined') return;
  kwhJualState.charts[id] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: values.map((_, index) => index + 1),
      datasets: [{
        data: values,
        borderColor: color,
        backgroundColor: colorAlpha(color, .12),
        borderWidth: 1.8,
        pointRadius: 0,
        fill: true,
        tension: .35,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
    },
  });
}

function groupedByTension(rows) {
  const grouped = {};
  KJ_GROUPS.forEach(group => grouped[group] = { TR: 0, TM: 0, TT: 0 });
  rows.forEach(row => {
    if (grouped[row.group] && grouped[row.group][row.tegangan] !== undefined) {
      grouped[row.group][row.tegangan] += Number(row.kwh || 0);
    }
  });
  return grouped;
}

function groupRows(rows) {
  const grouped = {};
  KJ_GROUPS.forEach(group => grouped[group] = []);
  rows.forEach(row => {
    if (!grouped[row.group]) grouped[row.group] = [];
    grouped[row.group].push(row);
  });
  return grouped;
}

function destroyChart(id) {
  if (!kwhJualState.charts[id]) return;
  try { kwhJualState.charts[id].destroy(); } catch (_) {}
  delete kwhJualState.charts[id];
}

window.rerenderCharts = () => {
  if (kwhJualState.data) {
    renderSummaryCards(kwhJualState.data);
    renderCharts(kwhJualState.data);
  }
};

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

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function cssColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
function gridColor() { return document.body.classList.contains('dark') ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)'; }
function colorAlpha(color, alpha) {
  if (!color.startsWith('#') || color.length < 7) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function pct(value, total) { return total ? (Number(value || 0) / total * 100).toFixed(2) : '0.00'; }
function fmtNum(value) { return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(Number(value || 0)); }
function compactNum(value) {
  return new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
}
function csvCell(value) {
  const text = String(value ?? '');
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function qid(id) { return document.getElementById(id); }
function setText(id, value) { const el = qid(id); if (el) el.textContent = value; }
function setVal(id, value) { const el = qid(id); if (el) el.value = value; }
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}
function showToastSafe(message, type) {
  if (window.showToast) window.showToast(message, type);
}
