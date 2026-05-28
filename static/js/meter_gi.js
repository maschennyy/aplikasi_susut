'use strict';

const METER_MONTH_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
const METER_MONTH_FULL = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const TRAFO_COLORS = ['#1769e0', '#139a57', '#c77800', '#6d5dfc', '#d03939'];

let meterState = {
  gi: [],
  trafos: [],
  monthlyRows: Array.from({ length: 12 }, () => []),
  year: new Date().getFullYear(),
  month: Math.min(new Date().getMonth(), 11),
  charts: {},
};

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof Chart === 'undefined') {
    setLive('Chart error');
    return;
  }

  initFilters();
  bindEvents();
  await loadMaster();
  await loadMeterData();
});

function initFilters() {
  const year = qid('filter-meter-tahun');
  const month = qid('filter-meter-bulan');

  for (let y = 2020; y <= 2030; y++) {
    const opt = new Option(y, y);
    if (y === meterState.year) opt.selected = true;
    year.appendChild(opt);
  }

  METER_MONTH_FULL.forEach((name, idx) => {
    const opt = new Option(name, idx + 1);
    if (idx === meterState.month) opt.selected = true;
    month.appendChild(opt);
  });
}

function bindEvents() {
  on('btn-terapkan-meter', 'click', loadMeterData);
  on('btn-refresh-meter', 'click', loadMeterData);
  on('btn-export-meter', 'click', exportMeterCSV);
  on('filter-meter-gi', 'change', async () => {
    await loadTrafos();
    await loadMeterData();
  });
}

async function loadMaster() {
  setLive('Memuat master');
  meterState.gi = await getJSON('/api/gardu-induk', []);
  const select = qid('filter-meter-gi');
  select.innerHTML = '';
  meterState.gi.forEach((gi, idx) => {
    const opt = new Option(`${gi.kode_gi} - ${gi.nama_gi}`, gi.id);
    if (idx === 0) opt.selected = true;
    select.appendChild(opt);
  });
  await loadTrafos();
}

async function loadTrafos() {
  const giId = qid('filter-meter-gi').value;
  meterState.trafos = giId ? await getJSON(`/api/trafo?gi_id=${encodeURIComponent(giId)}`, []) : [];
}

