/* ═══════════════════════════════════════════════════════
   dashboard.js  v3 — Aplikasi Susut Energi
   Requires: Chart.js 4.x (loaded in base.html BEFORE this)
   API     : GET /api/dashboard-data?tahun=YYYY
             returns { data_bulanan:[...], total:{...} }
═══════════════════════════════════════════════════════ */

'use strict';

/* ── CONSTANTS ─────────────────────────────────────── */
const TARGET      = 1.5;          // % batas toleransi susut
const REFRESH_MS  = 300_000;      // auto-refresh 5 menit
const MO_FULL     = ['Januari','Februari','Maret','April','Mei','Juni',
                     'Juli','Agustus','September','Oktober','November','Desember'];
const MO_SHORT    = ['Jan','Feb','Mar','Apr','Mei','Jun',
                     'Jul','Ags','Sep','Okt','Nov','Des'];

/* ── STATE ─────────────────────────────────────────── */
let allData       = [];
let currentPeriode= 'mei';
let currentTahun  = new Date().getFullYear();

/* instance chart — disimpan agar bisa destroy sebelum re-render */
const charts = {};

/* ── BOOT ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Guard: pastikan Chart.js sudah load (di-include di base.html sebelum script ini)
  if (typeof Chart === 'undefined') {
    console.error('[dashboard.js] Chart.js belum load! Pastikan CDN ada di base.html.');
    return;
  }
  initTahunSelect();
  bindEvents();
  loadData();
  setInterval(loadData, REFRESH_MS);
});

/* expose rerenderCharts untuk dark-mode toggle di base.html */
window.rerenderCharts = () => {
  if (!allData.length) return;
  const yd = yearData();
  renderMainChart(yd, activeRange());
  renderJualChart(yd);
  renderSparklines(yd);
};

/* ── INIT TAHUN SELECT ─────────────────────────────── */
function initTahunSelect() {
  const sel = qid('tahun');
  if (!sel) return;
  for (let y = 2020; y <= 2030; y++) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    if (y === currentTahun) o.selected = true;
    sel.appendChild(o);
  }
}

/* ── EVENTS ────────────────────────────────────────── */
function bindEvents() {
  on('periode',   'change', e => { currentPeriode = e.target.value; updateDashboard(); });
  on('tahun',     'change', e => { currentTahun = +e.target.value; loadData(); });
  on('btn-reset', 'click',  () => {
    setVal('periode', 'mei'); setVal('tahun', String(new Date().getFullYear()));
    currentPeriode = 'mei'; currentTahun = new Date().getFullYear();
    loadData();
  });
  on('btn-export', 'click', exportCSV);

  /* range tabs */
  document.querySelectorAll('.range-tab').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.range-tab').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      renderMainChart(yearData(), activeRange());
    });
  });
}

/* ── LOAD DATA ─────────────────────────────────────── */
async function loadData() {
  try {
    const r = await fetch(`/api/dashboard-data?tahun=${currentTahun}`);
    if (!r.ok) throw new Error(r.statusText);
    const json = await r.json();
    allData = json.data_bulanan || [];
    setText('live-label', 'Live · ' + now());
    updateDashboard();
  } catch (err) {
    console.warn('API gagal, pakai demo data:', err.message);
    allData = demoData();
    setText('live-label', 'Demo');
    updateDashboard();
  }
}

function demoData() {
  return Array.from({ length: 12 }, (_, i) => {
    const mu = 160000 + Math.round(Math.sin(i * .7) * 18000 + 18000);
    const py = Math.round(mu * (1 - (.011 + Math.sin(i * 1.2) * .003 + .002)));
    return {
      tanggal: `${currentTahun}-${pad(i+1)}-01`,
      meter_utama: mu, total_penyulang: py,
      susut_kwh: mu - py,
      persentase_susut: +((mu - py) / mu * 100).toFixed(2)
    };
  });
}

/* ── MAIN UPDATE ───────────────────────────────────── */
function updateDashboard() {
  if (!allData.length) return;
  const yd  = yearData();
  const agg = periodeAgg(yd, currentPeriode);
  renderMetricCards(agg, yd);
  renderSparklines(yd);
  renderMainChart(yd, activeRange());
  renderJualChart(yd);
  renderDetailTable(yd);
  updatePeriodeLabels();
}

