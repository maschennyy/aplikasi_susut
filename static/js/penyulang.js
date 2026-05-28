'use strict';

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
const MONTH_FULL = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

let state = {
  gi: [],
  areas: [],
  trafo: [],
  feeders: [],
  monthlyRows: Array.from({ length: 12 }, () => []),
  currentYear: new Date().getFullYear(),
  currentMonth: Math.min(new Date().getMonth(), 11),
  charts: {},
  autoPeriodResolved: false,
};

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof Chart === 'undefined') {
    showError('Chart.js belum tersedia.');
    return;
  }

  initYearMonthFilters();
  bindEvents();
  await loadMasterData();
  await loadData();
});

function bindEvents() {
  on('btn-terapkan', 'click', loadData);
  on('btn-refresh-penyulang', 'click', loadData);
  on('btn-export-penyulang', 'click', exportCSV);
  on('btn-sample-penyulang', 'click', downloadSampleCSV);
  on('form-upload-penyulang', 'submit', uploadPenyulang);
  on('filter-gi', 'change', async () => {
    state.autoPeriodResolved = false;
    await loadTrafo();
    await loadFeeders();
    await loadData();
  });
  on('filter-area', 'change', async () => {
    await loadFeeders();
    await loadData();
  });
  on('filter-trafo', 'change', async () => {
    await loadFeeders();
    await loadData();
  });
  on('filter-penyulang', 'change', loadData);
  on('filter-group', 'change', () => renderPage());
  window.rerenderCharts = () => renderCharts(buildSummary());
}

function initYearMonthFilters() {
  const year = qid('filter-tahun');
  const month = qid('filter-bulan');
  const uploadMonth = qid('upload-bulan-penyulang');

  for (let y = 2020; y <= 2030; y++) {
    const opt = new Option(y, y);
    if (y === state.currentYear) opt.selected = true;
    year.appendChild(opt);
  }

  MONTH_FULL.forEach((name, idx) => {
    const opt = new Option(name, idx + 1);
    if (idx === state.currentMonth) opt.selected = true;
    month.appendChild(opt);
  });
  if (uploadMonth) uploadMonth.value = `${state.currentYear}-${pad(state.currentMonth + 1)}`;
}

async function loadMasterData() {
  setLive('Memuat master');
  const [gi, areas] = await Promise.all([
    getJSON('/api/gardu-induk', []),
    getJSON('/api/penyulang-area', []),
  ]);
  state.gi = gi;
  state.areas = areas;
  fillSelect(qid('filter-gi'), state.gi, {
    allLabel: 'Semua GI',
    value: item => item.id,
    label: item => `${item.kode_gi} - ${item.nama_gi}`,
  });
  fillSelect(qid('filter-area'), state.areas, {
    allLabel: 'Semua Area / UP3',
    value: item => item,
    label: item => item,
  });
  await loadTrafo();
  await loadFeeders();
}

async function refreshAreas() {
  state.areas = await getJSON('/api/penyulang-area', []);
  const current = qid('filter-area').value;
  fillSelect(qid('filter-area'), state.areas, {
    allLabel: 'Semua Area / UP3',
    value: item => item,
    label: item => item,
  });
  qid('filter-area').value = current;
}

async function loadTrafo() {
  const giId = qid('filter-gi').value;
  const url = giId ? `/api/trafo?gi_id=${encodeURIComponent(giId)}` : '/api/trafo';
  state.trafo = await getJSON(url, []);
  fillSelect(qid('filter-trafo'), state.trafo, {
    allLabel: 'Semua Trafo',
    value: item => item.id,
    label: item => `${item.kode_trafo} - ${item.nama_trafo}`,
  });
}

async function loadFeeders() {
  const params = new URLSearchParams();
  if (qid('filter-gi').value) params.set('gi_id', qid('filter-gi').value);
  if (qid('filter-trafo').value) params.set('trafo_id', qid('filter-trafo').value);
  if (qid('filter-area').value) params.set('area_up3', qid('filter-area').value);
  const selected = qid('filter-penyulang').value;
  const query = params.toString();
  state.feeders = await getJSON(`/api/penyulang${query ? '?' + query : ''}`, []);
  fillSelect(qid('filter-penyulang'), state.feeders, {
    allLabel: 'Semua Penyulang',
    value: item => item.id,
    label: item => `${item.kode_penyulang} - ${item.nama_penyulang}`,
  });
  if (selected && state.feeders.some(item => String(item.id) === selected)) {
    qid('filter-penyulang').value = selected;
  }
}

