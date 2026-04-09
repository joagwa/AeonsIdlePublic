/**
 * ResidualBonusPanel — Displays Cosmic Legacy bonuses carried across epochs.
 */

import { formatNumber } from '../core/NumberFormatter.js?v=8f9cac5';

export class ResidualBonusPanel {
  constructor(EventBus, gameState) {
    this.eventBus = EventBus;
    this.gameState = gameState;
    this.container = null;
    this._collapsed = false;
  }

  init() {
    this.container = document.getElementById('bonus-list');
    this._render();

    this._onEpochTransition = () => this._render();
    this.eventBus.on('epoch:transition:complete', this._onEpochTransition);

    const header = document.getElementById('residual-bonus-panel-header');
    if (header) header.addEventListener('click', () => this._toggleCollapse());
  }

  _render() {
    this.container.innerHTML = '';

    const bonuses = this.gameState.residualBonuses;
    if (!bonuses || bonuses.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'bonus-empty';
      empty.textContent = 'No bonuses yet — complete Epoch 1 to earn Cosmic Residue';
      this.container.appendChild(empty);
      return;
    }

    for (const bonus of bonuses) {
      const row = document.createElement('div');
      row.className = 'bonus-row';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'bonus-name';
      nameSpan.textContent = bonus.displayName || bonus.id;

      const valueSpan = document.createElement('span');
      valueSpan.className = 'bonus-value';
      const pct = (bonus.value * 100);
      valueSpan.textContent = `+${formatNumber(pct)}%`;

      if (bonus.tooltipText) {
        row.title = bonus.tooltipText;
      }

      row.appendChild(nameSpan);
      row.appendChild(valueSpan);
      this.container.appendChild(row);
    }
  }

  _toggleCollapse() {
    this._collapsed = !this._collapsed;
    const body = document.getElementById('residual-bonus-body');
    if (body) body.classList.toggle('collapsed', this._collapsed);
    const icon = document.querySelector('#residual-bonus-panel-header .collapse-icon');
    if (icon) icon.textContent = this._collapsed ? '▼' : '▲';
  }
}
