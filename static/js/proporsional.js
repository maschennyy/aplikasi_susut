'use strict';

const PROP_MONTH_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
const PROP_MONTH_FULL = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const PROP_COLORS = ['#1769e0', '#139a57', '#c77800', '#6d5dfc', '#d03939', '#0694a2'];

const propState = {
  gi: [],
  trafos: [],
  feeders: [],
  meters: [],
  readings: [],
  groups: [],
  trafosSummary: [],
  rows: [],
  totals: {},
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  charts: {},
  autoPeriodResolved: false,
};

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof Chart === 'undefined') {
    setLive('Chart error');
    return;
  }
  initFilters();
  bindEvents();
  await loadMaster();
  await loadProporsional();
});

function initFilters() {
  const year = qid('filter-prop-tahun');
  const month = qid('filter-prop-bulan');
  for (let y = 2020; y <= 2030; y++) {
    const opt = new Option(y, y);
    if (y === propState.year) opt.selected = true;
    year.appendChild(opt);
  }
  PROP_MONTH_FULL.forEach((name, idx) => {
    const opt = new Option(name, idx + 1);
    if (idx === propState.month) opt.selected = true;
    month.appendChild(opt);
  });
}

function bindEvents() {
  on('btn-terapkan-prop', 'click', loadProporsional);
  on('btn-refresh-prop', 'click', loadProporsional);
  on('btn-export-prop', 'click', exportCSV);
  on('filter-prop-gi', 'change', async () => {
    propState.autoPeriodResolved = false;
    await loadGIChildren();
    await loadProporsional();
  });
  window.rerenderCharts = () => renderCharts();
  window.rerenderProporsionalCharts = () => renderCharts();
}

async function loadMaster() {
  setLive('Memuat master');
  propState.gi = await getJSON('/api/gardu-induk', []);
  const select = qid('filter-prop-gi');
  select.innerHTML = '';
  propState.gi.forEach((gi, idx) => {
    const opt = new Option(`${gi.kode_gi} - ${gi.nama_gi}`, gi.id);
    if (idx === 0) opt.selected = true;
    select.appendChild(opt);
  });
  await loadGIChildren();
}

async function loadGIChildren() {
  const giId = qid('filter-prop-gi').value;
  if (!giId) {
    propState.trafos = [];
    propState.feeders = [];
    return;
  }
  const [trafos, feeders] = await Promise.all([
    getJSON(`/api/trafo?gi_id=${encodeURIComponent(giId)}`, []),
    getJSON(`/api/penyulang?gi_id=${encodeURIComponent(giId)}`, []),
  ]);
  propState.trafos = trafos;
  propState.feeders = feeders;
}

