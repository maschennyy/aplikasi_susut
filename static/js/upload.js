'use strict';

let lastAnalysis = null;

document.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  const monthInput = qid('nkwh-bulan');
  if (monthInput) monthInput.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

  on('btn-analyze-nkwh', 'click', () => submitNkwh('analyze'));
  on('btn-import-nkwh', 'click', () => submitNkwh('import'));
});

async function submitNkwh(mode) {
  const form = qid('form-nkwh-upload');
  const fileInput = qid('nkwh-file');
  if (!fileInput?.files.length) {
    setResult('Pilih workbook NKWh terlebih dahulu.', 'warning');
    return;
  }

  const data = new FormData(form);
  data.set('import_exim', qid('nkwh-import-exim')?.checked ? '1' : '0');
  const endpoint = mode === 'import' ? '/api/nkwh/import' : '/api/nkwh/analyze';
  setLive(mode === 'import' ? 'Import' : 'Analisa');
  setResult(mode === 'import' ? 'Mengimport data NKWh...' : 'Menganalisa workbook...');

  try {
    const resp = await fetch(endpoint, { method: 'POST', body: data });
    const payload = await resp.json();
    if (!resp.ok) throw new Error(payload.error || 'Proses gagal.');

    if (mode === 'import') {
      setResult(`Import selesai: ${payload.created} baru, ${payload.updated} diperbarui, ${payload.alerts} alert, ${payload.exim_created} rule EXIM baru.`);
      if (window.showToast) window.showToast('Import NKWh selesai', 'success');
      await submitNkwh('analyze');
      return;
    }

    lastAnalysis = payload;
    renderAnalysis(payload);
    setResult(`Analisa selesai: ${payload.filename || 'workbook'} terbaca.`);
    if (window.showToast) window.showToast('Analisa NKWh selesai', 'success');
  } catch (err) {
    setResult(err.message, 'error');
    if (window.showToast) window.showToast(err.message, 'error');
  } finally {
    setLive('Siap');
  }
}

function renderAnalysis(data) {
  const workbook = data.workbook || {};
  const feeder = data.kwh_penyulang || {};
  const exim = data.exim || {};
  setText('metric-sheet-count', workbook.sheet_count ?? '-');
  setText('metric-feeder-count', feeder.feeder_count ?? '-');
  setText('metric-total-kwh', fmtNum(feeder.total_kwh || 0));
  setText('metric-exim-count', exim.row_count ?? '-');
  setText('metric-period', formatPeriod(data.periode_bulan));

  renderSheets(workbook.sheets || []);
  renderGi(feeder.by_gi || []);
  renderSample(data.samples?.feeders || []);
  renderMethods(exim.methods || []);
}

function renderSheets(rows) {
  const tbody = document.querySelector('#table-nkwh-sheets tbody');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-cell">Tidak ada sheet terbaca.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(row => `
    <tr>
      <td><strong>${escapeHTML(row.name)}</strong></td>
      <td class="tr mono">${fmtNum(row.used_rows || row.max_row || 0)}</td>
      <td class="tr mono">${fmtNum(row.used_columns || row.max_column || 0)}</td>
    </tr>`).join('');
}

function renderGi(rows) {
  const tbody = document.querySelector('#table-nkwh-gi tbody');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="2" class="empty-cell">Tidak ada GI terbaca.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.slice(0, 12).map(row => `
    <tr>
      <td><strong>${escapeHTML(row.gardu_induk)}</strong></td>
      <td class="tr mono">${fmtNum(row.jumlah_penyulang || 0)}</td>
    </tr>`).join('');
}

function renderSample(rows) {
  const tbody = document.querySelector('#table-nkwh-sample tbody');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Tidak ada sample penyulang.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>${escapeHTML(row.gardu_induk || '-')}</td>
      <td>${escapeHTML(row.kode_trafo || '-')}</td>
      <td>
        <strong>${escapeHTML(row.kode_penyulang || '-')}</strong>
        <span class="subtext">${escapeHTML(row.nama_penyulang || '-')}</span>
      </td>
      <td class="tr mono">${fmtNum(row.kwh_wbp || 0)}</td>
      <td class="tr mono">${fmtNum(row.kwh_lwbp1 || 0)}</td>
      <td class="tr mono">${fmtNum(row.kwh_lwbp2 || 0)}</td>
      <td class="tr mono"><strong>${fmtNum(row.kwh_total || 0)}</strong></td>
    </tr>`).join('');
}

function renderMethods(methods) {
  const wrap = qid('nkwh-method-pills');
  if (!wrap) return;
  if (!methods.length) {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = methods.map(item => (
    `<span class="badge badge-warn">${escapeHTML(item.metode)}: ${fmtNum(item.count)}</span>`
  )).join('');
}

function setResult(message, type = 'info') {
  const el = qid('nkwh-result');
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
}

function formatPeriod(value) {
  if (!value) return 'periode';
  const date = new Date(value + 'T00:00:00');
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(date);
}

function setLive(text) { setText('upload-live', text); }
function qid(id) { return document.getElementById(id); }
function on(id, event, fn) { qid(id)?.addEventListener(event, fn); }
function setText(id, value) { const el = qid(id); if (el) el.textContent = value; }
function pad(n) { return String(n).padStart(2, '0'); }
function fmtNum(value) { return new Intl.NumberFormat('id-ID').format(Math.round(Number(value || 0))); }
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}
