/* ════════════════════════════════════════════════════
   dashboard.js v2 — Susut Energi
   Requires: Chart.js (loaded in base.html)
   API contract: GET /api/dashboard-data
════════════════════════════════════════════════════ */

'use strict';

const TARGET_SUSUT = 1.5;
const MONTH_NAMES  = ['Januari','Februari','Maret','April','Mei','Juni',
                      'Juli','Agustus','September','Oktober','November','Desember'];
const MONTH_SHORT  = ['Jan','Feb','Mar','Apr','Mei','Jun',
                      'Jul','Ags','Sep','Okt','Nov','Des'];

let allData        = [];
let currentPeriode = 'mei';
let currentTahun   = new Date().getFullYear();
let mainChart      = null;
let sparkInstances = {};

// ─────────────────────────────────────
// INIT
// ─────────────────────────────────────
(function init() {
  const sel = document.getElementById('tahun');
  if (sel) {
    for (let y = 2020; y <= 2030; y++) {
      const o = document.createElement('option');
      o.value = y; o.textContent = y;
      if (y === currentTahun) o.selected = true;
      sel.appendChild(o);
    }
  }
  bindEvents();
  loadData();
})();

// ─────────────────────────────────────
// EVENTS
// ─────────────────────────────────────
function bindEvents() {
  document.getElementById('periode')?.addEventListener('change', e => {
    currentPeriode = e.target.value; updateDashboard();
  });
  document.getElementById('tahun')?.addEventListener('change', e => {
    currentTahun = parseInt(e.target.value); loadData();
  });
  document.getElementById('reset-filter')?.addEventListener('click', () => {
    document.getElementById('periode').value = 'mei';
    document.getElementById('tahun').value   = new Date().getFullYear();
    currentPeriode = 'mei';
    currentTahun   = new Date().getFullYear();
    loadData();
  });
  document.getElementById('export-btn')?.addEventListener('click', exportCSV);

  // filter tabs (3B / 6B / 12B)
  document.querySelectorAll('.ftab').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      renderMainChart(getYearData(), parseInt(this.dataset.range || 6));
    });
  });

  // dark mode toggle in sidebar
  document.querySelector('.dark-toggle')?.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('darkMode', document.body.classList.contains('dark'));
    if (allData.length) renderMainChart(getYearData(), activeRange());
  });
  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark');
  }

  // sidebar collapse
  document.querySelector('.sidebar-toggle')?.addEventListener('click', () => {
    document.querySelector('.sidebar')?.classList.toggle('collapsed');
  });
}

function activeRange() {
  return parseInt(document.querySelector('.ftab.active')?.dataset.range || 6);
}

// ─────────────────────────────────────
// DATA LOADING
// ─────────────────────────────────────
async function loadData() {
  try {
    const r = await fetch(`/api/dashboard-data?tahun=${currentTahun}`);
    if (!r.ok) throw new Error(r.statusText);
    const json = await r.json();
    allData = json.data_bulanan || [];
    updateDashboard();
    const el = document.getElementById('live-label');
    if (el) el.textContent = 'Live · ' + new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
  } catch (err) {
    console.warn('API belum siap, pakai demo data:', err.message);
    allData = demoData();
    updateDashboard();
    const el = document.getElementById('live-label');
    if (el) el.textContent = 'Demo';
  }
}

function demoData() {
  return Array.from({ length: 12 }, (_, i) => {
    const mu = 165000 + Math.round(Math.sin(i * .8) * 15000 + 15000);
    const py = Math.round(mu * (1 - (0.012 + Math.sin(i * 1.3 + 1) * .003 + .002)));
    return {
      tanggal: `${currentTahun}-${String(i+1).padStart(2,'0')}-01`,
      meter_utama: mu, total_penyulang: py,
      susut_kwh: mu - py,
      persentase_susut: parseFloat(((mu - py) / mu * 100).toFixed(2))
    };
  });
}

