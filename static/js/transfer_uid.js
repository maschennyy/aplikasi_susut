'use strict';

const UID_MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
let uidTransferChart = null;
let uidDirectionChart = null;

document.addEventListener('DOMContentLoaded', async () => {
  initUidTransferFilters();
  document.getElementById('uid-transfer-tahun')?.addEventListener('change', loadUidTransfer);
  document.getElementById('btn-refresh-uid-transfer')?.addEventListener('click', loadUidTransfer);
  await loadUidTransfer();
});

function initUidTransferFilters() {
  const select = document.getElementById('uid-transfer-tahun');
  if (!select) return;
  const year = new Date().getFullYear();
  for (let y = 2020; y <= 2030; y++) {
    const opt = new Option(y, y);
    if (y === year) opt.selected = true;
    select.appendChild(opt);
  }
}

async function loadUidTransfer() {
  const year = document.getElementById('uid-transfer-tahun')?.value || new Date().getFullYear();
  setText('uid-transfer-live', 'Memuat');
  const rows = await getJSON(`/api/transfer-data?tahun=${encodeURIComponent(year)}`, []);
  renderUidSummary(rows);
  renderUidCharts(rows);
  renderUidTable(rows);
  setText('uid-transfer-live', 'Update ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
}

function renderUidSummary(rows) {
  const ekspor = sumByDirection(rows, 'EKSPOR');
  const impor = sumByDirection(rows, 'IMPOR');
  setText('uid-export', fmtNum(ekspor));
  setText('uid-import', fmtNum(impor));
  setText('uid-netto', fmtNum(ekspor - impor));
  setText('uid-count', fmtNum(rows.length));
}

function renderUidCharts(rows) {
  const ekspor = Array(12).fill(0);
  const impor = Array(12).fill(0);
  rows.forEach(row => {
    const month = new Date(row.periode_bulan).getMonth();
    if (row.arah === 'EKSPOR') ekspor[month] += Number(row.kwh_transfer || 0);
    if (row.arah === 'IMPOR') impor[month] += Number(row.kwh_transfer || 0);
  });

  destroyUidCharts();
  const trend = document.getElementById('chart-uid-transfer');
  if (trend && typeof Chart !== 'undefined') {
    uidTransferChart = new Chart(trend, {
      type: 'bar',
      data: {
        labels: UID_MONTHS,
        datasets: [
          makeDataset('Ekspor', ekspor, '#1769e0'),
          makeDataset('Impor', impor, '#139a57'),
        ],
      },
      options: chartOptions(),
    });
  }

  const direction = document.getElementById('chart-uid-direction');
  if (direction && typeof Chart !== 'undefined') {
    uidDirectionChart = new Chart(direction, {
      type: 'doughnut',
      data: {
        labels: ['Ekspor', 'Impor'],
        datasets: [{
          data: [sumArray(ekspor), sumArray(impor)],
          backgroundColor: ['#1769e0', '#139a57'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#98a2b3', boxWidth: 10, usePointStyle: true } } },
      },
    });
  }
}

function renderUidTable(rows) {
  const tbody = document.querySelector('#table-uid-transfer tbody');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Belum ada data transfer antar UID untuk tahun ini.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(row => {
    const badgeClass = row.arah === 'EKSPOR' ? 'badge-warn' : 'badge-ok';
    return `
      <tr>
        <td>${formatMonth(row.periode_bulan)}</td>
        <td>${escapeHTML(row.unit_asal || '-')}</td>
        <td>${escapeHTML(row.unit_tujuan || '-')}</td>
        <td>
          <strong>${escapeHTML(row.gi_interkoneksi || '-')}</strong>
          <span class="subtext">${escapeHTML(row.kode_interbus || '-')}</span>
        </td>
        <td><span class="badge ${badgeClass}">${escapeHTML(row.arah || '-')}</span></td>
        <td class="tr mono">${fmtNum(row.kwh_transfer)}</td>
      </tr>`;
  }).join('');
}

function makeDataset(label, data, color) {
  return {
    label,
    data,
    backgroundColor: color,
    borderRadius: 7,
    borderSkipped: false,
  };
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#98a2b3', boxWidth: 10, usePointStyle: true } },
      tooltip: { callbacks: { label: item => `${item.dataset.label}: ${fmtNum(item.raw)} kWh` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#98a2b3' } },
      y: {
        beginAtZero: true,
        grid: { color: document.body.classList.contains('dark') ? 'rgba(255,255,255,.06)' : 'rgba(15,23,42,.06)' },
        ticks: { color: '#98a2b3', callback: value => fmtCompact(value) },
      },
    },
  };
}

function destroyUidCharts() {
  if (uidTransferChart) uidTransferChart.destroy();
  if (uidDirectionChart) uidDirectionChart.destroy();
  uidTransferChart = null;
  uidDirectionChart = null;
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

function sumByDirection(rows, direction) {
  return rows.filter(row => row.arah === direction).reduce((sum, row) => sum + Number(row.kwh_transfer || 0), 0);
}

function sumArray(values) {
  return values.reduce((sum, value) => sum + Number(value || 0), 0);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatMonth(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' }).format(new Date(value));
}

function fmtNum(value) {
  return new Intl.NumberFormat('id-ID').format(Math.round(Number(value || 0)));
}

function fmtCompact(value) {
  return new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
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