/* ── METRIC CARDS ──────────────────────────────────── */
function renderMetricCards(agg, yd) {
  const p = (agg != null && agg.persentase_susut != null) ? agg.persentase_susut : null;
  const s = p === null ? null : p > TARGET ? 'danger' : p > TARGET * .88 ? 'warn' : 'ok';

  setText('val-susut-pct',  p    != null ? p.toFixed(2) + '%'     : '—');
  setText('val-mu',         agg?.meter_utama    != null ? fmtN(agg.meter_utama)     : '—');
  setText('val-py',         agg?.total_penyulang!= null ? fmtN(agg.total_penyulang) : '—');
  setText('val-susut-kwh',  agg?.susut_kwh      != null ? fmtN(agg.susut_kwh)       : '—');

  const bd = qid('badge-susut');
  if (bd && s) {
    bd.textContent = s === 'ok' ? '✓ Normal' : s === 'warn' ? '⚠ Perhatian' : '↑ Melebihi';
    bd.className   = 'mc-badge';
    bd.style.background = s === 'ok' ? 'var(--green-dim)' : s === 'warn' ? 'var(--amber-dim)' : 'var(--red-dim)';
    bd.style.color      = s === 'ok' ? 'var(--green)'     : s === 'warn' ? 'var(--amber)'     : 'var(--red)';
  }

  /* badge MU — tren vs bulan sebelumnya */
  const last = yd[yd.length - 1], prev = yd[yd.length - 2];
  const bd2  = qid('badge-mu');
  if (bd2 && last && prev) {
    const d = ((last.meter_utama - prev.meter_utama) / prev.meter_utama * 100).toFixed(1);
    bd2.textContent = (d >= 0 ? '↑ ' : '↓ ') + Math.abs(d) + '%';
    bd2.style.background = d >= 0 ? 'var(--blue-dim)' : 'var(--red-dim)';
    bd2.style.color      = d >= 0 ? 'var(--blue)'     : 'var(--red)';
  }

  /* floating popup — safe null checks */
  if (last) {
    const dt = new Date(last.tanggal);
    setText('cp-bulan', MO_SHORT[dt.getMonth()] + ' ' + dt.getFullYear());
    setText('cp-val',   last.persentase_susut.toFixed(2) + '%');
    const cpDelta = qid('cp-delta');
    if (cpDelta) {
      if (prev && typeof prev.persentase_susut === 'number') {
        const d = last.persentase_susut - prev.persentase_susut;
        cpDelta.textContent = (d >= 0 ? '↑ +' : '↓ ') + Math.abs(d).toFixed(2) + '% dari ' + MO_SHORT[new Date(prev.tanggal).getMonth()];
        cpDelta.style.color = d > 0 ? 'var(--red)' : 'var(--green)';
      } else {
        cpDelta.textContent = 'Tidak ada data pembanding';
        cpDelta.style.color = 'var(--t3)';
      }
    }
  }
}

/* ── SPARKLINES ────────────────────────────────────── */
function renderSparklines(yd) {
  sparkline('spk-susut-pct', yd.map(d => d.persentase_susut), '#dc2626');
  sparkline('spk-mu',        yd.map(d => d.meter_utama / 1000),  '#2563eb');
  sparkline('spk-py',        yd.map(d => d.total_penyulang / 1000), '#16a34a');
  sparkline('spk-susut-kwh', yd.map(d => d.susut_kwh), '#d97706');
}

/* FIX: destroy existing instance sebelum buat baru */
function sparkline(id, data, color) {
  destroyChart(id);
  const el = qid(id);
  if (!el || !data.length) return;
  charts[id] = new Chart(el, {
    type: 'line',
    data: {
      labels: data.map((_,i) => i),
      datasets: [{
        data, borderColor: color, borderWidth: 1.8,
        pointRadius: 0, tension: .4, fill: true,
        backgroundColor: hexAlpha(color, .1),
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } }
    }
  });
}