// ─────────────────────────────────────
// MAIN UPDATE
// ─────────────────────────────────────
function updateDashboard() {
  if (!allData.length) return;
  const yearData = getYearData();
  const agg      = getPeriodeData(yearData, currentPeriode);
  renderMetricCards(agg, yearData);
  renderMainChart(yearData, activeRange());
  renderKwhJualChart(yearData);
  renderDetailTable(yearData);
  updatePeriodeLabels();
}

// ─────────────────────────────────────
// HELPERS
// ─────────────────────────────────────
function getYearData() {
  return allData.filter(d => new Date(d.tanggal).getFullYear() === currentTahun);
}

function getPeriodeData(yearData, periode) {
  const names = MONTH_NAMES.map(m => m.toLowerCase());
  if (names.includes(periode)) {
    const idx = names.indexOf(periode);
    return yearData.find(d => new Date(d.tanggal).getMonth() === idx) || null;
  }
  const TW = { tw1:[0,1,2], tw2:[3,4,5], tw3:[6,7,8], tw4:[9,10,11] };
  if (TW[periode]) return agg(yearData.filter(d => TW[periode].includes(new Date(d.tanggal).getMonth())));
  if (periode === 'kumulatif') return agg(yearData);
  return null;
}

function agg(arr) {
  if (!arr.length) return null;
  const mu = arr.reduce((s,d) => s + d.meter_utama, 0);
  const py = arr.reduce((s,d) => s + d.total_penyulang, 0);
  const sk = mu - py;
  return { meter_utama: mu, total_penyulang: py, susut_kwh: sk,
           persentase_susut: mu ? sk/mu*100 : 0 };
}

// ─────────────────────────────────────
// METRIC CARDS
// ─────────────────────────────────────
function renderMetricCards(data, yearData) {
  const p = data?.persentase_susut ?? null;
  const status = p == null ? 'neutral' : p > TARGET_SUSUT ? 'danger' : p > TARGET_SUSUT*.85 ? 'warn' : 'ok';

  set('susut-persen', p != null ? p.toFixed(2)+'%' : '—');
  set('kwh-beli',     data?.meter_utama    != null ? fmtNum(data.meter_utama)    : '—');
  set('kwh-jual',     data?.total_penyulang!= null ? fmtNum(data.total_penyulang): '—');
  set('susut-kwh',    data?.susut_kwh      != null ? fmtNum(data.susut_kwh)      : '—');

  const badge = document.getElementById('badge-susut');
  if (badge && p != null) {
    badge.textContent = status==='ok' ? '↓ Normal' : status==='warn' ? '⚠ Perhatian' : '↑ Melebihi';
    badge.className   = 'mc-badge ' +
      (status==='ok' ? 'mc-badge-up' : status==='warn' ? 'mc-badge-warn' : 'mc-badge-down');
  }

  // sparklines dari data year
  const susutPct = yearData.map(d => d.persentase_susut);
  const muVals   = yearData.map(d => d.meter_utama / 1000);
  const pyVals   = yearData.map(d => d.total_penyulang / 1000);
  const skVals   = yearData.map(d => d.susut_kwh);

  sparkLine('spark-susut-pct', susutPct, '#ef4444');
  sparkLine('spark-mu',        muVals,   '#4f7df4');
  sparkLine('spark-py',        pyVals,   '#8b5cf6');
  sparkLine('spark-susut-kwh', skVals,   '#f59e0b');

  // floating popup
  const last = yearData[yearData.length - 1];
  const prev = yearData[yearData.length - 2];
  if (last) {
    const d = new Date(last.tanggal);
    set('fp-bulan', MONTH_SHORT[d.getMonth()] + ' ' + d.getFullYear());
    set('fp-val',   last.persentase_susut.toFixed(2) + '%');
    if (prev) {
      const diff = last.persentase_susut - prev.persentase_susut;
      const el   = document.getElementById('fp-chg');
      if (el) {
        el.textContent = (diff >= 0 ? '↑ +' : '↓ ') + Math.abs(diff).toFixed(2) + '% dari ' + MONTH_SHORT[new Date(prev.tanggal).getMonth()];
        el.style.color = diff > 0 ? 'var(--red)' : 'var(--green)';
      }
    }
  }
}