async function loadMeterData() {
  const giId = qid('filter-meter-gi').value;
  meterState.year = Number(qid('filter-meter-tahun').value);
  meterState.month = Number(qid('filter-meter-bulan').value) - 1;

  if (!giId) {
    renderEmpty('Pilih gardu induk terlebih dahulu.');
    return;
  }

  setLive('Memuat data');
  await loadTrafos();

  const jobs = METER_MONTH_SHORT.map((_, idx) => {
    const bulan = `${meterState.year}-${pad(idx + 1)}`;
    return getJSON(`/api/meter-data?gi_id=${encodeURIComponent(giId)}&bulan=${bulan}`, []);
  });
  meterState.monthlyRows = await Promise.all(jobs);

  renderMeterPage();
  setLive('Update ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
}

function renderMeterPage() {
  const summary = buildMeterSummary();
  renderMetrics(summary);
  renderTrafoCards(summary);
  renderCharts(summary);
  renderTable(summary);
}

function buildMeterSummary() {
  const trafoMap = new Map();
  meterState.trafos.forEach(trafo => {
    trafoMap.set(trafo.id, createTrafoSummary(trafo));
  });

  const monthMU = Array(12).fill(0);
  const monthMP = Array(12).fill(0);

  meterState.monthlyRows.forEach((rows, monthIdx) => {
    rows.forEach(row => {
      if (!trafoMap.has(row.trafo_id)) {
        trafoMap.set(row.trafo_id, createTrafoSummary({
          id: row.trafo_id,
          kode_trafo: row.kode_trafo || '-',
          nama_trafo: row.nama_trafo || 'Trafo',
          kapasitas_mva: 0,
          tegangan_kv: null,
        }));
      }

      const trafo = trafoMap.get(row.trafo_id);
      const mu = Number(row.mu_kwh_total || 0);
      const mp = Number(row.mp_kwh_total || 0);

      trafo.mu[monthIdx] += mu;
      trafo.mp[monthIdx] += mp;
      trafo.deviasi[monthIdx] = Number(row.deviasi_mu_mp || 0);
      trafo.totalMU += mu;
      trafo.totalMP += mp;
      monthMU[monthIdx] += mu;
      monthMP[monthIdx] += mp;
    });
  });

  const trafos = [...trafoMap.values()].sort((a, b) => a.kode.localeCompare(b.kode));
  const totalMU = monthMU.reduce((sum, value) => sum + value, 0);
  const totalMP = monthMP.reduce((sum, value) => sum + value, 0);
  const focusMU = monthMU[meterState.month] || 0;
  const focusMP = monthMP[meterState.month] || 0;
  const focusDeviasi = focusMU ? ((focusMU - focusMP) / focusMU) * 100 : 0;

  return { trafos, monthMU, monthMP, totalMU, totalMP, focusMU, focusMP, focusDeviasi };
}

function createTrafoSummary(trafo) {
  return {
    id: trafo.id,
    kode: trafo.kode_trafo,
    nama: trafo.nama_trafo,
    kapasitas: Number(trafo.kapasitas_mva || 0),
    tegangan: trafo.tegangan_kv,
    mu: Array(12).fill(0),
    mp: Array(12).fill(0),
    deviasi: Array(12).fill(0),
    totalMU: 0,
    totalMP: 0,
  };
}

function renderMetrics(summary) {
  setText('meter-total-mu', fmtNum(summary.totalMU));
  setText('meter-total-mp', fmtNum(summary.totalMP));
  setText('meter-trafo-count', String(summary.trafos.length));
  setText('meter-focus-deviasi', `${summary.focusDeviasi.toFixed(2)}%`);
  setText('meter-focus-label', `${METER_MONTH_FULL[meterState.month]} ${meterState.year}`);
  setText('meter-scope', selectedGIText());
  setText('meter-table-caption', `${selectedGIText()} - ${meterState.year}`);

  const pills = qid('meter-summary-pills');
  if (pills) {
    pills.innerHTML = `
      <span class="badge badge-ok">${summary.trafos.length} trafo</span>
      <span class="badge badge-warn">${fmtNum(summary.focusMU)} kWh fokus</span>
      <span class="badge badge-danger">Deviasi ${summary.focusDeviasi.toFixed(2)}%</span>`;
  }
}

function renderTrafoCards(summary) {
  const grid = qid('trafo-grid');
  if (!grid) return;

  if (!summary.trafos.length) {
    grid.innerHTML = '<div class="empty-state"><i class="ti ti-info-circle" aria-hidden="true"></i><div><strong>Belum ada data trafo</strong><span>GI ini belum memiliki trafo aktif atau pembacaan meter.</span></div></div>';
    return;
  }

  grid.innerHTML = summary.trafos.map((trafo, idx) => {
    const focusMU = trafo.mu[meterState.month] || 0;
    const focusMP = trafo.mp[meterState.month] || 0;
    const deviasi = focusMU ? ((focusMU - focusMP) / focusMU) * 100 : 0;
    const badgeClass = Math.abs(deviasi) > 1 ? 'badge-danger' : Math.abs(deviasi) > .5 ? 'badge-warn' : 'badge-ok';
    const color = TRAFO_COLORS[idx % TRAFO_COLORS.length];

    return `
      <article class="trafo-card" style="--accent:${color}">
        <div class="trafo-card-head">
          <div>
            <span>${escapeHTML(trafo.kode)}</span>
            <strong>${escapeHTML(trafo.nama)}</strong>
          </div>
          <i class="ti ti-transformer" aria-hidden="true"></i>
        </div>
        <div class="trafo-card-value">${fmtNum(focusMU)}</div>
        <div class="trafo-card-meta">
          <span>${fmtNum(focusMP)} kWh MP</span>
          <span class="badge ${badgeClass}">${deviasi.toFixed(2)}%</span>
        </div>
        <div class="trafo-card-foot">${trafo.kapasitas ? trafo.kapasitas.toFixed(0) + ' MVA' : 'Kapasitas belum diisi'}</div>
      </article>`;
  }).join('');
}

function renderCharts(summary) {
  destroyChart('chart-meter-trend');
  destroyChart('chart-trafo-focus');

  const trend = qid('chart-meter-trend');
  if (trend) {
    meterState.charts['chart-meter-trend'] = new Chart(trend, {
      type: 'line',
      data: {
        labels: METER_MONTH_SHORT,
        datasets: [
          makeLineDataset('Meter Utama', summary.monthMU, '#1769e0'),
          makeLineDataset('Meter Pembanding', summary.monthMP, '#139a57'),
        ]
      },
      options: chartOptions()
    });
  }

  const focus = qid('chart-trafo-focus');
  if (focus) {
    meterState.charts['chart-trafo-focus'] = new Chart(focus, {
      type: 'bar',
      data: {
        labels: summary.trafos.map(t => t.kode),
        datasets: [{
          label: 'MU',
          data: summary.trafos.map(t => t.mu[meterState.month] || 0),
          backgroundColor: summary.trafos.map((_, idx) => TRAFO_COLORS[idx % TRAFO_COLORS.length]),
          borderRadius: 7,
          borderSkipped: false,
        }]
      },
      options: chartOptions()
    });
  }
}

function makeLineDataset(label, data, color) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: hexAlpha(color, .12),
    borderWidth: 2.4,
    pointRadius: data.map((_, idx) => idx === meterState.month ? 6 : 3),
    pointBackgroundColor: color,
    pointBorderColor: '#fff',
    pointBorderWidth: 2,
    tension: .36,
    fill: false,
  };
}

