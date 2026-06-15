'use strict';

(function initUIUtils(window) {
  const ICONS = {
    empty: 'database-off',
    filter: 'filter-off',
    error: 'alert-circle',
    success: 'circle-check',
  };

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function renderEmptyState(container, options = {}) {
    if (!container) return null;

    const {
      title = 'Belum ada data',
      description = '',
      actionLabel = '',
      onAction = null,
      icon = 'empty',
      compact = false,
    } = options;

    const iconName = ICONS[icon] || icon || ICONS.empty;
    container.innerHTML = `
      <div class="empty-state-card${compact ? ' empty-state-card-compact' : ''}">
        <div class="empty-state-icon" aria-hidden="true">
          <i class="ti ti-${escapeHTML(iconName)}"></i>
        </div>
        <div class="empty-state-copy">
          <strong>${escapeHTML(title)}</strong>
          ${description ? `<p>${escapeHTML(description)}</p>` : ''}
        </div>
        ${actionLabel ? `<button class="empty-state-action" type="button">${escapeHTML(actionLabel)}</button>` : ''}
      </div>`;

    const button = container.querySelector('.empty-state-action');
    if (button && typeof onAction === 'function') button.addEventListener('click', onAction);
    return container.firstElementChild;
  }

  function optionText(select) {
    if (!select || !select.value) return '';
    return select.options[select.selectedIndex]?.textContent?.trim() || '';
  }

  function renderFilterChips(container, chips, onClearAll) {
    if (!container) return;
    const active = (chips || []).filter(chip => chip && chip.value);
    container.hidden = active.length === 0;
    container.replaceChildren();
    if (!active.length) return;

    active.forEach(chip => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'active-filter-chip';
      button.setAttribute('aria-label', `Hapus filter ${chip.label}`);
      button.innerHTML = `<i class="ti ti-x" aria-hidden="true"></i><span>${escapeHTML(chip.label)}: ${escapeHTML(chip.text)}</span>`;
      button.addEventListener('click', chip.onRemove);
      container.appendChild(button);
    });

    if (typeof onClearAll === 'function' && active.length > 1) {
      const clearButton = document.createElement('button');
      clearButton.type = 'button';
      clearButton.className = 'clear-all-filters';
      clearButton.textContent = 'Reset semua';
      clearButton.addEventListener('click', onClearAll);
      container.appendChild(clearButton);
    }
  }

  window.UIUtils = {
    escapeHTML,
    optionText,
    renderEmptyState,
    renderFilterChips,
  };
})(window);