async function loadData() {
  setLive('Memuat data');
  state.currentYear = Number(qid('filter-tahun').value);
  state.currentMonth = Number(qid('filter-bulan').value) - 1;
  await loadFeeders();

  const giId = qid('filter-gi').value;
  const trafoId = qid('filter-trafo').value;
  const jobs = MONTH_SHORT.map((_, idx) => {
    const params = new URLSearchParams({ bulan: `${state.currentYear}-${pad(idx + 1)}` });
    if (giId) params.set('gi_id', giId);
    if (trafoId) params.set('trafo_id', trafoId);
    return getJSON(`/api/feeder-data?${params.toString()}`, []);
  });

  state.monthlyRows = await Promise.all(jobs);
  if (!state.autoPeriodResolved && !state.monthlyRows.some(rows => rows.length)) {
    state.autoPeriodResolved = true;
    const fallback = await findAvailableYear(giId, trafoId);
    if (fallback) {
      state.currentYear = fallback;
      qid('filter-tahun').value = String(fallback);
      return loadData();
    }
  }
  renderPage();
  setLive('Update ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
}

async function findAvailableYear(giId, trafoId) {
  for (let year = state.currentYear; year >= state.currentYear - 3; year--) {
    for (let month = 12; month >= 1; month--) {
      const params = new URLSearchParams({ bulan: `${year}-${pad(month)}` });
      if (giId) params.set('gi_id', giId);
      if (trafoId) params.set('trafo_id', trafoId);
      const rows = await getJSON(`/api/feeder-data?${params.toString()}`, []);
      if (rows.length) return year;
    }
  }
  return null;
}

function renderPage() {
  const summary = buildSummary();
  renderMetrics(summary);
  renderCharts(summary);
  renderTable(summary);
  renderAlerts(summary);
}

function buildSummary() {
  const selectedFeeder = qid('filter-penyulang').value;
  const threshold = Number(qid('upload-threshold-penyulang')?.value || 25);
  const minDelta = Number(qid('upload-min-delta-penyulang')?.value || 10000);
  const feederMap = new Map();
  state.feeders.forEach(f => {
    if (selectedFeeder && String(f.id) !== String(selectedFeeder)) return;
    feederMap.set(f.id, {
      id: f.id,
      trafoId: f.trafo_id,
      giId: f.gi_id,
      kode: f.kode_penyulang,
      nama: f.nama_penyulang,
      jenis: f.jenis || 'REGULAR',
      area: f.area_up3 || 'Belum Dipetakan',
      exCabang: f.ex_cabang || '-',
      status: f.status || 'AKTIF',
      monthly: Array(12).fill(0),
      wbp: Array(12).fill(0),
      lwbp1: Array(12).fill(0),
      lwbp2: Array(12).fill(0),
      alerts: Array(12).fill(false),
      alertNotes: Array(12).fill(''),
      deltaPct: Array(12).fill(0),
      total: 0,
    });
  });

  const monthTotals = Array(12).fill(0);
  const monthMix = Array.from({ length: 12 }, () => ({ wbp: 0, lwbp1: 0, lwbp2: 0 }));

  state.monthlyRows.forEach((rows, monthIdx) => {
    rows.forEach(row => {
      const id = row.penyulang_id;
      if (selectedFeeder && String(id) !== String(selectedFeeder)) return;
      if (!feederMap.has(id) && (qid('filter-area').value || selectedFeeder)) return;
      if (!feederMap.has(id)) {
        feederMap.set(id, {
          id,
          trafoId: row.trafo_id,
          giId: row.gi_id,
          kode: row.kode_penyulang || '-',
          nama: row.nama_penyulang || 'Penyulang',
          jenis: row.jenis || 'REGULAR',
          area: row.area_up3 || 'Belum Dipetakan',
          exCabang: row.ex_cabang || '-',
          status: row.status || 'AKTIF',
          monthly: Array(12).fill(0),
          wbp: Array(12).fill(0),
          lwbp1: Array(12).fill(0),
          lwbp2: Array(12).fill(0),
          alerts: Array(12).fill(false),
          alertNotes: Array(12).fill(''),
          deltaPct: Array(12).fill(0),
          total: 0,
        });
      }

      const feeder = feederMap.get(id);
      const wbp = Number(row.kwh_wbp || 0);
      const lwbp1 = Number(row.kwh_lwbp1 || 0);
      const lwbp2 = Number(row.kwh_lwbp2 || 0);
      const total = Number(row.kwh_total || (wbp + lwbp1 + lwbp2));

      feeder.monthly[monthIdx] += total;
      feeder.wbp[monthIdx] += wbp;
      feeder.lwbp1[monthIdx] += lwbp1;
      feeder.lwbp2[monthIdx] += lwbp2;
      feeder.alerts[monthIdx] = feeder.alerts[monthIdx] || Boolean(row.flag_alert);
      feeder.alertNotes[monthIdx] = row.catatan || feeder.alertNotes[monthIdx];
      feeder.total += total;

      monthTotals[monthIdx] += total;
      monthMix[monthIdx].wbp += wbp;
      monthMix[monthIdx].lwbp1 += lwbp1;
      monthMix[monthIdx].lwbp2 += lwbp2;
    });
  });

  const feeders = [...feederMap.values()]
    .filter(f => f.total > 0 || state.feeders.length)
    .map(feeder => applyAnomaly(feeder, threshold, minDelta))
    .sort((a, b) => {
      const groupA = groupLabel(a);
      const groupB = groupLabel(b);
      return groupA.localeCompare(groupB) || b.total - a.total || a.kode.localeCompare(b.kode);
    });

  const groups = [];
  const groupMap = new Map();
  feeders.forEach(feeder => {
    const key = groupingKey(feeder);
    if (!groupMap.has(key)) {
      const group = {
        id: key,
        label: groupLabel(feeder),
        feeders: [],
        monthly: Array(12).fill(0),
        total: 0,
      };
      groupMap.set(key, group);
      groups.push(group);
    }
    const group = groupMap.get(key);
    group.feeders.push(feeder);
    feeder.monthly.forEach((value, idx) => { group.monthly[idx] += value; });
    group.total += feeder.total;
  });

  const focusAlerts = feeders.filter(f => f.alerts[state.currentMonth]);
  return {
    feeders,
    groups,
    monthTotals,
    monthMix,
    focusTotal: monthTotals[state.currentMonth] || 0,
    focusAlerts,
    yearTotal: monthTotals.reduce((sum, value) => sum + value, 0),
  };
}

function applyAnomaly(feeder, threshold, minDelta) {
  for (let idx = 1; idx < 12; idx++) {
    const prev = feeder.monthly[idx - 1];
    const current = feeder.monthly[idx];
    if (!prev || !current) continue;
    const delta = current - prev;
    const pct = (delta / prev) * 100;
    feeder.deltaPct[idx] = pct;
    if (Math.abs(delta) >= minDelta && Math.abs(pct) >= threshold) {
      feeder.alerts[idx] = true;
      feeder.alertNotes[idx] = feeder.alertNotes[idx] || `Anomali ${delta > 0 ? 'naik' : 'turun'} ${pct.toFixed(2)}% dari bulan sebelumnya.`;
    }
  }
  return feeder;
}

function renderMetrics(summary) {
  setText('metric-total-year', fmtNum(summary.yearTotal));
  setText('metric-month-total', fmtNum(summary.focusTotal));
  setText('metric-month-label', `${MONTH_FULL[state.currentMonth]} ${state.currentYear}`);
  setText('metric-feeder-count', String(summary.feeders.filter(f => f.total > 0).length));
  setText('metric-alert-count', String(summary.focusAlerts.length));
  setText('metric-scope', currentScopeLabel());
  setText('table-caption', `${currentScopeLabel()} - ${state.currentYear}`);
  setText('trend-caption', selectedText('filter-penyulang') || 'Akumulasi bulanan sesuai filter aktif');

  const pills = qid('summary-pills');
  if (pills) {
    pills.innerHTML = `
      <span class="badge badge-ok">${summary.feeders.length} penyulang</span>
      <span class="badge badge-warn">${fmtNum(summary.focusTotal)} kWh bulan fokus</span>
      <span class="badge badge-danger">${summary.focusAlerts.length} alert</span>`;
  }
}

function renderCharts(summary) {
  destroyChart('chart-feeder-trend');
  destroyChart('chart-feeder-mix');

  const selectedFeeder = qid('filter-penyulang').value;
  const trendDatasets = selectedFeeder
    ? summary.feeders.slice(0, 1).map(f => lineDataset(f.nama, f.monthly, '#1769e0'))
    : topFeeders(summary.feeders, 5).map((f, idx) => lineDataset(f.kode, f.monthly, ['#1769e0','#139a57','#c77800','#6d5dfc','#d03939'][idx]));
  if (!trendDatasets.length) {
    trendDatasets.push(lineDataset('Total', summary.monthTotals, '#1769e0'));
  }

  const trend = qid('chart-feeder-trend');
  if (trend) {
    state.charts['chart-feeder-trend'] = new Chart(trend, {
      type: 'line',
      data: { labels: MONTH_SHORT, datasets: trendDatasets },
      options: chartOptions(value => fmtCompact(value), !selectedFeeder)
    });
  }

  const mix = summary.monthMix[state.currentMonth] || { wbp: 0, lwbp1: 0, lwbp2: 0 };
  const mixEl = qid('chart-feeder-mix');
  if (mixEl) {
    state.charts['chart-feeder-mix'] = new Chart(mixEl, {
      type: 'doughnut',
      data: {
        labels: ['WBP', 'LWBP1', 'LWBP2'],
        datasets: [{
          data: [mix.wbp, mix.lwbp1, mix.lwbp2],
          backgroundColor: ['#1769e0', '#139a57', '#c77800'],
          borderColor: document.documentElement.classList.contains('theme-dark') ? '#262626' : '#fff',
          borderWidth: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '64%',
        plugins: {
          legend: { position: 'bottom', labels: { color: tickColor(), boxWidth: 10, usePointStyle: true } },
          tooltip: { callbacks: { label: item => `${item.label}: ${fmtNum(item.raw)} kWh` } }
        }
      }
    });
  }
}

function lineDataset(label, data, color) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: `${color}22`,
    pointRadius: data.map((_, idx) => idx === state.currentMonth ? 6 : 3),
    pointBackgroundColor: data.map((_, idx) => idx === state.currentMonth ? '#d03939' : color),
    pointBorderColor: '#fff',
    pointBorderWidth: 2,
    borderWidth: 2.4,
    tension: .36,
    fill: false,
  };
}

function renderTable(summary) {
  const tbody = document.querySelector('#table-penyulang tbody');
  if (!tbody) return;

  if (!summary.feeders.length) {
    tbody.innerHTML = '<tr><td colspan="18" class="empty-cell">Tidak ada data penyulang untuk filter ini.</td></tr>';
    return;
  }

  tbody.innerHTML = summary.groups.map(group => {
    const groupMonthCells = group.monthly.map((value, idx) => {
      const classes = ['tr', 'mono'];
      if (idx === state.currentMonth) classes.push('focus-month');
      return `<td class="${classes.join(' ')}">${fmtNum(value)}</td>`;
    }).join('');
    const groupRow = `
      <tr class="trafo-group-row">
        <td>
          <strong>${escapeHTML(group.label)}</strong>
          <span class="subtext">${group.feeders.length} penyulang</span>
        </td>
        <td><span class="badge badge-warn">GROUP</span></td>
        <td colspan="2"></td>
        ${groupMonthCells}
        <td class="tr mono"><strong>${fmtNum(group.total)}</strong></td>
        <td></td>
      </tr>`;

    const feederRows = group.feeders.map(feeder => {
      const monthCells = feeder.monthly.map((value, idx) => {
        const classes = ['tr', 'mono'];
        if (idx === state.currentMonth) classes.push('focus-month');
        if (feeder.alerts[idx]) classes.push('alert-cell');
        return `<td class="${classes.join(' ')}">${fmtNum(value)}</td>`;
      }).join('');
      const delta = feeder.deltaPct[state.currentMonth] || 0;
      const deltaClass = delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : 'delta-flat';

      return `
        <tr>
          <td>
            <strong>${escapeHTML(feeder.kode)}</strong>
            <span class="subtext">${escapeHTML(feeder.nama)}</span>
          </td>
          <td><span class="badge ${feeder.jenis === 'INTERKONEKSI' ? 'badge-warn' : 'badge-ok'}">${escapeHTML(feeder.jenis)}</span></td>
          <td>${escapeHTML(feeder.area)}</td>
          <td><span class="badge ${feeder.status === 'AKTIF' ? 'badge-ok' : 'badge-warn'}">${escapeHTML(feeder.status)}</span></td>
          ${monthCells}
          <td class="tr mono"><strong>${fmtNum(feeder.total)}</strong></td>
          <td class="tr mono ${deltaClass}">${delta ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%` : '-'}</td>
        </tr>`;
    }).join('');

    return groupRow + feederRows;
  }).join('');
}

function renderAlerts(summary) {
  const list = qid('alert-list');
  if (!list) return;

  if (!summary.focusAlerts.length) {
    list.innerHTML = `
      <div class="empty-state">
        <i class="ti ti-circle-check" aria-hidden="true"></i>
        <div>
          <strong>Tidak ada alert pada ${MONTH_FULL[state.currentMonth]} ${state.currentYear}</strong>
          <span>Kenaikan atau penurunan kWh pada filter ini masih dalam ambang wajar.</span>
        </div>
      </div>`;
    return;
  }

  list.innerHTML = summary.focusAlerts.map(feeder => `
    <div class="alert-item">
      <div class="alert-icon"><i class="ti ti-alert-triangle" aria-hidden="true"></i></div>
      <div>
        <strong>${escapeHTML(feeder.kode)} - ${escapeHTML(feeder.nama)}</strong>
        <span>${fmtNum(feeder.monthly[state.currentMonth])} kWh · ${escapeHTML(feeder.area)} · ${escapeHTML(feeder.alertNotes[state.currentMonth] || 'Cek stand awal/akhir dan faktor kali.')}</span>
      </div>
    </div>`).join('');
}

async function uploadPenyulang(event) {
  event.preventDefault();
  const form = qid('form-upload-penyulang');
  const result = qid('upload-result-penyulang');
  const fileInput = qid('upload-file-penyulang');
  if (!fileInput.files.length) return;

  const data = new FormData(form);
  if (qid('filter-gi').value) data.set('gi_id', qid('filter-gi').value);
  if (qid('filter-trafo').value) data.set('trafo_id', qid('filter-trafo').value);
  result.textContent = 'Mengupload dan menghitung anomali...';

  try {
    const resp = await fetch('/api/upload-penyulang', { method: 'POST', body: data });
    const payload = await resp.json();
    if (!resp.ok) throw new Error(payload.error || 'Upload gagal');
    result.textContent = `Upload selesai: ${payload.created} data baru, ${payload.updated} diperbarui, ${payload.alerts} alert. ${payload.error_count ? payload.error_count + ' baris dilewati.' : ''}`;
    if (window.showToast) window.showToast('Upload penyulang selesai', 'success');
    await refreshAreas();
    await loadTrafo();
    await loadFeeders();
    await loadData();
    form.reset();
    qid('upload-bulan-penyulang').value = `${state.currentYear}-${pad(state.currentMonth + 1)}`;
  } catch (err) {
    result.textContent = err.message;
    if (window.showToast) window.showToast(err.message, 'error');
  }
}

function downloadSampleCSV(event) {
  event.preventDefault();
  const csv = [
    ['bulan','kode_gi','nama_gi','kode_trafo','nama_trafo','kode_penyulang','nama_penyulang','area_up3','ex_cabang','status','jenis','stand_awal','stand_akhir','faktor_kali','wbp','lwbp1','lwbp2','total_kwh'],
    [`${state.currentYear}-${pad(state.currentMonth + 1)}`,'TNG','GI Tangerang','TRF-1','Trafo 1','P01','Penyulang Contoh','UP3 Teluk Naga','TLN','AKTIF','REGULAR','1000','1250','16000','','','',''],
    [`${state.currentYear}-${pad(state.currentMonth + 1)}`,'TNG','GI Tangerang','TRF-1','Trafo 1','P02','Penyulang Total Saja','UP3 Cikokol','CKK','AKTIF','REGULAR','','','','120000','240000','360000',''],
  ].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadBlob(csv, `contoh_upload_penyulang_${state.currentYear}.csv`, 'text/csv;charset=utf-8;');
}

function exportCSV() {
  const summary = buildSummary();
  const rows = [['Group','Kode','Nama','Jenis','Area/UP3','Status',...MONTH_SHORT,'Total','Perubahan Fokus %']];
  summary.feeders.forEach(f => {
    rows.push([groupLabel(f), f.kode, f.nama, f.jenis, f.area, f.status, ...f.monthly.map(v => Math.round(v)), Math.round(f.total), (f.deltaPct[state.currentMonth] || 0).toFixed(2)]);
  });
  const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadBlob(csv, `penyulang_${state.currentYear}.csv`, 'text/csv;charset=utf-8;');
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
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

function fillSelect(select, items, config) {
  select.innerHTML = `<option value="">${config.allLabel}</option>`;
  items.forEach(item => {
    select.appendChild(new Option(config.label(item), config.value(item)));
  });
}

function chartOptions(tickFormatter, showLegend) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: Boolean(showLegend), position: 'bottom', labels: { color: tickColor(), boxWidth: 10, boxHeight: 10 } },
      tooltip: { callbacks: { label: item => `${item.dataset.label ? item.dataset.label + ': ' : ''}${fmtNum(item.raw)} kWh` } }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: tickColor() } },
      y: {
        beginAtZero: true,
        grid: { color: document.documentElement.classList.contains('theme-dark') ? 'rgba(255,255,255,.06)' : 'rgba(15,23,42,.06)' },
        ticks: { color: tickColor(), callback: tickFormatter }
      }
    }
  };
}

function topFeeders(feeders, limit) {
  return [...feeders].sort((a, b) => b.total - a.total).slice(0, limit);
}

function groupingKey(feeder) {
  const mode = qid('filter-group')?.value || 'area';
  if (mode === 'gi') return feeder.giId || 'tanpa-gi';
  if (mode === 'trafo') return feeder.trafoId || 'tanpa-trafo';
  return feeder.area || 'Belum Dipetakan';
}

function groupLabel(feeder) {
  const mode = qid('filter-group')?.value || 'area';
  if (mode === 'gi') return giLabel(feeder.giId);
  if (mode === 'trafo') return trafoLabel(feeder.trafoId);
  return feeder.area || 'Belum Dipetakan';
}

function currentScopeLabel() {
  const gi = selectedText('filter-gi') || 'Semua GI';
  const area = selectedText('filter-area');
  const trafo = selectedText('filter-trafo');
  const feeder = selectedText('filter-penyulang');
  return [gi, area, trafo, feeder].filter(Boolean).join(' / ');
}

function trafoLabel(trafoId) {
  const trafo = state.trafo.find(item => String(item.id) === String(trafoId));
  if (!trafo) return 'Tanpa Trafo';
  return `${trafo.kode_trafo} - ${trafo.nama_trafo}`;
}

function giLabel(giId) {
  const gi = state.gi.find(item => String(item.id) === String(giId));
  if (!gi) return 'Tanpa GI';
  return `${gi.kode_gi} - ${gi.nama_gi}`;
}

function selectedText(id) {
  const el = qid(id);
  if (!el || !el.value) return '';
  return el.options[el.selectedIndex]?.textContent || '';
}

function destroyChart(id) {
  if (state.charts[id]) {
    state.charts[id].destroy();
    delete state.charts[id];
  }
}

function tickColor() {
  return document.documentElement.classList.contains('theme-dark') ? '#b8bec8' : '#667085';
}

function showError(message) {
  setLive('Error');
  const tbody = document.querySelector('#table-penyulang tbody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="18" class="empty-cell">${escapeHTML(message)}</td></tr>`;
}

function setLive(text) { setText('penyulang-live', text); }
function qid(id) { return document.getElementById(id); }
function on(id, event, fn) { qid(id)?.addEventListener(event, fn); }
function setText(id, value) { const el = qid(id); if (el) el.textContent = value; }
function pad(n) { return String(n).padStart(2, '0'); }
function fmtNum(n) { return new Intl.NumberFormat('id-ID').format(Math.round(Number(n || 0))); }
function fmtCompact(n) { return new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n || 0)); }
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}
