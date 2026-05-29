'use strict';

let lastAnalysis = null;
let lastFileSignature = '';

document.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  const monthInput = qid('nkwh-bulan');
  if (monthInput) monthInput.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

  on('btn-analyze-nkwh', 'click', () => submitNkwh('analyze'));
  on('btn-import-nkwh', 'click', () => submitNkwh('import'));
  qid('nkwh-file')?.addEventListener('change', resetAnalysisState);
  qid('nkwh-source-type')?.addEventListener('change', resetAnalysisState);
  qid('nkwh-bulan')?.addEventListener('change', resetAnalysisState);
});

async function submitNkwh(mode) {
  const form = qid('form-nkwh-upload');
  const fileInput = qid('nkwh-file');
  if (!fileInput?.files.length) {
    setResult('Pilih workbook NKWh terlebih dahulu.', 'warning');
    return;
  }

  if (mode === 'import' && !canImportCurrentFile()) {
    setResult('Analisa file terlebih dahulu sampai validasi siap import.', 'warning');
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
      setStep('import');
      await submitNkwh('analyze');
      return;
    }

    lastAnalysis = payload;
    lastFileSignature = fileSignature(fileInput.files[0]);
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
  renderValidation(data.validation || {});
  updateImportState();
  setStep((data.validation || {}).status === 'blocked' ? 'validate' : 'import');
}

function renderValidation(validation) {
  const status = validation.status || 'ready';
  const errors = Number(validation.error_count || 0);
  const warnings = Number(validation.warning_count || 0);
  const infos = Number(validation.info_count || 0);
  const issues = validation.issues || [];
  const summary = qid('nkwh-validation-summary');
  const pills = qid('nkwh-validation-pills');
  const tbody = document.querySelector('#table-nkwh-validation tbody');

  if (summary) {
    summary.textContent = status === 'blocked'
      ? 'Ada error yang harus diperbaiki sebelum import.'
      : warnings
        ? 'Data bisa diimport, tetapi ada catatan yang perlu diperiksa.'
        : 'Data siap diimport.';
  }

  if (pills) {
    pills.innerHTML = `
      <span class="badge ${errors ? 'badge-danger' : 'badge-ok'}">${fmtNum(errors)} error</span>
      <span class="badge ${warnings ? 'badge-warn' : 'badge-ok'}">${fmtNum(warnings)} warning</span>
      <span class="badge badge-ok">${fmtNum(infos)} info</span>`;
  }

  if (!tbody) return;
  if (!issues.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">Tidak ada masalah terdeteksi.</td></tr>';
    return;
  }

  tbody.innerHTML = issues.map(issue => {
    const badgeClass = issue.level === 'error' ? 'badge-danger' : issue.level === 'warning' ? 'badge-warn' : 'badge-ok';
    return `
      <tr>
        <td><span class="badge ${badgeClass}">${escapeHTML(issue.level || '-')}</span></td>
        <td>
          <strong>${escapeHTML(issue.sheet || '-')}</strong>
          <span class="subtext">${escapeHTML(issue.code || '-')}</span>
        </td>
        <td>${escapeHTML(issue.message || '-')}</td>
        <td class="tr mono">${issue.count == null ? '-' : fmtNum(issue.count)}</td>
      </tr>`;
  }).join('');
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

function resetAnalysisState() {
  lastAnalysis = null;
  lastFileSignature = '';
  updateImportState();
  setStep('file');
  setResult('File berubah. Jalankan analisa ulang sebelum import.');
  setText('metric-sheet-count', '-');
  setText('metric-feeder-count', '-');
  setText('metric-total-kwh', '-');
  setText('metric-exim-count', '-');
  setText('metric-period', 'periode');
  const validationBody = document.querySelector('#table-nkwh-validation tbody');
  if (validationBody) validationBody.innerHTML = '<tr><td colspan="4" class="empty-cell">Belum ada validasi.</td></tr>';
  setText('nkwh-validation-summary', 'Analisa workbook untuk melihat kesiapan import.');
  const pills = qid('nkwh-validation-pills');
  if (pills) pills.innerHTML = '';
}

function canImportCurrentFile() {
  const file = qid('nkwh-file')?.files?.[0];
  const validation = lastAnalysis?.validation || {};
  return Boolean(file && lastAnalysis && lastFileSignature === fileSignature(file) && validation.status !== 'blocked');
}

function updateImportState() {
  const btn = qid('btn-import-nkwh');
  if (btn) btn.disabled = !canImportCurrentFile();
}

function fileSignature(file) {
  if (!file) return '';
  return [file.name, file.size, file.lastModified].join(':');
}

function setStep(step) {
  const active = {
    file: ['upload-step-file'],
    validate: ['upload-step-file', 'upload-step-validate'],
    import: ['upload-step-file', 'upload-step-validate', 'upload-step-import'],
  }[step] || ['upload-step-file'];
  ['upload-step-file', 'upload-step-validate', 'upload-step-import'].forEach(id => {
    qid(id)?.classList.toggle('is-active', active.includes(id));
  });
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