async function loadProporsional() {
  const giId = qid('filter-prop-gi').value;
  propState.year = Number(qid('filter-prop-tahun').value);
  propState.month = Number(qid('filter-prop-bulan').value) - 1;
  if (!giId) return;

  setLive('Menghitung');
  await loadGIChildren();
  const bulan = `${propState.year}-${pad(propState.month + 1)}`;
  const [meters, readings] = await Promise.all([
    getJSON(`/api/meter-data?gi_id=${encodeURIComponent(giId)}&bulan=${bulan}`, []),
    getJSON(`/api/feeder-data?gi_id=${encodeURIComponent(giId)}&bulan=${bulan}`, []),
  ]);
  if (!propState.autoPeriodResolved && !meters.length && !readings.length) {
    propState.autoPeriodResolved = true;
    const fallback = await findAvailablePeriod(giId);
    if (fallback) {
      propState.year = fallback.year;
      propState.month = fallback.month;
      qid('filter-prop-tahun').value = String(fallback.year);
      qid('filter-prop-bulan').value = String(fallback.month + 1);
      return loadProporsional();
    }
  }
  propState.meters = meters;
  propState.readings = readings;
  calculate();
  renderPage();
  setLive('Update ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
}

async function findAvailablePeriod(giId) {
  const candidates = [];
  for (let year = propState.year; year >= propState.year - 2; year--) {
    for (let month = 11; month >= 0; month--) {
      candidates.push({ year, month });
    }
  }
  for (const item of candidates) {
    const bulan = `${item.year}-${pad(item.month + 1)}`;
    const [meters, readings] = await Promise.all([
      getJSON(`/api/meter-data?gi_id=${encodeURIComponent(giId)}&bulan=${bulan}`, []),
      getJSON(`/api/feeder-data?gi_id=${encodeURIComponent(giId)}&bulan=${bulan}`, []),
    ]);
    if (meters.length || readings.length) return item;
  }
  return null;
}

function calculate() {
  const feederMap = new Map(propState.feeders.map(row => [Number(row.id), row]));
  const trafoMap = new Map(propState.trafos.map(row => [Number(row.id), row]));

  const mu = sumRegisters(propState.meters, 'mu_kwh_');
  const baca = sumRegisters(propState.readings, 'kwh_');
  const deviasi = {
    wbp: mu.wbp - baca.wbp,
    lwbp1: mu.lwbp1 - baca.lwbp1,
    lwbp2: mu.lwbp2 - baca.lwbp2,
    total: mu.total - baca.total,
  };

  const rows = propState.readings.map((reading, idx) => {
    const feeder = feederMap.get(Number(reading.penyulang_id)) || {};
    const trafo = trafoMap.get(Number(reading.trafo_id)) || {};
    const source = {
      wbp: num(reading.kwh_wbp),
      lwbp1: num(reading.kwh_lwbp1),
      lwbp2: num(reading.kwh_lwbp2),
      total: num(reading.kwh_total),
    };
    const prop = {
      wbp: source.wbp + allocate(deviasi.wbp, source.wbp, baca.wbp, source.total, baca.total),
      lwbp1: source.lwbp1 + allocate(deviasi.lwbp1, source.lwbp1, baca.lwbp1, source.total, baca.total),
      lwbp2: source.lwbp2 + allocate(deviasi.lwbp2, source.lwbp2, baca.lwbp2, source.total, baca.total),
    };
    prop.total = prop.wbp + prop.lwbp1 + prop.lwbp2;

    const group = resolveGroup(feeder, trafo);
    return {
      no: idx + 1,
      id: reading.id,
      penyulangId: reading.penyulang_id,
      trafoId: reading.trafo_id,
      kode: reading.kode_penyulang || feeder.kode_penyulang || '-',
      nama: reading.nama_penyulang || feeder.nama_penyulang || 'Penyulang',
      trafoKode: trafo.kode_trafo || `TRF-${reading.trafo_id || '-'}`,
      trafoNama: trafo.nama_trafo || 'Trafo',
      jenis: feeder.jenis || 'REGULAR',
      group,
      exCabang: group.exCabang,
      area: group.name,
      faktor: num(reading.faktor_kali) || 1,
      source,
      prop,
      deviasi: prop.total - source.total,
      share: baca.total ? (source.total / baca.total) * 100 : 0,
    };
  }).sort((a, b) => a.group.order - b.group.order || a.trafoKode.localeCompare(b.trafoKode) || a.kode.localeCompare(b.kode));

  propState.rows = rows;
  propState.groups = summarizeGroups(rows);
  propState.trafosSummary = summarizeTrafos(rows, propState.meters, trafoMap);
  propState.totals = { mu, baca, deviasi, propTotal: sumRows(rows, 'prop') };
}

function resolveGroup(feeder, trafo) {
  const jenis = String(feeder.jenis || '').toUpperCase();
  if (jenis.includes('INTER')) {
    return { key: 'eksternal', name: 'Area / UP3 Lain', exCabang: 'EXIM', order: 2, tone: 'amber' };
  }
  const area = inferArea(feeder.nama_penyulang || feeder.kode_penyulang || '');
  if (area) return { key: area.key, name: area.name, exCabang: area.exCabang, order: area.order, tone: area.tone };
  return {
    key: `trafo-${trafo.id || feeder.trafo_id || 'x'}`,
    name: trafo.kode_trafo ? `Penyulang ${trafo.kode_trafo}` : 'Penyulang GI',
    exCabang: '-',
    order: 1,
    tone: 'blue',
  };
}

function inferArea(label) {
  const text = String(label).toUpperCase();
  const rules = [
    { keys: ['CIKOKOL', 'CKK'], key: 'cikokol', name: 'Area Cikokol', exCabang: 'CKK', order: 3, tone: 'green' },
    { keys: ['MELAYU', 'POSKO'], key: 'posko-melayu', name: 'Posko Melayu', exCabang: 'TLG', order: 4, tone: 'violet' },
    { keys: ['TELUK', 'TNG', 'TANGERANG'], key: 'teluk-naga', name: 'Area Teluk Naga', exCabang: 'TNG', order: 1, tone: 'blue' },
  ];
  return rules.find(rule => rule.keys.some(key => text.includes(key)));
}

function summarizeGroups(rows) {
  const map = new Map();
  rows.forEach(row => {
    if (!map.has(row.group.key)) {
      map.set(row.group.key, {
        ...row.group,
        count: 0,
        baca: zeroReg(),
        prop: zeroReg(),
        deviasi: 0,
      });
    }
    const item = map.get(row.group.key);
    item.count += 1;
    addReg(item.baca, row.source);
    addReg(item.prop, row.prop);
    item.deviasi += row.deviasi;
  });
  return [...map.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function summarizeTrafos(rows, meterRows, trafoMap) {
  const map = new Map();
  propState.trafos.forEach(trafo => {
    map.set(Number(trafo.id), {
      id: trafo.id,
      kode: trafo.kode_trafo,
      nama: trafo.nama_trafo,
      mu: zeroReg(),
      baca: zeroReg(),
      prop: zeroReg(),
      deviasi: 0,
      count: 0,
    });
  });
  meterRows.forEach(row => {
    ensureTrafoSummary(map, Number(row.trafo_id), trafoMap);
    addReg(map.get(Number(row.trafo_id)).mu, {
      wbp: num(row.mu_kwh_wbp),
      lwbp1: num(row.mu_kwh_lwbp1),
      lwbp2: num(row.mu_kwh_lwbp2),
      total: num(row.mu_kwh_total),
    });
  });
  rows.forEach(row => {
    ensureTrafoSummary(map, Number(row.trafoId), trafoMap);
    const item = map.get(Number(row.trafoId));
    item.count += 1;
    addReg(item.baca, row.source);
    addReg(item.prop, row.prop);
    item.deviasi += row.deviasi;
  });
  return [...map.values()].sort((a, b) => a.kode.localeCompare(b.kode));
}

function ensureTrafoSummary(map, id, trafoMap) {
  if (map.has(id)) return;
  const trafo = trafoMap.get(id) || {};
  map.set(id, {
    id,
    kode: trafo.kode_trafo || `TRF-${id || '-'}`,
    nama: trafo.nama_trafo || 'Trafo',
    mu: zeroReg(),
    baca: zeroReg(),
    prop: zeroReg(),
    deviasi: 0,
    count: 0,
  });
}

function renderPage() {
  renderMetrics();
  renderGroups();
  renderCharts();
  renderTrafoTable();
  renderDetailTable();
}

function renderMetrics() {
  const totals = propState.totals;
  const pct = totals.mu.total ? (totals.deviasi.total / totals.mu.total) * 100 : 0;
  setText('prop-mu-total', fmtNum(totals.mu.total));
  setText('prop-feeder-total', fmtNum(totals.baca.total));
  setText('prop-deviasi-total', fmtNum(totals.deviasi.total));
  setText('prop-deviasi-pct', `${pct.toFixed(2)}%`);
  setText('prop-scope', selectedGIText());
  setText('prop-period', `${PROP_MONTH_FULL[propState.month]} ${propState.year}`);
  setText('prop-trafo-caption', `${selectedGIText()} - ${PROP_MONTH_FULL[propState.month]} ${propState.year}`);
  setText('prop-table-caption', 'Alokasi deviasi MU ke penyulang berdasarkan porsi kWh hasil baca');

  const pills = qid('prop-summary-pills');
  if (pills) {
    pills.innerHTML = `
      <span class="badge badge-ok">${propState.rows.length} penyulang</span>
      <span class="badge badge-warn">${propState.groups.length} kelompok</span>
      <span class="badge badge-danger">${fmtNum(totals.deviasi.total)} kWh deviasi</span>`;
  }
}

function renderGroups() {
  const grid = qid('prop-group-grid');
  if (!grid) return;
  if (!propState.groups.length) {
    grid.innerHTML = '<div class="empty-state"><i class="ti ti-info-circle" aria-hidden="true"></i><div><strong>Belum ada data penyulang</strong><span>Data hasil baca belum tersedia untuk periode ini.</span></div></div>';
    return;
  }

  grid.innerHTML = propState.groups.map((group, idx) => {
    const share = propState.totals.propTotal.total ? (group.prop.total / propState.totals.propTotal.total) * 100 : 0;
    return `
      <article class="trafo-card prop-group-card" style="--accent:${PROP_COLORS[idx % PROP_COLORS.length]}">
        <div class="trafo-card-head">
          <div>
            <span>${escapeHTML(group.exCabang)}</span>
            <strong>${escapeHTML(group.name)}</strong>
          </div>
          <i class="ti ti-chart-pie" aria-hidden="true"></i>
        </div>
        <div class="trafo-card-value">${fmtNum(group.prop.total)}</div>
        <div class="trafo-card-meta">
          <span>${share.toFixed(1)}% porsi</span>
          <span class="badge ${badgeByDev(group.deviasi)}">${fmtNum(group.deviasi)}</span>
        </div>
        <div class="trafo-card-foot">${group.count} penyulang, hasil baca ${fmtNum(group.baca.total)}</div>
      </article>`;
  }).join('');
}

function renderCharts() {
  destroyChart('chart-prop-group');
  destroyChart('chart-prop-share');

  const bar = qid('chart-prop-group');
  if (bar) {
    propState.charts['chart-prop-group'] = new Chart(bar, {
      type: 'bar',
      data: {
        labels: propState.groups.map(g => g.name),
        datasets: [
          {
            label: 'Hasil Baca',
            data: propState.groups.map(g => g.baca.total),
            backgroundColor: 'rgba(19, 154, 87, .72)',
            borderRadius: 7,
            borderSkipped: false,
          },
          {
            label: 'Proporsional',
            data: propState.groups.map(g => g.prop.total),
            backgroundColor: 'rgba(23, 105, 224, .78)',
            borderRadius: 7,
            borderSkipped: false,
          },
        ]
      },
      options: chartOptions(value => fmtCompact(value), true)
    });
  }

  const doughnut = qid('chart-prop-share');
  if (doughnut) {
    propState.charts['chart-prop-share'] = new Chart(doughnut, {
      type: 'doughnut',
      data: {
        labels: propState.groups.map(g => g.name),
        datasets: [{
          data: propState.groups.map(g => Math.abs(g.deviasi)),
          backgroundColor: propState.groups.map((_, idx) => PROP_COLORS[idx % PROP_COLORS.length]),
          borderColor: chartSurface(),
          borderWidth: 4,
          hoverOffset: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { position: 'bottom', labels: { color: tickColor(), boxWidth: 10, boxHeight: 10 } },
          tooltip: { callbacks: { label: item => `${item.label}: ${fmtNum(item.raw)} kWh` } },
        },
      }
    });
  }
}

function renderTrafoTable() {
  const tbody = document.querySelector('#table-prop-trafo tbody');
  if (!tbody) return;
  if (!propState.trafosSummary.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Tidak ada data trafo untuk filter ini.</td></tr>';
    return;
  }

  tbody.innerHTML = propState.trafosSummary.map(item => {
    const share = propState.totals.baca.total ? (item.baca.total / propState.totals.baca.total) * 100 : 0;
    const gap = item.mu.total - item.baca.total;
    return `
      <tr>
        <td>
          <strong>${escapeHTML(item.kode)}</strong>
          <span class="subtext">${escapeHTML(item.nama)} · ${item.count} penyulang</span>
        </td>
        <td class="tr mono">${fmtNum(item.mu.total)}</td>
        <td class="tr mono">${fmtNum(item.baca.total)}</td>
        <td class="tr mono">${fmtNum(gap)}</td>
        <td class="tr mono"><strong>${fmtNum(item.prop.total)}</strong></td>
        <td class="tr mono">${share.toFixed(2)}%</td>
      </tr>`;
  }).join('');
}

function renderDetailTable() {
  const tbody = document.querySelector('#table-prop tbody');
  if (!tbody) return;
  if (!propState.rows.length) {
    tbody.innerHTML = '<tr><td colspan="15" class="empty-cell">Tidak ada data penyulang untuk filter ini.</td></tr>';
    setFooters(zeroReg(), zeroReg(), 0);
    return;
  }

  const fragments = [];
  let currentGroup = '';
  let groupNo = 0;
  propState.rows.forEach((row, idx) => {
    if (row.group.key !== currentGroup) {
      currentGroup = row.group.key;
      groupNo += 1;
      const group = propState.groups.find(item => item.key === currentGroup);
      fragments.push(`
        <tr class="prop-group-row">
          <td colspan="5">${roman(groupNo)}. ${escapeHTML(group?.name || row.group.name)}</td>
          <td class="tr mono">${fmtNum(group?.baca.wbp)}</td>
          <td class="tr mono">${fmtNum(group?.baca.lwbp1)}</td>
          <td class="tr mono">${fmtNum(group?.baca.lwbp2)}</td>
          <td class="tr mono">${fmtNum(group?.baca.total)}</td>
          <td class="tr mono">${fmtNum(group?.prop.wbp)}</td>
          <td class="tr mono">${fmtNum(group?.prop.lwbp1)}</td>
          <td class="tr mono">${fmtNum(group?.prop.lwbp2)}</td>
          <td class="tr mono">${fmtNum(group?.prop.total)}</td>
          <td class="tr mono">${fmtNum(group?.deviasi)}</td>
          <td></td>
        </tr>`);
    }
    fragments.push(`
      <tr class="${Math.abs(row.deviasi) > 100000 ? 'row-warn' : ''}">
        <td class="mono">${idx + 1}</td>
        <td>
          <strong>${escapeHTML(row.nama)}</strong>
          <span class="subtext">${escapeHTML(row.kode)} · ${escapeHTML(row.trafoKode)}</span>
        </td>
        <td>${escapeHTML(row.exCabang)}</td>
        <td>${escapeHTML(row.area)}</td>
        <td class="tr mono">${fmtNum(row.faktor)}</td>
        <td class="tr mono">${fmtNum(row.source.wbp)}</td>
        <td class="tr mono">${fmtNum(row.source.lwbp1)}</td>
        <td class="tr mono">${fmtNum(row.source.lwbp2)}</td>
        <td class="tr mono">${fmtNum(row.source.total)}</td>
        <td class="tr mono">${fmtNum(row.prop.wbp)}</td>
        <td class="tr mono">${fmtNum(row.prop.lwbp1)}</td>
        <td class="tr mono">${fmtNum(row.prop.lwbp2)}</td>
        <td class="tr mono"><strong>${fmtNum(row.prop.total)}</strong></td>
        <td class="tr mono">${fmtNum(row.deviasi)}</td>
        <td><span class="badge ${badgeByDev(row.deviasi)}">${row.share.toFixed(1)}%</span></td>
      </tr>`);
  });
  tbody.innerHTML = fragments.join('');
  setFooters(propState.totals.baca, propState.totals.propTotal, propState.totals.deviasi.total);
}

function setFooters(baca, prop, deviasi) {
  setText('prop-ft-wbp', fmtNum(baca.wbp));
  setText('prop-ft-lwbp1', fmtNum(baca.lwbp1));
  setText('prop-ft-lwbp2', fmtNum(baca.lwbp2));
  setText('prop-ft-baca', fmtNum(baca.total));
  setText('prop-ft-pwbp', fmtNum(prop.wbp));
  setText('prop-ft-plwbp1', fmtNum(prop.lwbp1));
  setText('prop-ft-plwbp2', fmtNum(prop.lwbp2));
  setText('prop-ft-prop', fmtNum(prop.total));
  setText('prop-ft-dev', fmtNum(deviasi));
}

function exportCSV() {
  const rows = [[
    'No','Penyulang','Kode','Trafo','Ex Cabang','Area','Faktor',
    'WBP Baca','LWBP1 Baca','LWBP2 Baca','Total Baca',
    'WBP Prop','LWBP1 Prop','LWBP2 Prop','Total Prop','Deviasi','Porsi %'
  ]];
  propState.rows.forEach((row, idx) => {
    rows.push([
      idx + 1, row.nama, row.kode, row.trafoKode, row.exCabang, row.area, row.faktor,
      Math.round(row.source.wbp), Math.round(row.source.lwbp1), Math.round(row.source.lwbp2), Math.round(row.source.total),
      Math.round(row.prop.wbp), Math.round(row.prop.lwbp1), Math.round(row.prop.lwbp2), Math.round(row.prop.total),
      Math.round(row.deviasi), row.share.toFixed(2),
    ]);
  });
  const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), {
    href: url,
    download: `proporsional_${propState.year}_${pad(propState.month + 1)}.csv`,
  });
  link.click();
  URL.revokeObjectURL(url);
}

function sumRegisters(rows, prefix) {
  return rows.reduce((acc, row) => {
    acc.wbp += num(row[`${prefix}wbp`]);
    acc.lwbp1 += num(row[`${prefix}lwbp1`]);
    acc.lwbp2 += num(row[`${prefix}lwbp2`]);
    acc.total += num(row[`${prefix}total`]);
    return acc;
  }, zeroReg());
}

function sumRows(rows, key) {
  return rows.reduce((acc, row) => {
    addReg(acc, row[key]);
    return acc;
  }, zeroReg());
}

function zeroReg() {
  return { wbp: 0, lwbp1: 0, lwbp2: 0, total: 0 };
}

function addReg(target, source) {
  target.wbp += num(source.wbp);
  target.lwbp1 += num(source.lwbp1);
  target.lwbp2 += num(source.lwbp2);
  target.total += num(source.total);
}

function allocate(deviasi, registerValue, registerTotal, rowTotal, grandTotal) {
  const base = registerTotal > 0 ? registerValue / registerTotal : (grandTotal > 0 ? rowTotal / grandTotal : 0);
  return deviasi * base;
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

function chartOptions(tickFormatter, legend) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: Boolean(legend), labels: { color: tickColor(), boxWidth: 10, boxHeight: 10 } },
      tooltip: { callbacks: { label: item => `${item.dataset.label}: ${fmtNum(item.raw)} kWh` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: tickColor() } },
      y: { grid: { color: gridColor() }, ticks: { color: tickColor(), callback: tickFormatter } },
    },
  };
}

