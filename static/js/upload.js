'use strict';

let lastAnalysis = null;
let lastFileSignature = '';
let workflowState = null;
let readinessState = null;

const WORKFLOW_STEPS = [
  { status: 'DRAFT', label: 'Draft' },
  { status: 'SUDAH_UPLOAD', label: 'Sudah Upload' },
  { status: 'SUDAH_DICEK', label: 'Sudah Dicek' },
  { status: 'FINAL', label: 'Final' },
  { status: 'TERKUNCI', label: 'Terkunci' },
];

const ACTIVITY_LABELS = {
  ANALYZE_NKWH: 'Analisa NKWh',
  IMPORT_NKWH: 'Import NKWh',
  IMPORT_PENYULANG: 'Import Penyulang',
  MARK_MONTH_UPLOADED: 'Status Upload',
  UPDATE_MONTHLY_STATUS: 'Update Status',
};

document.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  const monthInput = qid('nkwh-bulan');
  if (monthInput) monthInput.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

  on('btn-analyze-nkwh', 'click', () => submitNkwh('analyze'));
  on('btn-import-nkwh', 'click', () => submitNkwh('import'));
  qid('nkwh-file')?.addEventListener('change', resetAnalysisState);
  qid('nkwh-source-type')?.addEventListener('change', resetAnalysisState);
  qid('nkwh-bulan')?.addEventListener('change', () => {
    resetAnalysisState();
    loadWorkflowStatus();
  });
  on('btn-workflow-refresh', 'click', () => loadWorkflowStatus());
  on('btn-workflow-save', 'click', updateWorkflowStatus);
  on('btn-workflow-export', 'click', downloadAuditPackage);
  qid('workflow-status-select')?.addEventListener('change', syncWorkflowForceControl);
  renderWorkflow(null);
  loadWorkflowStatus();
});