// ─────────────────────────────────────
// SPARKLINE
// ─────────────────────────────────────
function sparkLine(canvasId, data, color) {
  if (sparkInstances[canvasId]) { sparkInstances[canvasId].destroy(); }
  const el = document.getElementById(canvasId);
  if (!el || !data.length) return;
  sparkInstances[canvasId] = new Chart(el, {
    type: 'line',
    data: {
      labels: data.map((_,i) => i),
      datasets: [{
        data, borderColor: color, borderWidth: 2,
        pointRadius: 0, tension: .4, fill: true,
        backgroundColor: color + '22',
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      animation: { duration: 400 }
    }
  });
}

// ─────────────────────────────────────
// MAIN CHART (Tren Susut)
// ─────────────────────────────────────
function renderMainChart(yearData, range) {
  const slice  = yearData.slice(-range);
  const labels = slice.map(d => {
    const dt = new Date(d.tanggal);
    return MONTH_SHORT[dt.getMonth()] + " '" + String(dt.getFullYear()).slice(-2);
  });
  const vals   = slice.map(d => d.persentase_susut);
  const target = Array(slice.length).fill(TARGET_SUSUT);

  if (mainChart) { mainChart.destroy(); }
  const el = document.getElementById('chart-susut');
  if (!el) return;

  mainChart = new Chart(el, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          data: vals, borderColor: '#4f7df4', borderWidth: 2.5,
          pointRadius: vals.map((_,i) => i === vals.length-1 ? 6 : 3),
          pointBackgroundColor: vals.map((v,i) =>
            i === vals.length-1 ? (v > TARGET_SUSUT ? '#ef4444' : '#4f7df4') : '#4f7df4'),
          pointBorderColor: '#fff', pointBorderWidth: 2,
          tension: .4, fill: true,
          backgroundColor: (ctx) => {
            const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 180);
            g.addColorStop(0, 'rgba(79,125,244,.12)');
            g.addColorStop(1, 'rgba(79,125,244,.0)');
            return g;
          },
        },
        {
          data: target, borderColor: '#ef444455', borderWidth: 1.5,
          borderDash: [5,4], pointRadius: 0, fill: false,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => c.datasetIndex === 0 ? 'Susut: ' + c.raw.toFixed(2) + '%' : null,
            filter: i => i.datasetIndex === 0
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 11, family: "'Sora',sans-serif" } } },
        y: {
          grid: { color: 'rgba(0,0,0,.04)' },
          ticks: { callback: v => v+'%', color: '#9ca3af', font: { size: 11, family: "'Sora',sans-serif" } },
          min: 0.5, max: Math.max(...vals, TARGET_SUSUT) + .4
        }
      }
    }
  });
}

// ─────────────────────────────────────
// kWh JUAL CHART
// ─────────────────────────────────────
function renderKwhJualChart(yearData) {
  const el = document.getElementById('chart-kwh-jual');
  if (!el) return;

  // Dummy distribusi kategori (akan diganti data real saat model TT/TM/TR tersedia)
  const seed = currentTahun * 7;
  const rng  = (i, base, sp) => Math.round(base + ((seed*(i+1)*3571)%sp));
  const labels = yearData.map(d => MONTH_SHORT[new Date(d.tanggal).getMonth()]);
  const tt = yearData.map((_,i) => rng(i, 12000, 16000));
  const tm = yearData.map((_,i) => rng(i, 22000, 20000));
  const tr = yearData.map((_,i) => rng(i, 34000, 22000));

  if (window._jualChart) window._jualChart.destroy();
  window._jualChart = new Chart(el, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'TT', data:tt, backgroundColor:'rgba(79,125,244,.85)', borderRadius:4, borderSkipped:false },
        { label:'TM', data:tm, backgroundColor:'rgba(16,185,129,.85)', borderRadius:4, borderSkipped:false },
        { label:'TR', data:tr, backgroundColor:'rgba(245,158,11,.85)', borderRadius:4, borderSkipped:false },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, barPercentage: .7, categoryPercentage: .7,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color:'#9ca3af', font:{ size:10, family:"'Sora',sans-serif" } } },
        y: { grid: { color:'rgba(0,0,0,.04)' }, ticks: { color:'#9ca3af', font:{ size:10, family:"'Sora',sans-serif" } } }
      }
    }
  });
}

