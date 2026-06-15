'use strict';

(function enhanceDashboard() {
  const defaultYear = new Date().getFullYear();
  const defaultPeriod = MO_FULL[new Date().getMonth()].toLowerCase();
  const stateSlot = document.getElementById('dashboard-empty-state');
  const dataContent = document.getElementById('dashboard-data-content');
  const chipContainer = document.getElementById('dashboard-filter-chips');
  const resetButton = document.getElementById('btn-reset');

  currentTahun = defaultYear;
  currentPeriode = defaultPeriod;
  setVal('periode', defaultPeriod);

  function selectedPeriodLabel() {
    const select = qid('periode');
    const text = select?.options[select.selectedIndex]?.textContent || MO_FULL[new Date().getMonth()];
    return `${text} ${currentTahun}`;
  }

  function hasActiveFilters() {
    return currentPeriode !== defaultPeriod || Number(currentTahun) !== defaultYear;
  }

  function updateFilterUI() {
    const active = hasActiveFilters();
    if (resetButton) resetButton.hidden = !active;
    UIUtils.renderFilterChips(chipContainer, [
      currentPeriode !== defaultPeriod ? {
        label: 'Periode',
        text: qid('periode')?.options[qid('periode').selectedIndex]?.textContent || currentPeriode,
        value: currentPeriode,
        onRemove: () => {
          currentPeriode = defaultPeriod;
          setVal('periode', defaultPeriod);
          loadData();
        },
      } : null,
      Number(currentTahun) !== defaultYear ? {
        label: 'Tahun',
        text: String(currentTahun),
        value: currentTahun,
        onRemove: () => {
          currentTahun = defaultYear;
          setVal('tahun', String(defaultYear));
          loadData();
        },
      } : null,
    ], resetDashboardFilters);
  }

  function hideDashboardState() {
    if (stateSlot) stateSlot.hidden = true;
    if (dataContent) dataContent.hidden = false;
  }

  function showDashboardState(kind) {
    if (!stateSlot) return;
    if (dataContent) dataContent.hidden = true;
    stateSlot.hidden = false;
    if (kind === 'error') {
      UIUtils.renderEmptyState(stateSlot, {
        icon: 'error',
        title: 'Gagal memuat data',
        description: 'Terjadi kesalahan saat mengambil data. Periksa koneksi atau coba muat ulang.',
        actionLabel: 'Coba Lagi',
        onAction: loadData,
      });
      return;
    }
    UIUtils.renderEmptyState(stateSlot, {
      icon: hasActiveFilters() ? 'filter' : 'empty',
      title: hasActiveFilters() ? 'Tidak ada data ditemukan' : 'Belum ada data bulan ini',
      description: hasActiveFilters()
        ? 'Tidak ada data yang cocok dengan periode yang dipilih. Coba ubah periode atau tahun.'
        : `Data untuk periode ${selectedPeriodLabel()} belum tersedia. Pastikan data sudah diinput atau coba bulan sebelumnya.`,
      actionLabel: hasActiveFilters() ? 'Reset Filter' : 'Lihat Bulan Sebelumnya',
      onAction: hasActiveFilters() ? resetDashboardFilters : showPreviousMonth,
    });
  }

  function resetDashboardFilters() {
    currentPeriode = defaultPeriod;
    currentTahun = defaultYear;
    setVal('periode', defaultPeriod);
    setVal('tahun', String(defaultYear));
    loadData();
  }

  function showPreviousMonth() {
    const monthNames = MO_FULL.map(month => month.toLowerCase());
    let index = monthNames.indexOf(currentPeriode);
    if (index < 0) index = new Date().getMonth();
    if (index === 0) {
      currentTahun -= 1;
      index = 11;
    } else {
      index -= 1;
    }
    currentPeriode = monthNames[index];
    setVal('periode', currentPeriode);
    setVal('tahun', String(currentTahun));
    loadData();
  }

  bindEvents = function bindDashboardEvents() {
    on('periode', 'change', event => {
      currentPeriode = event.target.value;
      updateFilterUI();
      updateDashboard();
      loadExecutiveDashboard();
    });
    on('tahun', 'change', event => {
      currentTahun = Number(event.target.value);
      updateFilterUI();
      loadData();
    });
    on('btn-reset', 'click', resetDashboardFilters);
    on('btn-export', 'click', exportCSV);
    document.querySelectorAll('.range-tab').forEach(button => {
      button.addEventListener('click', function onRangeClick() {
        document.querySelectorAll('.range-tab').forEach(item => item.classList.remove('active'));
        this.classList.add('active');
        renderMainChart(yearData(), activeRange());
      });
    });
  };

  loadData = async function loadDashboardData() {
    setText('live-label', 'Memuat...');
    try {
      const response = await fetch(`/api/dashboard-data?tahun=${currentTahun}`);
      if (!response.ok) throw new Error(response.statusText || 'Request gagal');
      const json = await response.json();
      allData = Array.isArray(json.data_bulanan) ? json.data_bulanan : [];
      setText('live-label', `Live · ${now()}`);
      setText('insight-mode', 'Live');
      setText('insight-year', currentTahun);
      updateFilterUI();
      updateDashboard();
      if (dataContent && !dataContent.hidden) await loadExecutiveDashboard();
    } catch (error) {
      console.warn('Dashboard gagal dimuat:', error.message);
      allData = [];
      setText('live-label', 'Error');
      setText('insight-mode', 'Error');
      setText('insight-year', currentTahun);
      updateFilterUI();
      showDashboardState('error');
    }
  };

  updateDashboard = function updateDashboardView() {
    const yd = yearData();
    const aggregate = periodeAgg(yd, currentPeriode);
    if (!yd.length || !aggregate) {
      showDashboardState('empty');
      return;
    }
    hideDashboardState();
    renderMetricCards(aggregate, yd);
    renderSparklines(yd);
    renderMainChart(yd, activeRange());
    renderJualChart(yd);
    renderDetailTable(yd);
    updatePeriodeLabels();
  };

  loadExecutiveDashboard = async function loadExecutiveData() {
    const month = executiveMonth();
    try {
      const response = await fetch(`/api/executive-dashboard?tahun=${currentTahun}&month=${month}`);
      if (!response.ok) throw new Error(response.statusText || 'Request gagal');
      renderExecutiveDashboard(await response.json());
    } catch (error) {
      console.warn('Executive dashboard gagal:', error.message);
      setText('exec-period', `${MO_FULL[month - 1]} ${currentTahun}`);
      ['exec-kwh-masuk', 'exec-kwh-keluar', 'exec-susut', 'exec-readiness', 'exec-workflow'].forEach(id => setText(id, '-'));
      ['exec-gi-deviasi', 'exec-anomali'].forEach(id => {
        UIUtils.renderEmptyState(qid(id), {
          compact: true,
          icon: 'error',
          title: 'Gagal memuat data',
          description: 'Data ringkasan belum dapat diambil.',
          actionLabel: 'Coba Lagi',
          onAction: loadExecutiveDashboard,
        });
      });
    }
  };

  renderExecutiveRows = function renderExecutiveDataRows(id, rows) {
    const element = qid(id);
    if (!element) return;
    if (!rows.length) {
      UIUtils.renderEmptyState(element, {
        compact: true,
        icon: 'empty',
        title: 'Belum ada data bulan ini',
        description: `Data ${selectedPeriodLabel()} belum tersedia.`,
      });
      return;
    }
    element.innerHTML = rows.map(row => `
      <div class="exec-row">
        <div>
          <strong>${escapeHTML(row.title)}</strong>
          <span>${escapeHTML(row.meta)}</span>
        </div>
        <b>${escapeHTML(row.value)}</b>
      </div>`).join('');
  };

  updateFilterUI();
})();