async function submitNkwh(mode) {
  const form = qid('form-nkwh-upload');
  const fileInput = qid('nkwh-file');
  if (!fileInput?.files.length) {
    setResult('Pilih workbook NKWh terlebih dahulu.', 'warning');
    return;
  }

  if (mode === 'import' && !canImportCurrentFile()) {
    setResult(workflowState && workflowState.writable === false
      ? `Periode ${formatPeriod(workflowState.periode_bulan)} berstatus ${workflowState.label}. Turunkan status sebelum import ulang.`
      : 'Analisa file terlebih dahulu sampai validasi siap import.', 'warning');
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
      if (payload.workflow) renderWorkflow(payload.workflow);
      await loadWorkflowStatus(true);
      await submitNkwh('analyze');
      return;
    }

    lastAnalysis = payload;
    lastFileSignature = fileSignature(fileInput.files[0]);
    if (payload.workflow) renderWorkflow(payload.workflow);
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
  if (data.workflow) renderWorkflow(data.workflow);
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

async function loadWorkflowStatus(silent = false) {
  const month = qid('nkwh-bulan')?.value;
  if (!month) return null;
  try {
    const resp = await fetch(`/api/monthly-status/${encodeURIComponent(month)}`);
    const payload = await resp.json();
    if (!resp.ok) throw new Error(payload.error || 'Gagal memuat status bulanan.');
    renderWorkflow(payload);
    loadWorkflowReadiness(month, true);
    loadWorkflowActivity(month, true);
    return payload;
  } catch (err) {
    if (!silent) {
      setResult(err.message, 'error');
      if (window.showToast) window.showToast(err.message, 'error');
    }
    return null;
  }
}

async function updateWorkflowStatus() {
  const month = qid('nkwh-bulan')?.value;
  const status = qid('workflow-status-select')?.value;
  const catatan = qid('workflow-note')?.value || '';
  const forceFinalize = Boolean(qid('workflow-force-final')?.checked);
  if (!month || !status) return;
  setLive('Update status');
  try {
    const resp = await fetch(`/api/monthly-status/${encodeURIComponent(month)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, catatan, force_finalize: forceFinalize }),
    });
    const payload = await resp.json();
    if (!resp.ok) {
      if (payload.readiness) renderWorkflowReadiness(payload.readiness);
      throw new Error(payload.error || 'Gagal update status bulanan.');
    }
    renderWorkflow(payload);
    loadWorkflowReadiness(month, true);
    loadWorkflowActivity(month, true);
    updateImportState();
    setResult(`Status ${formatPeriod(payload.periode_bulan)} menjadi ${payload.label}.`);
    if (window.showToast) window.showToast('Status bulanan diperbarui', 'success');
  } catch (err) {
    setResult(err.message, 'error');
    if (window.showToast) window.showToast(err.message, 'error');
  } finally {
    setLive('Siap');
  }
}

async function downloadAuditPackage() {
  const month = qid('nkwh-bulan')?.value;
  if (!month) return;
  setLive('Export audit');
  try {
    const resp = await fetch(`/api/monthly-status/${encodeURIComponent(month)}/audit-package`);
    const payload = await resp.json();
    if (!resp.ok) throw new Error(payload.error || 'Gagal export paket audit.');
    const content = JSON.stringify(payload, null, 2);
    downloadBlob(content, `audit_periode_${payload.periode || month}.json`, 'application/json;charset=utf-8');
    setResult(`Paket audit ${formatPeriod(payload.periode_bulan)} siap diunduh.`);
    if (window.showToast) window.showToast('Paket audit diunduh', 'success');
  } catch (err) {
    setResult(err.message, 'error');
    if (window.showToast) window.showToast(err.message, 'error');
  } finally {
    setLive('Siap');
  }
}

async function loadWorkflowReadiness(month, silent = false) {
  if (!month) return;
  try {
    const resp = await fetch(`/api/monthly-status/${encodeURIComponent(month)}/readiness`);
    const payload = await resp.json();
    if (!resp.ok) throw new Error(payload.error || 'Gagal memuat kesiapan data.');
    renderWorkflowReadiness(payload);
  } catch (err) {
    if (!silent) {
      setResult(err.message, 'error');
      if (window.showToast) window.showToast(err.message, 'error');
    }
  }
}

function renderWorkflowReadiness(payload) {
  readinessState = payload || null;
  const items = payload?.items || [];
  const grid = qid('workflow-readiness-grid');
  setText('workflow-readiness-caption', payload?.periode_bulan ? formatPeriod(payload.periode_bulan) : 'Coverage data periode');
  setText('workflow-readiness-score', `${fmtNum(payload?.score || 0)}% siap`);
  setText('workflow-readiness-alert', `${fmtNum(payload?.alert_count || 0)} alert`);
  const scoreBadge = qid('workflow-readiness-score');
  if (scoreBadge) {
    scoreBadge.className = `badge ${readinessBadgeClass(payload?.status)}`;
  }
  const alertBadge = qid('workflow-readiness-alert');
  if (alertBadge) {
    alertBadge.className = `badge ${(payload?.alert_count || 0) ? 'badge-danger' : 'badge-ok'}`;
  }
  if (!grid) return;
  if (!items.length) {
    grid.innerHTML = '<div class="readiness-empty">Belum ada data kesiapan.</div>';
    syncWorkflowForceControl();
    return;
  }
  grid.innerHTML = items.map(item => `
    <div class="readiness-card is-${escapeHTML(item.status)} ${item.optional ? 'is-optional' : ''}">
      <div class="readiness-card-head">
        <span class="readiness-dot"></span>
        <strong>${escapeHTML(item.label)}</strong>
        ${item.optional ? '<span class="readiness-optional">Opsional</span>' : ''}
      </div>
      <div class="readiness-value">${escapeHTML(item.subtitle || '-')}</div>
      <div class="readiness-progress" aria-hidden="true">
        <span style="width:${Math.max(0, Math.min(100, Number(item.percent || 0)))}%"></span>
      </div>
      <div class="readiness-detail">${escapeHTML(item.detail || '-')}</div>
    </div>
  `).join('');
  syncWorkflowForceControl();
}

function readinessBadgeClass(status) {
  return {
    ready: 'badge-ok',
    partial: 'badge-warn',
    empty: 'badge-danger',
  }[status] || 'badge-info';
}

function syncWorkflowForceControl() {
  const status = qid('workflow-status-select')?.value;
  const wrap = qid('workflow-force-wrap');
  const checkbox = qid('workflow-force-final');
  const needsGate = ['FINAL', 'TERKUNCI'].includes(status);
  const readinessIncomplete = readinessState && readinessState.can_finalize === false;
  const visible = Boolean(needsGate && readinessIncomplete);
  if (wrap) wrap.classList.toggle('is-visible', visible);
  if (checkbox && !visible) checkbox.checked = false;
}

async function loadWorkflowActivity(month, silent = false) {
  if (!month) return;
  try {
    const resp = await fetch(`/api/monthly-status/${encodeURIComponent(month)}/activity`);
    const payload = await resp.json();
    if (!resp.ok) throw new Error(payload.error || 'Gagal memuat riwayat periode.');
    renderWorkflowActivity(payload);
  } catch (err) {
    if (!silent) {
      setResult(err.message, 'error');
      if (window.showToast) window.showToast(err.message, 'error');
    }
  }
}

function renderWorkflowActivity(payload) {
  const rows = payload?.rows || [];
  const tbody = document.querySelector('#table-workflow-activity tbody');
  setText('workflow-activity-caption', payload?.periode_bulan ? formatPeriod(payload.periode_bulan) : 'Aktivitas bulan berjalan');
  setText('workflow-activity-count', `${fmtNum(rows.length)} aktivitas`);
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Belum ada aktivitas periode ini.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>
        <strong>${escapeHTML(formatDateTime(row.created_at))}</strong>
      </td>
      <td>
        <strong>${escapeHTML(row.username || '-')}</strong>
        <span class="subtext">${escapeHTML(row.role || '-')}</span>
      </td>
      <td><span class="activity-action">${escapeHTML(ACTIVITY_LABELS[row.action] || row.action || '-')}</span></td>
      <td><span class="badge ${row.status === 'FAILED' ? 'badge-danger' : 'badge-ok'}">${escapeHTML(row.status || '-')}</span></td>
      <td class="activity-detail">${escapeHTML(row.summary || '-')}</td>
    </tr>
  `).join('');
}

function renderWorkflow(data) {
  const fallbackMonth = qid('nkwh-bulan')?.value;
  const payload = data || {
    periode: fallbackMonth || '',
    periode_bulan: fallbackMonth ? `${fallbackMonth}-01` : '',
    status: 'DRAFT',
    label: 'Draft',
    catatan: '',
    writable: true,
    allowed_next: WORKFLOW_STEPS.slice(0, 2),
    steps: WORKFLOW_STEPS.map((step, index) => ({
      ...step,
      done: false,
      active: index === 0,
      locked: step.status === 'TERKUNCI',
    })),
  };
  workflowState = payload;

  const label = qid('workflow-current-label');
  if (label) {
    label.textContent = payload.label || 'Draft';
    label.className = `badge ${workflowBadgeClass(payload.status)}`;
  }
  setText('workflow-caption', payload.periode_bulan ? formatPeriod(payload.periode_bulan) : 'Status data bulanan');

  const strip = qid('workflow-strip');
  const steps = payload.steps?.length ? payload.steps : WORKFLOW_STEPS;
  if (strip) {
    strip.innerHTML = steps.map((step, index) => `
      <div class="workflow-stage ${step.done ? 'is-done' : ''} ${step.active ? 'is-active' : ''} ${step.locked ? 'is-locked' : ''}">
        <span class="workflow-stage-index">${index + 1}</span>
        <strong>${escapeHTML(step.label)}</strong>
      </div>
    `).join('');
  }

  const select = qid('workflow-status-select');
  const allowed = payload.allowed_next?.length ? payload.allowed_next : [{ status: payload.status, label: payload.label }];
  if (select) {
    select.innerHTML = allowed.map(item => (
      `<option value="${escapeHTML(item.status)}">${escapeHTML(item.label)}</option>`
    )).join('');
    select.value = payload.status;
    select.disabled = allowed.length <= 1 && allowed[0]?.status === 'TERKUNCI';
  }
  const lockedWithoutAction = allowed.length <= 1 && allowed[0]?.status === 'TERKUNCI';
  const note = qid('workflow-note');
  if (note) {
    note.value = payload.catatan || '';
    note.disabled = lockedWithoutAction;
  }
  const save = qid('btn-workflow-save');
  if (save) save.disabled = lockedWithoutAction;
  syncWorkflowForceControl();
  updateImportState();
}

function workflowBadgeClass(status) {
  return {
    DRAFT: 'badge-info',
    SUDAH_UPLOAD: 'badge-warn',
    SUDAH_DICEK: 'badge-ok',
    FINAL: 'badge-ok',
    TERKUNCI: 'badge-danger',
  }[status] || 'badge-info';
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
  const workflowWritable = !workflowState || workflowState.writable !== false;
  return Boolean(file && lastAnalysis && lastFileSignature === fileSignature(file) && validation.status !== 'blocked' && workflowWritable);
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

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function setLive(text) { setText('upload-live', text); }
function qid(id) { return document.getElementById(id); }
function on(id, event, fn) { qid(id)?.addEventListener(event, fn); }
function setText(id, value) { const el = qid(id); if (el) el.textContent = value; }
function pad(n) { return String(n).padStart(2, '0'); }
function fmtNum(value) { return new Intl.NumberFormat('id-ID').format(Math.round(Number(value || 0))); }
function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
