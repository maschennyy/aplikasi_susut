'use strict';

let currentGardu = 'GI Cawang';
let currentTahun = 2026;

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun', 'Jul','Ags','Sep','Okt','Nov','Des'];

(function initTahun() {
  const sel = document.getElementById('filter-tahun');
  for (let y = 2020; y <= 2030; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === currentTahun) opt.selected = true;
    sel.appendChild(opt);
  }
})();

document.getElementById('btn-terapkan').addEventListener('click', () => {
  currentGardu = document.getElementById('filter-gardu').value.trim() || 'GI Cawang';
  currentTahun = parseInt(document.getElementById('filter-tahun').value);
  loadData();
});

document.getElementById('filter-gardu').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    currentGardu = e.target.value.trim() || 'GI Cawang';
    currentTahun = parseInt(document.getElementById('filter-tahun').value);
    loadData();
  }
});

async function loadData() {
  try {
    const url = `/api/penyulang-data?gardu=${encodeURIComponent(currentGardu)}&tahun=${currentTahun}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(resp.statusText);
    const json = await resp.json();
    
    renderTable(json);
    updateUI(json);
    
    document.getElementById('last-update-text').textContent =
      'Update: ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } catch (err) {
    console.error('Gagal memuat data penyulang:', err);
  }
}

function renderTable(data) {
  const tbody = document.querySelector('#table-penyulang tbody');
  tbody.innerHTML = '';
  
  if (!data.penyulang.length) {
    tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:2rem;">Tidak ada data</td></tr>`;
    return;
  }
  
  data.penyulang.forEach((p, i) => {
    let html = `<tr>`;
    html += `<td class="sticky-col">${p.nama}</td>`;
    
    p.bulanan.forEach(val => {
      html += `<td class="text-right text-mono">${fmtNum(val)}</td>`;
    });
    
    html += `<td class="text-right text-mono sticky-col-right"><strong>${fmtNum(p.total)}</strong></td>`;
    html += `</tr>`;
    tbody.insertAdjacentHTML('beforeend', html);
  });
  
  const totalPerBulan = Array(12).fill(0);
  let grandTotal = 0;
  data.penyulang.forEach(p => {
    p.bulanan.forEach((val, i) => { totalPerBulan[i] += val; });
    grandTotal += p.total;
  });
  
  let totalRow = `<tr style="font-weight:700;background:var(--c-surface-2);">`;
  totalRow += `<td class="sticky-col" style="background:var(--c-surface-2);">TOTAL</td>`;
  totalPerBulan.forEach(val => {
    totalRow += `<td class="text-right text-mono">${fmtNum(val)}</td>`;
  });
  totalRow += `<td class="text-right text-mono sticky-col-right" style="background:var(--c-surface-2);">${fmtNum(grandTotal)}</td>`;
  totalRow += `</tr>`;
  tbody.insertAdjacentHTML('beforeend', totalRow);
}

function updateUI(data) {
  document.getElementById('tabel-title').textContent = `Data Pemakaian – ${data.gardu} ${data.tahun}`;
  document.getElementById('info-jumlah').textContent = `${data.penyulang.length} penyulang`;
}

function fmtNum(n) {
  return new Intl.NumberFormat('id-ID').format(Math.round(n));
}

document.addEventListener('DOMContentLoaded', loadData);