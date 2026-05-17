/* ════════════════════════════════════════════════════
   SUSUT ENERGI DASHBOARD — dashboard.js
   Kompatibel dengan endpoint: GET /api/dashboard-data
   Format response: { data_bulanan: [...] }
════════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────
// STATE
// ─────────────────────────────────────
let allData      = [];
let currentPeriode = 'mei';
let currentTahun   = 2026;

const MONTH_NAMES = ['Januari','Februari','Maret','April','Mei','Juni',
                     'Juli','Agustus','September','Oktober','November','Desember'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun',
                     'Jul','Ags','Sep','Okt','Nov','Des'];
const TARGET_SUSUT = 1.5; // % batas toleransi

// ─────────────────────────────────────
// THEME HELPERS
// ─────────────────────────────────────
const isDark = () => document.body.classList.contains('dark');

function chartTheme() {
  const dark = isDark();
  return {
    font:    dark ? '#8b949e' : '#6b7280',
    grid:    dark ? '#1e2a3a' : '#f3f4f6',
    paper:   'rgba(0,0,0,0)',
    plot:    'rgba(0,0,0,0)',
    border:  dark ? '#2d3748' : '#e4e7ed',
  };
}

// ─────────────────────────────────────
// INIT: TAHUN SELECT
// ─────────────────────────────────────
(function initTahun() {
  const sel = document.getElementById('tahun');
  for (let y = 2020; y <= 2030; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === currentTahun) opt.selected = true;
    sel.appendChild(opt);
  }
})();

// ─────────────────────────────────────
// EVENTS
// ─────────────────────────────────────
document.getElementById('periode').addEventListener('change', e => {
  currentPeriode = e.target.value;
  updateDashboard();
});
document.getElementById('tahun').addEventListener('change', e => {
  currentTahun = parseInt(e.target.value);
  updateDashboard();
});
document.getElementById('reset-filter').addEventListener('click', () => {
  document.getElementById('periode').value = 'mei';
  document.getElementById('tahun').value   = 2026;
  currentPeriode = 'mei';
  currentTahun   = 2026;
  updateDashboard();
});
document.getElementById('export-btn')?.addEventListener('click', exportCSV);

// Dark mode
const darkToggle = document.getElementById('dark-mode-toggle');
darkToggle.addEventListener('change', function () {
  document.body.classList.toggle('dark', this.checked);
  localStorage.setItem('darkMode', this.checked);
  if (allData.length) renderCharts(
    getYearData(), buildMonthKeys(), buildMonthLabels()
  );
});
if (localStorage.getItem('darkMode') === 'true') {
  darkToggle.checked = true;
  document.body.classList.add('dark');
}

// ─────────────────────────────────────
// DATA LOADING
// ─────────────────────────────────────
async function loadData() {
  try {
    const r = await fetch('/api/dashboard-data');
    if (!r.ok) throw new Error(r.statusText);
    const json = await r.json();
    allData = json.data_bulanan || [];
    updateDashboard();
    document.getElementById('last-update-text').textContent =
      'Update: ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } catch (err) {
    console.error('Gagal memuat data:', err);
    // Gunakan data demo jika endpoint belum tersedia
    allData = generateDemoData();
    updateDashboard();
    document.getElementById('last-update-text').textContent = 'Demo data';
  }
}

// Demo data agar UI dapat dipreview tanpa backend
function generateDemoData() {
  return Array.from({ length: 12 }, (_, i) => {
    const mu = 170000 + Math.random() * 30000;
    const py = mu * (1 - (0.012 + Math.random() * 0.008));
    return {
      tanggal:          `${currentTahun}-${String(i + 1).padStart(2, '0')}-01`,
      meter_utama:      Math.round(mu),
      total_penyulang:  Math.round(py),
      susut_kwh:        Math.round(mu - py),
      persentase_susut: parseFloat(((mu - py) / mu * 100).toFixed(2)),
    };
  });
}

// ─────────────────────────────────────
// MAIN UPDATE
// ─────────────────────────────────────
function updateDashboard() {
  if (!allData.length) return;
  const yearData   = getYearData();
  const keys       = buildMonthKeys();
  const labels     = buildMonthLabels();
  const periodeAgg = getPeriodeData(yearData, currentPeriode);

  renderMetricCards(periodeAgg);
  renderCharts(yearData, keys, labels);
  renderDetailTable(yearData);
  updateLabelPeriode();
}

// ─────────────────────────────────────
// HELPERS
// ─────────────────────────────────────
function getYearData() {
  return allData.filter(d => new Date(d.tanggal).getFullYear() === currentTahun);
}
function buildMonthKeys() {
  return Array.from({ length: 12 }, (_, i) =>
    `${currentTahun}-${String(i + 1).padStart(2, '0')}`
  );
}
function buildMonthLabels() {
  return MONTH_SHORT.slice(); // hanya nama bulan, tanpa tahun
}

// ─────────────────────────────────────
// PERIODE AGGREGATION
// ─────────────────────────────────────
function getPeriodeData(yearData, periode) {
  const months = MONTH_NAMES.map(m => m.toLowerCase());
  if (months.includes(periode)) {
    const idx = months.indexOf(periode);
    return yearData.find(d => new Date(d.tanggal).getMonth() === idx) || null;
  }
  const TW = { tw1:[0,1,2], tw2:[3,4,5], tw3:[6,7,8], tw4:[9,10,11] };
  if (TW[periode]) return aggregate(yearData.filter(d => TW[periode].includes(new Date(d.tanggal).getMonth())));
  if (periode === 'kumulatif') return aggregate(yearData);
  return null;
}

function aggregate(arr) {
  if (!arr.length) return null;
  const mu   = arr.reduce((s, d) => s + d.meter_utama, 0);
  const py   = arr.reduce((s, d) => s + d.total_penyulang, 0);
  const skwh = mu - py;
  return { meter_utama: mu, total_penyulang: py, susut_kwh: skwh, persentase_susut: mu ? skwh / mu * 100 : 0 };
}

// ─────────────────────────────────────
// METRIC CARDS
// ─────────────────────────────────────
function renderMetricCards(data) {
  const p = data?.persentase_susut ?? null;
  const status = p == null ? 'neutral' : p > TARGET_SUSUT ? 'danger' : p > TARGET_SUSUT * 0.8 ? 'warn' : 'ok';

  // Susut %
  document.getElementById('susut-persen').textContent = p != null ? fmtPct(p) : '—';
  const badge = document.getElementById('badge-susut');
  badge.textContent = p != null ? (status === 'ok' ? '✓ Normal' : status === 'warn' ? '⚠ Perhatian' : '✕ Melebihi') : '—';
  badge.className = 'metric-badge ' + (status === 'neutral' ? '' : status);

  // Gauge
  updateGauge(p);

  // Susut kWh
  document.getElementById('susut-kwh').textContent = data?.susut_kwh != null ? fmtNum(data.susut_kwh) + ' kWh' : '—';

  // Beli / Jual
  document.getElementById('kwh-beli').textContent = data?.meter_utama != null ? fmtNum(data.meter_utama) + ' kWh' : '—';
  document.getElementById('kwh-jual').textContent = data?.total_penyulang != null ? fmtNum(data.total_penyulang) + ' kWh' : '—';
}

function updateGauge(persen) {
  const arc = document.getElementById('gauge-arc');
  if (!arc) return;
  const maxLen  = 107; // approx arc length for the SVG path
  const maxPct  = 5;   // 5% = full arc
  const ratio   = Math.min((persen || 0) / maxPct, 1);
  const offset  = maxLen - ratio * maxLen;
  arc.style.strokeDashoffset = offset;
  arc.style.stroke = (persen || 0) > TARGET_SUSUT ? '#dc2626' : (persen || 0) > TARGET_SUSUT * 0.8 ? '#d97706' : '#059669';
}

function updateLabelPeriode() {
  const sel   = document.getElementById('periode');
  const label = sel.options[sel.selectedIndex].text + ' ' + currentTahun;
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`label-periode-${i}`);
    if (el) el.textContent = label;
  }
}

// ─────────────────────────────────────
// CHARTS (Plotly)
// ─────────────────────────────────────
function renderCharts(yearData, monthKeys, labels) {
  const theme = chartTheme();

  // Map data kebulan
  const susutMap = {};
  yearData.forEach(d => { susutMap[d.tanggal.substring(0, 7)] = d.persentase_susut; });
  const susutVals = monthKeys.map(k => susutMap[k] ?? null);

  // ── Chart Susut Trend ──────────────────────────
  // Update judul chart dengan tahun yang dipilih
  const susutChartTitle = document.getElementById('susut-chart-title');
  if (susutChartTitle) susutChartTitle.textContent = `Susut Energi ${currentTahun}`;

  const traceSusut = {
    x: labels, y: susutVals,
    type: 'scatter', mode: 'lines+markers+text',
    name: 'Susut %',
    line: { color: '#dc2626', width: 2.5, shape: 'spline' },
    marker: { color: '#dc2626', size: 7, symbol: 'circle',
              line: { color: '#fff', width: 2 } },
    fill: 'tozeroy',
    fillcolor: isDark() ? 'rgba(220,38,38,0.07)' : 'rgba(220,38,38,0.06)',
    connectgaps: false,
    text: susutVals.map(v => v != null ? v.toFixed(2) + '%' : ''),
    textposition: 'top center',
    textfont: {
      family: "'JetBrains Mono', monospace",
      size: 10,
      color: isDark() ? '#f87171' : '#dc2626',
    },
    hovertemplate: '<b>%{x}</b><br>Susut: %{y:.2f}%<extra></extra>',
  };
  const traceTarget = {
    x: labels, y: Array(12).fill(TARGET_SUSUT),
    type: 'scatter', mode: 'lines', name: `Target ${TARGET_SUSUT}%`,
    line: { color: '#94a3b8', width: 1.5, dash: 'dot' },
    hoverinfo: 'skip',
  };

  const layoutBase = {
    paper_bgcolor: theme.paper,
    plot_bgcolor:  theme.plot,
    font: { family: "'DM Sans', sans-serif", color: theme.font, size: 12 },
    margin: { t: 32, r: 20, b: 48, l: 16 },
    showlegend: false,
    xaxis: {
      showgrid: false, zeroline: false,
      tickfont: { size: 11, color: theme.font },
      tickangle: 0,
      automargin: true,
      fixedrange: true,
    },
    yaxis: {
      visible: false,
      zeroline: false,
      fixedrange: true,
      // beri ruang di atas agar label tidak terpotong
      range: [0, Math.max(...susutVals.filter(v => v != null), TARGET_SUSUT) * 1.35],
    },
  };

  Plotly.react('chart-susut', [traceSusut, traceTarget], layoutBase, {
    responsive: true, displayModeBar: false,
  });

  // ── Chart kWh Jual (dummy categories) ──────────
  const seed = currentTahun * 13;
  const rng  = (i, base, spread) => Math.round(base + ((seed * (i + 1) * 7919) % spread));
  const ttArr = monthKeys.map((_, i) => rng(i, 12000, 18000));
  const tmArr = monthKeys.map((_, i) => rng(i, 22000, 24000));
  const trArr = monthKeys.map((_, i) => rng(i, 32000, 28000));
  window._kwhJualData = { labels, TT: ttArr, TM: tmArr, TR: trArr };

  const maxBarVal = Math.max(...ttArr, ...tmArr, ...trArr);

  const barLayout = {
    paper_bgcolor: theme.paper,
    plot_bgcolor:  theme.plot,
    font: { family: "'DM Sans', sans-serif", color: theme.font, size: 12 },
    margin: { t: 36, r: 20, b: 48, l: 16 },
    barmode: 'group',
    bargap: 0.22,
    bargroupgap: 0.08,
    showlegend: true,
    legend: { orientation: 'h', y: 1.12, x: 0, font: { size: 11, color: theme.font } },
    xaxis: {
      showgrid: false, zeroline: false,
      tickfont: { size: 11, color: theme.font },
      tickangle: 0, automargin: true, fixedrange: true,
    },
    yaxis: {
      visible: false, zeroline: false, fixedrange: true,
      range: [0, maxBarVal * 1.22],
    },
  };

  Plotly.react('chart-kwh-jual', [
    { x: labels, y: ttArr, name: 'TT', type: 'bar',
      marker: { color: isDark() ? '#60a5fa' : '#3b82f6', opacity: 0.9 },
      text: ttArr.map(v => fmtNumK(v)), textposition: 'outside',
      textfont: { size: 9, color: isDark() ? '#60a5fa' : '#3b82f6' },
      hovertemplate: '<b>%{x}</b><br>TT: %{y:,} kWh<extra></extra>', cliponaxis: false },
    { x: labels, y: tmArr, name: 'TM', type: 'bar',
      marker: { color: isDark() ? '#34d399' : '#10b981', opacity: 0.9 },
      text: tmArr.map(v => fmtNumK(v)), textposition: 'outside',
      textfont: { size: 9, color: isDark() ? '#34d399' : '#059669' },
      hovertemplate: '<b>%{x}</b><br>TM: %{y:,} kWh<extra></extra>', cliponaxis: false },
    { x: labels, y: trArr, name: 'TR', type: 'bar',
      marker: { color: isDark() ? '#fbbf24' : '#f59e0b', opacity: 0.9 },
      text: trArr.map(v => fmtNumK(v)), textposition: 'outside',
      textfont: { size: 9, color: isDark() ? '#fbbf24' : '#d97706' },
      hovertemplate: '<b>%{x}</b><br>TR: %{y:,} kWh<extra></extra>', cliponaxis: false },
  ], barLayout, { responsive: true, displayModeBar: false });

  renderKwhJualTable(labels, ttArr, tmArr, trArr);

  // ── Sparkline susut kWh ────────────────────────
  const susutKwhVals = monthKeys.map(k => {
    const d = yearData.find(r => r.tanggal.substring(0, 7) === k);
    return d?.susut_kwh ?? null;
  });
  Plotly.react('spark-susut', [{
    x: monthKeys, y: susutKwhVals, type: 'scatter', mode: 'lines',
    line: { color: '#dc2626', width: 1.5 }, fill: 'tozeroy',
    fillcolor: 'rgba(220,38,38,0.08)',
  }], {
    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { t: 0, r: 0, b: 0, l: 0 },
    xaxis: { visible: false }, yaxis: { visible: false },
    showlegend: false,
  }, { responsive: true, displayModeBar: false, staticPlot: true });
}

// ─────────────────────────────────────
// TABLE: kWh JUAL
// ─────────────────────────────────────
function renderKwhJualTable(labels, tt, tm, tr) {
  const tbody = document.querySelector('#table-kwh-jual tbody');
  if (!tbody) return;
  let sTT = 0, sTM = 0, sTR = 0;
  tbody.innerHTML = '';
  labels.forEach((lbl, i) => {
    sTT += tt[i]; sTM += tm[i]; sTR += tr[i];
    const total = tt[i] + tm[i] + tr[i];
    tbody.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${lbl}</td>
        <td class="text-right text-mono">${fmtNum(tt[i])}</td>
        <td class="text-right text-mono">${fmtNum(tm[i])}</td>
        <td class="text-right text-mono">${fmtNum(tr[i])}</td>
        <td class="text-right text-mono"><strong>${fmtNum(total)}</strong></td>
      </tr>
    `);
  });
  tbody.insertAdjacentHTML('beforeend', `
    <tr style="font-weight:700;background:var(--c-surface-2)">
      <td>TOTAL</td>
      <td class="text-right text-mono">${fmtNum(sTT)}</td>
      <td class="text-right text-mono">${fmtNum(sTM)}</td>
      <td class="text-right text-mono">${fmtNum(sTR)}</td>
      <td class="text-right text-mono">${fmtNum(sTT+sTM+sTR)}</td>
    </tr>
  `);
}

// ─────────────────────────────────────
// TABLE: DETAIL SUSUT BULANAN
// ─────────────────────────────────────
function renderDetailTable(data) {
  const tbody = document.querySelector('#table-detail tbody');
  const tfoot = document.querySelector('#table-detail tfoot');
  if (!tbody) return;
  tbody.innerHTML = '';

  let countDanger = 0, countWarn = 0, countOk = 0;
  data.forEach(row => {
    const p      = row.persentase_susut;
    const isDng  = p > TARGET_SUSUT;
    const isWrn  = !isDng && p > TARGET_SUSUT * 0.85;
    if (isDng) countDanger++; else if (isWrn) countWarn++; else countOk++;
    const rowClass = isDng ? 'row-danger' : isWrn ? 'row-warn' : '';
    const badge    = isDng
      ? `<span class="status-danger">↑ Melebihi</span>`
      : isWrn
        ? `<span class="status-warn">⚠ Perhatian</span>`
        : `<span class="status-ok">✓ Normal</span>`;
    tbody.insertAdjacentHTML('beforeend', `
      <tr class="${rowClass}">
        <td><strong>${fmtDate(row.tanggal)}</strong></td>
        <td class="text-right text-mono">${fmtNum(row.meter_utama)}</td>
        <td class="text-right text-mono">${fmtNum(row.total_penyulang)}</td>
        <td class="text-right text-mono">${fmtNum(row.susut_kwh)}</td>
        <td class="text-right text-mono">${fmtPct(p)}</td>
        <td>${badge}</td>
      </tr>
    `);
  });

  // Pills summary
  const pills = document.getElementById('status-pills');
  if (pills) {
    pills.innerHTML = `
      <span class="status-ok">${countOk} Normal</span>
      <span class="status-warn">${countWarn} Perhatian</span>
      <span class="status-danger">${countDanger} Melebihi</span>
    `;
  }

  // Footer total
  const totMU = data.reduce((s, d) => s + d.meter_utama, 0);
  const totPY = data.reduce((s, d) => s + d.total_penyulang, 0);
  const totSK = totMU - totPY;
  const totSP = totMU ? totSK / totMU * 100 : 0;
  tfoot.innerHTML = `
    <tr>
      <td><strong>Total / Rata-rata</strong></td>
      <td class="text-right text-mono"><strong>${fmtNum(totMU)}</strong></td>
      <td class="text-right text-mono"><strong>${fmtNum(totPY)}</strong></td>
      <td class="text-right text-mono"><strong>${fmtNum(totSK)}</strong></td>
      <td class="text-right text-mono"><strong>${fmtPct(totSP)}</strong></td>
      <td></td>
    </tr>
  `;
}

// ─────────────────────────────────────
// EXPORT CSV
// ─────────────────────────────────────
function exportCSV() {
  if (!allData.length) return;
  const rows = [['Bulan','Meter Utama (kWh)','Total Penyulang (kWh)','Susut (kWh)','Susut (%)']];
  getYearData().forEach(d => {
    rows.push([fmtDate(d.tanggal), d.meter_utama, d.total_penyulang, d.susut_kwh, d.persentase_susut.toFixed(2)]);
  });
  const csv  = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `susut_${currentTahun}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────
// UTILS
// ─────────────────────────────────────
function fmtNum(n)  { return new Intl.NumberFormat('id-ID').format(Math.round(n)); }
function fmtNumK(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1).replace('.', ',') + 'k';
  return String(Math.round(n));
}
function fmtPct(n)  { return n != null ? n.toFixed(2) + '%' : '—'; }
function fmtDate(s) {
  const d = new Date(s);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

// ─────────────────────────────────────
// SIDEBAR COLLAPSE → CHART RESIZE
// ─────────────────────────────────────
(function initSidebarResizeObserver() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar || typeof ResizeObserver === 'undefined') return;
  const observer = new ResizeObserver(() => {
    // Tunggu transisi CSS selesai baru resize chart
    setTimeout(() => {
      ['chart-susut', 'chart-kwh-jual', 'spark-susut'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.children.length) Plotly.Plots.resize(el);
      });
    }, 280); // sedikit lebih dari durasi transisi 0.25s
  });
  observer.observe(sidebar);
})();

// ─────────────────────────────────────
// BOOT
// ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', loadData);
setInterval(loadData, 300_000); // refresh tiap 5 menit