/* ── MAIN CHART ────────────────────────────────────── */
function renderMainChart(yd, range) {
  destroyChart('chart-susut');
  const slice  = yd.slice(-range);
  if (!slice.length) return;
  const labels = slice.map(d => {
    const dt = new Date(d.tanggal);
    return MO_SHORT[dt.getMonth()] + " '" + String(dt.getFullYear()).slice(-2);
  });
  const vals   = slice.map(d => d.persentase_susut);
  const target = Array(slice.length).fill(TARGET);

  const el = qid('chart-susut');
  if (!el) return;

  charts['chart-susut'] = new Chart(el, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          data: vals,
          borderColor: '#2563eb', borderWidth: 2.5,
          pointRadius: vals.map((_, i) => i === vals.length - 1 ? 6 : 3),
          pointBackgroundColor: vals.map((v, i) =>
            i === vals.length - 1 ? (v > TARGET ? '#dc2626' : '#2563eb') : '#2563eb'),
          pointBorderColor: '#fff', pointBorderWidth: 2,
          tension: .4, fill: true,
          backgroundColor: (ctx) => {
            const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 180);
            g.addColorStop(0, 'rgba(37,99,235,.12)');
            g.addColorStop(1, 'rgba(37,99,235,.0)');
            return g;
          },
        },
        {
          data: target,
          borderColor: '#dc2626', borderDash: [5, 4],
          borderWidth: 1.5, pointRadius: 0, fill: false,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: item => item.datasetIndex === 0,
          callbacks: { label: c => 'Susut: ' + c.raw.toFixed(2) + '%' }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#9ca3af', font: { size: 11, family: "'Plus Jakarta Sans', sans-serif" }, maxRotation: 30 }
        },
        y: {
          grid: { color: isDark() ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)' },
          ticks: {
            callback: v => v + '%', color: '#9ca3af',
            font: { size: 11, family: "'Plus Jakarta Sans', sans-serif" }
          },
          min: Math.max(0, Math.min(...vals) - .3),
          max: Math.max(...vals, TARGET) + .35
        }
      }
    }
  });
}

/* ── kWh JUAL CHART ────────────────────────────────── */
function renderJualChart(yd) {
  destroyChart('chart-jual');
  const el = qid('chart-jual');
  if (!el || !yd.length) return;

  /* data dummy — akan diganti data TT/TM/TR real */
  const seed = currentTahun * 31;
  const rng  = (i, base, sp) => Math.round(base + ((seed * (i+1) * 4001) % sp));
  const labels = yd.map(d => MO_SHORT[new Date(d.tanggal).getMonth()]);
  const tt = yd.map((_,i) => rng(i, 11000, 14000));
  const tm = yd.map((_,i) => rng(i, 22000, 18000));
  const tr = yd.map((_,i) => rng(i, 33000, 20000));

  charts['chart-jual'] = new Chart(el, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'TT', data:tt, backgroundColor:'rgba(37,99,235,.82)',  borderRadius:4, borderSkipped:false },
        { label:'TM', data:tm, backgroundColor:'rgba(22,163,74,.82)',  borderRadius:4, borderSkipped:false },
        { label:'TR', data:tr, backgroundColor:'rgba(217,119,6,.82)', borderRadius:4, borderSkipped:false },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      barPercentage: .7, categoryPercentage: .75,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color:'#9ca3af', font:{ size:10 } } },
        y: {
          grid: { color: isDark() ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)' },
          ticks: { color:'#9ca3af', font:{ size:10 } }
        }
      }
    }
  });
}

