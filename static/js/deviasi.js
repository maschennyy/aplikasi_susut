'use strict';

const DEV_MONTH_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
const DEV_MONTH_FULL = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const DEV_COLORS = ['#1769e0', '#139a57', '#c77800', '#6d5dfc', '#d03939'];

let devState = {
  gi: [],
  trafos: [],
  meterRows: Array.from({ length: 12 }, () => []),
  feederRows: Array.from({ length: 12 }, () => []),
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
  await loadDeviasi();
});

function initFilters() {
  const year = qid('filter-deviasi-tahun');
  const month = qid('filter-deviasi-bulan');
  for (let y = 2020; y <= 2030; y++) {
    const opt = new Option(y, y);
    if (y === devState.year) opt.selected = true;
    year.appendChild(opt);
  }
  DEV_MONTH_FULL.forEach((name, idx) => {
    const opt = new Option(name, idx + 1);
    if (idx === devState.month) opt.selected = true;
    month.appendChild(opt);
  });
}

function bindEvents() {
  on('btn-terapkan-deviasi', 'click', loadDeviasi);
  on('btn-refresh-deviasi', 'click', loadDeviasi);
  on('btn-export-deviasi', 'click', exportCSV);
  on('filter-deviasi-gi', 'change', async () => {
    await loadTrafos();
    await loadDeviasi();
  });
}

async function loadMaster() {
  setLive('Memuat master');
  devState.gi = await getJSON('/api/gardu-induk', []);
  const select = qid('filter-deviasi-gi');
  select.innerHTML = '';
  devState.gi.forEach((gi, idx) => {
    const opt = new Option(`${gi.kode_gi} - ${gi.nama_gi}`, gi.id);
    if (idx === 0) opt.selected = true;
    select.appendChild(opt);
  });
  await loadTrafos();
}

async function loadTrafos() {
  const giId = qid('filter-deviasi-gi').value;
  devState.trafos = giId ? await getJSON(`/api/trafo?gi_id=${encodeURIComponent(giId)}`, []) : [];
}