function badgeByDev(value) {
  const abs = Math.abs(num(value));
  if (abs > 100000) return 'badge-danger';
  if (abs > 25000) return 'badge-warn';
  return 'badge-ok';
}

function roman(numVal) {
  const values = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  return values[numVal] || String(numVal);
}

function selectedGIText() {
  const select = qid('filter-prop-gi');
  return select?.options[select.selectedIndex]?.textContent || '-';
}

function destroyChart(id) {
  if (propState.charts[id]) {
    propState.charts[id].destroy();
    delete propState.charts[id];
  }
}

function chartSurface() {
  return document.documentElement.classList.contains('theme-dark') ? '#262626' : '#ffffff';
}

function tickColor() {
  return document.documentElement.classList.contains('theme-dark') ? '#b8bec8' : '#667085';
}

function gridColor() {
  return document.documentElement.classList.contains('theme-dark') ? 'rgba(255,255,255,.07)' : 'rgba(15,23,42,.06)';
}

function setLive(text) { setText('prop-live', text); }
function qid(id) { return document.getElementById(id); }
function on(id, event, fn) { qid(id)?.addEventListener(event, fn); }
function setText(id, value) { const el = qid(id); if (el) el.textContent = value; }
function pad(n) { return String(n).padStart(2, '0'); }
function num(value) { return Number(value || 0); }
function fmtNum(value) { return new Intl.NumberFormat('id-ID').format(Math.round(num(value))); }
function fmtCompact(value) {
  return new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(num(value));
}
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}