// ─────────────────────────────────────
// DETAIL TABLE
// ─────────────────────────────────────
function renderDetailTable(data) {
  const tbody = document.querySelector('#table-detail tbody');
  const tfoot = document.querySelector('#table-detail tfoot');
  if (!tbody) return;

  tbody.innerHTML = '';
  let nOk=0, nWarn=0, nDng=0;
  let tmu=0, tpy=0, tsk=0;

  data.forEach(row => {
    const p = row.persentase_susut;
    const isDng = p > TARGET_SUSUT, isWrn = !isDng && p > TARGET_SUSUT*.85;
    if (isDng) nDng++; else if (isWrn) nWarn++; else nOk++;
    tmu += row.meter_utama; tpy += row.total_penyulang; tsk += row.susut_kwh;

    const cls   = isDng ? 'row-danger' : isWrn ? 'row-warn' : '';
    const badge = isDng ? `<span class="s-danger">Melebihi</span>`
                        : isWrn ? `<span class="s-warn">Perhatian</span>`
                        : `<span class="s-ok">Normal</span>`;
    const d = new Date(row.tanggal);
    tbody.insertAdjacentHTML('beforeend', `
      <tr class="${cls}">
        <td><strong>${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}</strong></td>
        <td class="tr mono">${fmtNum(row.meter_utama)}</td>
        <td class="tr mono">${fmtNum(row.total_penyulang)}</td>
        <td class="tr mono">${fmtNum(row.susut_kwh)}</td>
        <td class="tr mono">${p.toFixed(2)}%</td>
        <td>${badge}</td>
      </tr>`);
  });

  const pills = document.getElementById('status-pills');
  if (pills) pills.innerHTML = `
    <span class="s-ok">${nOk} Normal</span>
    <span class="s-warn">${nWarn} Perhatian</span>
    <span class="s-danger">${nDng} Melebihi</span>`;

  const tp = tmu ? (tsk/tmu*100) : 0;
  if (tfoot) tfoot.innerHTML = `
    <tr>
      <td><strong>Total / Rata-rata</strong></td>
      <td class="tr mono"><strong>${fmtNum(tmu)}</strong></td>
      <td class="tr mono"><strong>${fmtNum(tpy)}</strong></td>
      <td class="tr mono"><strong>${fmtNum(tsk)}</strong></td>
      <td class="tr mono"><strong>${tp.toFixed(2)}%</strong></td>
      <td></td>
    </tr>`;
}

// ─────────────────────────────────────
// LABELS
// ─────────────────────────────────────
function updatePeriodeLabels() {
  const sel = document.getElementById('periode');
  if (!sel) return;
  const label = sel.options[sel.selectedIndex].text + ' ' + currentTahun;
  ['label-periode-1','label-periode-2','label-periode-3'].forEach(id => set(id, label));
}

// ─────────────────────────────────────
// EXPORT CSV
// ─────────────────────────────────────
function exportCSV() {
  if (!allData.length) return;
  const rows = [['Bulan','Meter Utama (kWh)','Total Penyulang (kWh)','Susut (kWh)','Susut (%)']];
  getYearData().forEach(d => {
    const dt = new Date(d.tanggal);
    rows.push([MONTH_NAMES[dt.getMonth()]+' '+dt.getFullYear(),
               d.meter_utama, d.total_penyulang, d.susut_kwh, d.persentase_susut.toFixed(2)]);
  });
  const csv  = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `susut_${currentTahun}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────
// UTILS
// ─────────────────────────────────────
function fmtNum(n) { return new Intl.NumberFormat('id-ID').format(Math.round(n)); }
function set(id, val) { const el=document.getElementById(id); if(el) el.textContent=val; }

// ─────────────────────────────────────
// AUTO REFRESH
// ─────────────────────────────────────
setInterval(loadData, 300_000);