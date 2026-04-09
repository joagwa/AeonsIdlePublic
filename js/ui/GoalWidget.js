/**
 * GoalWidget — Shows the next milestone goal with a live progress bar
 * at the top of the resource panel.
 */

import { formatNumber } from '../core/NumberFormatter.js?v=b57db20';

export class GoalWidget {
  constructor(EventBus, milestoneSystem, resourceManager) {
    this.bus = EventBus;
    this.milestoneSystem = milestoneSystem;
    this.resourceManager = resourceManager;

    this._container = null;
    this._titleEl = null;
    this._barFill = null;
    this._labelEl = null;
    this._refreshPending = false;
  }

  init() {
    this._container = document.getElementById('goal-display');
    if (!this._container) return;

    this._titleEl = this._container.querySelector('.goal-title');
    this._barFill = this._container.querySelector('.goal-bar-fill');
    this._labelEl = this._container.querySelector('.goal-label');

    this.bus.on('resource:updated', () => this._scheduleRefresh());
    this.bus.on('milestone:triggered', () => this._refresh());

    this._refresh();
  }

  _scheduleRefresh() {
    if (this._refreshPending) return;
    this._refreshPending = true;
    requestAnimationFrame(() => {
      this._refreshPending = false;
      this._refresh();
    });
  }

  _refresh() {
    if (!this._container) return;
    if (typeof this.milestoneSystem?.getNextGoal !== 'function') return;

    const goal = this.milestoneSystem.getNextGoal();
    if (!goal) {
      this._container.classList.add('hidden');
      return;
    }

    this._container.classList.remove('hidden');

    if (this._titleEl) this._titleEl.textContent = goal.title;

    if (goal.conditionType === 'resource_threshold') {
      const state = this.resourceManager.get(goal.conditionTarget);
      const current = state ? state.currentValue : 0;
      const target = goal.conditionValue;
      const progress = Math.min(1, current / target);
      const label = state?.displayLabel || goal.conditionTarget;

      if (this._labelEl) {
        this._labelEl.textContent = `${label}: ${formatNumber(current)} / ${formatNumber(target)}`;
      }
      if (this._barFill) {
        this._barFill.style.width = `${(progress * 100).toFixed(1)}%`;
      }
    } else if (goal.conditionType === 'star_cycle') {
      const label = goal.conditionTarget === 'star_stage'
        ? `Reach star stage: ${goal.conditionValue}`
        : `Complete ${goal.conditionValue} stellar cycle(s)`;
      if (this._labelEl) this._labelEl.textContent = label;
      if (this._barFill) this._barFill.style.width = '0%';
    } else {
      if (this._labelEl) this._labelEl.textContent = '';
      if (this._barFill) this._barFill.style.width = '0%';
    }
  }
}