function renderTable(summary) {
  const tbody = document.querySelector('#table-meter tbody');
  if (!tbody) return;

  if (!summary.trafos.length) {
    tbody.innerHTML = '<tr><td colspan="16" class="empty-cell">Tidak ada data meter untuk GI ini.</td></tr>';
    return;
  }

  tbody.innerHTML = summary.trafos.map(trafo => {
    const monthCells = trafo.mu.map((value, idx) => {
      const classes = ['tr', 'mono'];
      if (idx === meterState.month) classes.push('focus-month');
      return `<td class="${classes.join(' ')}">${fmtNum(value)}</td>`;
    }).join('');
    const deviasiYear = trafo.totalMU ? ((trafo.totalMU - trafo.totalMP) / trafo.totalMU) * 100 : 0;
    const devClass = Math.abs(deviasiYear) > 1 ? 'badge-danger' : Math.abs(deviasiYear) > .5 ? 'badge-warn' : 'badge-ok';

    return `
      <tr>
        <td>
          <strong>${escapeHTML(trafo.kode)}</strong>
          <span class="subtext">${escapeHTML(trafo.nama)}</span>
        </td>
        <td>${trafo.kapasitas ? trafo.kapasitas.toFixed(0) + ' MVA' : '-'}</td>
        ${monthCells}
        <td class="tr mono"><strong>${fmtNum(trafo.totalMU)}</strong></td>
        <td class="tr"><span class="badge ${devClass}">${deviasiYear.toFixed(2)}%</span></td>
      </tr>`;
  }).join('');
}

function renderEmpty(message) {
  setLive('Kosong');
  setText('meter-table-caption', message);
  const tbody = document.querySelector('#table-meter tbody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="16" class="empty-cell">${escapeHTML(message)}</td></tr>`;
}

function exportMeterCSV() {
  const summary = buildMeterSummary();
  const rows = [['Kode Trafo','Nama Trafo','Kapasitas MVA',...METER_MONTH_SHORT,'Total MU','Total MP','Deviasi Tahun']];
  summary.trafos.forEach(t => {
    const deviasi = t.totalMU ? ((t.totalMU - t.totalMP) / t.totalMU) * 100 : 0;
    rows.push([t.kode, t.nama, t.kapasitas, ...t.mu.map(v => Math.round(v)), Math.round(t.totalMU), Math.round(t.totalMP), deviasi.toFixed(2)]);
  });
  const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), {
    href: url,
    download: `main_meter_gi_${meterState.year}.csv`,
  });
  link.click();
  URL.revokeObjectURL(url);
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

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#98a2b3', boxWidth: 10, usePointStyle: true } },
      tooltip: { callbacks: { label: item => `${item.dataset.label || 'kWh'}: ${fmtNum(item.raw)} kWh` } }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#98a2b3' } },
      y: {
        beginAtZero: true,
        grid: { color: document.body.classList.contains('dark') ? 'rgba(255,255,255,.06)' : 'rgba(15,23,42,.06)' },
        ticks: { color: '#98a2b3', callback: value => fmtCompact(value) }
      }
    }
  };
}

function selectedGIText() {
  const select = qid('filter-meter-gi');
  return select?.options[select.selectedIndex]?.textContent || '-';
}

function destroyChart(id) {
  if (meterState.charts[id]) {
    meterState.charts[id].destroy();
    delete meterState.charts[id];
  }
}

function setLive(text) { setText('meter-live', text); }
function qid(id) { return document.getElementById(id); }
function on(id, event, fn) { qid(id)?.addEventListener(event, fn); }
function setText(id, value) { const el = qid(id); if (el) el.textContent = value; }
function pad(n) { return String(n).padStart(2, '0'); }
function fmtNum(n) { return new Intl.NumberFormat('id-ID').format(Math.round(Number(n || 0))); }
function fmtCompact(n) { return new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n || 0)); }
function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}
