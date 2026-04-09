/**
 * StatsPanel — Collapsible panel showing current game statistics.
 */
import { formatNumber } from '../core/NumberFormatter.js?v=27e9987';

export class StatsPanel {
  constructor(EventBus) {
    this.bus = EventBus;
    this._resourceManager = null;
    this._upgradeSystem = null;
    this._milestoneSystem = null;
    this._collapsed = false;
    this._startTime = Date.now();
    this._particlesAbsorbed = 0;
    this._currentStageLabel = 'Quantum Mote';
    this._container = null;
    this._body = null;
    this._rows = {};
  }

  init(resourceManager, upgradeSystem, milestoneSystem) {
    this._resourceManager = resourceManager;
    this._upgradeSystem = upgradeSystem;
    this._milestoneSystem = milestoneSystem;

    this._container = document.getElementById('stats-panel');
    this._body = document.getElementById('stats-body');
    const header = document.getElementById('stats-panel-header');
    if (header) header.addEventListener('click', () => this._toggleCollapse());

    this.bus.on('resource:updated', () => this._update());
    this.bus.on('upgrade:purchased', () => this._update());
    this.bus.on('milestone:triggered', () => this._update());
    this.bus.on('particle:absorbed', () => { this._particlesAbsorbed++; this._updateRow('particlesAbsorbed', this._particlesAbsorbed.toLocaleString()); });
    this.bus.on('visual:threshold:changed', (data) => { this._currentStageLabel = data.label || ''; this._updateRow('stage', this._currentStageLabel); });

    this._build();
    this._timeInterval = setInterval(() => this._updateTime(), 1000);
  }

  _build() {
    if (!this._body) return;
    this._body.innerHTML = '';
    this._rows = {};
    this._addRow('epoch',    '🌌 Epoch',       'The Primordial Universe');
    this._addRow('stage',    '✦ Stage',        this._currentStageLabel);
    this._addRow('time',     '⏱ Time Played',  '0:00:00');
    this._addRow('sep1',     null,             null); // separator
    this._addRow('energy',   '⚡ Energy',       '0');
    this._addRow('mass',     '⚫ Mass',         '0');
    this._addRow('sep2',     null,             null);
    this._addRow('milestones','🏆 Milestones',  '0 / 16');
    this._addRow('upgrades', '🔬 Upgrades',    '0');
    this._addRow('particles','🌀 Particles Absorbed', '0');
    this._update();
  }

  _addRow(key, label, value) {
    if (label === null) {
      const sep = document.createElement('div');
      sep.className = 'stats-separator';
      this._body.appendChild(sep);
      return;
    }
    const row = document.createElement('div');
    row.className = 'stats-row';
    const labelEl = document.createElement('span');
    labelEl.className = 'stats-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'stats-value';
    valueEl.textContent = value;
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    this._body.appendChild(row);
    this._rows[key] = valueEl;
  }

  _updateRow(key, value) {
    if (this._rows[key]) this._rows[key].textContent = value;
  }

  _update() {
    if (!this._resourceManager) return;

    const energy = this._resourceManager.get('energy');
    if (energy) this._updateRow('energy', formatNumber(energy.currentValue));

    const mass = this._resourceManager.get('mass');
    if (mass) this._updateRow('mass', formatNumber(mass.currentValue));

    // Milestones
    if (this._milestoneSystem) {
      const msStates = this._milestoneSystem.getStates();
      const total = Object.keys(msStates).length;
      const triggered = Object.values(msStates).filter(s => s.triggered).length;
      this._updateRow('milestones', `${triggered} / ${total}`);
    }

    // Upgrades
    if (this._upgradeSystem) {
      const all = this._upgradeSystem.getAll();
      const purchased = all.filter(u => u.state.purchased).length;
      const total = all.length;
      this._updateRow('upgrades', `${purchased} / ${total}`);
    }

    this._updateRow('particlesAbsorbed', this._particlesAbsorbed.toLocaleString());
  }

  _updateTime() {
    const elapsed = Math.floor((Date.now() - this._startTime) / 1000);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    this._updateRow('time', `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
  }

  _toggleCollapse() {
    this._collapsed = !this._collapsed;
    if (this._body) this._body.classList.toggle('collapsed', this._collapsed);
    const icon = document.querySelector('#stats-panel-header .collapse-icon');
    if (icon) icon.textContent = this._collapsed ? '▼' : '▲';
  }
}
