'use strict';

const REKAP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
const rekapState = {
  rows: [],
  charts: {},
  year: new Date().getFullYear(),
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!document.getElementById('rekap-tahun')) return;
  initRekapFilters();
  bindRekapEvents();
  await loadRekapGI();
  await loadRekap();
});

function initRekapFilters() {
  const select = qid('rekap-tahun');
  if (!select) return;
  for (let year = 2020; year <= 2030; year++) {
    const option = new Option(year, year);
    if (year === rekapState.year) option.selected = true;
    select.appendChild(option);
  }
}

function bindRekapEvents() {
  qid('btn-refresh-rekap')?.addEventListener('click', loadRekap);
  qid('rekap-tahun')?.addEventListener('change', loadRekap);
  qid('rekap-gi')?.addEventListener('change', loadRekap);
}

async function loadRekapGI() {
  const select = qid('rekap-gi');
  if (!select) return;
  try {
    const rows = await getJSON('/api/gardu-induk', []);
    select.innerHTML = '<option value="">Semua GI</option>' + rows.map(row => (
      `<option value="${row.id}">${escapeHTML(row.kode_gi || '-')} - ${escapeHTML(row.nama_gi || '-')}</option>`
    )).join('');
  } catch (_) {
    select.innerHTML = '<option value="">Semua GI</option>';
  }
}

async function loadRekap() {
  setText('rekap-live', 'Memuat');
  const year = qid('rekap-tahun')?.value || rekapState.year;
  const giId = qid('rekap-gi')?.value || '';
  const params = new URLSearchParams({ tahun: year });
  if (giId) params.set('gi_id', giId);
  try {
    const rows = await getJSON(`/api/rekap?${params.toString()}`, []);
    rekapState.rows = rows;
    renderRekap(rows);
    setText('rekap-live', 'Update ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
  } catch (err) {
    console.warn('Gagal memuat rekap:', err);
    rekapState.rows = [];
    renderRekap([]);
    setText('rekap-live', 'Gagal memuat');
  }
}

function renderRekap(rows) {
  renderRekapMetrics(rows);
  renderRekapTable(rows);
  renderRekapCharts(rows);
}

function renderRekapMetrics(rows) {
  const totals = rows.reduce((acc, row) => {
    acc.mu += Number(row.kwh_mu_total || 0);
    acc.mp += Number(row.kwh_mp_total || 0);
    acc.feeder += Number(row.kwh_penyulang_total || 0);
    acc.susut += Number(row.susut_kwh || 0);
    return acc;
  }, { mu: 0, mp: 0, feeder: 0, susut: 0 });
  const susutPct = totals.mu ? totals.susut / totals.mu * 100 : 0;
  const devPct = totals.mu ? (totals.mu - totals.feeder) / totals.mu * 100 : 0;
  setText('rekap-mu-total', fmtNum(totals.mu));
  setText('rekap-feeder-total', fmtNum(totals.feeder));
  setText('rekap-susut-total', fmtNum(totals.susut));
  setText('rekap-susut-pct', `${susutPct.toFixed(2)}% dari MU`);
  setText('rekap-deviasi-pct', `${devPct.toFixed(2)}%`);
}

function renderRekapTable(rows) {
  const tbody = document.querySelector('#table-rekap tbody');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-cell">Belum ada data rekap untuk filter ini.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(row => {
    const period = formatPeriod(row.periode_bulan);
    return `
      <tr>
        <td><strong>${period}</strong></td>
        <td>${escapeHTML(row.nama_gi || '-')}<span class="subtext">${escapeHTML(row.kode_gi || '-')}</span></td>
        <td class="tr mono">${fmtNum(row.kwh_mu_total)}</td>
        <td class="tr mono">${fmtNum(row.kwh_mp_total)}</td>
        <td class="tr mono">${fmtNum(row.kwh_penyulang_total)}</td>
        <td class="tr mono">${fmtPct(row.deviasi_mu_penyulang)}</td>
        <td class="tr mono">${fmtNum(row.susut_kwh)}</td>
        <td class="tr mono">${fmtPct(row.susut_persen)}</td>
        <td class="tr mono">${fmtNum(row.transfer_ekspor)}</td>
        <td class="tr mono">${fmtNum(row.transfer_impor)}</td>
      </tr>`;
  }).join('');
}

function renderRekapCharts(rows) {
  if (typeof Chart === 'undefined') return;
  const monthly = Array.from({ length: 12 }, () => ({ mu: 0, feeder: 0, susut: 0 }));
  rows.forEach(row => {
    const month = new Date(row.periode_bulan).getMonth();
    if (month < 0 || month > 11) return;
    monthly[month].mu += Number(row.kwh_mu_total || 0);
    monthly[month].feeder += Number(row.kwh_penyulang_total || 0);
    monthly[month].susut += Number(row.susut_kwh || 0);
  });
  const susutPct = monthly.map(row => row.mu ? +(row.susut / row.mu * 100).toFixed(2) : 0);
  const mu = monthly.map(row => Math.round(row.mu));
  const feeder = monthly.map(row => Math.round(row.feeder));

  destroyRekapChart('chart-rekap-susut');
  destroyRekapChart('chart-rekap-energy');
  const susutCanvas = qid('chart-rekap-susut');
  const energyCanvas = qid('chart-rekap-energy');
  if (susutCanvas) {
    rekapState.charts['chart-rekap-susut'] = new Chart(susutCanvas, {
      type: 'line',
      data: {
        labels: REKAP_MONTHS,
        datasets: [{
          data: susutPct,
          borderColor: '#d97706',
          backgroundColor: 'rgba(217,119,6,.12)',
          borderWidth: 2.3,
          pointRadius: 3,
          fill: true,
          tension: .35,
        }],
      },
      options: chartOptions(value => `${value}%`),
    });
  }
  if (energyCanvas) {
    rekapState.charts['chart-rekap-energy'] = new Chart(energyCanvas, {
      type: 'bar',
      data: {
        labels: REKAP_MONTHS,
        datasets: [
          { label: 'MU', data: mu, backgroundColor: 'rgba(37,99,235,.78)', borderRadius: 4 },
          { label: 'Penyulang', data: feeder, backgroundColor: 'rgba(22,163,74,.78)', borderRadius: 4 },
        ],
      },
      options: chartOptions(value => compactNum(value), true),
    });
  }
}

function chartOptions(tickFormatter, showLegend = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: showLegend } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } } },
      y: {
        grid: { color: document.body.classList.contains('dark') ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)' },
        ticks: { color: '#9ca3af', callback: tickFormatter, font: { size: 10 } },
      },
    },
  };
}

function destroyRekapChart(id) {
  if (!rekapState.charts[id]) return;
  try { rekapState.charts[id].destroy(); } catch (_) {}
  delete rekapState.charts[id];
}

async function getJSON(url, fallback) {
  const resp = await fetch(url);
  if (!resp.ok) return fallback;
  return resp.json();
}

function formatPeriod(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${REKAP_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function qid(id) { return document.getElementById(id); }
function setText(id, value) { const el = qid(id); if (el) el.textContent = value; }
function fmtNum(value) { return new Intl.NumberFormat('id-ID').format(Math.round(Number(value || 0))); }
function compactNum(value) {
  return new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
}
function fmtPct(value) { return `${Number(value || 0).toFixed(2)}%`; }
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}