async function loadDeviasi() {
  const giId = qid('filter-deviasi-gi').value;
  devState.year = Number(qid('filter-deviasi-tahun').value);
  devState.month = Number(qid('filter-deviasi-bulan').value) - 1;
  if (!giId) return;

  setLive('Memuat data');
  await loadTrafos();
  const meterJobs = DEV_MONTH_SHORT.map((_, idx) => getJSON(`/api/meter-data?gi_id=${encodeURIComponent(giId)}&bulan=${devState.year}-${pad(idx + 1)}`, []));
  const feederJobs = DEV_MONTH_SHORT.map((_, idx) => getJSON(`/api/feeder-data?gi_id=${encodeURIComponent(giId)}&bulan=${devState.year}-${pad(idx + 1)}`, []));
  devState.meterRows = await Promise.all(meterJobs);
  devState.feederRows = await Promise.all(feederJobs);
  renderPage();
  setLive('Update ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
}

function buildSummary() {
  const trafoMap = new Map();
  devState.trafos.forEach(trafo => {
    trafoMap.set(trafo.id, {
      id: trafo.id,
      kode: trafo.kode_trafo,
      nama: trafo.nama_trafo,
      mu: Array(12).fill(0),
      feeder: Array(12).fill(0),
    });
  });

  const giMU = Array(12).fill(0);
  const giFeeder = Array(12).fill(0);

  devState.meterRows.forEach((rows, monthIdx) => {
    rows.forEach(row => {
      ensureTrafo(trafoMap, row.trafo_id, row.kode_trafo, row.nama_trafo);
      const mu = Number(row.mu_kwh_total || 0);
      trafoMap.get(row.trafo_id).mu[monthIdx] += mu;
      giMU[monthIdx] += mu;
    });
  });

  devState.feederRows.forEach((rows, monthIdx) => {
    rows.forEach(row => {
      ensureTrafo(trafoMap, row.trafo_id, `TRF-${row.trafo_id || '-'}`, 'Trafo');
      const value = Number(row.kwh_total || 0);
      trafoMap.get(row.trafo_id).feeder[monthIdx] += value;
      giFeeder[monthIdx] += value;
    });
  });

  const trafos = [...trafoMap.values()].sort((a, b) => a.kode.localeCompare(b.kode));
  const giGap = giMU.map((value, idx) => value - giFeeder[idx]);
  const giPct = giMU.map((value, idx) => value ? (giGap[idx] / value) * 100 : 0);
  const focus = devState.month;

  return {
    trafos,
    giMU,
    giFeeder,
    giGap,
    giPct,
    focusMU: giMU[focus] || 0,
    focusFeeder: giFeeder[focus] || 0,
    focusGap: giGap[focus] || 0,
    focusPct: giPct[focus] || 0,
  };
}

function ensureTrafo(map, id, kode, nama) {
  if (map.has(id)) return;
  map.set(id, {
    id,
    kode: kode || '-',
    nama: nama || 'Trafo',
    mu: Array(12).fill(0),
    feeder: Array(12).fill(0),
  });
}

function renderPage() {
  const summary = buildSummary();
  renderMetrics(summary);
  renderTrafoCards(summary);
  renderCharts(summary);
  renderTable(summary);
}

function renderMetrics(summary) {
  setText('deviasi-focus-mu', fmtNum(summary.focusMU));
  setText('deviasi-focus-feeder', fmtNum(summary.focusFeeder));
  setText('deviasi-focus-gap', fmtNum(summary.focusGap));
  setText('deviasi-focus-pct', `${summary.focusPct.toFixed(2)}%`);
  setText('deviasi-focus-label', `${DEV_MONTH_FULL[devState.month]} ${devState.year}`);
  setText('deviasi-scope', selectedGIText());
  setText('deviasi-table-caption', `${selectedGIText()} - ${DEV_MONTH_FULL[devState.month]} ${devState.year}`);

  const pills = qid('deviasi-summary-pills');
  if (pills) {
    pills.innerHTML = `
      <span class="badge badge-ok">${summary.trafos.length} trafo</span>
      <span class="badge badge-warn">Selisih ${fmtNum(summary.focusGap)}</span>
      <span class="badge badge-danger">Deviasi ${summary.focusPct.toFixed(2)}%</span>`;
  }
}

function renderTrafoCards(summary) {
  const grid = qid('deviasi-trafo-grid');
  if (!grid) return;
  if (!summary.trafos.length) {
    grid.innerHTML = '<div class="empty-state"><i class="ti ti-info-circle" aria-hidden="true"></i><div><strong>Belum ada data trafo</strong><span>Data MU atau penyulang belum tersedia.</span></div></div>';
    return;
  }

  grid.innerHTML = summary.trafos.map((trafo, idx) => {
    const mu = trafo.mu[devState.month] || 0;
    const feeder = trafo.feeder[devState.month] || 0;
    const gap = mu - feeder;
    const pct = mu ? (gap / mu) * 100 : 0;
    const cls = Math.abs(pct) > 1.5 ? 'badge-danger' : Math.abs(pct) > .75 ? 'badge-warn' : 'badge-ok';
    return `
      <article class="trafo-card" style="--accent:${DEV_COLORS[idx % DEV_COLORS.length]}">
        <div class="trafo-card-head">
          <div>
            <span>${escapeHTML(trafo.kode)}</span>
            <strong>${escapeHTML(trafo.nama)}</strong>
          </div>
          <i class="ti ti-chart-bar" aria-hidden="true"></i>
        </div>
        <div class="trafo-card-value">${pct.toFixed(2)}%</div>
        <div class="trafo-card-meta">
          <span>${fmtNum(gap)} kWh</span>
          <span class="badge ${cls}">${statusText(pct)}</span>
        </div>
        <div class="trafo-card-foot">MU ${fmtNum(mu)} / Penyulang ${fmtNum(feeder)}</div>
      </article>`;
  }).join('');
}

function renderCharts(summary) {
  destroyChart('chart-deviasi-trend');
  destroyChart('chart-deviasi-trafo');

  const trend = qid('chart-deviasi-trend');
  if (trend) {
    devState.charts['chart-deviasi-trend'] = new Chart(trend, {
      type: 'line',
      data: {
        labels: DEV_MONTH_SHORT,
        datasets: [{
          label: 'Deviasi GI',
          data: summary.giPct,
          borderColor: '#d03939',
          backgroundColor: 'rgba(208,57,57,.12)',
          borderWidth: 2.4,
          pointRadius: summary.giPct.map((_, idx) => idx === devState.month ? 6 : 3),
          pointBackgroundColor: '#d03939',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          tension: .35,
          fill: true,
        }]
      },
      options: chartOptions(value => `${Number(value).toFixed(1)}%`)
    });
  }

  const bar = qid('chart-deviasi-trafo');
  if (bar) {
    devState.charts['chart-deviasi-trafo'] = new Chart(bar, {
      type: 'bar',
      data: {
        labels: summary.trafos.map(t => t.kode),
        datasets: [{
          label: 'Deviasi %',
          data: summary.trafos.map(t => {
            const mu = t.mu[devState.month] || 0;
            const gap = mu - (t.feeder[devState.month] || 0);
            return mu ? (gap / mu) * 100 : 0;
          }),
          backgroundColor: summary.trafos.map((_, idx) => DEV_COLORS[idx % DEV_COLORS.length]),
          borderRadius: 7,
          borderSkipped: false,
        }]
      },
      options: chartOptions(value => `${Number(value).toFixed(1)}%`)
    });
  }
}

function renderTable(summary) {
  const tbody = document.querySelector('#table-deviasi tbody');
  if (!tbody) return;
  if (!summary.trafos.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Tidak ada data deviasi untuk filter ini.</td></tr>';
    return;
  }

  tbody.innerHTML = summary.trafos.map(trafo => {
    const mu = trafo.mu[devState.month] || 0;
    const feeder = trafo.feeder[devState.month] || 0;
    const gap = mu - feeder;
    const pct = mu ? (gap / mu) * 100 : 0;
    const cls = Math.abs(pct) > 1.5 ? 'badge-danger' : Math.abs(pct) > .75 ? 'badge-warn' : 'badge-ok';
    return `
      <tr>
        <td>
          <strong>${escapeHTML(trafo.kode)}</strong>
          <span class="subtext">${escapeHTML(trafo.nama)}</span>
        </td>
        <td class="tr mono">${fmtNum(mu)}</td>
        <td class="tr mono">${fmtNum(feeder)}</td>
        <td class="tr mono">${fmtNum(gap)}</td>
        <td class="tr mono"><strong>${pct.toFixed(2)}%</strong></td>
        <td><span class="badge ${cls}">${statusText(pct)}</span></td>
      </tr>`;
  }).join('');
}

function exportCSV() {
  const summary = buildSummary();
  const rows = [['Trafo','Nama','MU Fokus','Penyulang Fokus','Selisih','Deviasi %']];
  summary.trafos.forEach(t => {
    const mu = t.mu[devState.month] || 0;
    const feeder = t.feeder[devState.month] || 0;
    const gap = mu - feeder;
    const pct = mu ? (gap / mu) * 100 : 0;
    rows.push([t.kode, t.nama, Math.round(mu), Math.round(feeder), Math.round(gap), pct.toFixed(2)]);
  });
  const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: `deviasi_${devState.year}_${pad(devState.month + 1)}.csv` });
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

