'use strict';

(function enhancePenyulangUI() {
  document.addEventListener('DOMContentLoaded', () => {
    const entityIds = ['filter-gi', 'filter-area', 'filter-trafo', 'filter-penyulang'];
    const yearId = 'filter-tahun';
    const monthId = 'filter-bulan';
    const chips = document.getElementById('penyulang-filter-chips');
    const resetButton = document.getElementById('btn-reset-penyulang');
    const tbody = document.querySelector('#table-penyulang tbody');
    const defaultYear = new Date().getFullYear();
    const defaultMonth = new Date().getMonth() + 1;
    let replacingEmptyState = false;

    const field = id => document.getElementById(id);
    const selectedText = id => UIUtils.optionText(field(id));

    function filtersActive() {
      return entityIds.some(id => Boolean(field(id)?.value))
        || Number(field(yearId)?.value || defaultYear) !== defaultYear
        || Number(field(monthId)?.value || defaultMonth) !== defaultMonth;
    }

    async function reloadFor(id) {
      if (id === 'filter-gi') {
        await loadTrafo();
        await loadFeeders();
      } else if (id === 'filter-area' || id === 'filter-trafo') {
        await loadFeeders();
      }
      await loadData();
    }

    function removeFilter(id) {
      const element = field(id);
      if (!element) return;
      element.value = '';
      reloadFor(id);
    }

    async function resetFilters() {
      entityIds.forEach(id => {
        const element = field(id);
        if (element) element.value = '';
      });
      if (field('filter-group')) field('filter-group').value = 'area';
      if (field(yearId)) field(yearId).value = String(defaultYear);
      if (field(monthId)) field(monthId).value = String(defaultMonth);
      state.autoPeriodResolved = true;
      await loadTrafo();
      await loadFeeders();
      await loadData();
      renderChips();
    }

    async function previousMonth() {
      let year = Number(field(yearId)?.value || defaultYear);
      let month = Number(field(monthId)?.value || defaultMonth);
      if (month === 1) {
        year -= 1;
        month = 12;
      } else {
        month -= 1;
      }
      field(yearId).value = String(year);
      field(monthId).value = String(month);
      await loadData();
      renderChips();
    }

    function renderChips() {
      const active = filtersActive();
      if (resetButton) resetButton.hidden = !active;
      const year = Number(field(yearId)?.value || defaultYear);
      const month = Number(field(monthId)?.value || defaultMonth);

      UIUtils.renderFilterChips(chips, [
        field('filter-gi')?.value ? { label: 'GI', text: selectedText('filter-gi'), value: field('filter-gi').value, onRemove: () => removeFilter('filter-gi') } : null,
        field('filter-area')?.value ? { label: 'Area', text: selectedText('filter-area'), value: field('filter-area').value, onRemove: () => removeFilter('filter-area') } : null,
        field('filter-trafo')?.value ? { label: 'Trafo', text: selectedText('filter-trafo'), value: field('filter-trafo').value, onRemove: () => removeFilter('filter-trafo') } : null,
        field('filter-penyulang')?.value ? { label: 'Penyulang', text: selectedText('filter-penyulang'), value: field('filter-penyulang').value, onRemove: () => removeFilter('filter-penyulang') } : null,
        year !== defaultYear ? { label: 'Tahun', text: String(year), value: year, onRemove: () => { field(yearId).value = String(defaultYear); loadData(); renderChips(); } } : null,
        month !== defaultMonth ? { label: 'Periode', text: selectedText(monthId), value: month, onRemove: () => { field(monthId).value = String(defaultMonth); loadData(); renderChips(); } } : null,
      ], resetFilters);
    }

    function enhanceEmptyState() {
      if (!tbody || replacingEmptyState || tbody.querySelector('.empty-state-card')) return;
      const text = tbody.textContent.trim();
      if (!text.includes('Tidak ada data penyulang')) return;

      replacingEmptyState = true;
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 18;
      cell.className = 'table-empty-cell';
      row.appendChild(cell);
      tbody.replaceChildren(row);

      const active = filtersActive();
      const year = field(yearId)?.value || defaultYear;
      const month = selectedText(monthId) || MONTH_FULL[defaultMonth - 1];
      UIUtils.renderEmptyState(cell, {
        icon: active ? 'filter' : 'empty',
        title: active ? 'Tidak ada data ditemukan' : 'Belum ada data bulan ini',
        description: active
          ? 'Tidak ada penyulang yang cocok dengan filter yang dipilih. Coba ubah Gardu Induk, Trafo, atau periode.'
          : `Data untuk periode ${month} ${year} belum tersedia. Pastikan data sudah diinput atau coba bulan sebelumnya.`,
        actionLabel: active ? 'Reset Filter' : 'Lihat Bulan Sebelumnya',
        onAction: active ? resetFilters : previousMonth,
      });
      replacingEmptyState = false;
    }

    resetButton?.addEventListener('click', resetFilters);
    [...entityIds, yearId, monthId].forEach(id => {
      field(id)?.addEventListener('change', () => {
        renderChips();
        window.setTimeout(enhanceEmptyState, 0);
      });
    });

    if (tbody) {
      new MutationObserver(enhanceEmptyState).observe(tbody, { childList: true, subtree: true });
    }
    renderChips();
    enhanceEmptyState();
  });
})();
