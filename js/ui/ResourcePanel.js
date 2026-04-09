/**
 * ResourcePanel — Renders and live-updates the sidebar resource list.
 * Subscribes to EventBus for resource changes and epoch transitions.
 */

import { formatNumber, formatRate } from '../core/NumberFormatter.js?v=a2c3b17';

export class ResourcePanel {
  constructor(EventBus) {
    this.eventBus = EventBus;
    this.rows = {};
    this.container = null;
    this._resourceManager = null;
    this._collapsed = false;
  }

  init() {
    this.container = document.getElementById('resource-list');

    this._onResourceUpdated = (data) => this._handleResourceUpdated(data);
    this._onEpochTransition = () => this._handleEpochTransition();
    this._onVisibilityChanged = (data) => this._handleVisibilityChanged(data);

    this.eventBus.on('resource:updated', this._onResourceUpdated);
    this.eventBus.on('epoch:transition:complete', this._onEpochTransition);
    this.eventBus.on('resource:visibility:changed', this._onVisibilityChanged);

    const header = document.getElementById('resource-panel-header');
    if (header) header.addEventListener('click', () => this._toggleCollapse());
  }

  /** Called from main.js to give direct access to ResourceManager for initial render. */
  setResourceManager(rm) {
    this._resourceManager = rm;
  }

  /** Render all currently visible resources from the ResourceManager. */
  renderAll() {
    if (!this._resourceManager) return;
    this.container.innerHTML = '';
    this.rows = {};

    const resources = this._resourceManager.getAllArray();
    for (const state of resources) {
      const row = this._createRow(state.id, state.displayLabel || state.id);
      this.rows[state.id] = row;
      this.container.appendChild(row.el);
      if (state.cap !== null && state.cap !== undefined) {
        row.valueSpan.textContent = `${formatNumber(state.currentValue)} / ${formatNumber(state.cap)}`;
      } else {
        row.valueSpan.textContent = formatNumber(state.currentValue);
      }
      const sign = state.passiveRatePerSec >= 0 ? '+' : '';
      row.rateSpan.textContent = `${sign}${formatRate(state.passiveRatePerSec)}/s`;
    }
  }

  _handleResourceUpdated({ resourceId, newValue, delta, ratePerSec }) {
    // Check visibility from resource manager
    if (this._resourceManager) {
      const state = this._resourceManager.get(resourceId);
      if (state && !state.visible) {
        if (this.rows[resourceId]) {
          this.rows[resourceId].el.remove();
          delete this.rows[resourceId];
        }
        return;
      }
      // If resource just became visible, create row
      if (state && state.visible && !this.rows[resourceId]) {
        const row = this._createRow(resourceId, state.displayLabel || resourceId);
        this.rows[resourceId] = row;
        this.container.appendChild(row.el);
      }
    }

    let row = this.rows[resourceId];
    if (!row) return;

    const state = this._resourceManager?.get(resourceId);
    if (state?.cap !== null && state?.cap !== undefined) {
      row.valueSpan.textContent = `${formatNumber(newValue)} / ${formatNumber(state.cap)}`;
    } else {
      row.valueSpan.textContent = formatNumber(newValue);
    }

    const sign = ratePerSec >= 0 ? '+' : '';
    row.rateSpan.textContent = `${sign}${formatRate(ratePerSec)}/s`;
  }

  _createRow(resourceId, label) {
    const el = document.createElement('div');
    el.className = 'resource-row';
    el.dataset.id = resourceId;

    const labelSpan = document.createElement('span');
    labelSpan.className = 'resource-label';
    labelSpan.textContent = label;

    const valueSpan = document.createElement('span');
    valueSpan.className = 'resource-value';
    valueSpan.textContent = '0';

    const rateSpan = document.createElement('span');
    rateSpan.className = 'resource-rate';
    rateSpan.textContent = '+0/s';

    el.appendChild(labelSpan);
    el.appendChild(valueSpan);
    el.appendChild(rateSpan);

    return { el, labelSpan, valueSpan, rateSpan };
  }

  _handleVisibilityChanged({ resourceId, visible }) {
    if (visible) {
      if (!this.rows[resourceId] && this._resourceManager) {
        const state = this._resourceManager.get(resourceId);
        if (state) {
          const row = this._createRow(resourceId, state.displayLabel || resourceId);
          this.rows[resourceId] = row;
          this.container.appendChild(row.el);
          if (state.cap !== null && state.cap !== undefined) {
            row.valueSpan.textContent = `${formatNumber(state.currentValue)} / ${formatNumber(state.cap)}`;
          } else {
            row.valueSpan.textContent = formatNumber(state.currentValue);
          }
          const sign = state.passiveRatePerSec >= 0 ? '+' : '';
          row.rateSpan.textContent = `${sign}${formatRate(state.passiveRatePerSec)}/s`;
        }
      }
    } else {
      if (this.rows[resourceId]) {
        this.rows[resourceId].el.remove();
        delete this.rows[resourceId];
      }
    }
  }

  _handleEpochTransition() {
    this.renderAll();
  }

  _toggleCollapse() {
    this._collapsed = !this._collapsed;
    const body = document.getElementById('resource-body');
    if (body) body.classList.toggle('collapsed', this._collapsed);
    const icon = document.querySelector('#resource-panel-header .collapse-icon');
    if (icon) icon.textContent = this._collapsed ? '▼' : '▲';
  }
}