function chartOptions(tickFormatter) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: item => `${item.dataset.label}: ${Number(item.raw).toFixed(2)}%` } }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#98a2b3' } },
      y: {
        grid: { color: document.body.classList.contains('dark') ? 'rgba(255,255,255,.06)' : 'rgba(15,23,42,.06)' },
        ticks: { color: '#98a2b3', callback: tickFormatter }
      }
    }
  };
}

function statusText(pct) {
  const v = Math.abs(pct);
  if (v > 1.5) return 'Tinggi';
  if (v > .75) return 'Perhatian';
  return 'Normal';
}

function selectedGIText() {
  const select = qid('filter-deviasi-gi');
  return select?.options[select.selectedIndex]?.textContent || '-';
}

function destroyChart(id) {
  if (devState.charts[id]) {
    devState.charts[id].destroy();
    delete devState.charts[id];
  }
}

function setLive(text) { setText('deviasi-live', text); }
function qid(id) { return document.getElementById(id); }
function on(id, event, fn) { qid(id)?.addEventListener(event, fn); }
function setText(id, value) { const el = qid(id); if (el) el.textContent = value; }
function pad(n) { return String(n).padStart(2, '0'); }
function fmtNum(n) { return new Intl.NumberFormat('id-ID').format(Math.round(Number(n || 0))); }
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}