/* ── DETAIL TABLE ──────────────────────────────────── */
function renderDetailTable(yd) {
  const tbody = document.querySelector('#tbl-detail tbody');
  const tfoot = document.querySelector('#tbl-detail tfoot');
  if (!tbody) return;

  tbody.innerHTML = '';
  let nOk=0, nWn=0, nDn=0, tmu=0, tpy=0, tsk=0;

  yd.forEach(row => {
    const p   = row.persentase_susut;
    const isDn = p > TARGET, isWn = !isDn && p > TARGET * .87;
    if (isDn) nDn++; else if (isWn) nWn++; else nOk++;
    tmu += row.meter_utama; tpy += row.total_penyulang; tsk += row.susut_kwh;

    const cls   = isDn ? 'row-danger' : isWn ? 'row-warn' : '';
    const badge = isDn
      ? `<span class="badge badge-danger">↑ Melebihi</span>`
      : isWn
        ? `<span class="badge badge-warn">⚠ Perhatian</span>`
        : `<span class="badge badge-ok">✓ Normal</span>`;

    const dt = new Date(row.tanggal);
    tbody.insertAdjacentHTML('beforeend', `
      <tr class="${cls}">
        <td><strong>${MO_SHORT[dt.getMonth()]} ${dt.getFullYear()}</strong></td>
        <td class="tr mono">${fmtN(row.meter_utama)}</td>
        <td class="tr mono">${fmtN(row.total_penyulang)}</td>
        <td class="tr mono">${fmtN(row.susut_kwh)}</td>
        <td class="tr mono">${p.toFixed(2)}%</td>
        <td>${badge}</td>
      </tr>`);
  });

  const pills = qid('status-pills');
  if (pills) pills.innerHTML = `
    <span class="badge badge-ok">${nOk} Normal</span>
    <span class="badge badge-warn">${nWn} Perhatian</span>
    <span class="badge badge-danger">${nDn} Melebihi</span>`;

  if (tfoot) {
    const tp = tmu ? (tsk / tmu * 100) : 0;
    tfoot.innerHTML = `
      <tr>
        <td><strong>Total</strong></td>
        <td class="tr mono"><strong>${fmtN(tmu)}</strong></td>
        <td class="tr mono"><strong>${fmtN(tpy)}</strong></td>
        <td class="tr mono"><strong>${fmtN(tsk)}</strong></td>
        <td class="tr mono"><strong>${tp.toFixed(2)}%</strong></td>
        <td></td>
      </tr>`;
  }
}

/* ── EXPORT CSV ────────────────────────────────────── */
function exportCSV() {
  if (!allData.length) return;
  const rows = [['Bulan','Meter Utama (kWh)','Total Penyulang (kWh)','Susut (kWh)','Susut (%)']];
  yearData().forEach(d => {
    const dt = new Date(d.tanggal);
    rows.push([MO_FULL[dt.getMonth()] + ' ' + dt.getFullYear(),
               d.meter_utama, d.total_penyulang, d.susut_kwh, d.persentase_susut.toFixed(2)]);
  });
  const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href:url, download:`susut_${currentTahun}.csv` });
  a.click(); URL.revokeObjectURL(url);
}

/* ── HELPERS ───────────────────────────────────────── */
function yearData() {
  return allData.filter(d => new Date(d.tanggal).getFullYear() === currentTahun);
}

function periodeAgg(yd, periode) {
  const names = MO_FULL.map(m => m.toLowerCase());
  if (names.includes(periode)) {
    const idx = names.indexOf(periode);
    return yd.find(d => new Date(d.tanggal).getMonth() === idx) || null;
  }
  const TW = { tw1:[0,1,2], tw2:[3,4,5], tw3:[6,7,8], tw4:[9,10,11] };
  if (TW[periode]) return aggArr(yd.filter(d => TW[periode].includes(new Date(d.tanggal).getMonth())));
  if (periode === 'kumulatif') return aggArr(yd);
  return null;
}

function aggArr(arr) {
  if (!arr.length) return null;
  const mu = arr.reduce((s,d) => s + d.meter_utama, 0);
  const py = arr.reduce((s,d) => s + d.total_penyulang, 0);
  const sk = mu - py;
  return { meter_utama:mu, total_penyulang:py, susut_kwh:sk, persentase_susut: mu ? sk/mu*100 : 0 };
}

function updatePeriodeLabels() {
  const sel = qid('periode');
  if (!sel) return;
  const lbl = sel.options[sel.selectedIndex].text + ' ' + currentTahun;
  ['lbl-periode-1','lbl-periode-2','lbl-periode-3'].forEach(id => setText(id, lbl));
}

function activeRange() {
  return +( document.querySelector('.range-tab.active')?.dataset.range || 6 );
}

function destroyChart(id) {
  if (charts[id]) { try { charts[id].destroy(); } catch(_) {} delete charts[id]; }
}

function isDark() { return document.body.classList.contains('dark'); }

/* micro-utils */
const qid    = id => document.getElementById(id);
const setText= (id, v) => { const e=qid(id); if(e) e.textContent=v; };
const setVal = (id, v) => { const e=qid(id); if(e) e.value=v; };
const on     = (id, ev, fn) => qid(id)?.addEventListener(ev, fn);
const pad    = n => String(n).padStart(2,'0');
const now    = () => new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
const fmtN   = n  => new Intl.NumberFormat('id-ID').format(Math.round(n));
const hexAlpha = (hex, a) => {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
};